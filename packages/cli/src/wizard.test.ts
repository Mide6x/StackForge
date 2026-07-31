import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderSelection, StackForgeIntegration, StackForgeProvider } from "@stackforge/core";
import { availableFullStackTestOptions, availableTestOptions, testingPromptComponents } from "./wizard.js";

const selection: ProviderSelection = {
  projectType: "full-stack",
  providerIds: ["nextjs", "express", "postgres"],
  frontendLanguage: "typescript",
  backendLanguage: "typescript",
  docker: false,
  testing: {},
};
const frontend: StackForgeProvider = {
  metadata: { id: "nextjs", name: "Next.js", category: "frontend", description: "" },
  compatibility: {}, generator: { async generate() {} },
  testing: { options: [{ id: "vitest", name: "Vitest", description: "", testTypes: ["unit"], commands: [] }], generators: [] },
};
const backend: StackForgeProvider = {
  metadata: { id: "express", name: "Express", category: "backend", description: "" },
  compatibility: {}, generator: { async generate() {} },
};
const integration: StackForgeIntegration = {
  metadata: { id: "golden", name: "Golden", description: "", providerIds: ["nextjs", "express", "postgres"] },
  phase: "finalize", apply: async () => {},
  testing: { options: [{ id: "stack", name: "Stack", description: "", testTypes: ["e2e"], commands: [], isAvailable: (value) => value.projectType === "full-stack" }], generators: [] },
};

test("testing prompt helpers expose provider-specific and applicable full-stack options", () => {
  assert.deepEqual(availableTestOptions(frontend, selection).map((option) => option.id), ["vitest"]);
  assert.deepEqual(availableTestOptions(backend, selection), []);
  assert.deepEqual(availableFullStackTestOptions([integration], selection).map(({ option }) => option.id), ["stack"]);
});

test("testing prompt helpers limit coverage questions to the selected project type", () => {
  assert.deepEqual(testingPromptComponents("frontend-only"), ["frontend"]);
  assert.deepEqual(testingPromptComponents("backend-only"), ["backend"]);
  assert.deepEqual(testingPromptComponents("full-stack"), ["frontend", "backend", "full-stack"]);
});
