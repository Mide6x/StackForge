// SPDX-License-Identifier: MPL-2.0
import type {
  GenerationContext,
  IntegrationContext,
  IntegrationPhase,
  ProviderSelection,
  StackForgeIntegration,
} from "./contracts.js";
import { DefaultComposeAccumulator } from "./accumulators/compose.js";
import { DefaultDependencyAccumulator } from "./accumulators/dependencies.js";
import { DefaultDocumentationAccumulator } from "./accumulators/documentation.js";
import { DefaultEnvironmentAccumulator } from "./accumulators/environment.js";
import { DefaultGenerationResultBuilder } from "./accumulators/result.js";
import { DefaultPackageScriptAccumulator } from "./accumulators/scripts.js";
import { DefaultGeneratedFileWriter } from "./generation-files.js";

export const integrationPhases: IntegrationPhase[] = [
  "connect-applications",
  "connect-database",
  "compose-infrastructure",
  "finalize",
];

const phaseOrder = new Map(integrationPhases.map((phase, index) => [phase, index]));

export function matchingIntegrations(
  integrations: StackForgeIntegration[],
  selection: ProviderSelection,
): StackForgeIntegration[] {
  const ids = new Set<string>();
  for (const integration of integrations) {
    if (ids.has(integration.metadata.id)) {
      throw new Error(`Duplicate integration id "${integration.metadata.id}".`);
    }
    ids.add(integration.metadata.id);
    const hasApply = typeof integration.apply === "function";
    const hasLegacy = typeof integration.integrate === "function";
    if (hasApply === hasLegacy) {
      throw new Error(
        `Integration "${integration.metadata.id}" must define exactly one of apply() or integrate().`,
      );
    }
    if (hasApply && !integration.phase) {
      throw new Error(`Integration "${integration.metadata.id}" must declare a phase.`);
    }
  }

  const selected = new Set(selection.providerIds);
  const applicable = integrations.filter((integration) =>
    integration.metadata.providerIds.every((id) => selected.has(id))
    && (integration.isApplicable?.(selection) ?? true));
  const hasLegacy = applicable.some((integration) => integration.integrate);
  const hasPhased = applicable.some((integration) => integration.apply);
  if (hasLegacy && hasPhased) {
    throw new Error(
      "Applicable legacy and phased integrations cannot be mixed safely in one generation.",
    );
  }

  return applicable.sort((left, right) => {
    const leftPhase = left.phase ? phaseOrder.get(left.phase) ?? Number.MAX_SAFE_INTEGER : 0;
    const rightPhase = right.phase ? phaseOrder.get(right.phase) ?? Number.MAX_SAFE_INTEGER : 0;
    return leftPhase - rightPhase
      || (left.priority ?? 0) - (right.priority ?? 0)
      || left.metadata.id.localeCompare(right.metadata.id);
  });
}

export interface IntegrationRuntime {
  environment: DefaultEnvironmentAccumulator;
  compose: DefaultComposeAccumulator;
  dependencies: DefaultDependencyAccumulator;
  documentation: DefaultDocumentationAccumulator;
  result: DefaultGenerationResultBuilder;
  files: DefaultGeneratedFileWriter;
  scripts: DefaultPackageScriptAccumulator;
  contextFor(integration: StackForgeIntegration): IntegrationContext;
}

export function createIntegrationRuntime(
  context: GenerationContext,
  result: DefaultGenerationResultBuilder,
  providerFiles: Set<string>,
): IntegrationRuntime {
  const environment = new DefaultEnvironmentAccumulator();
  const compose = new DefaultComposeAccumulator();
  const dependencies = new DefaultDependencyAccumulator();
  const documentation = new DefaultDocumentationAccumulator();
  const files = new DefaultGeneratedFileWriter(context.rootDirectory, providerFiles);
  const scripts = new DefaultPackageScriptAccumulator();

  return {
    environment,
    compose,
    dependencies,
    documentation,
    result,
    files,
    scripts,
    contextFor(integration) {
      const owner = integration.metadata.id;
      return {
        ...context,
        environment: environment.scoped(owner),
        compose: compose.scoped(owner),
        dependencies: dependencies.scoped(owner),
        documentation: documentation.scoped(owner),
        result,
        files: files.scoped(owner),
        scripts: scripts.scoped(owner),
      };
    },
  };
}
