import type { StackForgeProvider } from "./contracts.js";

export async function loadProvider(moduleName: string): Promise<StackForgeProvider> {
  const loaded = await import(moduleName);
  const provider = loaded.default as StackForgeProvider | undefined;
  if (!provider?.metadata || !provider.generator) {
    throw new Error(`Module "${moduleName}" does not export a StackForge provider as its default export.`);
  }
  return provider;
}
