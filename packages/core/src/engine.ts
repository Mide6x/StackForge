// SPDX-License-Identifier: MPL-2.0
import { access, mkdir, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import type {
  DependencyManager,
  GeneratedComponent,
  GenerationResult,
  GenerationContext,
  GenerationEngine,
  ProviderRegistry,
  StackForgeIntegration,
  StackForgeProvider,
  TestSuiteComponent,
  TestingGenerationContext,
} from "./contracts.js";
import { DefaultGenerationResultBuilder } from "./accumulators/result.js";
import { writeText } from "./files.js";
import {
  createIntegrationRuntime,
  integrationPhases,
  matchingIntegrations,
} from "./integration-runner.js";

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
    const integrations = matchingIntegrations(this.integrations, context.selection);
    await mkdir(context.rootDirectory, { recursive: true });
    await this.prepareDirectories(context);
    const completedSteps: string[] = [];
    const initialResult = this.createResult(context, providers);

    try {
      for (const provider of providers) {
        const step = `${provider.metadata.name} scaffold`;
        context.log(`Generating ${provider.metadata.name}...`);
        await this.runStep(step, () => provider.generator.generate(context));
        completedSteps.push(step);
      }

      await this.runStep("Shared project files", () => this.writeBaseFiles(context));
      completedSteps.push("Shared project files");

      const legacyIntegrations = integrations.filter((integration) => integration.integrate);
      if (legacyIntegrations.length > 0) {
        const legacyResult = initialResult;
        await writeText(context.rootDirectory, ".env.example", "JWT_SECRET=\n");
        for (const integration of legacyIntegrations) {
          const step = `${integration.metadata.name} integration`;
          context.log(`Connecting ${integration.metadata.name}...`);
          await this.runStep(step, async () => {
            await integration.integrate!(context);
            await integration.augmentResult?.(legacyResult, context);
          });
          completedSteps.push(step);
        }
        await this.runProviderHooks(providers, context, completedSteps);
        legacyResult.completedSteps = completedSteps;
        return legacyResult;
      }

      const providerFiles = await this.listGeneratedFiles(context.rootDirectory);
      const builder = new DefaultGenerationResultBuilder(initialResult);
      const runtime = createIntegrationRuntime(context, builder, providerFiles);
      this.seedCoreContributions(runtime, context);

      for (const phase of integrationPhases) {
        for (const integration of integrations.filter((item) => item.phase === phase)) {
          const step = `${integration.metadata.name} integration`;
          context.log(`Connecting ${integration.metadata.name}...`);
          await this.runStep(step, () => integration.apply!(runtime.contextFor(integration)));
          builder.addAppliedIntegration(integration.metadata.id);
          completedSteps.push(step);
        }
      }

      await this.runSelectedTestGenerators(
        providers,
        integrations,
        runtime,
        context,
        completedSteps,
      );

      await this.runStep("Package script updates", () => runtime.scripts.apply(context));
      completedSteps.push("Package script updates");

      const dependencyGroups = await this.runStepWithResult(
        "Dependency manifest updates",
        () => runtime.dependencies.apply(context),
      );
      completedSteps.push("Dependency manifest updates");

      const externallyInstalledTargets = await this.runProviderHooks(
        providers,
        context,
        completedSteps,
      );
      const outcomes = await this.runStepWithResult(
        "Dependency installation",
        () => runtime.dependencies.install(context, dependencyGroups, externallyInstalledTargets),
      );
      for (const outcome of outcomes) {
        builder.addDependencyOutcome(outcome);
        if (outcome.status === "skipped") {
          const command = outcome.command?.join(" ") ?? `${outcome.manager} install`;
          builder.addWarning(outcome.reason ?? `${command} was skipped.`);
          builder.addManualStep(
            `install:${outcome.manager}:${outcome.directory}`,
            `Run \`${command}\` in ${outcome.directory}.`,
          );
        }
      }
      completedSteps.push("Dependency installation");

      const environmentFiles = await this.runStepWithResult(
        "Environment finalization",
        () => runtime.environment.finalize(context),
      );
      environmentFiles.forEach((path) => builder.addEnvironmentFile(path));
      completedSteps.push("Environment finalization");

      await this.runStep("Documentation finalization", async () => {
        await runtime.documentation.finalize(context);
      });
      completedSteps.push("Documentation finalization");

      const docker = await this.runStepWithResult(
        "Docker Compose finalization",
        () => runtime.compose.finalize(context),
      );
      if (docker) builder.setDocker(docker);
      completedSteps.push("Docker Compose finalization");

      await this.runStep("Generated output validation", () =>
        this.validateGeneratedOutput(context, initialResult.components, environmentFiles, docker?.composeFile));
      completedSteps.push("Generated output validation");
      return builder.build(completedSteps);
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
  }

  private async runStep(step: string, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      throw new StepFailure(step, error);
    }
  }

  private async runStepWithResult<T>(step: string, action: () => Promise<T>): Promise<T> {
    try {
      return await action();
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

    return {
      projectName: context.projectName,
      rootDirectory: context.rootDirectory,
      components,
      dependenciesInstalled,
      docker: undefined,
      environmentFiles: [],
      warnings: [],
      completedSteps: [],
      testSuites: [],
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

  private async writeBaseFiles(context: GenerationContext): Promise<void> {
    await Promise.all([
      writeText(context.rootDirectory, ".gitignore", "node_modules/\ndist/\n.env\n.env.local\n__pycache__/\n*.py[cod]\ntarget/\n.idea/\n.DS_Store\n"),
      writeText(context.rootDirectory, ".editorconfig", "root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\ninsert_final_newline = true\nindent_style = space\nindent_size = 2\n"),
    ]);
  }

  private async prepareDirectories(context: GenerationContext): Promise<void> {
    if (context.selection.projectType !== "full-stack") return;

    await Promise.all([
      mkdir(join(context.rootDirectory, context.directories.frontend ?? "frontend"), { recursive: true }),
      mkdir(join(context.rootDirectory, context.directories.backend ?? "backend"), { recursive: true }),
    ]);
  }

  private seedCoreContributions(
    runtime: ReturnType<typeof createIntegrationRuntime>,
    context: GenerationContext,
  ): void {
    const coreEnvironment = runtime.environment.scoped("stackforge-core");
    if (context.selection.projectType !== "frontend-only") {
      coreEnvironment.add({
        name: "JWT_SECRET",
        exampleValue: "",
        description: "Replace this value before using authentication in production.",
        section: "Application",
        targets: ["root"],
        sensitive: true,
      });
    }

    const structure = context.selection.projectType === "full-stack"
      ? "- `frontend/` contains the client.\n- `backend/` contains the API."
      : "The selected application is generated in this directory.";
    runtime.documentation.scoped("stackforge-core").add({
      id: "structure",
      title: "Structure",
      content: structure,
      order: 10,
    });
  }

  private async runProviderHooks(
    providers: StackForgeProvider[],
    context: GenerationContext,
    completedSteps: string[],
  ): Promise<Set<string>> {
    const installed = new Set<string>();
    for (const provider of providers) {
      for (const hook of provider.postInstallHooks ?? []) {
        const step = hook.name;
        context.log(`Running ${hook.name}...`);
        await this.runStep(step, () => hook.run(context));
        completedSteps.push(step);
        const manager = this.managerForProvider(provider);
        if (manager && (provider.metadata.category === "frontend" || provider.metadata.category === "backend")) {
          installed.add(`${manager}:${provider.metadata.category}`);
        }
      }
    }
    return installed;
  }

  private async runSelectedTestGenerators(
    providers: StackForgeProvider[],
    integrations: StackForgeIntegration[],
    runtime: ReturnType<typeof createIntegrationRuntime>,
    context: GenerationContext,
    completedSteps: string[],
  ): Promise<void> {
    const selection = context.selection.testing ?? {};
    if (
      (selection.frontend ?? []).includes("playwright")
      && (selection.fullStack ?? []).includes("fullstack-playwright-health")
    ) {
      throw new Error(
        "Choose either the frontend Playwright suite or the full-stack Playwright health flow, not both.",
      );
    }
    const providerSelections: Array<{
      component: Exclude<TestSuiteComponent, "full-stack">;
      optionIds: string[];
      provider: StackForgeProvider | undefined;
    }> = [
      {
        component: "frontend",
        optionIds: selection.frontend ?? [],
        provider: providers.find((provider) => provider.metadata.category === "frontend"),
      },
      {
        component: "backend",
        optionIds: selection.backend ?? [],
        provider: providers.find((provider) => provider.metadata.category === "backend"),
      },
    ];

    for (const item of providerSelections) {
      if (item.optionIds.length === 0) continue;
      if (!item.provider?.testing) {
        throw new Error(`The selected ${item.component} does not provide generated test suites.`);
      }
      for (const optionId of item.optionIds) {
        const option = item.provider.testing.options.find((candidate) => candidate.id === optionId);
        const generator = item.provider.testing.generators.find((candidate) => candidate.optionId === optionId);
        if (!option || !generator || option.isAvailable?.(context.selection) === false) {
          throw new Error(`Unsupported ${item.component} test option: ${optionId}`);
        }
        const owner: StackForgeIntegration = {
          metadata: {
            id: `testing:${item.provider.metadata.id}:${optionId}`,
            name: `${item.provider.metadata.name} ${option.name}`,
            description: "Generated provider test suite.",
            providerIds: [item.provider.metadata.id],
          },
          phase: "finalize",
          apply: async () => {},
        };
        const step = `${option.name} test generation`;
        context.log(`Generating ${option.name} tests...`);
        await this.runStep(step, () => generator.generate(runtime.contextFor(owner) as TestingGenerationContext));
        completedSteps.push(step);
      }
    }

    for (const optionId of selection.fullStack ?? []) {
      const integration = integrations.find((candidate) =>
        candidate.testing?.options.some((option) => option.id === optionId && option.isAvailable?.(context.selection) !== false));
      const option = integration?.testing?.options.find((candidate) => candidate.id === optionId);
      const generator = integration?.testing?.generators.find((candidate) => candidate.optionId === optionId);
      if (!integration || !option || !generator) {
        throw new Error(`Unsupported full-stack test option: ${optionId}`);
      }
      const step = `${option.name} test generation`;
      context.log(`Generating ${option.name} tests...`);
      await this.runStep(step, () => generator.generate(runtime.contextFor(integration) as TestingGenerationContext));
      completedSteps.push(step);
    }
  }

  private managerForProvider(provider: StackForgeProvider): DependencyManager | undefined {
    if (provider.metadata.id === "express" || provider.metadata.category === "frontend") return "npm";
    if (provider.metadata.id === "fastapi") return "python";
    if (provider.metadata.id === "springboot") return "maven";
    return undefined;
  }

  private async listGeneratedFiles(directory: string): Promise<Set<string>> {
    const files = new Set<string>();
    const ignoredDirectories = new Set([".git", ".next", "dist", "node_modules", "target"]);
    const visit = async (current: string): Promise<void> => {
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const path = join(current, entry.name);
        if (entry.isDirectory()) {
          if (ignoredDirectories.has(entry.name)) continue;
          await visit(path);
        } else if (entry.isFile()) {
          files.add(path);
        }
      }
    };
    await visit(directory);
    return files;
  }

  private async validateGeneratedOutput(
    context: GenerationContext,
    components: GeneratedComponent[],
    environmentFiles: string[],
    composeFile?: string,
  ): Promise<void> {
    for (const component of components.filter((item) => item.category !== "database")) {
      const info = await stat(component.directory);
      if (!info.isDirectory()) {
        throw new Error(`Generated component directory is missing: ${component.directory}`);
      }
    }
    for (const path of [...environmentFiles, ...(composeFile ? [composeFile] : [])]) {
      await access(path, constants.F_OK);
    }
    await access(join(context.rootDirectory, "README.md"), constants.F_OK);
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
