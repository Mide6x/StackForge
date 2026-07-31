// SPDX-License-Identifier: MPL-2.0
import type { IntegrationContext, StackForgeIntegration } from "@stackforge/core";
import {
  backendDirectoryName,
  backendIds,
  backends,
  type BackendId,
  databaseIds,
  type DatabaseId,
  frontendDirectoryName,
  frontendIds,
  frontends,
  isJavaScript,
  selectedId,
} from "../catalog.js";
import {
  backendDockerfile,
  frontendDockerfile,
  replaceOrCreate,
  viteNginxConfig,
} from "./dockerfiles.js";

function backendEnvironment(
  backendId: BackendId,
  databaseId: DatabaseId,
  frontendOrigin: string,
): Record<string, string> {
  const environment: Record<string, string> = {
    FRONTEND_URL: frontendOrigin,
    PORT: String(backends[backendId].port),
  };
  if (databaseId === "postgres") {
    environment.DATABASE_URL = backendId === "springboot"
      ? "jdbc:postgresql://postgres:5432/app"
      : "postgresql://postgres:postgres@postgres:5432/app";
    if (backendId === "springboot") {
      environment.POSTGRES_USER = "postgres";
      environment.POSTGRES_PASSWORD = "postgres";
    }
  } else if (databaseId === "mongodb") {
    environment.MONGODB_URI = "mongodb://mongodb:27017/app";
  } else {
    environment.SUPABASE_URL = "${SUPABASE_URL}";
    environment.SUPABASE_SERVICE_ROLE_KEY = "${SUPABASE_SERVICE_ROLE_KEY}";
  }
  return environment;
}

function backendHealthcheck(backendId: BackendId): NonNullable<
  Parameters<IntegrationContext["compose"]["addService"]>[1]["healthcheck"]
> {
  if (backendId === "express") {
    return {
      test: [
        "CMD",
        "node",
        "-e",
        "fetch('http://localhost:3001/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))",
      ],
      interval: "5s",
      timeout: "5s",
      retries: 10,
    };
  }
  if (backendId === "fastapi") {
    return {
      test: [
        "CMD",
        "python",
        "-c",
        "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')",
      ],
      interval: "5s",
      timeout: "5s",
      retries: 10,
    };
  }
  return {
    test: ["CMD", "curl", "--fail", "--silent", "http://localhost:8080/health"],
    interval: "5s",
    timeout: "5s",
    retries: 10,
  };
}

function databaseDependency(databaseId: DatabaseId): Record<
  string,
  { condition: "service_healthy" }
> {
  if (databaseId === "postgres") return { postgres: { condition: "service_healthy" } };
  if (databaseId === "mongodb") return { mongodb: { condition: "service_healthy" } };
  return {};
}

async function writeDockerFiles(
  context: IntegrationContext,
  frontendId: keyof typeof frontends,
  backendId: BackendId,
): Promise<void> {
  const frontendDirectory = frontendDirectoryName(context.directories);
  const backendDirectory = backendDirectoryName(context.directories);
  await replaceOrCreate(
    context.files,
    `${frontendDirectory}/Dockerfile`,
    frontendDockerfile(frontendId),
  );
  await replaceOrCreate(
    context.files,
    `${backendDirectory}/Dockerfile`,
    backendDockerfile(
      backendId,
      !isJavaScript(context.selection.backendLanguage),
      await context.files.exists(`${backendDirectory}/mvnw`),
    ),
  );
  await replaceOrCreate(
    context.files,
    `${frontendDirectory}/.dockerignore`,
    "node_modules\n.next\ndist\n.env*\n",
  );
  await replaceOrCreate(
    context.files,
    `${backendDirectory}/.dockerignore`,
    "node_modules\ndist\n.env*\n__pycache__\ntarget\n",
  );
  if (frontendId !== "nextjs") {
    await replaceOrCreate(
      context.files,
      `${frontendDirectory}/nginx.conf`,
      viteNginxConfig,
    );
  }
}

export const fullStackComposeIntegration: StackForgeIntegration = {
  metadata: {
    id: "fullstack-compose",
    name: "Full-stack Docker Compose",
    description: "Combines the selected frontend, backend, and database services.",
    providerIds: [],
  },
  phase: "compose-infrastructure",
  isApplicable(selection) {
    return selection.projectType === "full-stack"
      && selection.docker
      && Boolean(selectedId(selection.providerIds, frontendIds))
      && Boolean(selectedId(selection.providerIds, backendIds))
      && Boolean(selectedId(selection.providerIds, databaseIds));
  },
  async apply(context) {
    const frontendId = selectedId(context.selection.providerIds, frontendIds);
    const backendId = selectedId(context.selection.providerIds, backendIds);
    const databaseId = selectedId(context.selection.providerIds, databaseIds);
    if (!frontendId || !backendId || !databaseId) return;

    const frontend = frontends[frontendId];
    const backend = backends[backendId];
    const frontendDirectory = frontendDirectoryName(context.directories);
    const backendDirectory = backendDirectoryName(context.directories);
    const frontendOrigin = `http://localhost:${frontend.port}`;
    const backendUrl = `http://localhost:${backend.port}`;
    const frontendContainerPort = frontendId === "nextjs" ? 3000 : 80;

    context.compose.addService("backend", {
      build: { context: `./${backendDirectory}` },
      component: "backend",
      environment: backendEnvironment(backendId, databaseId, frontendOrigin),
      ports: [`${backend.port}:${backend.port}`],
      dependsOn: databaseDependency(databaseId),
      healthcheck: backendHealthcheck(backendId),
    });
    context.compose.addService("frontend", {
      build: {
        context: `./${frontendDirectory}`,
        args: {
          [frontend.apiEnvironmentVariable]: backendUrl,
        },
      },
      component: "frontend",
      ports: [`${frontend.port}:${frontendContainerPort}`],
      dependsOn: { backend: { condition: "service_healthy" } },
    });

    await writeDockerFiles(context, frontendId, backendId);
    context.documentation.add({
      id: "docker",
      title: "Docker",
      order: 50,
      content: databaseId === "supabase"
        ? "Run `docker compose up --build` to start the frontend and backend. "
          + "The applications use your separately hosted Supabase project."
        : "Run `docker compose up --build` to start the frontend, backend, and database.",
    });
  },
};
