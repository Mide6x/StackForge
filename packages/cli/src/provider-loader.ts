// SPDX-License-Identifier: MPL-2.0
import type { StackForgeIntegration, StackForgeProvider } from "@stackforge/core";
import builtInIntegrations from "../../../integrations/built-in/src/index.js";
import expressProvider from "../../../providers/express/src/index.js";
import fastapiProvider from "../../../providers/fastapi/src/index.js";
import mongodbProvider from "../../../providers/mongodb/src/index.js";
import nextjsProvider from "../../../providers/nextjs/src/index.js";
import postgresProvider from "../../../providers/postgres/src/index.js";
import reactProvider from "../../../providers/react/src/index.js";
import springbootProvider from "../../../providers/springboot/src/index.js";
import supabaseProvider from "../../../providers/supabase/src/index.js";
import vueProvider from "../../../providers/vue/src/index.js";

const providers = [
  nextjsProvider,
  reactProvider,
  vueProvider,
  expressProvider,
  fastapiProvider,
  springbootProvider,
  postgresProvider,
  mongodbProvider,
  supabaseProvider,
] as const;

export async function loadProviders(): Promise<StackForgeProvider[]> {
  return [...providers];
}

export async function loadIntegrations(): Promise<StackForgeIntegration[]> {
  return [...builtInIntegrations];
}
