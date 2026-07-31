import type { StackForgeProvider } from "@stackforge/core";
import { targetDirectory, writeText } from "@stackforge/core";

const provider: StackForgeProvider = {
  metadata: {
    id: "express",
    name: "Express",
    category: "backend",
    description: "Minimal Node.js web server",
    version: "5",
    supportedLanguages: ["typescript", "javascript"],
    tags: ["node", "api"],
    runtime: {
      developmentCommand: ["npm run dev"],
      productionCommand: ["npm run build", "npm run start"],
      localUrl: "http://localhost:3001",
      healthCheckUrl: "http://localhost:3001/health",
      dependenciesInstalled: true,
    },
  },
  compatibility: { projectTypes: ["full-stack", "backend-only"] },
  generator: { async generate(context) {
    const target = targetDirectory(context, "backend");
    const isTs = context.selection.backendLanguage !== "javascript";
    await writeText(target, "package.json", JSON.stringify({ name: "backend", private: true, type: "module", scripts: isTs ? { dev: "tsx watch src/index.ts", build: "tsc", start: "node dist/index.js" } : { dev: "node --watch src/index.js", start: "node src/index.js" }, dependencies: { express: "^5.1.0" }, devDependencies: isTs ? { "@types/express": "^5.0.3", "@types/node": "^22.0.0", tsx: "^4.0.0", typescript: "^5.0.0" } : {} }, null, 2) + "\n");
    await writeText(target, isTs ? "src/index.ts" : "src/index.js", `import express from "express";\n\nconst app = express();\nconst port = Number(process.env.PORT ?? 3001);\n\napp.use(express.json());\napp.get("/health", (_request, response) => response.json({ status: "ok" }));\n\napp.listen(port, () => console.log(\`API listening on :\${port}\`));\n`);
    if (isTs) await writeText(target, "tsconfig.json", '{ "compilerOptions": { "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext", "outDir": "dist", "strict": true, "esModuleInterop": true }, "include": ["src"] }\n');
    if (context.selection.docker) {
      const dockerfile = isTs
        ? `FROM node:22-alpine AS dependencies
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
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["npm", "run", "start"]
`
        : `FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
EXPOSE 3001
CMD ["npm", "run", "start"]
`;
      await writeText(target, "Dockerfile", dockerfile);
    }
  } },
  getDependencies: () => [{ name: "express", version: "^5.1.0", type: "runtime" }],
  postInstallHooks: [{
    name: "Installing Express dependencies",
    async run(context) {
      await context.run("npm", ["install"], targetDirectory(context, "backend"));
    },
  }],
};
export default provider;
export { provider };
