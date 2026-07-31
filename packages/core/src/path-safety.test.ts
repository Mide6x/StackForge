// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertNoSymlinkEscape,
  assertSafeRelativePath,
  componentDirectory,
  relativeFilePath,
  removeManagedPath,
  resolveInsideRoot,
} from "./path-safety.js";
import type { GenerationContext } from "./contracts.js";

function context(rootDirectory: string): GenerationContext {
  return {
    projectName: "sample-app",
    rootDirectory,
    selection: {
      projectType: "full-stack",
      providerIds: ["frontend-test", "backend-test"],
      docker: false,
    },
    answers: {},
    directories: { frontend: "frontend", backend: "backend" },
    log() {},
    async run() {},
  };
}

test("resolveInsideRoot rejects traversal, absolute paths, and prefix confusion", () => {
  assert.equal(resolveInsideRoot("/tmp/app", "frontend/index.ts"), "/tmp/app/frontend/index.ts");
  assert.throws(() => resolveInsideRoot("/tmp/app", "../outside.txt"), /escapes the project root/i);
  assert.throws(() => resolveInsideRoot("/tmp/app", "/tmp/application-evil/file"), /must be relative/i);
  assert.equal(resolveInsideRoot("/tmp/app", "nested/../file.txt"), "/tmp/app/file.txt");
});

test("directory configuration must remain relative to the project root", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackforge-paths-config-"));
  try {
    const sample = context(root);
    sample.directories.frontend = "../frontend";
    assert.throws(() => componentDirectory(sample, "frontend"), /escapes the project root/i);
    sample.directories.frontend = "/tmp/outside";
    assert.throws(() => componentDirectory(sample, "frontend"), /must be relative/i);
    sample.directories.frontend = "apps/frontend";
    assert.equal(componentDirectory(sample, "frontend"), join(root, "apps/frontend"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("symlink targets are rejected for generated files and removals", async () => {
  const parent = await mkdtemp(join(tmpdir(), "stackforge-paths-symlink-"));
  const root = join(parent, "project");
  const outside = join(parent, "outside");

  try {
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(root, "frontend"), "dir");

    await assert.rejects(
      assertNoSymlinkEscape(root, "frontend/app.ts"),
      /will not write through symlinks/i,
    );
    await assert.rejects(
      removeManagedPath(root, "frontend"),
      /will not write through symlinks|will not delete the project root/i,
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

test("removeManagedPath cannot delete the project root or outside files", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackforge-paths-delete-"));
  const outside = await mkdtemp(join(tmpdir(), "stackforge-paths-delete-outside-"));
  try {
    await writeFile(join(root, "compose.yaml"), "services: {}\n", "utf8");
    await removeManagedPath(root, "compose.yaml");
    await assert.rejects(readFile(join(root, "compose.yaml"), "utf8"));

    await assert.rejects(removeManagedPath(root, "."), /must not be empty|escapes the project root/i);
    await assert.rejects(removeManagedPath(root, "../outside"), /escapes the project root/i);

    await writeFile(join(outside, "secret.txt"), "secret\n", "utf8");
    await assert.rejects(removeManagedPath(root, "../../secret.txt"), /escapes the project root/i);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("safe relative path helpers reject invalid values", () => {
  assert.equal(assertSafeRelativePath("frontend"), "frontend");
  assert.equal(relativeFilePath("frontend", "src", "index.ts"), "frontend/src/index.ts");
  assert.throws(() => assertSafeRelativePath(""), /must not be empty/i);
  assert.throws(() => assertSafeRelativePath(".."), /escapes the project root/i);
});
