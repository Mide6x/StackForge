// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { GenerationContext } from "../contracts.js";
import { DefaultDependencyAccumulator } from "./dependencies.js";

test("dependencies deduplicate identical contributions", () => {
  const accumulator = new DefaultDependencyAccumulator();
  accumulator.scoped("first").add({
    manager: "npm",
    target: "backend",
    name: "cors",
    version: "^2.8.5",
  });
  accumulator.scoped("second").add({
    manager: "npm",
    target: "backend",
    name: "cors",
    version: "^2.8.5",
  });
  assert.equal(accumulator.list().length, 1);
});

test("dependency version conflicts are rejected", () => {
  const accumulator = new DefaultDependencyAccumulator();
  accumulator.scoped("first").add({
    manager: "python",
    target: "backend",
    name: "pymongo",
    version: ">=4.9",
  });
  assert.throws(
    () => accumulator.scoped("second").add({
      manager: "python",
      target: "backend",
      name: "pymongo",
      version: ">=5.0",
    }),
    /Dependency version conflict/,
  );
});

test("Python dependency merging handles extras inside quoted dependency names", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackforge-python-dependencies-"));
  try {
    await writeFile(
      join(root, "pyproject.toml"),
      '[project]\ndependencies = ["fastapi>=0.115", "uvicorn[standard]>=0.30"]\n',
      "utf8",
    );
    const accumulator = new DefaultDependencyAccumulator();
    accumulator.scoped("database").add({
      manager: "python",
      target: "backend",
      name: "pymongo",
      version: ">=4.9",
    });
    const context: GenerationContext = {
      projectName: "python-dependencies",
      rootDirectory: root,
      selection: {
        projectType: "backend-only",
        providerIds: ["fastapi", "mongodb"],
        backendLanguage: "python",
        docker: false,
      },
      answers: {},
      directories: {},
      log() {},
      async run() {},
    };
    await accumulator.apply(context);
    const project = await readFile(join(root, "pyproject.toml"), "utf8");
    assert.match(project, /uvicorn\[standard\]>=0\.30/);
    assert.match(project, /pymongo>=4\.9/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Python development dependencies merge into the uv development group", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackforge-python-development-"));
  try {
    await writeFile(join(root, "pyproject.toml"), '[project]\ndependencies = ["fastapi>=0.115"]\n\n[tool.uv]\ndev-dependencies = ["pytest>=8.0"]\n');
    const accumulator = new DefaultDependencyAccumulator();
    accumulator.scoped("tests").add({ manager: "python", target: "backend", name: "httpx", version: ">=0.28", group: "development" });
    await accumulator.apply({
      projectName: "python-development",
      rootDirectory: root,
      selection: { projectType: "backend-only", providerIds: ["fastapi"], docker: false },
      answers: {}, directories: {}, log() {}, async run() {},
    });
    assert.match(await readFile(join(root, "pyproject.toml"), "utf8"), /httpx>=0\.28/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
