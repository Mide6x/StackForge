// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import test from "node:test";
import {
  assertDestinationWritable,
  ensureDestinationApproved,
  inspectDestination,
  resolveDestination,
} from "./destination.js";

test("a named project creates a new folder", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "stackforge-cli-workspace-"));
  const destination = await resolveDestination(workspace, "my-app");
  const canonicalWorkspace = await realpath(workspace);

  assert.equal(destination.mode, "new-directory");
  assert.equal(destination.projectName, "my-app");
  assert.equal(destination.rootDirectory, resolve(canonicalWorkspace, "my-app"));

  await rm(workspace, { recursive: true, force: true });
});

test("dot generates inside the current folder", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackforge-cli-current-"));
  const destination = await resolveDestination(root, ".");
  const canonicalRoot = await realpath(root);

  assert.equal(destination.mode, "current-directory");
  assert.equal(destination.rootDirectory, canonicalRoot);

  await rm(root, { recursive: true, force: true });
});

test("the project name for dot comes from the current folder name", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackforge-cli-name-"));
  const destination = await resolveDestination(root, ".");
  const canonicalRoot = await realpath(root);

  assert.equal(destination.projectName, basename(canonicalRoot));

  await rm(root, { recursive: true, force: true });
});

test("a nested path resolves correctly", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "stackforge-cli-nested-"));
  await mkdir(resolve(workspace, "projects"), { recursive: true });
  const destination = await resolveDestination(workspace, "./projects/my-app");
  const canonicalWorkspace = await realpath(workspace);

  assert.equal(destination.projectName, "my-app");
  assert.equal(destination.rootDirectory, resolve(canonicalWorkspace, "./projects/my-app"));

  await rm(workspace, { recursive: true, force: true });
});

test("invalid destinations are rejected", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "stackforge-cli-invalid-"));

  await assert.rejects(() => resolveDestination(workspace, ""), /valid project path/i);
  await assert.rejects(() => resolveDestination(workspace, ".."), /must stay inside/i);
  await assert.rejects(() => resolveDestination(workspace, "../outside"), /must stay inside/i);
  await assert.rejects(() => resolveDestination(workspace, "/"), /must stay inside|not supported/i);
  await assert.rejects(() => resolveDestination(workspace, resolve(workspace, "..", "escape")), /must stay inside/i);
  await assert.rejects(() => resolveDestination(workspace, "my-app/.."), /not supported/i);

  await rm(workspace, { recursive: true, force: true });
});

test("destination resolution rejects symlink escapes", async () => {
  const parent = await mkdtemp(join(tmpdir(), "stackforge-cli-symlink-parent-"));
  const workspace = join(parent, "workspace");
  const outside = join(parent, "outside");

  try {
    await mkdir(workspace, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(workspace, "projects"), "dir");

    await assert.rejects(
      resolveDestination(workspace, "projects/my-app"),
      /must stay inside|not a directory path/i,
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

test("an existing empty folder is accepted", async () => {
  const rootDirectory = await mkdtemp(resolve(tmpdir(), "stackforge-cli-empty-"));

  try {
    const inspection = await inspectDestination(rootDirectory);
    assert.equal(inspection.exists, true);
    assert.deepEqual(inspection.meaningfulEntries, []);
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test("a folder containing only .DS_Store is accepted", async () => {
  const rootDirectory = await mkdtemp(resolve(tmpdir(), "stackforge-cli-dsstore-"));

  try {
    await writeFile(resolve(rootDirectory, ".DS_Store"), "", "utf8");
    const inspection = await inspectDestination(rootDirectory);
    assert.deepEqual(inspection.meaningfulEntries, []);
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test("a non-empty folder is reported", async () => {
  const rootDirectory = await mkdtemp(resolve(tmpdir(), "stackforge-cli-non-empty-"));

  try {
    await mkdir(resolve(rootDirectory, "src"));
    await writeFile(resolve(rootDirectory, "README.md"), "# existing\n", "utf8");
    const inspection = await inspectDestination(rootDirectory);
    assert.deepEqual(inspection.meaningfulEntries, ["README.md", "src"]);
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test("unwritable destinations are rejected", async () => {
  await assert.rejects(
    assertDestinationWritable("/dev/null/stackforge"),
    /cannot write/i,
  );
});

test("cancellation exits cleanly without generating files", async () => {
  const rootDirectory = await mkdtemp(resolve(tmpdir(), "stackforge-cli-cancel-"));

  try {
    await writeFile(resolve(rootDirectory, "README.md"), "# existing\n", "utf8");
    const inspection = await inspectDestination(rootDirectory);
    let cancelled = false;

    await assert.rejects(
      ensureDestinationApproved(
        inspection,
        async () => "cancel",
        () => {
          cancelled = true;
          throw new Error("cancelled");
        },
      ),
      /cancelled/,
    );

    assert.equal(cancelled, true);
    assert.equal(await readFile(resolve(rootDirectory, "README.md"), "utf8"), "# existing\n");
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});
