import type { StackForgeProvider } from "@stackforge/core";
import { targetDirectory, writeText } from "@stackforge/core";

const provider: StackForgeProvider = {
  metadata: { id: "react", name: "React (Vite)", category: "frontend", description: "React single-page application powered by Vite", version: "latest", supportedLanguages: ["typescript", "javascript"], tags: ["react", "vite"] },
  compatibility: { projectTypes: ["full-stack", "frontend-only"] },
  generator: { async generate(context) {
    const template = context.selection.frontendLanguage === "javascript" ? "react" : "react-ts";
    await context.run("npm", ["create", "vite@latest", ".", "--", "--template", template], targetDirectory(context, "frontend"));
    if (context.selection.docker) await writeText(targetDirectory(context, "frontend"), "Dockerfile", "FROM node:22-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\nEXPOSE 5173\nCMD [\"npm\", \"run\", \"dev\", \"--\", \"--host\", \"0.0.0.0\"]\n");
  } },
};
export default provider;
export { provider };
