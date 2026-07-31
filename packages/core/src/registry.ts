// SPDX-License-Identifier: MPL-2.0
import type { ProviderCategory, ProviderRegistry, StackForgeProvider } from "./contracts.js";

export class InMemoryProviderRegistry implements ProviderRegistry {
  private readonly providers = new Map<string, StackForgeProvider>();

  register(provider: StackForgeProvider): void {
    const { id } = provider.metadata;
    if (this.providers.has(id)) {
      throw new Error(`A provider with id "${id}" is already registered.`);
    }
    this.providers.set(id, provider);
  }

  get(providerId: string): StackForgeProvider | undefined {
    return this.providers.get(providerId);
  }

  list(category?: ProviderCategory): StackForgeProvider[] {
    return [...this.providers.values()].filter(
      (provider) => !category || provider.metadata.category === category,
    );
  }

  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }
}
