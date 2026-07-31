import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  assertDestinationWritable,
  ensureDestinationApproved,
  inspectDestination,
  resolveDestination,
} from "./destination.js";

test("a named project creates a new folder", () => {
  const destination = resolveDestination("/workspace", "my-app");

  assert.equal(destination.mode, "new-directory");
  assert.equal(destination.projectName, "my-app");
  assert.equal(destination.rootDirectory, resolve("/workspace", "my-app"));
});

test("dot generates inside the current folder", () => {
  const destination = resolveDestination("/workspace/current-app", ".");

  assert.equal(destination.mode, "current-directory");
  assert.equal(destination.rootDirectory, "/workspace/current-app");
});

test("the project name for dot comes from the current folder name", () => {
  const destination = resolveDestination("/workspace/current-app", ".");

  assert.equal(destination.projectName, "current-app");
});

test("a nested path resolves correctly", () => {
  const destination = resolveDestination("/workspace", "./projects/my-app");

  assert.equal(destination.projectName, "my-app");
  assert.equal(destination.rootDirectory, resolve("/workspace", "./projects/my-app"));
});

test("invalid destinations are rejected", () => {
  assert.throws(() => resolveDestination("/workspace", ""), /valid project path/i);
  assert.throws(() => resolveDestination("/workspace", ".."), /not supported/i);
  assert.throws(() => resolveDestination("/workspace", "/"), /not supported/i);
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
