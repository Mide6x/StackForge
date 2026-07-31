// SPDX-License-Identifier: MPL-2.0
import { access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import type { GeneratedFileWriter } from "./contracts.js";

function safePath(rootDirectory: string, relativePath: string): string {
  if (!relativePath || isAbsolute(relativePath)) {
    throw new Error(`Generated file path must be relative: "${relativePath}".`);
  }
  const normalized = normalize(relativePath);
  const absolute = resolve(rootDirectory, normalized);
  const fromRoot = relative(rootDirectory, absolute);
  if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error(`Generated file path escapes the project root: "${relativePath}".`);
  }
  return absolute;
}

export class DefaultGeneratedFileWriter {
  private readonly claims = new Map<string, string>();

  constructor(
    private readonly rootDirectory: string,
    private readonly providerFiles: Set<string>,
  ) {}

  scoped(owner: string): GeneratedFileWriter {
    return {
      create: (path, content) => this.create(owner, path, content),
      replaceProviderFile: (path, content) => this.replaceProviderFile(owner, path, content),
      exists: (path) => this.exists(path),
    };
  }

  private async create(owner: string, relativePath: string, content: string): Promise<void> {
    const path = safePath(this.rootDirectory, relativePath);
    const claimed = this.claims.get(path);
    if (claimed) {
      throw new Error(`Generated file conflict at "${relativePath}": already claimed by ${claimed}.`);
    }
    try {
      await access(path, constants.F_OK);
      throw new Error(`Generated file conflict at "${relativePath}": the file already exists.`);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code !== "ENOENT") throw error;
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
    this.claims.set(path, owner);
  }

  private async replaceProviderFile(
    owner: string,
    relativePath: string,
    content: string,
  ): Promise<void> {
    const path = safePath(this.rootDirectory, relativePath);
    const claimed = this.claims.get(path);
    if (claimed && claimed !== owner) {
      throw new Error(
        `Generated file conflict at "${relativePath}": ${claimed} and ${owner} both attempted to replace it.`,
      );
    }
    if (!this.providerFiles.has(path)) {
      throw new Error(
        `Integration ${owner} cannot replace "${relativePath}" because it was not created by a provider in this generation.`,
      );
    }
    await writeFile(path, content, "utf8");
    this.claims.set(path, owner);
  }

  private async exists(relativePath: string): Promise<boolean> {
    try {
      await access(safePath(this.rootDirectory, relativePath), constants.F_OK);
      return true;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") return false;
      throw error;
    }
  }
}
