// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DefaultGeneratedFileWriter } from "./generation-files.js";

test("integrations can create files and intentionally replace provider files", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackforge-files-"));
  const providerPath = join(root, "frontend/page.tsx");
  try {
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(join(root, "frontend"), { recursive: true }));
    await writeFile(providerPath, "provider\n", "utf8");
    const writer = new DefaultGeneratedFileWriter(root, new Set([providerPath]));
    await writer.scoped("connector").replaceProviderFile("frontend/page.tsx", "connected\n");
    await writer.scoped("connector").create("frontend/lib/api.ts", "export {};\n");

    assert.equal(await readFile(providerPath, "utf8"), "connected\n");
    assert.equal(await readFile(join(root, "frontend/lib/api.ts"), "utf8"), "export {};\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generated-file writer rejects writes through symlinked directories", async () => {
  const parent = await mkdtemp(join(tmpdir(), "stackforge-files-symlink-"));
  const root = join(parent, "project");
  const outside = join(parent, "outside");
  try {
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(root, "frontend"), "dir");

    const writer = new DefaultGeneratedFileWriter(root, new Set());
    await assert.rejects(
      writer.scoped("connector").create("frontend/page.tsx", "unsafe\n"),
      /will not write through symlinks/i,
    );
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "EPERM" || nodeError.code === "EACCES" || nodeError.code === "ENOTSUP") {
      return;
    }
    throw error;
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("generated-file ownership prevents unsafe overwrites and traversal", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackforge-files-conflict-"));
  const providerPath = join(root, "page.tsx");
  try {
    await writeFile(providerPath, "provider\n", "utf8");
    const writer = new DefaultGeneratedFileWriter(root, new Set([providerPath]));
    await writer.scoped("first").replaceProviderFile("page.tsx", "first\n");
    await assert.rejects(
      writer.scoped("second").replaceProviderFile("page.tsx", "second\n"),
      /both attempted to replace/,
    );
    await assert.rejects(
      writer.scoped("second").create("../outside.txt", "unsafe"),
      /escapes the project root/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
