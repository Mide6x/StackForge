// SPDX-License-Identifier: MPL-2.0
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

test("formats a single environment file copy command into the same directory", () => {
  const result: GenerationResult = {
    projectName: "my-api",
    rootDirectory: "/workspace/my-api",
    components: [
      {
        providerId: "express",
        name: "Express",
        category: "backend",
        directory: "/workspace/my-api",
        relativeDirectory: ".",
        runtime: {
          developmentCommand: ["npm run dev"],
          localUrl: "http://localhost:3001",
          healthCheckUrl: "http://localhost:3001/health",
          dependenciesInstalled: true,
        },
      },
    ],
    dependenciesInstalled: true,
    environmentFiles: ["/workspace/my-api/.env.example"],
    warnings: [],
    completedSteps: [],
  };

  const summary = formatGenerationSummary(result, "/workspace");
  assert.match(summary, /cp my-api\/\.env\.example my-api\/\.env/);
});

test("describes remote Supabase Docker output without claiming it starts the full stack", () => {
  const result: GenerationResult = {
    projectName: "supabase-app",
    rootDirectory: "/workspace/supabase-app",
    components: [
      {
        providerId: "nextjs",
        name: "Next.js",
        category: "frontend",
        directory: "/workspace/supabase-app/frontend",
        relativeDirectory: "frontend",
      },
      {
        providerId: "fastapi",
        name: "FastAPI",
        category: "backend",
        directory: "/workspace/supabase-app/backend",
        relativeDirectory: "backend",
      },
      {
        providerId: "supabase",
        name: "Supabase",
        category: "database",
        directory: "/workspace/supabase-app",
        relativeDirectory: ".",
      },
    ],
    dependenciesInstalled: false,
    docker: {
      enabled: true,
      composeFile: "/workspace/supabase-app/compose.yaml",
      startsFullStack: false,
      command: ["docker compose up --build"],
    },
    database: {
      providerId: "supabase",
      name: "Supabase",
      setupSteps: [
        "Create or select a Supabase project.",
        "Add the project URL and server key to the backend environment.",
      ],
    },
    environmentFiles: [
      "/workspace/supabase-app/frontend/.env.example",
      "/workspace/supabase-app/backend/.env.example",
    ],
    manualSteps: ["Keep the service-role key on the server only."],
    warnings: [],
    completedSteps: [],
  };

  const summary = formatGenerationSummary(result, "/workspace");
  assert.match(summary, /Create or select a Supabase project/);
  assert.match(summary, /Start the generated containers/);
  assert.doesNotMatch(summary, /Start everything/);
  assert.match(summary, /Keep the service-role key on the server only/);
});

test("formats only selected test suites with relative commands", () => {
  const result: GenerationResult = {
    projectName: "my-app",
    rootDirectory: "/workspace/my-app",
    components: [],
    dependenciesInstalled: true,
    environmentFiles: [],
    warnings: [],
    completedSteps: [],
    testSuites: [{
      providerId: "express",
      component: "backend",
      optionId: "vitest-supertest",
      name: "Vitest + Supertest",
      directory: "/workspace/my-app/backend",
      commands: [{ name: "Unit and API integration tests", command: ["npm", "test"] }],
    }],
  };
  const summary = formatGenerationSummary(result, "/workspace");
  assert.match(summary, /Testing/);
  assert.match(summary, /Vitest \+ Supertest/);
  assert.match(summary, /cd my-app\/backend/);
  assert.doesNotMatch(summary, /Playwright/);
});

test("formats current-directory test commands without redundant path segments", () => {
  const result: GenerationResult = {
    projectName: "current",
    rootDirectory: "/workspace/current",
    components: [], dependenciesInstalled: true, environmentFiles: [], warnings: [], completedSteps: [],
    testSuites: [{
      providerId: "nextjs", component: "frontend", optionId: "vitest-rtl", name: "Vitest + React Testing Library",
      directory: "/workspace/current/frontend", commands: [{ name: "Unit tests", command: ["npm", "test"] }],
    }],
  };
  const summary = formatGenerationSummary(result, "/workspace/current");
  assert.match(summary, /cd frontend/);
  assert.doesNotMatch(summary, /\.\/\.\/frontend/);
});

test("formats FastAPI standard Python fallback start commands", () => {
  const result: GenerationResult = {
    projectName: "my-api",
    rootDirectory: "/workspace/my-api",
    components: [
      {
        providerId: "fastapi",
        name: "FastAPI",
        category: "backend",
        directory: "/workspace/my-api/backend",
        relativeDirectory: "backend",
        runtime: {
          developmentCommand: [
            "source .venv/bin/activate",
            "python -m uvicorn app.main:app --reload",
          ],
          localUrl: "http://localhost:8000",
          healthCheckUrl: "http://localhost:8000/health",
          dependenciesInstalled: true,
        },
      },
    ],
    dependenciesInstalled: true,
    environmentFiles: [],
    warnings: [],
    completedSteps: [],
  };

  const summary = formatGenerationSummary(result, "/workspace");
  assert.match(summary, /source \.venv\/bin\/activate/);
  assert.match(summary, /python -m uvicorn app\.main:app --reload/);
});
