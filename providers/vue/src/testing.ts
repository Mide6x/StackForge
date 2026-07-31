// SPDX-License-Identifier: MPL-2.0
import type { ProviderTestingSupport, TestingGenerationContext } from "@stackforge/core";
import { targetDirectory } from "@stackforge/core";

const vitestOption = {
  id: "vitest-vtu",
  name: "Vitest + Vue Test Utils",
  description: "Unit and component tests using Vue Test Utils and jsdom.",
  testTypes: ["unit", "component"] as const,
  commands: [{ name: "Unit and component tests", command: ["npm", "test"] }],
  default: true,
};
const playwrightOption = {
  id: "playwright",
  name: "Playwright",
  description: "Browser end-to-end tests for the Vite development server.",
  testTypes: ["e2e"] as const,
  commands: [{ name: "Browser end-to-end tests", command: ["npm", "run", "test:e2e"], requires: ["Run npx playwright install before the first browser test."] }],
};
function root(context: TestingGenerationContext): string { return context.selection.projectType === "full-stack" ? `${context.directories.frontend ?? "frontend"}/` : ""; }
function isTs(context: TestingGenerationContext): boolean { return context.selection.frontendLanguage !== "javascript"; }
function add(context: TestingGenerationContext, name: string, version: string): void { context.dependencies.add({ manager: "npm", target: "frontend", name, version, development: true }); }
async function vitest(context: TestingGenerationContext): Promise<void> {
  const extension = isTs(context) ? "ts" : "js"; const prefix = root(context);
  for (const [name, version] of [["vitest", "^3.2.4"], ["jsdom", "^26.1.0"], ["@vue/test-utils", "^2.4.6"]] as const) add(context, name, version);
  context.scripts.add({ target: "frontend", name: "test", command: "vitest run" });
  context.scripts.add({ target: "frontend", name: "test:watch", command: "vitest" });
  await context.files.create(`${prefix}vitest.config.${extension}`, `import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
export default defineConfig({ plugins: [vue()], test: { environment: "jsdom" } });
`);
  await context.files.create(`${prefix}src/components/StackForgeWelcome.vue`, `<template><p>StackForge testing is ready.</p></template>\n`);
  await context.files.create(`${prefix}tests/stackforge-welcome.test.${extension}`, `import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import StackForgeWelcome from "../src/components/StackForgeWelcome.vue";
describe("StackForgeWelcome", () => { it("renders the generated component", () => { expect(mount(StackForgeWelcome).text()).toContain("StackForge testing is ready."); }); });
`);
  context.result.addTestSuite({ providerId: "vue", component: "frontend", optionId: vitestOption.id, name: vitestOption.name, directory: targetDirectory(context, "frontend"), commands: vitestOption.commands });
}
async function playwright(context: TestingGenerationContext): Promise<void> {
  const extension = isTs(context) ? "ts" : "js"; const prefix = root(context);
  add(context, "@playwright/test", "^1.55.0"); context.scripts.add({ target: "frontend", name: "test:e2e", command: "playwright test" });
  await context.files.create(`${prefix}playwright.config.${extension}`, `import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./tests/e2e", use: { baseURL: "http://127.0.0.1:5173" }, webServer: { command: "npm run dev", url: "http://127.0.0.1:5173", reuseExistingServer: !process.env.CI } });
`);
  await context.files.create(`${prefix}tests/e2e/home.spec.${extension}`, `import { expect, test } from "@playwright/test";
test("the generated frontend loads", async ({ page }) => { await page.goto("/"); await expect(page.locator("body")).toBeVisible(); });
`);
  context.result.addTestSuite({ providerId: "vue", component: "frontend", optionId: playwrightOption.id, name: playwrightOption.name, directory: targetDirectory(context, "frontend"), commands: playwrightOption.commands });
}
export const testing: ProviderTestingSupport = { options: [vitestOption, playwrightOption], generators: [{ optionId: vitestOption.id, generate: vitest }, { optionId: playwrightOption.id, generate: playwright }] };
