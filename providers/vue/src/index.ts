import type { StackForgeProvider } from "@stackforge/core";
import { targetDirectory, writeText } from "@stackforge/core";

const viteVersion = "7.1.3";

const provider: StackForgeProvider = {
  metadata: {
    id: "vue",
    name: "Vue (Vite)",
    category: "frontend",
    description: "Vue single-page application powered by Vite",
    version: viteVersion,
    supportedLanguages: ["typescript", "javascript"],
    tags: ["vue", "vite"],
    runtime: {
      developmentCommand: ["npm run dev"],
      productionCommand: ["npm run build", "npm run preview"],
      localUrl: "http://localhost:5173",
      dependenciesInstalled: true,
    },
  },
  compatibility: { projectTypes: ["full-stack", "frontend-only"] },
  generator: { async generate(context) {
    const template = context.selection.frontendLanguage === "javascript" ? "vue" : "vue-ts";
    await context.run("npm", ["create", `vite@${viteVersion}`, ".", "--", "--template", template], targetDirectory(context, "frontend"));
    if (context.selection.docker) await writeText(targetDirectory(context, "frontend"), "Dockerfile", "FROM node:22-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\nEXPOSE 5173\nCMD [\"npm\", \"run\", \"dev\", \"--\", \"--host\", \"0.0.0.0\"]\n");
  } },
};
export default provider;
export { provider };
