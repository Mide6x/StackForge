import type { GeneratedFileWriter } from "@stackforge/core";
import type { BackendId, FrontendId } from "../catalog.js";

const npmInstall = "if [ -f package-lock.json ]; then npm ci; else npm install; fi";
const npmProductionInstall =
  "if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi";

export function frontendDockerfile(frontendId: FrontendId): string {
  if (frontendId === "nextjs") {
    return `FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN ${npmInstall}

FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN ${npmProductionInstall}
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["npm", "run", "start"]
`;
  }

  return `FROM node:22-alpine AS builder
WORKDIR /app
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL
COPY package*.json ./
RUN ${npmInstall}
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runner
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;
}

export const viteNginxConfig = `server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
`;

export function expressDockerfile(typeScript: boolean): string {
  if (!typeScript) {
    return `FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN ${npmProductionInstall}
COPY . .
EXPOSE 3001
CMD ["npm", "run", "start"]
`;
  }
  return `FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN ${npmInstall}
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN ${npmProductionInstall}
COPY --from=builder /app/dist ./dist
EXPOSE 3001
CMD ["npm", "run", "start"]
`;
}

export const fastApiDockerfile = `FROM python:3.12-slim AS builder
WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir --prefix=/install .

FROM python:3.12-slim AS runner
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY --from=builder /install /usr/local
COPY app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
`;

export function springBootDockerfile(hasWrapper: boolean): string {
  const builder = hasWrapper
    ? `FROM eclipse-temurin:21-jdk AS builder
WORKDIR /app
COPY mvnw ./
COPY .mvn ./.mvn
COPY pom.xml ./
RUN ./mvnw dependency:go-offline
COPY src ./src
RUN ./mvnw package -DskipTests`
    : `FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml ./
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn package -DskipTests`;
  return `${builder}

FROM eclipse-temurin:21-jre AS runner
RUN apt-get update && apt-get install -y --no-install-recommends curl \\
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/*.jar /app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app.jar"]
`;
}

export async function replaceOrCreate(
  files: GeneratedFileWriter,
  path: string,
  content: string,
): Promise<void> {
  if (await files.exists(path)) {
    await files.replaceProviderFile(path, content);
  } else {
    await files.create(path, content);
  }
}

export function backendDockerfile(
  backendId: BackendId,
  typeScript: boolean,
  hasMavenWrapper: boolean,
): string {
  if (backendId === "express") return expressDockerfile(typeScript);
  if (backendId === "fastapi") return fastApiDockerfile;
  return springBootDockerfile(hasMavenWrapper);
}
