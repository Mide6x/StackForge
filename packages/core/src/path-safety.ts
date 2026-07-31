// SPDX-License-Identifier: MPL-2.0
import { lstat, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import type { GenerationContext } from "./contracts.js";

export class PathSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathSafetyError";
  }
}

function hasRootEscape(relation: string): boolean {
  return relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation);
}

export function assertSafeRelativePath(relativePath: string, label = "path"): string {
  if (!relativePath || !relativePath.trim()) {
    throw new PathSafetyError(`${label} must not be empty.`);
  }
  if (relativePath.includes("\0")) {
    throw new PathSafetyError(`${label} must not contain null bytes.`);
  }
  if (isAbsolute(relativePath)) {
    throw new PathSafetyError(`${label} must be relative.`);
  }

  const normalized = normalize(relativePath);
  const relation = relative(".", normalized);
  if (normalized === "." || hasRootEscape(relation)) {
    throw new PathSafetyError(`${label} escapes the project root.`);
  }
  return normalized;
}

export function resolveInsideRoot(rootDirectory: string, relativePath: string): string {
  const normalized = assertSafeRelativePath(relativePath, "Generated file path");
  const absolute = resolve(rootDirectory, normalized);
  const relation = relative(rootDirectory, absolute);
  if (hasRootEscape(relation)) {
    throw new PathSafetyError(`Generated file path escapes the project root: "${relativePath}".`);
  }
  return absolute;
}

async function assertNoSymlinkPath(rootDirectory: string, relativePath: string): Promise<string> {
  let current = rootDirectory;
  for (const part of relativePath.split(/[\\/]+/).filter(Boolean)) {
    current = join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        throw new PathSafetyError(`StackForge will not write through symlinks: ${current}`);
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
  return current;
}

export async function assertNoSymlinkEscape(rootDirectory: string, relativePath: string): Promise<string> {
  const canonicalRoot = resolve(rootDirectory);
  const normalized = assertSafeRelativePath(relativePath, "Generated file path");
  const absolute = resolveInsideRoot(canonicalRoot, normalized);
  const relation = relative(canonicalRoot, absolute);
  if (hasRootEscape(relation)) {
    throw new PathSafetyError(`Generated file path escapes the project root: "${relativePath}".`);
  }
  return assertNoSymlinkPath(canonicalRoot, normalized);
}

export function componentRelativeDirectory(
  context: GenerationContext,
  category: "frontend" | "backend",
): string {
  if (context.selection.projectType !== "full-stack") return ".";
  const configured = context.directories[category] ?? category;
  return assertSafeRelativePath(configured, `${category} directory`);
}

export function componentDirectory(
  context: GenerationContext,
  category: "frontend" | "backend",
): string {
  if (context.selection.projectType !== "full-stack") return context.rootDirectory;
  return resolveInsideRoot(context.rootDirectory, componentRelativeDirectory(context, category));
}

export async function removeManagedPath(rootDirectory: string, relativePath: string): Promise<void> {
  const absolute = await assertNoSymlinkEscape(rootDirectory, relativePath);
  const relation = relative(rootDirectory, absolute);
  if (!relation || relation === ".") {
    throw new PathSafetyError("StackForge will not delete the project root.");
  }
  await rm(absolute, { recursive: true, force: true });
}

export function relativeFilePath(...parts: string[]): string {
  return assertSafeRelativePath(join(...parts), "Generated file path");
}
