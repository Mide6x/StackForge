// SPDX-License-Identifier: MPL-2.0
import { join } from "node:path";
import type {
  EnvironmentAccumulator,
  EnvironmentTarget,
  EnvironmentVariableContribution,
  GenerationContext,
} from "../contracts.js";
import { writeText } from "../files.js";

type OwnedEnvironmentContribution = EnvironmentVariableContribution & {
  owners: Set<string>;
};

function assertVariableName(name: string): void {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid environment variable name "${name}".`);
  }
}

function targetPath(context: GenerationContext, target: EnvironmentTarget): string {
  if (target === "root") return join(context.rootDirectory, ".env.example");
  const directory = target === "frontend"
    ? context.directories.frontend ?? "frontend"
    : context.directories.backend ?? "backend";
  return join(context.rootDirectory, directory, ".env.example");
}

export class DefaultEnvironmentAccumulator {
  private readonly entries = new Map<string, OwnedEnvironmentContribution>();

  scoped(owner: string): EnvironmentAccumulator {
    return {
      add: (contribution) => this.add(owner, contribution),
    };
  }

  add(owner: string, contribution: EnvironmentVariableContribution): void {
    assertVariableName(contribution.name);
    if (contribution.targets.length === 0) {
      throw new Error(`Environment variable "${contribution.name}" must have at least one target.`);
    }

    if (contribution.sensitive && contribution.targets.includes("frontend")) {
      throw new Error(
        `Sensitive environment variable "${contribution.name}" cannot target the frontend.`,
      );
    }

    for (const target of [...new Set(contribution.targets)]) {
      const key = `${target}:${contribution.name}`;
      const existing = this.entries.get(key);
      if (!existing) {
        this.entries.set(key, {
          ...contribution,
          targets: [target],
          owners: new Set([owner]),
        });
        continue;
      }

      if (
        existing.exampleValue !== contribution.exampleValue
        || Boolean(existing.sensitive) !== Boolean(contribution.sensitive)
      ) {
        throw new Error(
          `Environment variable conflict for "${contribution.name}" in ${target}: `
          + `${[...existing.owners].join(", ")} and ${owner} contributed incompatible values.`,
        );
      }

      if (
        existing.section
        && contribution.section
        && existing.section !== contribution.section
      ) {
        throw new Error(
          `Environment variable conflict for "${contribution.name}" in ${target}: `
          + `sections "${existing.section}" and "${contribution.section}" do not match.`,
        );
      }

      existing.description ??= contribution.description;
      existing.section ??= contribution.section;
      existing.owners.add(owner);
    }
  }

  async finalize(context: GenerationContext): Promise<string[]> {
    const files: string[] = [];
    const targets: EnvironmentTarget[] = ["root", "frontend", "backend"];

    for (const target of targets) {
      const entries = [...this.entries.values()]
        .filter((entry) => entry.targets[0] === target)
        .sort((left, right) => {
          const section = (left.section ?? "").localeCompare(right.section ?? "");
          return section || left.name.localeCompare(right.name);
        });

      if (entries.length === 0) continue;

      const lines: string[] = [];
      let currentSection: string | undefined;
      for (const entry of entries) {
        if (entry.section && entry.section !== currentSection) {
          if (lines.length > 0) lines.push("");
          lines.push(`# ${entry.section}`);
          currentSection = entry.section;
        }
        if (entry.description) lines.push(`# ${entry.description}`);
        lines.push(`${entry.name}=${entry.exampleValue}`);
      }

      const path = targetPath(context, target);
      await writeText(path, "", `${lines.join("\n")}\n`);
      files.push(path);
    }

    return files;
  }
}
