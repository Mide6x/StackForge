import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import type {
  DependencyAccumulator,
  DependencyContribution,
  DependencyInstallationOutcome,
  DependencyManager,
  DependencyTarget,
  GenerationContext,
} from "../contracts.js";

type OwnedDependency = {
  contribution: DependencyContribution;
  owners: Set<string>;
};

type DependencyGroup = {
  manager: DependencyManager;
  target: DependencyTarget;
  contributions: DependencyContribution[];
};

function contributionKey(contribution: DependencyContribution): string {
  if (contribution.manager === "maven") {
    return `${contribution.manager}:${contribution.target}:${contribution.groupId}:${contribution.artifactId}`;
  }
  const group = contribution.manager === "npm"
    ? contribution.development ? "development" : "runtime"
    : contribution.group ?? "main";
  return `${contribution.manager}:${contribution.target}:${group}:${contribution.name}`;
}

function versionOf(contribution: DependencyContribution): string | undefined {
  return contribution.version;
}

function targetDirectory(context: GenerationContext, target: DependencyTarget): string {
  if (context.selection.projectType !== "full-stack") return context.rootDirectory;
  const relative = target === "frontend"
    ? context.directories.frontend ?? "frontend"
    : context.directories.backend ?? "backend";
  return join(context.rootDirectory, relative);
}

function dependencyLabel(contribution: DependencyContribution): string {
  return contribution.manager === "maven"
    ? `${contribution.groupId}:${contribution.artifactId}`
    : contribution.name;
}

export class DefaultDependencyAccumulator {
  private readonly entries = new Map<string, OwnedDependency>();

  scoped(owner: string): DependencyAccumulator {
    return {
      add: (contribution) => this.add(owner, contribution),
    };
  }

  add(owner: string, contribution: DependencyContribution): void {
    const key = contributionKey(contribution);
    const existing = this.entries.get(key);
    if (!existing) {
      this.entries.set(key, {
        contribution: structuredClone(contribution),
        owners: new Set([owner]),
      });
      return;
    }

    const currentVersion = versionOf(existing.contribution);
    const incomingVersion = versionOf(contribution);
    if (currentVersion && incomingVersion && currentVersion !== incomingVersion) {
      throw new Error(
        `Dependency version conflict for "${dependencyLabel(contribution)}": `
        + `${[...existing.owners].join(", ")} requested ${currentVersion}, `
        + `but ${owner} requested ${incomingVersion}.`,
      );
    }

    if (!currentVersion && incomingVersion) {
      existing.contribution = structuredClone(contribution);
    }
    existing.owners.add(owner);
  }

  list(): DependencyContribution[] {
    return [...this.entries.values()]
      .map((entry) => structuredClone(entry.contribution))
      .sort((left, right) => contributionKey(left).localeCompare(contributionKey(right)));
  }

  async apply(context: GenerationContext): Promise<DependencyGroup[]> {
    const grouped = new Map<string, DependencyGroup>();
    for (const contribution of this.list()) {
      const key = `${contribution.manager}:${contribution.target}`;
      const group = grouped.get(key) ?? {
        manager: contribution.manager,
        target: contribution.target,
        contributions: [],
      };
      group.contributions.push(contribution);
      grouped.set(key, group);
    }

    for (const group of grouped.values()) {
      const directory = targetDirectory(context, group.target);
      if (group.manager === "npm") {
        await applyNpmDependencies(directory, group.contributions);
      } else if (group.manager === "python") {
        await applyPythonDependencies(directory, group.contributions);
      } else {
        await applyMavenDependencies(directory, group.contributions);
      }
    }

    return [...grouped.values()].sort((left, right) =>
      `${left.manager}:${left.target}`.localeCompare(`${right.manager}:${right.target}`));
  }

  async install(
    context: GenerationContext,
    groups: DependencyGroup[],
    externallyInstalledTargets: Set<string>,
  ): Promise<DependencyInstallationOutcome[]> {
    const outcomes: DependencyInstallationOutcome[] = [];

    for (const group of groups) {
      const directory = targetDirectory(context, group.target);
      const groupKey = `${group.manager}:${group.target}`;
      if (externallyInstalledTargets.has(groupKey)) {
        outcomes.push({
          manager: group.manager,
          directory,
          status: "succeeded",
          reason: "Installed by the selected provider post-install hook.",
        });
        continue;
      }

      const command = await installCommand(group.manager, directory);
      if (!command) {
        outcomes.push({
          manager: group.manager,
          directory,
          status: "skipped",
          reason: `${group.manager} tooling is not available. Install dependencies manually.`,
        });
        continue;
      }

      try {
        await context.run(command[0]!, command.slice(1), directory);
        outcomes.push({
          manager: group.manager,
          directory,
          status: "succeeded",
          command,
        });
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          outcomes.push({
            manager: group.manager,
            directory,
            status: "skipped",
            command,
            reason: `${command[0]} is not available. Install dependencies manually.`,
          });
          continue;
        }
        outcomes.push({
          manager: group.manager,
          directory,
          status: "failed",
          command,
          reason: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    return outcomes;
  }
}

async function applyNpmDependencies(
  directory: string,
  contributions: DependencyContribution[],
): Promise<void> {
  const packagePath = join(directory, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const dependencies = { ...packageJson.dependencies };
  const devDependencies = { ...packageJson.devDependencies };

  for (const contribution of contributions) {
    if (contribution.manager !== "npm") continue;
    const target = contribution.development ? devDependencies : dependencies;
    target[contribution.name] = contribution.version ?? "latest";
  }

  packageJson.dependencies = Object.fromEntries(
    Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right)),
  );
  if (Object.keys(devDependencies).length > 0) {
    packageJson.devDependencies = Object.fromEntries(
      Object.entries(devDependencies).sort(([left], [right]) => left.localeCompare(right)),
    );
  }
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

async function applyPythonDependencies(
  directory: string,
  contributions: DependencyContribution[],
): Promise<void> {
  const projectPath = join(directory, "pyproject.toml");
  let project = await readFile(projectPath, "utf8");
  const python = contributions.filter((item): item is Extract<DependencyContribution, { manager: "python" }> =>
    item.manager === "python");
  for (const group of ["main", "development"] as const) {
    const additions = python
      .filter((item) => (item.group ?? "main") === group)
      .map((item) => `${item.name}${item.version ?? ""}`);
    if (additions.length === 0) continue;
    const key = group === "main" ? "dependencies" : "dev-dependencies";
    const array = findTomlStringArray(project, key);
    if (!array) throw new Error(`Could not find ${key} in ${projectPath}.`);
    const current = JSON.parse(array.value) as string[];
    const merged = [...new Set([...current, ...additions])].sort();
    project = `${project.slice(0, array.start)}${JSON.stringify(merged, null, 2)}${project.slice(array.end)}`;
  }
  await writeFile(projectPath, project, "utf8");
}

function findTomlStringArray(
  source: string,
  key: string,
): { start: number; end: number; value: string } | undefined {
  const assignment = new RegExp(`(?:^|\\n)\\s*${key}\\s*=\\s*`, "m").exec(source);
  if (!assignment) return undefined;
  const start = source.indexOf("[", assignment.index + assignment[0].length);
  if (start < 0) return undefined;

  let inString = false;
  let escaped = false;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        return {
          start,
          end: index + 1,
          value: source.slice(start, index + 1),
        };
      }
    }
  }
  return undefined;
}

async function applyMavenDependencies(
  directory: string,
  contributions: DependencyContribution[],
): Promise<void> {
  const pomPath = join(directory, "pom.xml");
  let pom = await readFile(pomPath, "utf8");
  const additions: string[] = [];

  for (const contribution of contributions) {
    if (contribution.manager !== "maven") continue;
    if (pom.includes(`<artifactId>${contribution.artifactId}</artifactId>`)) continue;
    additions.push(
      "<dependency>"
      + `<groupId>${contribution.groupId}</groupId>`
      + `<artifactId>${contribution.artifactId}</artifactId>`
      + (contribution.version ? `<version>${contribution.version}</version>` : "")
      + (contribution.scope ? `<scope>${contribution.scope}</scope>` : "")
      + "</dependency>",
    );
  }

  if (additions.length > 0) {
    pom = pom.replace("</dependencies>", `${additions.sort().join("")}</dependencies>`);
    await writeFile(pomPath, pom, "utf8");
  }
}

async function installCommand(
  manager: DependencyManager,
  directory: string,
): Promise<string[] | undefined> {
  if (manager === "npm") return ["npm", "install"];
  if (manager === "python") return ["uv", "sync"];
  try {
    await access(join(directory, "mvnw"), constants.X_OK);
    return ["./mvnw", "dependency:resolve"];
  } catch {
    return ["mvn", "dependency:resolve"];
  }
}
