import type {
  DatabaseResultDetails,
  DependencyInstallationOutcome,
  DockerGenerationResult,
  GenerationResult,
  GenerationResultBuilder,
  IntegrationConnectionResult,
} from "../contracts.js";

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class DefaultGenerationResultBuilder implements GenerationResultBuilder {
  private readonly warnings = new Set<string>();
  private readonly manualSteps = new Map<string, string>();
  private readonly environmentFiles = new Set<string>();
  private readonly dependencyInstallations: DependencyInstallationOutcome[] = [];
  private readonly appliedIntegrations = new Set<string>();
  private connection?: IntegrationConnectionResult;
  private database?: DatabaseResultDetails;
  private docker?: DockerGenerationResult;

  constructor(private readonly initial: GenerationResult) {}

  addWarning(message: string): void {
    this.warnings.add(message);
  }

  addManualStep(id: string, message: string): void {
    const existing = this.manualSteps.get(id);
    if (existing && existing !== message) {
      throw new Error(`Manual-step conflict for "${id}".`);
    }
    this.manualSteps.set(id, message);
  }

  setConnection(details: IntegrationConnectionResult): void {
    if (this.connection && !same(this.connection, details)) {
      throw new Error("Multiple integrations contributed incompatible application connections.");
    }
    this.connection = structuredClone(details);
  }

  setDatabase(details: DatabaseResultDetails): void {
    if (this.database && !same(this.database, details)) {
      throw new Error("Multiple integrations contributed incompatible database details.");
    }
    this.database = structuredClone(details);
  }

  setDocker(details: DockerGenerationResult): void {
    if (this.docker && !same(this.docker, details)) {
      throw new Error("Multiple integrations contributed incompatible Docker results.");
    }
    this.docker = structuredClone(details);
  }

  addEnvironmentFile(path: string): void {
    this.environmentFiles.add(path);
  }

  addDependencyOutcome(outcome: DependencyInstallationOutcome): void {
    this.dependencyInstallations.push(structuredClone(outcome));
  }

  addAppliedIntegration(id: string): void {
    this.appliedIntegrations.add(id);
  }

  build(completedSteps: string[]): GenerationResult {
    const outcomes = this.dependencyInstallations;
    const outcomeInstalled = outcomes.every((outcome) =>
      outcome.status === "succeeded" || outcome.status === "not-required");
    const components = this.initial.components.map((component) => {
      const outcome = outcomes.find((item) => item.directory === component.directory);
      if (!outcome || !component.runtime) return structuredClone(component);
      return {
        ...structuredClone(component),
        runtime: {
          ...structuredClone(component.runtime),
          dependenciesInstalled:
            outcome.status === "succeeded" || outcome.status === "not-required",
        },
      };
    });
    const unresolvedComponents = components.filter((component) =>
      component.category !== "database"
      && component.runtime?.dependenciesInstalled === false
      && !outcomes.some((outcome) => outcome.directory === component.directory));
    const dependenciesInstalled = unresolvedComponents.length === 0
      && outcomeInstalled
      && (
        outcomes.length > 0
        || this.initial.components
          .filter((component) => component.category !== "database")
          .every((component) => component.runtime?.dependenciesInstalled !== false)
      );

    return {
      ...this.initial,
      components,
      completedSteps: [...completedSteps],
      warnings: [...new Set([...this.initial.warnings, ...this.warnings])].sort(),
      environmentFiles: [...this.environmentFiles].sort(),
      docker: this.docker,
      dependenciesInstalled,
      dependencyInstallations: outcomes.length > 0 ? outcomes : undefined,
      database: this.database,
      connection: this.connection,
      manualSteps: this.manualSteps.size > 0
        ? [...this.manualSteps.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([, value]) => value)
        : undefined,
      appliedIntegrations: [...this.appliedIntegrations].sort(),
    };
  }
}
