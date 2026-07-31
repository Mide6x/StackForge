import { relative } from "node:path";
import type {
  GeneratedComponent,
  GenerationFailure,
  GenerationResult,
  ProviderRuntimeInstructions,
} from "@stackforge/core";

function toRelativePath(fromDirectory: string, targetPath: string): string {
  const value = relative(fromDirectory, targetPath) || ".";
  return value === "." ? "." : value.replace(/\\/g, "/");
}

function toDisplayPath(fromDirectory: string, targetPath: string): string {
  const relativePath = toRelativePath(fromDirectory, targetPath);
  if (relativePath === ".") return ".";
  if (relativePath.startsWith("../")) return relativePath;
  return relativePath.includes("/") ? relativePath : `./${relativePath}`;
}

function formatCommandBlock(commands: string[]): string {
  return commands.map((command) => `    ${command}`).join("\n");
}

function formatCdCommand(target: string): string[] {
  if (target === ".") return [];
  return [`cd ${target}`];
}

function findComponent(result: GenerationResult, category: GeneratedComponent["category"]): GeneratedComponent | undefined {
  return result.components.find((component) => component.category === category);
}

function componentCommandBlock(
  component: GeneratedComponent,
  runtime: ProviderRuntimeInstructions | undefined,
  invocationDirectory: string,
): string | undefined {
  if (!runtime?.developmentCommand || runtime.dependenciesInstalled === false) return undefined;

  const target = toRelativePath(invocationDirectory, component.directory);
  return formatCommandBlock([
    ...formatCdCommand(target),
    ...runtime.developmentCommand,
  ]);
}

function installCommandBlock(
  component: GeneratedComponent,
  runtime: ProviderRuntimeInstructions | undefined,
  invocationDirectory: string,
): string | undefined {
  if (!runtime?.installCommand || runtime.dependenciesInstalled !== false) return undefined;

  const target = toRelativePath(invocationDirectory, component.directory);
  return formatCommandBlock([
    ...formatCdCommand(target),
    ...runtime.installCommand,
  ]);
}

function exampleTarget(examplePath: string): string {
  return examplePath.endsWith(".example")
    ? examplePath.slice(0, -".example".length)
    : `${examplePath}.local`;
}

function formatEnvironmentFiles(result: GenerationResult, invocationDirectory: string): string[] {
  if (result.environmentFiles.length === 1) {
    const source = toRelativePath(invocationDirectory, result.environmentFiles[0]!);
    const target = toRelativePath(invocationDirectory, exampleTarget(result.environmentFiles[0]!));
    return [
      "Environment setup required",
      "",
      "1. Copy the example file:",
      "",
      `   cp ${source} ${target}`,
      "",
      "2. Add your credentials.",
      "",
      "3. Do not commit the .env file.",
    ];
  }

  const lines = [
    "Environment setup required",
    "",
    "Frontend environment:",
  ];
  const frontendEnv = result.environmentFiles.find((file) => file.includes("/frontend/"));
  const backendEnv = result.environmentFiles.find((file) => file.includes("/backend/"));
  const rootEnv = result.environmentFiles.find((file) => !file.includes("/frontend/") && !file.includes("/backend/"));

  if (frontendEnv) lines.push(`  ${toRelativePath(invocationDirectory, frontendEnv)}`);
  if (backendEnv) {
    lines.push("", "Backend environment:");
    lines.push(`  ${toRelativePath(invocationDirectory, backendEnv)}`);
  }
  if (rootEnv) {
    lines.push("", "Project environment:");
    lines.push(`  ${toRelativePath(invocationDirectory, rootEnv)}`);
  }
  lines.push("", "Copy the example files you need, add your credentials, and do not commit real .env files.");
  return lines;
}

function formatTesting(result: GenerationResult, invocationDirectory: string): string[] {
  const suites = result.testSuites ?? [];
  if (suites.length === 0) return [];
  const labels: Record<(typeof suites)[number]["component"], string> = {
    frontend: "Frontend",
    backend: "Backend",
    "full-stack": "Full-stack",
  };
  const lines = ["Testing"];
  for (const component of ["frontend", "backend", "full-stack"] as const) {
    const selected = suites.filter((suite) => suite.component === component);
    if (selected.length === 0) continue;
    lines.push("", labels[component]);
    for (const suite of selected) {
      lines.push(`  ${suite.name}:`);
      for (const runtime of suite.commands) {
        lines.push("", `    ${runtime.name}:`, "", formatCommandBlock([
          ...formatCdCommand(toRelativePath(invocationDirectory, suite.directory)),
          runtime.command.join(" "),
        ]));
        for (const requirement of runtime.requires ?? []) {
          lines.push(`    Requires: ${requirement}`);
        }
      }
    }
  }
  return lines;
}

export function formatGenerationSummary(result: GenerationResult, invocationDirectory: string): string {
  const frontend = findComponent(result, "frontend");
  const backend = findComponent(result, "backend");
  const database = findComponent(result, "database");
  const lines: string[] = [];

  if (result.components.some((component) => component.category === "frontend") && result.components.some((component) => component.category === "backend")) {
    lines.push("Project created successfully");
  } else if (frontend) {
    lines.push("Frontend project created successfully");
  } else {
    lines.push("Backend project created successfully");
  }

  lines.push("", "Project root", `  ${result.rootDirectory}`);

  if (frontend) {
    lines.push("", "Frontend", `  Created at: ${toDisplayPath(invocationDirectory, frontend.directory)}`, `  Framework: ${frontend.name}`);
    const commands = componentCommandBlock(frontend, frontend.runtime, invocationDirectory);
    if (commands) {
      lines.push("  Start command:", "", commands);
    }
    if (frontend.runtime?.localUrl) {
      lines.push("", "  Local URL:", `    ${frontend.runtime.localUrl}`);
    }
  }

  if (backend) {
    lines.push("", "Backend", `  Created at: ${toDisplayPath(invocationDirectory, backend.directory)}`, `  Framework: ${backend.name}`);
    const commands = componentCommandBlock(backend, backend.runtime, invocationDirectory);
    if (commands) {
      lines.push("  Start command:", "", commands);
    }
    if (backend.runtime?.localUrl) {
      lines.push("", "  API URL:", `    ${backend.runtime.localUrl}`);
    }
    if (backend.runtime?.healthCheckUrl) {
      lines.push("", "  Health check:", `    ${backend.runtime.healthCheckUrl}`);
    }
  }

  if (database) {
    lines.push("", "Database", `  ${database.name}`);
    const setupSteps = result.database?.setupSteps ?? database.runtime?.notes ?? [];
    if (setupSteps.length > 0) {
      lines.push("  Setup:");
      setupSteps.forEach((note, index) => lines.push(`  ${index + 1}. ${note}`));
    } else {
      const databaseEnvironment = result.environmentFiles.find((path) =>
        path.includes("/backend/")) ?? result.environmentFiles[0];
      if (databaseEnvironment) {
        lines.push("  Connection value added to:", `    ${databaseEnvironment}`);
      }
    }
  }

  if (result.dependenciesInstalled) {
    lines.push("", "Dependencies installed successfully.");
  } else {
    lines.push("", "Dependencies were not installed.", "", "Run:");
    for (const component of result.components) {
      const commands = installCommandBlock(component, component.runtime, invocationDirectory);
      if (commands) {
        lines.push("", commands);
      }
    }
  }

  if (result.environmentFiles.length > 0) {
    lines.push("", ...formatEnvironmentFiles(result, invocationDirectory));
  }

  const testing = formatTesting(result, invocationDirectory);
  if (testing.length > 0) lines.push("", ...testing);

  if (result.docker?.enabled && result.docker.command?.length) {
    lines.push("", "Docker");
    lines.push(
      result.docker.startsFullStack
        ? "  Start everything:"
        : result.database?.localServiceName
          ? "  Start the database:"
          : "  Start the generated containers:",
    );
    lines.push("", formatCommandBlock([
      ...formatCdCommand(toRelativePath(invocationDirectory, result.rootDirectory)),
      ...result.docker.command,
    ]));
  }

  if (result.manualSteps?.length) {
    lines.push("", "Manual steps");
    result.manualSteps.forEach((step, index) => lines.push(`  ${index + 1}. ${step}`));
  }

  if (result.warnings.length > 0) {
    lines.push("", "Warnings");
    result.warnings.forEach((warning) => lines.push(`  - ${warning}`));
  }

  return lines.join("\n");
}

export function formatGenerationFailure(
  error: GenerationFailure,
): string {
  const lines = [
    "StackForge could not finish creating the project.",
    "",
    "Completed:",
  ];

  if (error.details.completedSteps.length === 0) {
    lines.push("  (none)");
  } else {
    error.details.completedSteps.forEach((step) => lines.push(`  ✓ ${step}`));
  }

  lines.push(
    "",
    "Failed:",
    `  ✗ ${error.details.failedStep}`,
    "",
    "Reason:",
    `  ${error.message}`,
    "",
    "Partial files remain at:",
    `  ${error.details.rootDirectory}`,
  );

  return lines.join("\n");
}
