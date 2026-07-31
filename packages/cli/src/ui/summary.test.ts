import assert from "node:assert/strict";
import test from "node:test";
import type { GenerationResult } from "@stackforge/core";
import { GenerationFailure } from "@stackforge/core";
import { formatGenerationFailure, formatGenerationSummary } from "./summary.js";

test("formats a full-stack success summary with relative commands", () => {
  const result: GenerationResult = {
    projectName: "my-app",
    rootDirectory: "/workspace/my-app",
    components: [
      {
        providerId: "nextjs",
        name: "Next.js",
        category: "frontend",
        directory: "/workspace/my-app/frontend",
        relativeDirectory: "frontend",
        runtime: {
          developmentCommand: ["npm run dev"],
          localUrl: "http://localhost:3000",
          dependenciesInstalled: true,
        },
      },
      {
        providerId: "express",
        name: "Express",
        category: "backend",
        directory: "/workspace/my-app/backend",
        relativeDirectory: "backend",
        runtime: {
          developmentCommand: ["npm run dev"],
          localUrl: "http://localhost:3001",
          healthCheckUrl: "http://localhost:3001/health",
          dependenciesInstalled: true,
        },
      },
      {
        providerId: "postgres",
        name: "PostgreSQL",
        category: "database",
        directory: "/workspace/my-app",
        relativeDirectory: ".",
      },
    ],
    dependenciesInstalled: true,
    docker: {
      enabled: true,
      composeFile: "/workspace/my-app/compose.yaml",
      startsFullStack: true,
      command: ["docker compose up --build"],
    },
    environmentFiles: [
      "/workspace/my-app/.env.example",
      "/workspace/my-app/frontend/.env.example",
      "/workspace/my-app/backend/.env.example",
    ],
    warnings: [],
    completedSteps: [],
  };

  const summary = formatGenerationSummary(result, "/workspace");
  assert.match(summary, /Project created successfully/);
  assert.match(summary, /cd my-app\/frontend/);
  assert.match(summary, /cd my-app\/backend/);
  assert.match(summary, /docker compose up --build/);
});

test("formats a failure summary with completed and failed steps", () => {
  const error = new GenerationFailure("npm exited with code 1", {
    completedSteps: ["Frontend scaffold"],
    failedStep: "Backend dependency installation",
    rootDirectory: "/workspace/my-app",
  });

  const summary = formatGenerationFailure(error);
  assert.match(summary, /Completed:/);
  assert.match(summary, /✓ Frontend scaffold/);
  assert.match(summary, /✗ Backend dependency installation/);
  assert.match(summary, /Partial files remain at:/);
});
