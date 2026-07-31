import assert from "node:assert/strict";
import { access, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { GenerationContext, StackForgeProvider, TestingGenerationContext } from "./contracts.js";
import { DefaultGenerationEngine } from "./engine.js";
import { writeText } from "./files.js";
import { InMemoryProviderRegistry } from "./registry.js";

function createFrontendProvider(): StackForgeProvider {
  return {
    metadata: {
      id: "frontend-test",
      name: "Frontend Test",
      category: "frontend",
      description: "Test frontend provider",
      supportedLanguages: ["typescript"],
    },
    compatibility: { projectTypes: ["full-stack", "frontend-only"] },
    generator: {
      async generate(context) {
        const directory = join(context.rootDirectory, context.directories.frontend ?? "frontend");
        await writeText(directory, "app.txt", "frontend\n");
        await writeText(directory, "package.json", '{"scripts":{"dev":"test"}}\n');
      },
    },
    testing: {
      options: [{ id: "fixture-tests", name: "Fixture tests", description: "", testTypes: ["unit"], commands: [{ name: "Test", command: ["npm", "test"] }] }],
      generators: [{
        optionId: "fixture-tests",
        async generate(context: TestingGenerationContext) {
          context.dependencies.add({ manager: "npm", target: "frontend", name: "vitest", version: "^3.2.4", development: true });
          context.scripts.add({ target: "frontend", name: "test", command: "vitest run" });
          await context.files.create("frontend/tests/example.test.ts", "export {};\n");
          context.result.addTestSuite({ providerId: "frontend-test", component: "frontend", optionId: "fixture-tests", name: "Fixture tests", directory: join(context.rootDirectory, "frontend"), commands: [{ name: "Test", command: ["npm", "test"] }] });
        },
      }],
    },
  };
}

function createBackendProvider(): StackForgeProvider {
  return {
    metadata: {
      id: "backend-test",
      name: "Backend Test",
      category: "backend",
      description: "Test backend provider",
      supportedLanguages: ["typescript"],
    },
    compatibility: { projectTypes: ["full-stack", "backend-only"] },
    generator: {
      async generate(context) {
        await writeText(join(context.rootDirectory, context.directories.backend ?? "backend"), "app.txt", "backend\n");
      },
    },
  };
}

function createContext(rootDirectory: string): GenerationContext {
  return {
    projectName: "sample-app",
    rootDirectory,
    selection: {
      projectType: "full-stack",
      providerIds: ["frontend-test", "backend-test"],
      frontendLanguage: "typescript",
      backendLanguage: "typescript",
      docker: false,
    },
    answers: {},
    directories: { frontend: "frontend", backend: "backend" },
    log() {},
    async run() {},
  };
}

function createEngine(): DefaultGenerationEngine {
  const registry = new InMemoryProviderRegistry();
  registry.register(createFrontendProvider());
  registry.register(createBackendProvider());
  return new DefaultGenerationEngine(registry);
}

test("an existing empty folder is accepted", async () => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "stackforge-core-empty-"));

  try {
    await createEngine().generate(createContext(rootDirectory));
    assert.equal(await readFile(join(rootDirectory, "frontend/app.txt"), "utf8"), "frontend\n");
    assert.equal(await readFile(join(rootDirectory, "backend/app.txt"), "utf8"), "backend\n");
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test("a folder containing only .DS_Store is accepted", async () => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "stackforge-core-dsstore-"));

  try {
    await writeFile(join(rootDirectory, ".DS_Store"), "", "utf8");
    await createEngine().generate(createContext(rootDirectory));
    assert.equal(await readFile(join(rootDirectory, "frontend/app.txt"), "utf8"), "frontend\n");
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test("existing files are never silently overwritten", async () => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "stackforge-core-conflict-"));

  try {
    await writeFile(join(rootDirectory, "README.md"), "# existing\n", "utf8");
    await assert.rejects(
      createEngine().generate(createContext(rootDirectory)),
      /README\.md/,
    );
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test("unwritable destinations are rejected", async () => {
  const parentDirectory = await mkdtemp(join(tmpdir(), "stackforge-core-readonly-"));
  const rootDirectory = join(parentDirectory, "project");

  try {
    await chmod(parentDirectory, 0o555);
    await assert.rejects(
      createEngine().generate(createContext(rootDirectory)),
      /cannot write/i,
    );
  } finally {
    await chmod(parentDirectory, 0o755);
    await rm(parentDirectory, { recursive: true, force: true });
  }
});

test("an omitted testing selection generates no testing files", async () => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "stackforge-core-no-testing-"));
  try {
    const result = await createEngine().generate(createContext(rootDirectory));
    assert.deepEqual(result.testSuites, []);
    await assert.rejects(access(join(rootDirectory, "frontend", "tests"), constants.F_OK));
    await assert.rejects(access(join(rootDirectory, "backend", "tests"), constants.F_OK));
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test("selected provider tests generate after scaffolding and merge scripts and dependencies", async () => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "stackforge-core-testing-"));
  try {
    const context = createContext(rootDirectory);
    context.selection.testing = { frontend: ["fixture-tests"] };
    const result = await createEngine().generate(context);
    assert.equal((await readFile(join(rootDirectory, "frontend", "tests/example.test.ts"), "utf8")).trim(), "export {};");
    const packageJson = JSON.parse(await readFile(join(rootDirectory, "frontend", "package.json"), "utf8")) as {
      scripts: Record<string, string>; devDependencies: Record<string, string>;
    };
    assert.equal(packageJson.scripts.test, "vitest run");
    assert.equal(packageJson.devDependencies.vitest, "^3.2.4");
    assert.equal(result.testSuites?.[0]?.optionId, "fixture-tests");
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});
