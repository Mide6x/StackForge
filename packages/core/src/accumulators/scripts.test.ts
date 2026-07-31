import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { GenerationContext } from "../contracts.js";
import { DefaultPackageScriptAccumulator } from "./scripts.js";

function context(rootDirectory: string): GenerationContext {
  return {
    projectName: "scripts",
    rootDirectory,
    selection: { projectType: "frontend-only", providerIds: ["react"], docker: false },
    answers: {},
    directories: {},
    log() {},
    async run() {},
  };
}

test("package scripts merge safely and preserve existing values", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackforge-scripts-"));
  try {
    await writeFile(join(root, "package.json"), '{"scripts":{"dev":"vite"}}\n');
    const accumulator = new DefaultPackageScriptAccumulator();
    accumulator.scoped("tests").add({ target: "frontend", name: "test", command: "vitest run" });
    accumulator.scoped("second").add({ target: "frontend", name: "test", command: "vitest run" });
    await accumulator.apply(context(root));
    const value = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    assert.deepEqual(value.scripts, { dev: "vite", test: "vitest run" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("package script conflicts are rejected", () => {
  const accumulator = new DefaultPackageScriptAccumulator();
  accumulator.scoped("first").add({ target: "backend", name: "test", command: "vitest run" });
  assert.throws(
    () => accumulator.scoped("second").add({ target: "backend", name: "test", command: "pytest" }),
    /Package script conflict/,
  );
});
