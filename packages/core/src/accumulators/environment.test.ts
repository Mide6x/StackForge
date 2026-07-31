import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { GenerationContext } from "../contracts.js";
import { DefaultEnvironmentAccumulator } from "./environment.js";

function context(rootDirectory: string): GenerationContext {
  return {
    projectName: "environment-test",
    rootDirectory,
    selection: { projectType: "full-stack", providerIds: [], docker: false },
    answers: {},
    directories: { frontend: "frontend", backend: "backend" },
    log() {},
    async run() {},
  };
}

test("environment contributions merge and render deterministically", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackforge-environment-"));
  try {
    const accumulator = new DefaultEnvironmentAccumulator();
    accumulator.scoped("database").add({
      name: "DATABASE_URL",
      exampleValue: "postgresql://localhost/app",
      section: "Database",
      targets: ["root", "backend"],
      sensitive: true,
    });
    accumulator.scoped("duplicate").add({
      name: "DATABASE_URL",
      exampleValue: "postgresql://localhost/app",
      section: "Database",
      targets: ["backend"],
      sensitive: true,
    });
    accumulator.scoped("frontend").add({
      name: "VITE_API_URL",
      exampleValue: "http://localhost:3001",
      section: "Application",
      targets: ["frontend"],
    });

    const files = await accumulator.finalize(context(root));
    assert.deepEqual(files, [
      join(root, ".env.example"),
      join(root, "frontend/.env.example"),
      join(root, "backend/.env.example"),
    ]);
    assert.match(await readFile(join(root, "backend/.env.example"), "utf8"), /DATABASE_URL=/);
    assert.match(await readFile(join(root, "frontend/.env.example"), "utf8"), /VITE_API_URL=/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("environment conflicts and frontend secrets are rejected", () => {
  const accumulator = new DefaultEnvironmentAccumulator();
  accumulator.scoped("first").add({
    name: "DATABASE_URL",
    exampleValue: "one",
    targets: ["backend"],
  });
  assert.throws(
    () => accumulator.scoped("second").add({
      name: "DATABASE_URL",
      exampleValue: "two",
      targets: ["backend"],
    }),
    /Environment variable conflict/,
  );
  assert.throws(
    () => accumulator.scoped("secret").add({
      name: "SUPABASE_SERVICE_ROLE_KEY",
      exampleValue: "",
      targets: ["frontend"],
      sensitive: true,
    }),
    /cannot target the frontend/,
  );
});
