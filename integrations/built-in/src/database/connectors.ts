import type {
  DependencyContribution,
  IntegrationContext,
  StackForgeIntegration,
} from "@stackforge/core";
import {
  backends,
  type BackendId,
  databases,
  type DatabaseId,
  isJavaScript,
} from "../catalog.js";

function addDependencies(
  context: IntegrationContext,
  backendId: BackendId,
  databaseId: DatabaseId,
): void {
  const dependencies: Record<BackendId, Record<DatabaseId, DependencyContribution[]>> = {
    express: {
      postgres: [
        { manager: "npm", target: "backend", name: "pg", version: "^8.16.3" },
        { manager: "npm", target: "backend", name: "dotenv", version: "^17.2.1" },
      ],
      mongodb: [
        { manager: "npm", target: "backend", name: "mongodb", version: "^6.19.0" },
        { manager: "npm", target: "backend", name: "dotenv", version: "^17.2.1" },
      ],
      supabase: [
        {
          manager: "npm",
          target: "backend",
          name: "@supabase/supabase-js",
          version: "^2.57.4",
        },
        { manager: "npm", target: "backend", name: "dotenv", version: "^17.2.1" },
      ],
    },
    fastapi: {
      postgres: [
        { manager: "python", target: "backend", name: "sqlalchemy", version: ">=2.0" },
        { manager: "python", target: "backend", name: "psycopg[binary]", version: ">=3.2" },
        { manager: "python", target: "backend", name: "pydantic-settings", version: ">=2.6" },
      ],
      mongodb: [
        { manager: "python", target: "backend", name: "pymongo", version: ">=4.9" },
        { manager: "python", target: "backend", name: "pydantic-settings", version: ">=2.6" },
      ],
      supabase: [
        { manager: "python", target: "backend", name: "supabase", version: ">=2.10" },
        { manager: "python", target: "backend", name: "pydantic-settings", version: ">=2.6" },
      ],
    },
    springboot: {
      postgres: [
        {
          manager: "maven",
          target: "backend",
          groupId: "org.springframework.boot",
          artifactId: "spring-boot-starter-data-jpa",
        },
        {
          manager: "maven",
          target: "backend",
          groupId: "org.postgresql",
          artifactId: "postgresql",
          scope: "runtime",
        },
      ],
      mongodb: [
        {
          manager: "maven",
          target: "backend",
          groupId: "org.springframework.boot",
          artifactId: "spring-boot-starter-data-mongodb",
        },
      ],
      supabase: [],
    },
  };

  for (const dependency of dependencies[backendId][databaseId]) {
    context.dependencies.add(dependency);
  }

  if (
    backendId === "express"
    && databaseId === "postgres"
    && !isJavaScript(context.selection.backendLanguage)
  ) {
    context.dependencies.add({
      manager: "npm",
      target: "backend",
      name: "@types/pg",
      version: "^8.15.5",
      development: true,
    });
  }
}

function addEnvironment(
  context: IntegrationContext,
  backendId: BackendId,
  databaseId: DatabaseId,
): void {
  const backendTargets = context.selection.projectType === "backend-only"
    ? ["root"] as const
    : ["root", "backend"] as const;
  const backendOnlyTarget = context.selection.projectType === "backend-only"
    ? ["root"] as const
    : ["backend"] as const;
  if (databaseId === "postgres") {
    const exampleValue = backendId === "springboot"
      ? "jdbc:postgresql://localhost:5432/app"
      : "postgresql://postgres:postgres@localhost:5432/app";
    context.environment.add({
      name: "DATABASE_URL",
      exampleValue,
      description: "PostgreSQL connection string used by the backend.",
      section: "Database",
      targets: [...backendTargets],
      sensitive: true,
    });
    if (backendId === "springboot") {
      context.environment.add({
        name: "POSTGRES_USER",
        exampleValue: "postgres",
        description: "PostgreSQL user used by Spring Boot.",
        section: "Database",
        targets: [...backendOnlyTarget],
      });
      context.environment.add({
        name: "POSTGRES_PASSWORD",
        exampleValue: "postgres",
        description: "PostgreSQL password used by Spring Boot.",
        section: "Database",
        targets: [...backendOnlyTarget],
        sensitive: true,
      });
    }
    return;
  }

  if (databaseId === "mongodb") {
    context.environment.add({
      name: "MONGODB_URI",
      exampleValue: "mongodb://localhost:27017/app",
      description: "MongoDB connection string used by the backend.",
      section: "Database",
      targets: [...backendTargets],
      sensitive: true,
    });
    return;
  }

  context.environment.add({
    name: "SUPABASE_URL",
    exampleValue: "",
    description: "URL of the selected Supabase project.",
    section: "Supabase",
    targets: [...backendTargets],
  });
  context.environment.add({
    name: "SUPABASE_ANON_KEY",
    exampleValue: "",
    description: "Public Supabase key. The generated frontend calls the backend API instead.",
    section: "Supabase",
    targets: ["root"],
  });
  context.environment.add({
    name: "SUPABASE_SERVICE_ROLE_KEY",
    exampleValue: "",
    description: "Server-only Supabase service role key. Never expose this value to a browser.",
    section: "Supabase",
    targets: [...backendTargets],
    sensitive: true,
  });
}

function addDatabaseCompose(
  context: IntegrationContext,
  backendId: BackendId,
  databaseId: DatabaseId,
): void {
  if (databaseId === "postgres") {
    context.compose.addService("postgres", {
      image: "postgres:16-alpine",
      component: "database",
      environment: {
        POSTGRES_DB: "app",
        POSTGRES_PASSWORD: "postgres",
        POSTGRES_USER: "postgres",
      },
      ports: ["5432:5432"],
      volumes: ["postgres_data:/var/lib/postgresql/data"],
      healthcheck: {
        test: ["CMD-SHELL", "pg_isready -U postgres -d app"],
        interval: "5s",
        timeout: "5s",
        retries: 10,
      },
    });
    context.compose.addVolume("postgres_data");
    return;
  }

  if (databaseId === "mongodb") {
    context.compose.addService("mongodb", {
      image: "mongo:8",
      component: "database",
      ports: ["27017:27017"],
      volumes: ["mongo_data:/data/db"],
      healthcheck: {
        test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"],
        interval: "5s",
        timeout: "5s",
        retries: 10,
      },
    });
    context.compose.addVolume("mongo_data");
    return;
  }

  context.result.addWarning(
    `${backends[backendId].name} uses the remote Supabase project configured in `
    + `${context.selection.projectType === "backend-only" ? ".env" : "backend/.env"}; `
    + "Compose does not start Supabase locally.",
  );
}

export function createBackendDatabaseConnector(
  backendId: BackendId,
  databaseId: DatabaseId,
): StackForgeIntegration {
  const backend = backends[backendId];
  const database = databases[databaseId];
  const id = `${backendId}-${databaseId}`;

  return {
    metadata: {
      id,
      name: `${backend.name} + ${database.name}`,
      description: `Connects the ${backend.name} API to ${database.name}.`,
      providerIds: [backendId, databaseId],
    },
    phase: "connect-database",
    isApplicable(selection) {
      return selection.projectType === "full-stack"
        || selection.projectType === "backend-only";
    },
    async apply(context) {
      addDependencies(context, backendId, databaseId);
      addEnvironment(context, backendId, databaseId);
      addDatabaseCompose(context, backendId, databaseId);

      const setupSteps = databaseId === "supabase"
        ? [
          "Create or select a Supabase project.",
          `Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to ${
            context.selection.projectType === "backend-only" ? ".env" : "backend/.env"
          }.`,
          "Keep SUPABASE_SERVICE_ROLE_KEY on the server only.",
        ]
        : [
          context.selection.projectType === "backend-only"
            ? "Copy .env.example to .env."
            : "Copy backend/.env.example to backend/.env.",
          context.selection.docker
            ? `Start ${database.name} with Docker Compose.`
            : `Start a local ${database.name} instance and update the connection value.`,
        ];
      context.result.setDatabase({
        providerId: databaseId,
        name: database.name,
        setupSteps,
        localServiceName: databaseId === "supabase"
          ? undefined
          : databaseId === "postgres" ? "postgres" : "mongodb",
      });
      context.documentation.add({
        id: "database",
        title: `${database.name} connection`,
        order: 30,
        content: databaseId === "supabase"
          ? `${backend.name} uses the Supabase REST client with a server-only service-role key. `
            + "The key is never written to frontend environment files."
          : `${backend.name} includes a reusable ${database.name} client and the \`/health\` `
            + "endpoint verifies the database connection.",
      });
      context.result.addManualStep(
        `database:${id}`,
        setupSteps.join(" "),
      );
    },
  };
}

export const backendDatabaseIntegrations: StackForgeIntegration[] = (
  Object.keys(backends) as BackendId[]
).flatMap((backendId) =>
  (Object.keys(databases) as DatabaseId[]).map((databaseId) =>
    createBackendDatabaseConnector(backendId, databaseId)));
