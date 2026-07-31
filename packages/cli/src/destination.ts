// SPDX-License-Identifier: MPL-2.0
import { basename, resolve } from "node:path";
import { access, readdir } from "node:fs/promises";
import { constants } from "node:fs";

export type ProjectDestinationMode = "new-directory" | "current-directory";
const harmlessEntries = new Set([".DS_Store"]);

export interface ProjectDestination {
  projectName: string;
  rootDirectory: string;
  mode: ProjectDestinationMode;
}

export interface DestinationInspection {
  exists: boolean;
  meaningfulEntries: string[];
}

export type NonEmptyDestinationDecision = "cancel" | "continue";

function isBlank(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

function normalizeTargetPath(targetPath: string): string {
  const trimmed = targetPath.trim();
  if (isBlank(trimmed)) {
    throw new Error("Please provide a valid project path.");
  }
  if (trimmed === ".." || trimmed === "/") {
    throw new Error(`The destination path "${trimmed}" is not supported.`);
  }
  return trimmed;
}

export function resolveDestination(invocationDirectory: string, targetPath: string): ProjectDestination {
  const normalizedPath = normalizeTargetPath(targetPath);

  if (normalizedPath === ".") {
    return {
      mode: "current-directory",
      projectName: basename(invocationDirectory),
      rootDirectory: invocationDirectory,
    };
  }

  const projectName = basename(normalizedPath);
  if (!projectName || projectName === "." || projectName === "..") {
    throw new Error(`The destination path "${targetPath}" is not supported.`);
  }

  return {
    mode: "new-directory",
    projectName,
    rootDirectory: resolve(invocationDirectory, normalizedPath),
  };
}

export async function inspectDestination(rootDirectory: string): Promise<DestinationInspection> {
  try {
    const entries = await readdir(rootDirectory, { withFileTypes: true });
    return {
      exists: true,
      meaningfulEntries: entries
        .map((entry) => entry.name)
        .filter((name) => !harmlessEntries.has(name))
        .sort(),
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return { exists: false, meaningfulEntries: [] };
    }
    throw error;
  }
}

export async function assertDestinationWritable(rootDirectory: string): Promise<void> {
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

    const parent = resolve(probe, "..");
    if (parent === probe) {
      throw new Error(`StackForge cannot write to ${rootDirectory}.`);
    }
    probe = parent;
  }
}

export async function ensureDestinationApproved(
  inspection: DestinationInspection,
  chooseAction: () => Promise<NonEmptyDestinationDecision>,
  onCancel: () => never,
): Promise<void> {
  if (inspection.meaningfulEntries.length === 0) return;

  const decision = await chooseAction();
  if (decision === "cancel") {
    onCancel();
  }
}
