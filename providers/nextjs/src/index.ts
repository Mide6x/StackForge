import type { StackForgeProvider } from "@stackforge/core";
import { targetDirectory, writeText } from "@stackforge/core";

const provider: StackForgeProvider = {
  metadata: { id: "nextjs", name: "Next.js", category: "frontend", description: "React framework for full-stack web applications", version: "latest", supportedLanguages: ["typescript", "javascript"], tags: ["react", "ssr"] },
  compatibility: { projectTypes: ["full-stack", "frontend-only"] },
  generator: {
    async generate(context) {
      const language = context.selection.frontendLanguage === "javascript" ? "--js" : "--ts";
      await context.run("npx", ["--yes", "create-next-app@latest", ".", language, "--eslint", "--app", "--src-dir", "--use-npm", "--no-tailwind"], targetDirectory(context, "frontend"));
      if (context.selection.docker) await writeText(targetDirectory(context, "frontend"), "Dockerfile", "FROM node:22-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\nEXPOSE 3000\nCMD [\"npm\", \"run\", \"start\"]\n");
    },
  },
};

export default provider;
export { provider };
