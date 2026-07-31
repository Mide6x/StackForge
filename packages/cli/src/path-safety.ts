// SPDX-License-Identifier: MPL-2.0
import { access, lstat, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";

export class UnsafeDestinationError extends Error {
  constructor(
    message: string,
    readonly path: string,
    readonly reason: string,
  ) {
    super(message);
    this.name = "UnsafeDestinationError";
  }
}

function isBlank(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

function containsNullByte(value: string): boolean {
  return value.includes("\0");
}

function assertWithinBase(baseDirectory: string, candidate: string, original: string): void {
  const relation = relative(baseDirectory, candidate);
  if (
    relation === ".."
    || relation.startsWith(`..${sep}`)
    || relation === ""
    || isAbsolute(relation)
  ) {
    if (relation === "") return;
    throw new UnsafeDestinationError(
      `The destination path "${original}" must stay inside ${baseDirectory}.`,
      candidate,
      "path-outside-invocation-directory",
    );
  }
}

async function canonicalizeExistingParent(candidate: string): Promise<{ parent: string; missing: string[] }> {
  const missing: string[] = [];
  let current = candidate;

  for (;;) {
    try {
      const info = await lstat(current);
      if (!info.isDirectory()) {
        throw new UnsafeDestinationError(
          `The destination path "${candidate}" is not a directory path.`,
          current,
          "existing-path-is-not-directory",
        );
      }
      return { parent: await realpath(current), missing: missing.reverse() };
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError instanceof UnsafeDestinationError) throw nodeError;
      if (nodeError.code !== "ENOENT") throw error;
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new UnsafeDestinationError(
        `The destination path "${candidate}" is not supported.`,
        candidate,
        "no-existing-parent",
      );
    }
    missing.push(basename(current));
    current = parent;
  }
}

export async function canonicalInvocationDirectory(invocationDirectory: string): Promise<string> {
  if (isBlank(invocationDirectory) || containsNullByte(invocationDirectory)) {
    throw new UnsafeDestinationError(
      "StackForge could not determine a safe invocation directory.",
      invocationDirectory,
      "invalid-invocation-directory",
    );
  }
  const canonical = await realpath(resolve(invocationDirectory));
  if (canonical === parse(canonical).root) {
    throw new UnsafeDestinationError(
      "Generating a project from the filesystem root is not supported.",
      canonical,
      "filesystem-root",
    );
  }
  return canonical;
}

export async function canonicalizeDestinationPath(
  invocationDirectory: string,
  targetPath: string,
): Promise<{ canonicalInvocation: string; canonicalRoot: string; normalizedInput: string }> {
  const canonicalInvocation = await canonicalInvocationDirectory(invocationDirectory);
  const trimmed = targetPath.trim();

  if (isBlank(trimmed)) {
    throw new UnsafeDestinationError(
      "Please provide a valid project path.",
      targetPath,
      "blank-path",
    );
  }
  if (containsNullByte(trimmed)) {
    throw new UnsafeDestinationError(
      `The destination path "${targetPath}" is not supported.`,
      targetPath,
      "null-byte",
    );
  }
  if (isAbsolute(trimmed)) {
    throw new UnsafeDestinationError(
      `The destination path "${targetPath}" must stay inside ${canonicalInvocation}.`,
      targetPath,
      "absolute-path-not-allowed",
    );
  }

  const resolved = resolve(canonicalInvocation, trimmed);
  assertWithinBase(canonicalInvocation, resolved, trimmed);

  const { parent, missing } = await canonicalizeExistingParent(resolved);
  const canonicalRoot = resolve(parent, ...missing);
  assertWithinBase(canonicalInvocation, canonicalRoot, trimmed);

  if (canonicalRoot === parse(canonicalRoot).root) {
    throw new UnsafeDestinationError(
      `The destination path "${targetPath}" is not supported.`,
      canonicalRoot,
      "filesystem-root",
    );
  }

  return {
    canonicalInvocation,
    canonicalRoot,
    normalizedInput: trimmed,
  };
}

export async function assertDirectoryWritable(rootDirectory: string): Promise<void> {
  let probe = rootDirectory;

  for (;;) {
    try {
      await access(probe, constants.W_OK);
      return;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== "ENOENT") {
        throw new UnsafeDestinationError(
          `StackForge cannot write to ${rootDirectory}.`,
          rootDirectory,
          "destination-not-writable",
        );
      }
    }

    const parent = dirname(probe);
    if (parent === probe) {
      throw new UnsafeDestinationError(
        `StackForge cannot write to ${rootDirectory}.`,
        rootDirectory,
        "destination-not-writable",
      );
    }
    probe = parent;
  }
}
