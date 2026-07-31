// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { GenerationContext } from "../contracts.js";
import { DefaultComposeAccumulator } from "./compose.js";

function context(rootDirectory: string, projectType: "full-stack" | "backend-only" = "full-stack"): GenerationContext {
  return {
    projectName: "compose-test",
    rootDirectory,
    selection: {
      projectType,
      providerIds: projectType === "full-stack"
        ? ["nextjs", "express", "postgres"]
        : ["express", "postgres"],
      docker: true,
    },
    answers: {},
    directories: { frontend: "frontend", backend: "backend" },
    log() {},
    async run() {},
  };
}

test("Compose services merge and complete full-stack detection is accurate", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackforge-compose-"));
  try {
    const accumulator = new DefaultComposeAccumulator();
    accumulator.scoped("apps").addService("backend", {
      build: { context: "./backend" },
      ports: ["3001:3001"],
      component: "backend",
    });
    accumulator.scoped("database-link").addService("backend", {
      environment: { DATABASE_URL: "postgresql://postgres/app" },
      dependsOn: { postgres: { condition: "service_healthy" } },
    });
    accumulator.scoped("apps").addService("frontend", {
      build: { context: "./frontend" },
      component: "frontend",
    });
    accumulator.scoped("database").addService("postgres", {
      image: "postgres:16-alpine",
      component: "database",
    });

    const result = await accumulator.finalize(context(root));
    assert.equal(result?.startsFullStack, true);
    assert.equal(result?.composeFile, join(root, "compose.yaml"));
    const output = await readFile(join(root, "compose.yaml"), "utf8");
    assert.match(output, /depends_on:/);
    assert.match(output, /DATABASE_URL/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Compose duplicate service conflicts identify the property", () => {
  const accumulator = new DefaultComposeAccumulator();
  accumulator.scoped("first").addService("api", { image: "one" });
  assert.throws(
    () => accumulator.scoped("second").addService("api", { image: "two" }),
    /services\.api\.image/,
  );
});
