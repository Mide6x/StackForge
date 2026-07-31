// SPDX-License-Identifier: MPL-2.0
import type { SupportedLanguage } from "@stackforge/core";

export type FrontendId = "nextjs" | "react" | "vue";
export type BackendId = "express" | "fastapi" | "springboot";
export type DatabaseId = "postgres" | "mongodb" | "supabase";

export interface FrontendDefinition {
  id: FrontendId;
  name: string;
  port: number;
  apiEnvironmentVariable: "NEXT_PUBLIC_API_URL" | "VITE_API_URL";
  apiDirectory: "src/lib" | "src/services";
}

export interface BackendDefinition {
  id: BackendId;
  name: string;
  port: number;
}

export interface DatabaseDefinition {
  id: DatabaseId;
  name: string;
}

export const frontends: Record<FrontendId, FrontendDefinition> = {
  nextjs: {
    id: "nextjs",
    name: "Next.js",
    port: 3000,
    apiEnvironmentVariable: "NEXT_PUBLIC_API_URL",
    apiDirectory: "src/lib",
  },
  react: {
    id: "react",
    name: "React",
    port: 5173,
    apiEnvironmentVariable: "VITE_API_URL",
    apiDirectory: "src/lib",
  },
  vue: {
    id: "vue",
    name: "Vue",
    port: 5173,
    apiEnvironmentVariable: "VITE_API_URL",
    apiDirectory: "src/services",
  },
};

export const backends: Record<BackendId, BackendDefinition> = {
  express: { id: "express", name: "Express", port: 3001 },
  fastapi: { id: "fastapi", name: "FastAPI", port: 8000 },
  springboot: { id: "springboot", name: "Spring Boot", port: 8080 },
};

export const databases: Record<DatabaseId, DatabaseDefinition> = {
  postgres: { id: "postgres", name: "PostgreSQL" },
  mongodb: { id: "mongodb", name: "MongoDB" },
  supabase: { id: "supabase", name: "Supabase" },
};

export const frontendIds = Object.keys(frontends) as FrontendId[];
export const backendIds = Object.keys(backends) as BackendId[];
export const databaseIds = Object.keys(databases) as DatabaseId[];

export function selectedId<T extends string>(
  providerIds: string[],
  candidates: readonly T[],
): T | undefined {
  return candidates.find((candidate) => providerIds.includes(candidate));
}

export function isJavaScript(language: SupportedLanguage | undefined): boolean {
  return language === "javascript";
}

export function frontendDirectoryName(directories: { frontend?: string }): string {
  return directories.frontend ?? "frontend";
}

export function backendDirectoryName(directories: { backend?: string }): string {
  return directories.backend ?? "backend";
}
