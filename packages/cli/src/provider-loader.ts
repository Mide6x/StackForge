// SPDX-License-Identifier: MPL-2.0
import {
  loadIntegrationModule,
  loadProvider,
  type StackForgeIntegration,
  type StackForgeProvider,
} from "@stackforge/core";

const providerPackages = [
  "@stackforge/provider-nextjs",
  "@stackforge/provider-react",
  "@stackforge/provider-vue",
  "@stackforge/provider-express",
  "@stackforge/provider-fastapi",
  "@stackforge/provider-springboot",
  "@stackforge/provider-postgres",
  "@stackforge/provider-mongodb",
  "@stackforge/provider-supabase",
] as const;

export async function loadProviders(): Promise<StackForgeProvider[]> {
  return Promise.all(providerPackages.map(loadProvider));
}

const integrationPackages = [
  "@stackforge/integrations-built-in",
] as const;

export async function loadIntegrations(): Promise<StackForgeIntegration[]> {
  return (await Promise.all(integrationPackages.map(loadIntegrationModule))).flat();
}
