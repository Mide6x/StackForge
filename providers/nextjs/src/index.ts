import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { StackForgeProvider } from "@stackforge/core";
import { targetDirectory, writeText } from "@stackforge/core";

const nextjsVersion = "16.2.12";

const provider: StackForgeProvider = {
  metadata: {
    id: "nextjs",
    name: "Next.js",
    category: "frontend",
    description: "React framework for full-stack web applications",
    version: nextjsVersion,
    supportedLanguages: ["typescript", "javascript"],
    tags: ["react", "ssr"],
    runtime: {
      developmentCommand: ["npm run dev"],
      productionCommand: ["npm run build", "npm run start"],
      localUrl: "http://localhost:3000",
      dependenciesInstalled: true,
    },
  },
  compatibility: { projectTypes: ["full-stack", "frontend-only"] },
  generator: {
    async generate(context) {
      const language = context.selection.frontendLanguage === "javascript" ? "--js" : "--ts";
      const target = targetDirectory(context, "frontend");
      await context.run("npx", ["--yes", `create-next-app@${nextjsVersion}`, ".", language, "--eslint", "--app", "--src-dir", "--use-npm", "--no-tailwind"], target);
      if (context.selection.projectType === "full-stack") {
        await rm(join(target, ".git"), { recursive: true, force: true });
      }
      if (context.selection.docker) {
        await writeText(target, "Dockerfile", `FROM node:22-alpine AS dependencies
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
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.* ./
EXPOSE 3000
CMD ["npm", "run", "start"]
`);
      }
    },
  },
};

export default provider;
export { provider };
