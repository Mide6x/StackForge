import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { GenerationContext } from "@stackforge/core";
import integration from "./index.js";

test("connects the Next.js, Express, PostgreSQL, and Docker projects", async () => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "stackforge-integration-"));
  const frontend = join(rootDirectory, "frontend");
  const backend = join(rootDirectory, "backend");

  try {
    await Promise.all([
      mkdir(join(frontend, "src/app"), { recursive: true }),
      mkdir(join(backend, "src"), { recursive: true }),
    ]);
    await writeFile(
      join(backend, "package.json"),
      JSON.stringify({ dependencies: { express: "^5.1.0" }, devDependencies: {} }),
      "utf8",
    );
    await writeFile(join(rootDirectory, "docker-compose.yml"), "legacy: true\n", "utf8");

    const context: GenerationContext = {
      projectName: "golden-app",
      rootDirectory,
      selection: {
        projectType: "full-stack",
        providerIds: ["nextjs", "express", "postgres"],
        frontendLanguage: "typescript",
        backendLanguage: "typescript",
        docker: true,
      },
      answers: {},
      directories: { frontend: "frontend", backend: "backend" },
      log() {},
      async run() {},
    };

    await integration.integrate!(context);

    const backendPackage = JSON.parse(
      await readFile(join(backend, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    assert.equal(backendPackage.dependencies.pg, "^8.16.3");
    assert.match(await readFile(join(backend, "src/index.ts"), "utf8"), /SELECT 1/);
    assert.match(await readFile(join(frontend, "src/lib/api.ts"), "utf8"), /NEXT_PUBLIC_API_URL/);
    assert.match(await readFile(join(rootDirectory, "compose.yaml"), "utf8"), /condition: service_healthy/);
    assert.match(await readFile(join(rootDirectory, ".env.example"), "utf8"), /DATABASE_URL=/);
    await assert.rejects(readFile(join(rootDirectory, "docker-compose.yml"), "utf8"));
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});

test("writes a JavaScript backend Dockerfile without a build step", async () => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "stackforge-integration-js-"));
  const frontend = join(rootDirectory, "frontend");
  const backend = join(rootDirectory, "backend");

  try {
    await Promise.all([
      mkdir(join(frontend, "src/app"), { recursive: true }),
      mkdir(join(backend, "src"), { recursive: true }),
    ]);
    await writeFile(
      join(backend, "package.json"),
      JSON.stringify({ dependencies: { express: "^5.1.0" }, devDependencies: {} }),
      "utf8",
    );

    const context: GenerationContext = {
      projectName: "golden-app-js",
      rootDirectory,
      selection: {
        projectType: "full-stack",
        providerIds: ["nextjs", "express", "postgres"],
        frontendLanguage: "javascript",
        backendLanguage: "javascript",
        docker: true,
      },
      answers: {},
      directories: { frontend: "frontend", backend: "backend" },
      log() {},
      async run() {},
    };

    await integration.integrate!(context);

    const dockerfile = await readFile(join(backend, "Dockerfile"), "utf8");
    assert.doesNotMatch(dockerfile, /RUN npm run build/);
    assert.match(dockerfile, /CMD \["npm", "run", "start"\]/);
  } finally {
    await rm(rootDirectory, { recursive: true, force: true });
  }
});
