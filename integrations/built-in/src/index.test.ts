import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  createIntegrationRuntime,
  DefaultGenerationResultBuilder,
  matchingIntegrations,
  type GenerationContext,
  type GenerationResult,
  type ProviderSelection,
  type StackForgeIntegration,
} from "@stackforge/core";
import { backendSourceFinalizer } from "./backend/finalizer.js";
import {
  backendIds,
  backends,
  type BackendId,
  databaseIds,
  type DatabaseId,
  frontendIds,
  frontends,
  type FrontendId,
} from "./catalog.js";
import {
  backendDatabaseIntegrations,
  createBackendDatabaseConnector,
} from "./database/connectors.js";
import {
  createFrontendBackendConnector,
  frontendBackendIntegrations,
} from "./frontend/connectors.js";
import { fullStackComposeIntegration } from "./infrastructure/compose.js";
import integrations from "./index.js";

const execFileAsync = promisify(execFile);

interface Fixture {
  root: string;
  context: GenerationContext;
  providerFiles: Set<string>;
  cleanup(): Promise<void>;
}

function initialResult(root: string): GenerationResult {
  return {
    projectName: "matrix-app",
    rootDirectory: root,
    components: [],
    dependenciesInstalled: true,
    environmentFiles: [],
    warnings: [],
    completedSteps: [],
  };
}

async function fixture(
  frontendId: FrontendId,
  backendId: BackendId,
  databaseId: DatabaseId,
  options: { javaScript?: boolean; docker?: boolean; backendOnly?: boolean } = {},
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "stackforge-builtins-"));
  const frontend = join(root, "frontend");
  const backend = join(root, "backend");
  const providerFiles = new Set<string>();
  const typeScript = !options.javaScript;
  const backendPrefix = options.backendOnly ? "" : "backend/";

  async function providerFile(path: string, content: string): Promise<void> {
    const absolute = resolve(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
    providerFiles.add(absolute);
  }

  if (!options.backendOnly) {
    await providerFile("frontend/package.json", JSON.stringify({
      scripts: { build: "echo build", start: "echo start" },
    }));
    if (frontendId === "nextjs") {
      await providerFile(
        `frontend/src/app/page.${typeScript ? "tsx" : "js"}`,
        "export default function Home() { return null; }\n",
      );
      await mkdir(join(frontend, "public"), { recursive: true });
    } else if (frontendId === "react") {
      await providerFile(
        `frontend/src/App.${typeScript ? "tsx" : "jsx"}`,
        "export default function App() { return null; }\n",
      );
    } else {
      await providerFile("frontend/src/App.vue", "<template><main>Vue</main></template>\n");
    }
  }

  if (backendId === "express") {
    await providerFile(`${backendPrefix}package.json`, `${JSON.stringify({
      name: "backend",
      type: "module",
      scripts: typeScript
        ? { dev: "tsx watch src/index.ts", build: "tsc", start: "node dist/index.js" }
        : { dev: "node --watch src/index.js", start: "node src/index.js" },
      dependencies: { express: "^5.1.0" },
      devDependencies: {},
    }, null, 2)}\n`);
    await providerFile(
      `${backendPrefix}src/index.${typeScript ? "ts" : "js"}`,
      'import { app } from "./app.js";\nvoid app;\n',
    );
    await providerFile(
      `${backendPrefix}src/app.${typeScript ? "ts" : "js"}`,
      'import express from "express";\nexport const app = express();\n',
    );
  } else if (backendId === "fastapi") {
    await providerFile(
      `${backendPrefix}pyproject.toml`,
      '[project]\nname = "backend"\nversion = "0.1.0"\ndependencies = ["fastapi>=0.115", "uvicorn[standard]>=0.30"]\n',
    );
    await providerFile(`${backendPrefix}app/__init__.py`, "");
    await providerFile(
      `${backendPrefix}app/main.py`,
      "from fastapi import FastAPI\napp = FastAPI()\n",
    );
  } else {
    await providerFile(
      `${backendPrefix}pom.xml`,
      "<project><dependencies><dependency><groupId>org.springframework.boot</groupId>"
      + "<artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>\n",
    );
    await providerFile(
      `${backendPrefix}src/main/java/com/stackforge/backend/Application.java`,
      "package com.stackforge.backend; public class Application {}\n",
    );
    await providerFile(
      `${backendPrefix}src/main/resources/application.properties`,
      "spring.application.name=backend\n",
    );
  }

  if (options.docker) {
    if (!options.backendOnly) {
      await providerFile("frontend/Dockerfile", "FROM scratch\n");
    }
    await providerFile(`${backendPrefix}Dockerfile`, "FROM scratch\n");
  }

  const context: GenerationContext = {
    projectName: "matrix-app",
    rootDirectory: root,
    selection: {
      projectType: options.backendOnly ? "backend-only" : "full-stack",
      providerIds: options.backendOnly
        ? [backendId, databaseId]
        : [frontendId, backendId, databaseId],
      frontendLanguage: typeScript ? "typescript" : "javascript",
      backendLanguage: backendId === "express"
        ? typeScript ? "typescript" : "javascript"
        : backendId === "fastapi" ? "python" : "java",
      docker: options.docker ?? false,
    },
    answers: {},
    directories: { frontend: "frontend", backend: "backend" },
    log() {},
    async run() {},
  };

  return {
    root,
    context,
    providerFiles,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function applyIntegrations(
  value: Fixture,
  candidates: StackForgeIntegration[],
): Promise<ReturnType<typeof createIntegrationRuntime>> {
  const builder = new DefaultGenerationResultBuilder(initialResult(value.root));
  const runtime = createIntegrationRuntime(value.context, builder, value.providerFiles);
  for (const integration of matchingIntegrations(candidates, value.context.selection)) {
    await integration.apply?.(runtime.contextFor(integration));
  }
  return runtime;
}

function backendSourcePath(
  backendId: BackendId,
  javaScript = false,
  backendOnly = false,
): string {
  const prefix = backendOnly ? "" : "backend/";
  if (backendId === "express") return `${prefix}src/app.${javaScript ? "js" : "ts"}`;
  if (backendId === "fastapi") return `${prefix}app/main.py`;
  return `${prefix}src/main/java/com/stackforge/backend/Application.java`;
}

async function backendIntegrationSource(
  root: string,
  backendId: BackendId,
  options: { javaScript?: boolean; backendOnly?: boolean } = {},
): Promise<string> {
  const prefix = options.backendOnly ? "" : "backend/";
  const primary = await readFile(
    join(root, backendSourcePath(backendId, options.javaScript, options.backendOnly)),
    "utf8",
  );
  if (backendId === "fastapi") {
    return [
      primary,
      await readFile(join(root, `${prefix}app/config.py`), "utf8"),
      await readFile(join(root, `${prefix}app/database.py`), "utf8"),
    ].join("\n");
  }
  if (backendId === "springboot") {
    return [
      primary,
      await readFile(
        join(root, `${prefix}src/main/resources/application.properties`),
        "utf8",
      ),
    ].join("\n");
  }
  return primary;
}

test("exports 9 application connectors and 9 database connectors", () => {
  assert.equal(frontendBackendIntegrations.length, 9);
  assert.equal(backendDatabaseIntegrations.length, 9);
  assert.equal(integrations.length, 20);
  assert.equal(new Set(integrations.map((integration) => integration.metadata.id)).size, 20);
  assert.ok(integrations.every((integration) => integration.phase && integration.apply));
});

for (const frontendId of frontendIds) {
  for (const backendId of backendIds) {
    test(`${frontendId} connects to ${backendId} with the correct API variable and CORS origin`, async () => {
      const value = await fixture(frontendId, backendId, "postgres");
      try {
        const runtime = await applyIntegrations(value, [
          createFrontendBackendConnector(frontendId, backendId),
          createBackendDatabaseConnector(backendId, "postgres"),
          backendSourceFinalizer,
        ]);
        await runtime.environment.finalize(value.context);

        const frontendEnvironment = await readFile(
          join(value.root, "frontend/.env.example"),
          "utf8",
        );
        const frontendDefinition = frontends[frontendId];
        const backendDefinition = backends[backendId];
        assert.match(
          frontendEnvironment,
          new RegExp(`${frontendDefinition.apiEnvironmentVariable}=http://localhost:${backendDefinition.port}`),
        );

        const apiPath = frontendId === "vue"
          ? "frontend/src/services/api.ts"
          : "frontend/src/lib/api.ts";
        assert.match(
          await readFile(join(value.root, apiPath), "utf8"),
          new RegExp(frontendDefinition.apiEnvironmentVariable),
        );
        const backendSource = await backendIntegrationSource(value.root, backendId);
        assert.match(backendSource, new RegExp(`http://localhost:${frontendDefinition.port}`));
        assert.doesNotMatch(backendSource, /allowedOrigins\("\*"\)|allow_origins=\["\*"\]/);
      } finally {
        await value.cleanup();
      }
    });
  }
}

for (const backendId of backendIds) {
  for (const databaseId of databaseIds) {
    test(`${backendId} configures ${databaseId} dependencies, environment, and health source`, async () => {
      const value = await fixture("nextjs", backendId, databaseId);
      try {
        const connector = createBackendDatabaseConnector(backendId, databaseId);
        const runtime = await applyIntegrations(value, [
          createFrontendBackendConnector("nextjs", backendId),
          connector,
          backendSourceFinalizer,
        ]);
        await runtime.environment.finalize(value.context);
        const dependencies = runtime.dependencies.list();
        const backendEnvironment = await readFile(
          join(value.root, "backend/.env.example"),
          "utf8",
        );
        const backendSource = await backendIntegrationSource(value.root, backendId);

        if (databaseId === "postgres") {
          assert.match(backendEnvironment, /DATABASE_URL=/);
          assert.match(backendSource, /SELECT 1/);
        } else if (databaseId === "mongodb") {
          assert.match(backendEnvironment, /MONGODB_URI=/);
          assert.match(backendSource, /ping/i);
        } else {
          assert.match(backendEnvironment, /SUPABASE_SERVICE_ROLE_KEY=/);
          assert.match(backendSource, /supabase/i);
          const frontendEnvironment = await readFile(
            join(value.root, "frontend/.env.example"),
            "utf8",
          );
          assert.doesNotMatch(frontendEnvironment, /SUPABASE_SERVICE_ROLE_KEY|service_role/);
        }

        if (!(backendId === "springboot" && databaseId === "supabase")) {
          assert.ok(
            dependencies.some((dependency) => dependency.manager === (
              backendId === "express" ? "npm" : backendId === "fastapi" ? "python" : "maven"
            )),
          );
        }
      } finally {
        await value.cleanup();
      }
    });
  }
}

for (const frontendId of frontendIds) {
  for (const backendId of backendIds) {
    for (const databaseId of databaseIds) {
      test(`integrates full-stack matrix: ${frontendId} + ${backendId} + ${databaseId}`, async () => {
        const value = await fixture(frontendId, backendId, databaseId);
        try {
          const runtime = await applyIntegrations(value, integrations);
          const environmentFiles = await runtime.environment.finalize(value.context);
          const result = runtime.result.build([]);
          const selected = matchingIntegrations(integrations, value.context.selection);
          assert.deepEqual(
            selected.map((integration) => integration.metadata.id),
            [
              `${frontendId}-${backendId}`,
              `${backendId}-${databaseId}`,
              "backend-source-finalizer",
            ],
          );
          assert.equal(environmentFiles.length, 3);
          assert.match(
            await readFile(join(value.root, backendSourcePath(backendId)), "utf8"),
            /database|Database/,
          );
          const frontendEnvironment = await readFile(
            join(value.root, "frontend/.env.example"),
            "utf8",
          );
          assert.match(
            frontendEnvironment,
            new RegExp(frontends[frontendId].apiEnvironmentVariable),
          );
          assert.doesNotMatch(frontendEnvironment, /SUPABASE_SERVICE_ROLE_KEY|service_role/);
          assert.equal(result.connection?.frontendProviderId, frontendId);
          assert.equal(result.connection?.backendProviderId, backendId);
          assert.equal(
            result.connection?.apiEnvironmentVariable,
            frontends[frontendId].apiEnvironmentVariable,
          );
          assert.equal(result.database?.providerId, databaseId);
          assert.ok(result.database?.setupSteps.length);
          assert.ok(result.manualSteps?.length);
        } finally {
          await value.cleanup();
        }
      });
    }
  }
}

for (const backendId of backendIds) {
  for (const databaseId of databaseIds) {
    test(`integrates backend-only: ${backendId} + ${databaseId}`, async () => {
      const value = await fixture("nextjs", backendId, databaseId, {
        backendOnly: true,
        docker: true,
      });
      try {
        const runtime = await applyIntegrations(value, integrations);
        const environmentFiles = await runtime.environment.finalize(value.context);
        const docker = await runtime.compose.finalize(value.context);
        const source = await backendIntegrationSource(value.root, backendId, {
          backendOnly: true,
        });

        assert.deepEqual(
          matchingIntegrations(integrations, value.context.selection)
            .map((integration) => integration.metadata.id),
          [`${backendId}-${databaseId}`, "backend-source-finalizer"],
        );
        assert.deepEqual(environmentFiles, [join(value.root, ".env.example")]);
        assert.doesNotMatch(source, /cors|CORSMiddleware|CorsConfiguration/i);
        if (databaseId === "supabase") {
          assert.equal(docker, undefined);
        } else {
          assert.equal(docker?.startsFullStack, false);
          assert.deepEqual(docker?.command, [
            `docker compose up ${databaseId === "postgres" ? "postgres" : "mongodb"}`,
          ]);
          const compose = await readFile(join(value.root, "compose.yaml"), "utf8");
          assert.doesNotMatch(compose, /^\s*(frontend|backend):/m);
        }
      } finally {
        await value.cleanup();
      }
    });
  }
}

for (const javaScript of [false, true]) {
  test(`preserves the Next.js + Express + PostgreSQL ${javaScript ? "JavaScript" : "TypeScript"} Docker path`, async () => {
    const value = await fixture("nextjs", "express", "postgres", {
      javaScript,
      docker: true,
    });
    try {
      const runtime = await applyIntegrations(value, integrations);
      await runtime.dependencies.apply(value.context);
      const environmentFiles = await runtime.environment.finalize(value.context);
      await runtime.documentation.finalize(value.context);
      const docker = await runtime.compose.finalize(value.context);

      assert.equal(environmentFiles.length, 3);
      assert.equal(docker?.startsFullStack, true);
      assert.deepEqual(docker?.command, ["docker compose up --build"]);
      assert.match(await readFile(join(value.root, "compose.yaml"), "utf8"), /service_healthy/);
      assert.match(
        await readFile(join(value.root, `frontend/src/lib/api.${javaScript ? "js" : "ts"}`), "utf8"),
        /NEXT_PUBLIC_API_URL/,
      );
      assert.match(
        await readFile(join(value.root, backendSourcePath("express", javaScript)), "utf8"),
        /SELECT 1/,
      );

      const backendDockerfile = await readFile(join(value.root, "backend/Dockerfile"), "utf8");
      if (javaScript) {
        assert.doesNotMatch(backendDockerfile, /RUN npm run build/);
      } else {
        assert.match(backendDockerfile, /RUN npm run build/);
      }
      assert.match(backendDockerfile, /CMD \["npm", "run", "start"\]/);
    } finally {
      await value.cleanup();
    }
  });
}

test("integration applicability selects exactly one connector from each pair family", () => {
  const selection: ProviderSelection = {
    projectType: "full-stack",
    providerIds: ["react", "fastapi", "mongodb"],
    frontendLanguage: "typescript",
    backendLanguage: "python",
    docker: true,
  };
  const selected = matchingIntegrations(integrations, selection);
  assert.deepEqual(
    selected.map((integration) => integration.metadata.id),
    ["react-fastapi", "fastapi-mongodb", "fullstack-compose", "backend-source-finalizer"],
  );
});

test("the golden path exposes only its opt-in full-stack Playwright suite", () => {
  const golden = matchingIntegrations(integrations, {
    projectType: "full-stack",
    providerIds: ["nextjs", "express", "postgres"],
    frontendLanguage: "typescript",
    backendLanguage: "typescript",
    docker: false,
  }).find((integration) => integration.metadata.id === "backend-source-finalizer");
  assert.deepEqual(golden?.testing?.options.map((option) => option.id), ["fullstack-playwright-health"]);
  assert.equal(
    golden?.testing?.options[0]?.isAvailable?.({
      projectType: "full-stack",
      providerIds: ["react", "express", "postgres"],
      docker: false,
    }),
    false,
  );
});

test("generated full-stack Compose passes docker compose config when available", async (t) => {
  const value = await fixture("react", "fastapi", "mongodb", { docker: true });
  try {
    const runtime = await applyIntegrations(value, integrations);
    await runtime.compose.finalize(value.context);
    try {
      const { stdout } = await execFileAsync(
        "docker",
        ["compose", "-f", join(value.root, "compose.yaml"), "config"],
        { cwd: value.root },
      );
      assert.match(stdout, /services:/);
      assert.match(stdout, /mongodb:/);
      assert.match(stdout, /frontend:/);
      assert.match(stdout, /backend:/);
    } catch (error) {
      const commandError = error as NodeJS.ErrnoException & { stderr?: string };
      if (
        commandError.code === "ENOENT"
        || commandError.stderr?.includes("is not a docker command")
      ) {
        t.skip("Docker Compose is unavailable in this environment.");
        return;
      }
      throw error;
    }
  } finally {
    await value.cleanup();
  }
});
