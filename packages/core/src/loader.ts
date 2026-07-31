// SPDX-License-Identifier: MPL-2.0
import type { StackForgeIntegration, StackForgeProvider } from "./contracts.js";

export async function loadProvider(moduleName: string): Promise<StackForgeProvider> {
  const loaded = await import(moduleName);
  const provider = loaded.default as StackForgeProvider | undefined;
  if (!provider?.metadata || !provider.generator) {
    throw new Error(`Module "${moduleName}" does not export a StackForge provider as its default export.`);
  }
  return provider;
}

export async function loadIntegration(moduleName: string): Promise<StackForgeIntegration> {
  const loaded = await import(moduleName);
  const integration = loaded.default as StackForgeIntegration | undefined;
  if (
    !integration?.metadata
    || (typeof integration.integrate !== "function" && typeof integration.apply !== "function")
  ) {
    throw new Error(`Module "${moduleName}" does not export a StackForge integration as its default export.`);
  }
  return integration;
}

export async function loadIntegrationModule(moduleName: string): Promise<StackForgeIntegration[]> {
  const loaded = await import(moduleName);
  const exported = (loaded.integrations ?? loaded.default) as
    | StackForgeIntegration
    | StackForgeIntegration[]
    | undefined;
  const integrations = Array.isArray(exported) ? exported : exported ? [exported] : [];
  if (
    integrations.length === 0
    || integrations.some((integration) =>
      !integration?.metadata
      || (typeof integration.integrate !== "function" && typeof integration.apply !== "function"))
  ) {
    throw new Error(`Module "${moduleName}" does not export StackForge integrations.`);
  }
  return integrations;
}
