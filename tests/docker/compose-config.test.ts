// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  createIntegrationRuntime,
  DefaultGenerationResultBuilder,
  type GenerationContext,
  type GenerationResult,
} from "@stackforge/core";
import {
  createBackendDatabaseConnector,
  fullStackComposeIntegration,
} from "@stackforge/integrations-built-in";

const execFileAsync = promisify(execFile);

function hasCompose(): boolean {
  return spawnSync("docker", ["compose", "version"], { stdio: "ignore" }).status === 0;
}

async function composeFixture(database: "mongodb" | "supabase"): Promise<{
  root: string;
  context: GenerationContext;
  providerFiles: Set<string>;
}> {
  const root = await mkdtemp(join(tmpdir(), "stackforge-docker-smoke-"));
  await Promise.all([
    mkdir(join(root, "frontend"), { recursive: true }),
    mkdir(join(root, "backend"), { recursive: true }),
  ]);
  const providerFiles = new Set<string>();
  for (const path of ["frontend/Dockerfile", "backend/Dockerfile"]) {
    const absolute = join(root, path);
    await writeFile(absolute, "FROM scratch\n", "utf8");
    providerFiles.add(absolute);
  }
  return {
    root,
    providerFiles,
    context: {
      projectName: "docker-smoke",
      rootDirectory: root,
      selection: {
        projectType: "full-stack",
        providerIds: ["react", "fastapi", database],
        frontendLanguage: "typescript",
        backendLanguage: "python",
        docker: true,
      },
      answers: {},
      directories: { frontend: "frontend", backend: "backend" },
      log() {},
      async run() {},
    },
  };
}

function initialResult(root: string): GenerationResult {
  return {
    projectName: "docker-smoke",
    rootDirectory: root,
    components: [],
    dependenciesInstalled: true,
    environmentFiles: [],
    warnings: [],
    completedSteps: [],
  };
}

test("representative generated Compose passes docker compose config", {
  skip: hasCompose() ? false : "Docker Compose is unavailable in this environment.",
}, async () => {
  const fixture = await composeFixture("mongodb");
  try {
    const runtime = createIntegrationRuntime(
      fixture.context,
      new DefaultGenerationResultBuilder(initialResult(fixture.root)),
      fixture.providerFiles,
    );
    const database = createBackendDatabaseConnector("fastapi", "mongodb");
    await database.apply!(runtime.contextFor(database));
    await fullStackComposeIntegration.apply!(
      runtime.contextFor(fullStackComposeIntegration),
    );
    const result = await runtime.compose.finalize(fixture.context);
    assert.equal(result?.startsFullStack, true);

    const { stdout } = await execFileAsync(
      "docker",
      ["compose", "-f", join(fixture.root, "compose.yaml"), "config"],
      { cwd: fixture.root },
    );
    assert.match(stdout, /mongodb:/);
    assert.match(stdout, /backend:/);
    assert.match(stdout, /frontend:/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("remote Supabase Compose never claims to start the complete selected stack", async () => {
  const fixture = await composeFixture("supabase");
  try {
    const runtime = createIntegrationRuntime(
      fixture.context,
      new DefaultGenerationResultBuilder(initialResult(fixture.root)),
      fixture.providerFiles,
    );
    const database = createBackendDatabaseConnector("fastapi", "supabase");
    await database.apply!(runtime.contextFor(database));
    await fullStackComposeIntegration.apply!(
      runtime.contextFor(fullStackComposeIntegration),
    );
    const result = await runtime.compose.finalize(fixture.context);
    assert.equal(result?.startsFullStack, false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
