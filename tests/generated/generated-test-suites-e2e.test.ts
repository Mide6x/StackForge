// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DefaultGenerationEngine, InMemoryProviderRegistry, runCommand, type StackForgeProvider } from "@stackforge/core";
import integrations from "@stackforge/integrations-built-in";
import express from "../../providers/express/src/index.js";
import nextjs from "../../providers/nextjs/src/index.js";
import postgres from "../../providers/postgres/src/index.js";

const enabled = process.env.STACKFORGE_RUN_GENERATED_E2E === "1";

test("generates the opt-in golden-path Playwright health flow", { skip: enabled ? false : "Set STACKFORGE_RUN_GENERATED_E2E=1 to generate the networked full-stack browser suite." }, async () => {
  const parent = await mkdtemp(join(tmpdir(), "stackforge-generated-e2e-"));
  const root = join(parent, "project");
  try {
    const registry = new InMemoryProviderRegistry();
    [nextjs, express, postgres].forEach((provider: StackForgeProvider) => registry.register(provider));
    const result = await new DefaultGenerationEngine(registry, integrations).generate({
      projectName: "e2e",
      rootDirectory: root,
      selection: {
        projectType: "full-stack",
        providerIds: ["nextjs", "express", "postgres"],
        frontendLanguage: "typescript",
        backendLanguage: "typescript",
        docker: false,
        testing: { fullStack: ["fullstack-playwright-health"] },
      },
      answers: {}, directories: { frontend: "frontend", backend: "backend" }, log() {}, run: runCommand,
    });
    assert.match(await readFile(join(root, "frontend/tests/e2e/fullstack-health.spec.ts"), "utf8"), /Your full stack is connected/);
    assert.equal(result.testSuites?.[0]?.optionId, "fullstack-playwright-health");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
