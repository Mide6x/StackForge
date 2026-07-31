import type { ProviderTestingSupport, TestingGenerationContext } from "@stackforge/core";
import { targetDirectory } from "@stackforge/core";

const fullStackPlaywrightOption = {
  id: "fullstack-playwright-health",
  name: "Full-stack Playwright health flow",
  description: "Verifies that the connected Next.js + Express + PostgreSQL page reports a healthy stack.",
  testTypes: ["e2e"] as const,
  commands: [{
    name: "Full-stack browser test",
    command: ["npm", "run", "test:e2e:fullstack"],
    requires: [
      "Start PostgreSQL, Express, and Next.js before running this test.",
      "Run npx playwright install before the first browser test.",
    ],
  }],
  isAvailable(selection: { providerIds: string[]; projectType: string }) {
    return selection.projectType === "full-stack"
      && ["nextjs", "express", "postgres"].every((id) => selection.providerIds.includes(id));
  },
};

async function generateFullStackPlaywright(context: TestingGenerationContext): Promise<void> {
  const frontendDirectory = context.directories.frontend ?? "frontend";
  const extension = context.selection.frontendLanguage === "javascript" ? "js" : "ts";
  context.dependencies.add({ manager: "npm", target: "frontend", name: "@playwright/test", version: "^1.55.0", development: true });
  context.scripts.add({ target: "frontend", name: "test:e2e:fullstack", command: "playwright test tests/e2e/fullstack-health.spec.*" });
  await context.files.create(`${frontendDirectory}/playwright.config.${extension}`, `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000" },
});
`);
  await context.files.create(`${frontendDirectory}/tests/e2e/fullstack-health.spec.${extension}`, `import { expect, test } from "@playwright/test";

test("frontend displays connected stack status", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Your full stack is connected.")).toBeVisible();
});
`);
  context.result.addTestSuite({
    integrationId: "backend-source-finalizer",
    component: "full-stack",
    optionId: fullStackPlaywrightOption.id,
    name: fullStackPlaywrightOption.name,
    directory: targetDirectory(context, "frontend"),
    commands: fullStackPlaywrightOption.commands,
  });
}

export const goldenPathTesting: ProviderTestingSupport = {
  options: [fullStackPlaywrightOption],
  generators: [{ optionId: fullStackPlaywrightOption.id, generate: generateFullStackPlaywright }],
};
