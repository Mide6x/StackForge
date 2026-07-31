// SPDX-License-Identifier: MPL-2.0
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DefaultGenerationEngine, InMemoryProviderRegistry, runCommand, type ProviderSelection, type StackForgeProvider } from "@stackforge/core";
import integrations from "@stackforge/integrations-built-in";
import express from "../../providers/express/src/index.js";
import fastapi from "../../providers/fastapi/src/index.js";
import mongodb from "../../providers/mongodb/src/index.js";
import nextjs from "../../providers/nextjs/src/index.js";
import postgres from "../../providers/postgres/src/index.js";
import react from "../../providers/react/src/index.js";
import springboot from "../../providers/springboot/src/index.js";
import supabase from "../../providers/supabase/src/index.js";
import vue from "../../providers/vue/src/index.js";

const enabled = process.env.STACKFORGE_RUN_GENERATED_TESTS === "1";
const providers: StackForgeProvider[] = [nextjs, react, vue, express, fastapi, springboot, postgres, mongodb, supabase];

function available(command: string): boolean {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

async function generate(name: string, selection: ProviderSelection): Promise<{ root: string; cleanup(): Promise<void> }> {
  const parent = await mkdtemp(join(tmpdir(), "stackforge-generated-tests-"));
  const root = join(parent, "project");
  const registry = new InMemoryProviderRegistry();
  providers.forEach((provider) => registry.register(provider));
  const engine = new DefaultGenerationEngine(registry, integrations);
  await engine.generate({
    projectName: name,
    rootDirectory: root,
    selection,
    answers: {},
    directories: selection.projectType === "full-stack" ? { frontend: "frontend", backend: "backend" } : {},
    log() {},
    run: runCommand,
  });
  return { root, cleanup: () => rm(parent, { recursive: true, force: true }) };
}

const nodeSuites: Array<{ name: string; selection: ProviderSelection; cwd(root: string): string }> = [
  {
    name: "Next.js Vitest and React Testing Library",
    selection: { projectType: "frontend-only", providerIds: ["nextjs"], frontendLanguage: "typescript", docker: false, testing: { frontend: ["vitest-rtl"] } },
    cwd: (root) => root,
  },
  {
    name: "React Vitest and React Testing Library",
    selection: { projectType: "frontend-only", providerIds: ["react"], frontendLanguage: "typescript", docker: false, testing: { frontend: ["vitest-rtl"] } },
    cwd: (root) => root,
  },
  {
    name: "Vue Vitest and Vue Test Utils",
    selection: { projectType: "frontend-only", providerIds: ["vue"], frontendLanguage: "typescript", docker: false, testing: { frontend: ["vitest-vtu"] } },
    cwd: (root) => root,
  },
  {
    name: "Express Vitest and Supertest",
    selection: { projectType: "backend-only", providerIds: ["express"], backendLanguage: "typescript", docker: false, testing: { backend: ["vitest-supertest"] } },
    cwd: (root) => root,
  },
  {
    name: "Express JavaScript Vitest and Supertest",
    selection: { projectType: "backend-only", providerIds: ["express"], backendLanguage: "javascript", docker: false, testing: { backend: ["vitest-supertest"] } },
    cwd: (root) => root,
  },
];

for (const spec of nodeSuites) {
  test(`generated ${spec.name} tests pass`, { skip: enabled ? false : "Set STACKFORGE_RUN_GENERATED_TESTS=1 to run networked generated-test validation." }, async () => {
    const fixture = await generate("generated-tests", spec.selection);
    try {
      await runCommand("npm", ["test"], spec.cwd(fixture.root));
    } finally {
      await fixture.cleanup();
    }
  });
}

test("generated golden-path frontend and backend tests pass without a live database", { skip: enabled ? false : "Set STACKFORGE_RUN_GENERATED_TESTS=1 to run networked generated-test validation." }, async () => {
  const fixture = await generate("golden-tests", {
    projectType: "full-stack",
    providerIds: ["nextjs", "express", "postgres"],
    frontendLanguage: "typescript",
    backendLanguage: "typescript",
    docker: false,
    testing: { frontend: ["vitest-rtl"], backend: ["vitest-supertest"] },
  });
  try {
    await runCommand("npm", ["test"], join(fixture.root, "frontend"));
    await runCommand("npm", ["test"], join(fixture.root, "backend"));
  } finally {
    await fixture.cleanup();
  }
});

test("generated FastAPI pytest suite passes when uv is available", { skip: enabled && available("uv") ? false : "uv is unavailable or generated-test validation is disabled." }, async () => {
  const fixture = await generate("fastapi-tests", { projectType: "backend-only", providerIds: ["fastapi"], backendLanguage: "python", docker: false, testing: { backend: ["pytest-httpx"] } });
  try {
    await runCommand("uv", ["run", "pytest"], fixture.root);
  } finally { await fixture.cleanup(); }
});

test("generated Spring Boot MockMvc suite passes when Maven is available", { skip: enabled && available("mvn") ? false : "Maven is unavailable or generated-test validation is disabled." }, async () => {
  const fixture = await generate("spring-tests", { projectType: "backend-only", providerIds: ["springboot"], backendLanguage: "java", docker: false, testing: { backend: ["junit-mockmvc"] } });
  try {
    await runCommand("mvn", ["test"], fixture.root);
  } finally { await fixture.cleanup(); }
});
