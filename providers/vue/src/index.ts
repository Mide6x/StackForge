// SPDX-License-Identifier: MPL-2.0
import type { StackForgeProvider } from "@stackforge/core";
import { targetDirectory, writeText } from "@stackforge/core";
import { testing } from "./testing.js";

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
    if (context.selection.docker) {
      await writeText(targetDirectory(context, "frontend"), "Dockerfile", `FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`);
    }
  } },
  postInstallHooks: [{
    name: "Installing Vue dependencies",
    async run(context) {
      await context.run("npm", ["install"], targetDirectory(context, "frontend"));
    },
  }],
  testing,
};
export default provider;
export { provider };
