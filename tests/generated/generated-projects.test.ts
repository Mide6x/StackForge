// SPDX-License-Identifier: MPL-2.0
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  DefaultGenerationEngine,
  InMemoryProviderRegistry,
  runCommand,
  type ProviderSelection,
  type StackForgeProvider,
} from "@stackforge/core";
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

const enabled = process.env.STACKFORGE_RUN_GENERATED_SMOKE === "1";
const providers: StackForgeProvider[] = [
  nextjs,
  react,
  vue,
  express,
  fastapi,
  springboot,
  postgres,
  mongodb,
  supabase,
];

type SmokeSpec = {
  name: string;
  selection: ProviderSelection;
  requires?: string;
};

const specs: SmokeSpec[] = [
  {
    name: "Next.js TypeScript frontend-only",
    selection: {
      projectType: "frontend-only",
      providerIds: ["nextjs"],
      frontendLanguage: "typescript",
      docker: false,
    },
  },
  {
    name: "Next.js JavaScript frontend-only",
    selection: {
      projectType: "frontend-only",
      providerIds: ["nextjs"],
      frontendLanguage: "javascript",
      docker: false,
    },
  },
  {
    name: "React TypeScript frontend-only",
    selection: {
      projectType: "frontend-only",
      providerIds: ["react"],
      frontendLanguage: "typescript",
      docker: false,
    },
  },
  {
    name: "Vue TypeScript frontend-only",
    selection: {
      projectType: "frontend-only",
      providerIds: ["vue"],
      frontendLanguage: "typescript",
      docker: false,
    },
  },
  {
    name: "Express TypeScript backend-only",
    selection: {
      projectType: "backend-only",
      providerIds: ["express"],
      backendLanguage: "typescript",
      docker: false,
    },
  },
  {
    name: "Express JavaScript backend-only",
    selection: {
      projectType: "backend-only",
      providerIds: ["express"],
      backendLanguage: "javascript",
      docker: false,
    },
  },
  {
    name: "FastAPI backend-only",
    selection: {
      projectType: "backend-only",
      providerIds: ["fastapi"],
      backendLanguage: "python",
      docker: false,
    },
    requires: "python3",
  },
  {
    name: "Spring Boot backend-only",
    selection: {
      projectType: "backend-only",
      providerIds: ["springboot"],
      backendLanguage: "java",
      docker: false,
    },
    requires: "mvn",
  },
  {
    name: "Next.js TS + Express TS + PostgreSQL",
    selection: {
      projectType: "full-stack",
      providerIds: ["nextjs", "express", "postgres"],
      frontendLanguage: "typescript",
      backendLanguage: "typescript",
      docker: false,
    },
  },
  {
    name: "Next.js JS + Express JS + PostgreSQL",
    selection: {
      projectType: "full-stack",
      providerIds: ["nextjs", "express", "postgres"],
      frontendLanguage: "javascript",
      backendLanguage: "javascript",
      docker: false,
    },
  },
  {
    name: "React + FastAPI + MongoDB",
    selection: {
      projectType: "full-stack",
      providerIds: ["react", "fastapi", "mongodb"],
      frontendLanguage: "typescript",
      backendLanguage: "python",
      docker: false,
    },
    requires: "python3",
  },
  {
    name: "Vue + Spring Boot + PostgreSQL",
    selection: {
      projectType: "full-stack",
      providerIds: ["vue", "springboot", "postgres"],
      frontendLanguage: "typescript",
      backendLanguage: "java",
      docker: false,
    },
    requires: "mvn",
  },
  {
    name: "Next.js + FastAPI + Supabase",
    selection: {
      projectType: "full-stack",
      providerIds: ["nextjs", "fastapi", "supabase"],
      frontendLanguage: "typescript",
      backendLanguage: "python",
      docker: false,
    },
    requires: "python3",
  },
];

function commandAvailable(command: string): boolean {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

async function buildGeneratedProject(
  root: string,
  selection: ProviderSelection,
): Promise<void> {
  const frontendDirectory = selection.projectType === "full-stack"
    ? join(root, "frontend")
    : root;
  const backendDirectory = selection.projectType === "full-stack"
    ? join(root, "backend")
    : root;

  if (selection.projectType !== "backend-only") {
    await runCommand("npm", ["run", "build"], frontendDirectory);
  }
  if (selection.projectType === "frontend-only") return;

  if (selection.providerIds.includes("express")) {
    if (selection.backendLanguage === "javascript") {
      await runCommand("node", ["--check", "src/index.js"], backendDirectory);
    } else {
      await runCommand("npm", ["run", "build"], backendDirectory);
    }
  } else if (selection.providerIds.includes("fastapi")) {
    await runCommand("python3", ["-m", "compileall", "app"], backendDirectory);
  } else {
    await runCommand("mvn", ["test"], backendDirectory);
  }
}

for (const spec of specs) {
  const skipReason = !enabled
    ? "Set STACKFORGE_RUN_GENERATED_SMOKE=1 to run networked generated-project builds."
    : spec.requires && !commandAvailable(spec.requires)
      ? `${spec.requires} is not available in this environment.`
      : false;

  test(spec.name, { skip: skipReason }, async () => {
    const parent = await mkdtemp(join(tmpdir(), "stackforge-generated-smoke-"));
    const root = join(parent, "project");
    try {
      const registry = new InMemoryProviderRegistry();
      providers.forEach((provider) => registry.register(provider));
      const engine = new DefaultGenerationEngine(registry, integrations);
      await engine.generate({
        projectName: "generated-smoke",
        rootDirectory: root,
        selection: spec.selection,
        answers: {},
        directories: spec.selection.projectType === "full-stack"
          ? { frontend: "frontend", backend: "backend" }
          : {},
        log() {},
        run: runCommand,
      });
      await buildGeneratedProject(root, spec.selection);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
}
