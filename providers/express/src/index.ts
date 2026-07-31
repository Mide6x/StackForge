import type { StackForgeProvider, TestingGenerationContext } from "@stackforge/core";
import { targetDirectory, writeText } from "@stackforge/core";

const vitestSupertestOption = {
  id: "vitest-supertest",
  name: "Vitest + Supertest",
  description: "Unit and API integration tests for the Express application.",
  testTypes: ["unit", "integration"] as const,
  commands: [
    { name: "Unit and API integration tests", command: ["npm", "test"] },
    { name: "Watch tests", command: ["npm", "run", "test:watch"] },
  ],
  default: true,
};

function isTypeScript(context: TestingGenerationContext): boolean {
  return context.selection.backendLanguage !== "javascript";
}

function backendPrefix(context: TestingGenerationContext): string {
  return context.selection.projectType === "full-stack"
    ? `${context.directories.backend ?? "backend"}/`
    : "";
}

async function generateVitestSupertest(context: TestingGenerationContext): Promise<void> {
  const typeScript = isTypeScript(context);
  const prefix = backendPrefix(context);
  const extension = typeScript ? "ts" : "js";
  const hasDatabase = context.selection.providerIds.some((id) =>
    id === "postgres" || id === "mongodb" || id === "supabase");
  context.dependencies.add({ manager: "npm", target: "backend", name: "vitest", version: "^3.2.4", development: true });
  context.dependencies.add({ manager: "npm", target: "backend", name: "supertest", version: "^7.1.4", development: true });
  if (typeScript) {
    context.dependencies.add({ manager: "npm", target: "backend", name: "@types/supertest", version: "^6.0.3", development: true });
  }
  context.scripts.add({ target: "backend", name: "test", command: "vitest run" });
  context.scripts.add({ target: "backend", name: "test:watch", command: "vitest" });
  await context.files.create(`${prefix}vitest.config.${extension}`, `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
`);
  await context.files.create(`${prefix}tests/health.test.${extension}`, `import request from "supertest";
import { describe, expect, it } from "vitest";
import { app${hasDatabase ? ", setHealthCheckForTests" : ""} } from "../src/app.js";

${hasDatabase ? "setHealthCheckForTests(async () => {});\n" : ""}

describe("GET /health", () => {
  it("returns a successful health response", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });
});
`);
  context.result.addTestSuite({
    providerId: "express",
    component: "backend",
    optionId: vitestSupertestOption.id,
    name: vitestSupertestOption.name,
    directory: targetDirectory(context, "backend"),
    commands: vitestSupertestOption.commands,
  });
}

const provider: StackForgeProvider = {
  metadata: {
    id: "express",
    name: "Express",
    category: "backend",
    description: "Minimal Node.js web server",
    version: "5",
    supportedLanguages: ["typescript", "javascript"],
    tags: ["node", "api"],
    runtime: {
      developmentCommand: ["npm run dev"],
      productionCommand: ["npm run build", "npm run start"],
      localUrl: "http://localhost:3001",
      healthCheckUrl: "http://localhost:3001/health",
      dependenciesInstalled: true,
    },
  },
  compatibility: { projectTypes: ["full-stack", "backend-only"] },
  generator: { async generate(context) {
    const target = targetDirectory(context, "backend");
    const isTs = context.selection.backendLanguage !== "javascript";
    await writeText(target, "package.json", JSON.stringify({ name: "backend", private: true, type: "module", scripts: isTs ? { dev: "tsx watch src/index.ts", build: "tsc", start: "node dist/index.js" } : { dev: "node --watch src/index.js", start: "node src/index.js" }, dependencies: { express: "^5.1.0" }, devDependencies: isTs ? { "@types/express": "^5.0.3", "@types/node": "^22.0.0", tsx: "^4.0.0", typescript: "^5.0.0" } : {} }, null, 2) + "\n");
    const extension = isTs ? "ts" : "js";
    await writeText(target, `src/app.${extension}`, `import express from "express";

export const app = express();

app.use(express.json());
app.get("/health", (_request, response) => response.json({ status: "ok" }));
`);
    await writeText(target, `src/index.${extension}`, `import { app } from "./app.js";

const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => console.log(\`API listening on :\${port}\`));
`);
    if (isTs) await writeText(target, "tsconfig.json", '{ "compilerOptions": { "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext", "outDir": "dist", "strict": true, "esModuleInterop": true }, "include": ["src"] }\n');
    if (context.selection.docker) {
      const dockerfile = isTs
        ? `FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["npm", "run", "start"]
`
        : `FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
EXPOSE 3001
CMD ["npm", "run", "start"]
`;
      await writeText(target, "Dockerfile", dockerfile);
    }
  } },
  getDependencies: () => [{ name: "express", version: "^5.1.0", type: "runtime" }],
  postInstallHooks: [{
    name: "Installing Express dependencies",
    async run(context) {
      await context.run("npm", ["install"], targetDirectory(context, "backend"));
    },
  }],
  testing: {
    options: [vitestSupertestOption],
    generators: [{ optionId: vitestSupertestOption.id, generate: generateVitestSupertest }],
  },
};
export default provider;
export { provider };
