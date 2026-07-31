import { access, mkdir, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import type {
  GeneratedComponent,
  GenerationResult,
  GenerationContext,
  GenerationEngine,
  ProviderRegistry,
  StackForgeIntegration,
  StackForgeProvider,
} from "./contracts.js";
import { writeText } from "./files.js";

export class GenerationFailure extends Error {
  constructor(
    message: string,
    readonly details: {
      completedSteps: string[];
      failedStep: string;
      rootDirectory: string;
    },
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "GenerationFailure";
  }
}

export class DefaultGenerationEngine implements GenerationEngine {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly integrations: StackForgeIntegration[] = [],
  ) {}

  async generate(context: GenerationContext): Promise<GenerationResult> {
    await this.assertDestinationCanBeUsed(context);
    const providers = context.selection.providerIds.map((id) => {
      const provider = this.registry.get(id);
      if (!provider) throw new Error(`Unknown provider: ${id}`);
      return provider;
    });

    this.validate(providers, context);
    await mkdir(context.rootDirectory, { recursive: true });
    await this.prepareDirectories(context);
    const completedSteps: string[] = [];
    const result = this.createResult(context, providers);

    try {
      for (const provider of providers) {
        const step = `${provider.metadata.name} scaffold`;
        context.log(`Generating ${provider.metadata.name}...`);
        await this.runStep(step, () => provider.generator.generate(context));
        completedSteps.push(step);
      }

      await this.runStep("Shared project files", () => this.writeSharedFiles(context));
      completedSteps.push("Shared project files");

      for (const integration of this.matchingIntegrations(context)) {
        const step = `${integration.metadata.name} integration`;
        context.log(`Connecting ${integration.metadata.name}...`);
        await this.runStep(step, async () => {
          await integration.integrate(context);
          await integration.augmentResult?.(result, context);
        });
        completedSteps.push(step);
      }

      for (const provider of providers.flatMap((provider) => provider.postInstallHooks ?? [])) {
        const step = provider.name;
        context.log(`Running ${provider.name}...`);
        await this.runStep(step, () => provider.run(context));
        completedSteps.push(step);
      }
    } catch (error) {
      const failedStep = error instanceof StepFailure ? error.step : "Project generation";
      throw new GenerationFailure(
        error instanceof Error ? error.message : String(error),
        {
          completedSteps,
          failedStep,
          rootDirectory: context.rootDirectory,
        },
        { cause: error },
      );
    }

    result.completedSteps = completedSteps;
    return result;
  }

  private async runStep(step: string, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      throw new StepFailure(step, error);
    }
  }

  private createResult(context: GenerationContext, providers: StackForgeProvider[]): GenerationResult {
    const components = providers.map((provider) => this.toComponent(provider, context));
    const installableComponents = components.filter((component) => component.category !== "database");
    const dependenciesInstalled = installableComponents.every(
      (component) => component.runtime?.dependenciesInstalled !== false,
    );
    const dockerSelected = context.selection.docker;
    const databaseService = context.selection.providerIds.includes("postgres")
      ? "postgres"
      : context.selection.providerIds.includes("mongodb")
        ? "mongodb"
        : undefined;

    return {
      projectName: context.projectName,
      rootDirectory: context.rootDirectory,
      components,
      dependenciesInstalled,
      docker: dockerSelected
        ? {
          enabled: true,
          composeFile: databaseService ? join(context.rootDirectory, "docker-compose.yml") : undefined,
          startsFullStack: false,
          command: databaseService ? [`docker compose up ${databaseService}`] : undefined,
        }
        : undefined,
      environmentFiles: [join(context.rootDirectory, ".env.example")],
      warnings: [],
      completedSteps: [],
    };
  }

  private toComponent(provider: StackForgeProvider, context: GenerationContext): GeneratedComponent {
    const category = provider.metadata.category;
    const relativeDirectory = this.componentRelativeDirectory(category, context);

    return {
      providerId: provider.metadata.id,
      name: provider.metadata.name,
      category,
      directory: join(context.rootDirectory, relativeDirectory),
      relativeDirectory,
      runtime: provider.metadata.runtime,
    };
  }

  private componentRelativeDirectory(category: GeneratedComponent["category"], context: GenerationContext): string {
    if (category === "database") return ".";
    if (context.selection.projectType !== "full-stack") return ".";
    if (category === "frontend") return context.directories.frontend ?? "frontend";
    if (category === "backend") return context.directories.backend ?? "backend";
    return ".";
  }

  private matchingIntegrations(context: GenerationContext): StackForgeIntegration[] {
    const selected = new Set(context.selection.providerIds);
    return this.integrations.filter((integration) => {
      const hasRequiredProviders = integration.metadata.providerIds.every((id) => selected.has(id));
      return hasRequiredProviders && (integration.isApplicable?.(context.selection) ?? true);
    });
  }

  private validate(providers: StackForgeProvider[], context: GenerationContext): void {
    const selected = new Set(context.selection.providerIds);
    for (const provider of providers) {
      const compatibility = provider.compatibility;
      if (compatibility.projectTypes && !compatibility.projectTypes.includes(context.selection.projectType)) {
        throw new Error(`${provider.metadata.name} is not available for this project type.`);
      }
      for (const id of compatibility.requires ?? []) {
        if (!selected.has(id)) throw new Error(`${provider.metadata.name} requires ${id}.`);
      }
      for (const id of compatibility.conflictsWith ?? []) {
        if (selected.has(id)) throw new Error(`${provider.metadata.name} cannot be used with ${id}.`);
      }
      for (const rule of compatibility.rules ?? []) {
        if (!rule.isCompatible(context.selection)) throw new Error(rule.reason);
      }
    }
  }

  private async assertDestinationCanBeUsed(context: GenerationContext): Promise<void> {
    await this.assertRootDirectoryWritable(context.rootDirectory);
    const rootEntries = await this.listMeaningfulEntries(context.rootDirectory);

    if (context.selection.projectType !== "full-stack" && rootEntries.length > 0) {
      throw new Error(`The destination folder is not empty: ${context.rootDirectory}`);
    }

    for (const relativePath of this.rootConflicts(context)) {
      await this.assertPathDoesNotExist(join(context.rootDirectory, relativePath));
    }

    if (context.selection.projectType !== "full-stack") return;

    await this.assertAppDirectoryAvailable(join(context.rootDirectory, context.directories.frontend ?? "frontend"));
    await this.assertAppDirectoryAvailable(join(context.rootDirectory, context.directories.backend ?? "backend"));
  }

  private async assertRootDirectoryWritable(rootDirectory: string): Promise<void> {
    let probe = rootDirectory;

    for (;;) {
      try {
        await access(probe, constants.W_OK);
        return;
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code !== "ENOENT") {
          throw new Error(`StackForge cannot write to ${rootDirectory}.`);
        }
      }

      const parent = dirname(probe);
      if (parent === probe) {
        throw new Error(`StackForge cannot write to ${rootDirectory}.`);
      }
      probe = parent;
    }
  }

  private async assertAppDirectoryAvailable(directoryPath: string): Promise<void> {
    try {
      const info = await stat(directoryPath);
      if (!info.isDirectory()) {
        throw new Error(`StackForge would conflict with existing path: ${directoryPath}`);
      }

      const entries = await this.listMeaningfulEntries(directoryPath);
      if (entries.length > 0) {
        throw new Error(`StackForge would conflict with existing path: ${directoryPath}`);
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== "ENOENT") throw error;
    }
  }

  private async assertPathDoesNotExist(path: string): Promise<void> {
    try {
      await access(path, constants.F_OK);
      throw new Error(`StackForge would conflict with existing path: ${path}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("would conflict")) throw error;
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== "ENOENT") throw error;
    }
  }

  private async listMeaningfulEntries(directoryPath: string): Promise<string[]> {
    try {
      const entries = await readdir(directoryPath, { withFileTypes: true });
      return entries
        .map((entry) => entry.name)
        .filter((name) => name !== ".DS_Store")
        .sort();
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") return [];
      throw error;
    }
  }

  private rootConflicts(context: GenerationContext): string[] {
    const conflicts = new Set<string>([".gitignore", ".editorconfig", "README.md", ".env.example"]);
    const providers = new Set(context.selection.providerIds);

    if (context.selection.docker && (providers.has("postgres") || providers.has("mongodb"))) {
      conflicts.add("docker-compose.yml");
      conflicts.add("compose.yaml");
    }

    if (providers.has("supabase")) {
      conflicts.add("supabase/README.md");
    }

    return [...conflicts];
  }

  private async writeSharedFiles(context: GenerationContext): Promise<void> {
    const isFullStack = context.selection.projectType === "full-stack";
    const directories = isFullStack ? "- `frontend/` contains the client\n- `backend/` contains the server\n" : "";
    await Promise.all([
      writeText(context.rootDirectory, ".gitignore", "node_modules/\ndist/\n.env\n.env.local\n__pycache__/\n*.py[cod]\ntarget/\n.idea/\n.DS_Store\n"),
      writeText(context.rootDirectory, ".editorconfig", "root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\ninsert_final_newline = true\nindent_style = space\nindent_size = 2\n"),
      writeText(context.rootDirectory, "README.md", `# ${context.projectName}\n\nGenerated by StackForge.\n\n## Structure\n\n${directories}\n## Getting started\n\nSee the README files inside each generated application.\n`),
    ]);
    await writeText(context.rootDirectory, ".env.example", "JWT_SECRET=\n");
  }

  private async prepareDirectories(context: GenerationContext): Promise<void> {
    if (context.selection.projectType !== "full-stack") return;

    await Promise.all([
      mkdir(join(context.rootDirectory, context.directories.frontend ?? "frontend"), { recursive: true }),
      mkdir(join(context.rootDirectory, context.directories.backend ?? "backend"), { recursive: true }),
    ]);
  }
}

class StepFailure extends Error {
  constructor(
    readonly step: string,
    readonly originalError: unknown,
  ) {
    super(originalError instanceof Error ? originalError.message : String(originalError), { cause: originalError });
    this.name = "StepFailure";
  }
}

export async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code ?? "unknown"}.`)));
  });
}

export function targetDirectory(context: GenerationContext, category: "frontend" | "backend"): string {
  if (context.selection.projectType === "full-stack") {
    return join(context.rootDirectory, context.directories[category] ?? category);
  }
  return context.rootDirectory;
}
