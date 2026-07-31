// SPDX-License-Identifier: MPL-2.0
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  DependencyTarget,
  GenerationContext,
  PackageScriptAccumulator,
  PackageScriptContribution,
} from "../contracts.js";

type OwnedScript = {
  contribution: PackageScriptContribution;
  owners: Set<string>;
};

function targetDirectory(context: GenerationContext, target: DependencyTarget): string {
  if (context.selection.projectType !== "full-stack") return context.rootDirectory;
  return join(
    context.rootDirectory,
    target === "frontend"
      ? context.directories.frontend ?? "frontend"
      : context.directories.backend ?? "backend",
  );
}

export class DefaultPackageScriptAccumulator {
  private readonly entries = new Map<string, OwnedScript>();

  scoped(owner: string): PackageScriptAccumulator {
    return { add: (contribution) => this.add(owner, contribution) };
  }

  add(owner: string, contribution: PackageScriptContribution): void {
    if (!/^[a-zA-Z0-9:_-]+$/.test(contribution.name)) {
      throw new Error(`Invalid package script name "${contribution.name}".`);
    }
    if (!contribution.command.trim()) {
      throw new Error(`Package script "${contribution.name}" must have a command.`);
    }

    const key = `${contribution.target}:${contribution.name}`;
    const existing = this.entries.get(key);
    if (!existing) {
      this.entries.set(key, {
        contribution: structuredClone(contribution),
        owners: new Set([owner]),
      });
      return;
    }
    if (existing.contribution.command !== contribution.command) {
      throw new Error(
        `Package script conflict for "${contribution.name}": `
        + `${[...existing.owners].join(", ")} requested "${existing.contribution.command}", `
        + `but ${owner} requested "${contribution.command}".`,
      );
    }
    existing.owners.add(owner);
  }

  async apply(context: GenerationContext): Promise<void> {
    const grouped = new Map<DependencyTarget, PackageScriptContribution[]>();
    for (const entry of this.entries.values()) {
      const scripts = grouped.get(entry.contribution.target) ?? [];
      scripts.push(entry.contribution);
      grouped.set(entry.contribution.target, scripts);
    }

    for (const [target, contributions] of grouped) {
      const packagePath = join(targetDirectory(context, target), "package.json");
      const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
        scripts?: Record<string, string>;
      };
      const scripts = { ...packageJson.scripts };
      for (const contribution of contributions) {
        const current = scripts[contribution.name];
        if (current && current !== contribution.command) {
          throw new Error(
            `Package script conflict for "${contribution.name}" in ${packagePath}: `
            + `existing value is "${current}".`,
          );
        }
        scripts[contribution.name] = contribution.command;
      }
      packageJson.scripts = Object.fromEntries(
        Object.entries(scripts).sort(([left], [right]) => left.localeCompare(right)),
      );
      await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
    }
  }
}
