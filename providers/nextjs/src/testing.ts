import type {
  ProviderTestingSupport,
  TestingGenerationContext,
} from "@stackforge/core";
import { targetDirectory } from "@stackforge/core";

const vitestOption = {
  id: "vitest-rtl",
  name: "Vitest + React Testing Library",
  description: "Unit and component tests with jsdom and jest-dom matchers.",
  testTypes: ["unit", "component"] as const,
  commands: [
    { name: "Unit and component tests", command: ["npm", "test"] },
    { name: "Watch tests", command: ["npm", "run", "test:watch"] },
  ],
  default: true,
};

const playwrightOption = {
  id: "playwright",
  name: "Playwright",
  description: "Browser end-to-end tests for the frontend development server.",
  testTypes: ["e2e"] as const,
  commands: [
    {
      name: "Browser end-to-end tests",
      command: ["npm", "run", "test:e2e"],
      requires: ["Run npx playwright install before the first browser test."],
    },
  ],
};

function typeScript(context: TestingGenerationContext): boolean {
  return context.selection.frontendLanguage !== "javascript";
}

function prefix(context: TestingGenerationContext): string {
  return context.selection.projectType === "full-stack"
    ? `${context.directories.frontend ?? "frontend"}/`
    : "";
}

function addVitestDependencies(context: TestingGenerationContext): void {
  for (const [name, version] of [
    ["vitest", "^3.2.4"],
    ["jsdom", "^26.1.0"],
    ["@vitejs/plugin-react", "^5.0.2"],
    ["@testing-library/react", "^16.3.0"],
    ["@testing-library/jest-dom", "^6.8.0"],
    ["@testing-library/user-event", "^14.6.1"],
  ] as const) {
    context.dependencies.add({ manager: "npm", target: "frontend", name, version, development: true });
  }
}

async function generateVitest(context: TestingGenerationContext): Promise<void> {
  const isTs = typeScript(context);
  const extension = isTs ? "ts" : "js";
  const testExtension = isTs ? "tsx" : "jsx";
  const root = prefix(context);
  addVitestDependencies(context);
  context.scripts.add({ target: "frontend", name: "test", command: "vitest run" });
  context.scripts.add({ target: "frontend", name: "test:watch", command: "vitest" });
  await context.files.create(`${root}vitest.config.${extension}`, `import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", setupFiles: "./vitest.setup.${extension}" },
});
`);
  await context.files.create(`${root}vitest.setup.${extension}`, 'import "@testing-library/jest-dom/vitest";\n');
  await context.files.create(`${root}src/components/StackForgeWelcome.${testExtension}`, `export function StackForgeWelcome() {
  return <p>StackForge testing is ready.</p>;
}
`);
  await context.files.create(`${root}tests/stackforge-welcome.test.${testExtension}`, `import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StackForgeWelcome } from "../src/components/StackForgeWelcome";

describe("StackForgeWelcome", () => {
  it("renders the generated component", () => {
    render(<StackForgeWelcome />);

    expect(screen.getByText("StackForge testing is ready.")).toBeInTheDocument();
  });
});
`);
  context.result.addTestSuite({
    providerId: "nextjs",
    component: "frontend",
    optionId: vitestOption.id,
    name: vitestOption.name,
    directory: targetDirectory(context, "frontend"),
    commands: vitestOption.commands,
  });
}

async function generatePlaywright(context: TestingGenerationContext): Promise<void> {
  const isTs = typeScript(context);
  const root = prefix(context);
  const extension = isTs ? "ts" : "js";
  context.dependencies.add({ manager: "npm", target: "frontend", name: "@playwright/test", version: "^1.55.0", development: true });
  context.scripts.add({ target: "frontend", name: "test:e2e", command: "playwright test" });
  await context.files.create(`${root}playwright.config.${extension}`, `import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
  },
});
`);
  await context.files.create(`${root}tests/e2e/home.spec.${extension}`, `import { expect, test } from "@playwright/test";

test("the generated frontend loads", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("body")).toBeVisible();
});
`);
  context.result.addTestSuite({
    providerId: "nextjs",
    component: "frontend",
    optionId: playwrightOption.id,
    name: playwrightOption.name,
    directory: targetDirectory(context, "frontend"),
    commands: playwrightOption.commands,
  });
}

export const testing: ProviderTestingSupport = {
  options: [vitestOption, playwrightOption],
  generators: [
    { optionId: vitestOption.id, generate: generateVitest },
    { optionId: playwrightOption.id, generate: generatePlaywright },
  ],
};
