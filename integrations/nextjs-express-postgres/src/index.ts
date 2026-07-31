// SPDX-License-Identifier: MPL-2.0
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  targetDirectory,
  writeText,
  type GenerationContext,
  type GenerationResult,
  type StackForgeIntegration,
} from "@stackforge/core";

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

async function addBackendDependencies(backendDirectory: string): Promise<void> {
  const packagePath = join(backendDirectory, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as PackageJson;

  packageJson.dependencies = {
    ...packageJson.dependencies,
    cors: "^2.8.5",
    dotenv: "^17.2.1",
    pg: "^8.16.3",
  };
  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    "@types/cors": "^2.8.19",
    "@types/pg": "^8.15.5",
  };

  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

function expressSource(isTypeScript: boolean): string {
  const poolType = isTypeScript ? ": Promise<void>" : "";
  return `import "dotenv/config";
import cors from "cors";
import express from "express";
import { Pool } from "pg";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors({ origin: frontendUrl }));
app.use(express.json());

app.get("/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Database health check failed", error);
    response.status(503).json({ status: "error", database: "unavailable" });
  }
});

async function start()${poolType} {
  await pool.query("SELECT 1");
  app.listen(port, () => console.log(\`API listening on :\${port}\`));
}

start().catch((error) => {
  console.error("API failed to start", error);
  process.exit(1);
});
`;
}

function nextApiSource(isTypeScript: boolean): string {
  const returnType = isTypeScript
    ? ": Promise<{ status: string; database: string }>"
    : "";
  return `const apiUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function getApiHealth()${returnType} {
  const response = await fetch(\`\${apiUrl}/health\`);
  if (!response.ok) {
    throw new Error(\`API health check failed with status \${response.status}\`);
  }
  return response.json();
}
`;
}

function nextPageSource(isTypeScript: boolean): string {
  const stateType = isTypeScript
    ? '<{ status: string; database: string } | null>'
    : "";
  return `"use client";

import { useEffect, useState } from "react";
import { getApiHealth } from "../lib/api";

export default function Home() {
  const [health, setHealth] = useState${stateType}(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getApiHealth().then(setHealth).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to reach the API");
    });
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "80px auto", padding: 24, fontFamily: "sans-serif" }}>
      <p>StackForge golden path</p>
      <h1>${"${"}health ? "Your full stack is connected." : "Checking your stack…"${"}"}</h1>
      {health && <p>API: {health.status} · PostgreSQL: {health.database}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
`;
}

const frontendDockerfile = `FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["npm", "run", "start"]
`;

const typescriptBackendDockerfile = `FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3001
CMD ["npm", "run", "start"]
`;

const javascriptBackendDockerfile = `FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3001
CMD ["npm", "run", "start"]
`;

const composeFile = `services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d app"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build: ./backend
    environment:
      PORT: 3001
      FRONTEND_URL: http://localhost:3000
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/app
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3001/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 5s
      timeout: 5s
      retries: 10

  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_API_URL: http://localhost:3001
    ports:
      - "3000:3000"
    depends_on:
      backend:
        condition: service_healthy

volumes:
  postgres_data:
`;

function projectReadme(projectName: string, docker: boolean): string {
  const dockerInstructions = docker
    ? `## Run with Docker

\`\`\`bash
docker compose up --build
\`\`\`

Open http://localhost:3000. The generated page calls the Express health endpoint, which verifies the PostgreSQL connection.

`
    : "";
  const composeStructure = docker
    ? "- `compose.yaml` — complete local stack\n"
    : "";

  return `# ${projectName}

Generated by StackForge with Next.js, Express, and PostgreSQL.

${dockerInstructions}## Run locally

Start PostgreSQL, then copy the environment templates:

\`\`\`bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
\`\`\`

Run the applications in separate terminals:

\`\`\`bash
(cd backend && npm run dev)
(cd frontend && npm run dev)
\`\`\`

The frontend runs on port 3000 and the API runs on port 3001.

## Structure

- \`frontend/\` — Next.js application
- \`backend/\` — Express API and PostgreSQL connection
${composeStructure}
`;
}

export const integration: StackForgeIntegration = {
  metadata: {
    id: "nextjs-express-postgres",
    name: "Next.js + Express + PostgreSQL",
    description: "Connects the frontend, API, database, environments, and Docker services.",
    providerIds: ["nextjs", "express", "postgres"],
  },
  isApplicable(selection) {
    return selection.projectType === "full-stack";
  },
  async integrate(context: GenerationContext) {
    const frontendDirectory = targetDirectory(context, "frontend");
    const backendDirectory = targetDirectory(context, "backend");
    const isTypeScript = context.selection.backendLanguage !== "javascript";
    const frontendIsTypeScript = context.selection.frontendLanguage !== "javascript";
    const frontendExtension = frontendIsTypeScript ? "ts" : "js";
    const pageExtension = frontendIsTypeScript ? "tsx" : "js";

    await addBackendDependencies(backendDirectory);
    await Promise.all([
      writeText(
        context.rootDirectory,
        ".env.example",
        "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app\nJWT_SECRET=\nNEXT_PUBLIC_API_URL=http://localhost:3001\n",
      ),
      writeText(
        frontendDirectory,
        ".env.example",
        "NEXT_PUBLIC_API_URL=http://localhost:3001\n",
      ),
      writeText(
        backendDirectory,
        ".env.example",
        "PORT=3001\nFRONTEND_URL=http://localhost:3000\nDATABASE_URL=postgresql://postgres:postgres@localhost:5432/app\n",
      ),
      writeText(
        backendDirectory,
        isTypeScript ? "src/index.ts" : "src/index.js",
        expressSource(isTypeScript),
      ),
      writeText(
        frontendDirectory,
        `src/lib/api.${frontendExtension}`,
        nextApiSource(frontendIsTypeScript),
      ),
      writeText(
        frontendDirectory,
        `src/app/page.${pageExtension}`,
        nextPageSource(frontendIsTypeScript),
      ),
      writeText(
        context.rootDirectory,
        "README.md",
        projectReadme(context.projectName, context.selection.docker),
      ),
    ]);

    if (context.selection.docker) {
      await rm(join(context.rootDirectory, "docker-compose.yml"), { force: true });
      await Promise.all([
        writeText(context.rootDirectory, "compose.yaml", composeFile),
        writeText(frontendDirectory, "Dockerfile", frontendDockerfile),
        writeText(frontendDirectory, ".dockerignore", "node_modules\n.next\n.env*\n"),
        writeText(
          backendDirectory,
          "Dockerfile",
          isTypeScript ? typescriptBackendDockerfile : javascriptBackendDockerfile,
        ),
        writeText(backendDirectory, ".dockerignore", "node_modules\ndist\n.env*\n"),
      ]);
    }
  },
  augmentResult(result: GenerationResult, context: GenerationContext) {
    result.environmentFiles = [
      join(context.rootDirectory, ".env.example"),
      join(targetDirectory(context, "frontend"), ".env.example"),
      join(targetDirectory(context, "backend"), ".env.example"),
    ];
    result.docker = context.selection.docker
      ? {
        enabled: true,
        composeFile: join(context.rootDirectory, "compose.yaml"),
        startsFullStack: true,
        command: ["docker compose up --build"],
      }
      : undefined;
  },
};

export default integration;
