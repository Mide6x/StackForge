// SPDX-License-Identifier: MPL-2.0
import { basename } from "node:path";
import { readdir } from "node:fs/promises";
import {
  assertDirectoryWritable,
  canonicalizeDestinationPath,
} from "./path-safety.js";

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

export async function resolveDestination(
  invocationDirectory: string,
  targetPath: string,
): Promise<ProjectDestination> {
  const { canonicalInvocation, canonicalRoot, normalizedInput } = await canonicalizeDestinationPath(
    invocationDirectory,
    targetPath,
  );

  if (normalizedInput === ".") {
    return {
      mode: "current-directory",
      projectName: basename(canonicalRoot),
      rootDirectory: canonicalRoot,
    };
  }

  if (canonicalRoot === canonicalInvocation) {
    throw new Error(`The destination path "${targetPath}" is not supported.`);
  }

  const projectName = basename(canonicalRoot);
  if (!projectName || projectName === "." || projectName === "..") {
    throw new Error(`The destination path "${targetPath}" is not supported.`);
  }

  return {
    mode: "new-directory",
    projectName,
    rootDirectory: canonicalRoot,
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
  await assertDirectoryWritable(rootDirectory);
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
