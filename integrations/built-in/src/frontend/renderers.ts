// SPDX-License-Identifier: MPL-2.0
import type { FrontendDefinition } from "../catalog.js";

export interface FrontendRenderedFiles {
  apiPath: string;
  apiSource: string;
  pagePath: string;
  pageSource: string;
}

function healthType(typeScript: boolean): string {
  return typeScript ? ": Promise<{ status: string; database: string }>" : "";
}

function apiSource(
  frontend: FrontendDefinition,
  backendUrl: string,
  typeScript: boolean,
): string {
  const environmentAccess = frontend.id === "nextjs"
    ? `process.env.${frontend.apiEnvironmentVariable}`
    : `import.meta.env.${frontend.apiEnvironmentVariable}`;

  return `const apiUrl =
  ${environmentAccess} ?? "${backendUrl}";

export async function getApiHealth()${healthType(typeScript)} {
  const response = await fetch(\`\${apiUrl}/health\`);
  if (!response.ok) {
    throw new Error(\`API health check failed with status \${response.status}\`);
  }
  return response.json();
}
`;
}

function nextPage(typeScript: boolean): string {
  const stateType = typeScript ? '<{ status: string; database: string } | null>' : "";
  return `"use client";

import { useEffect, useState } from "react";
import { getApiHealth } from "../lib/api";

export default function Home() {
  const [health, setHealth] = useState${stateType}(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getApiHealth().then(setHealth).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to reach the API");
    });
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "80px auto", padding: 24, fontFamily: "sans-serif" }}>
      <p>StackForge full stack</p>
      <h1>{health ? "Your full stack is connected." : "Checking your stack…"}</h1>
      {health && <p>API: {health.status} · Database: {health.database}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
`;
}

function reactPage(typeScript: boolean): string {
  const stateType = typeScript ? '<{ status: string; database: string } | null>' : "";
  return `import { useEffect, useState } from "react";
import { getApiHealth } from "./lib/api";

export default function App() {
  const [health, setHealth] = useState${stateType}(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getApiHealth().then(setHealth).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to reach the API");
    });
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "80px auto", padding: 24, fontFamily: "sans-serif" }}>
      <p>StackForge full stack</p>
      <h1>{health ? "Your full stack is connected." : "Checking your stack…"}</h1>
      {health && <p>API: {health.status} · Database: {health.database}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
`;
}

function vuePage(typeScript: boolean): string {
  return `<script setup${typeScript ? ' lang="ts"' : ""}>
import { onMounted, ref } from "vue";
import { getApiHealth } from "./services/api";

const health = ref${typeScript ? '<{ status: string; database: string } | null>' : ""}(null);
const error = ref("");

onMounted(async () => {
  try {
    health.value = await getApiHealth();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "Unable to reach the API";
  }
});
</script>

<template>
  <main class="stackforge">
    <p>StackForge full stack</p>
    <h1>{{ health ? "Your full stack is connected." : "Checking your stack…" }}</h1>
    <p v-if="health">API: {{ health.status }} · Database: {{ health.database }}</p>
    <p v-if="error" class="error">{{ error }}</p>
  </main>
</template>

<style scoped>
.stackforge { max-width: 720px; margin: 80px auto; padding: 24px; font-family: sans-serif; }
.error { color: crimson; }
</style>
`;
}

export function renderFrontendFiles(
  frontend: FrontendDefinition,
  backendUrl: string,
  typeScript: boolean,
): FrontendRenderedFiles {
  const apiExtension = typeScript ? "ts" : "js";
  if (frontend.id === "nextjs") {
    return {
      apiPath: `${frontend.apiDirectory}/api.${apiExtension}`,
      apiSource: apiSource(frontend, backendUrl, typeScript),
      pagePath: `src/app/page.${typeScript ? "tsx" : "js"}`,
      pageSource: nextPage(typeScript),
    };
  }
  if (frontend.id === "react") {
    return {
      apiPath: `${frontend.apiDirectory}/api.${apiExtension}`,
      apiSource: apiSource(frontend, backendUrl, typeScript),
      pagePath: `src/App.${typeScript ? "tsx" : "jsx"}`,
      pageSource: reactPage(typeScript),
    };
  }
  return {
    apiPath: `${frontend.apiDirectory}/api.${apiExtension}`,
    apiSource: apiSource(frontend, backendUrl, typeScript),
    pagePath: "src/App.vue",
    pageSource: vuePage(typeScript),
  };
}
