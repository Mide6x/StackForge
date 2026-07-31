// SPDX-License-Identifier: MPL-2.0
export type ProviderCategory =
  | "frontend"
  | "backend"
  | "database"
  | "integration";

export type SupportedLanguage = "typescript" | "javascript" | "python" | "java";

export type ProjectType = "full-stack" | "frontend-only" | "backend-only";

export type TestSuiteType = "unit" | "component" | "integration" | "e2e";

export type TestSuiteComponent = "frontend" | "backend" | "full-stack";

export interface TestingSelection {
  frontend?: string[];
  backend?: string[];
  fullStack?: string[];
}

export interface ProviderMetadata {
  id: string;
  name: string;
  category: ProviderCategory;
  description: string;
  version?: string;
  supportedLanguages?: SupportedLanguage[];
  tags?: string[];
  runtime?: ProviderRuntimeInstructions;
}

export interface ProviderSelection {
  projectType: ProjectType;
  providerIds: string[];
  frontendLanguage?: SupportedLanguage;
  backendLanguage?: SupportedLanguage;
  docker: boolean;
  /** Optional during the migration so existing API consumers remain compatible. */
  testing?: TestingSelection;
}

export interface CompatibilityRule {
  reason: string;
  isCompatible(selection: ProviderSelection): boolean;
}

export interface ProviderCompatibility {
  projectTypes?: ProjectType[];
  languages?: SupportedLanguage[];
  requires?: string[];
  conflictsWith?: string[];
  rules?: CompatibilityRule[];
}

export type PromptValue = string | boolean | string[];

export interface ProviderPrompt {
  name: string;
  message: string;
  type: "select" | "multiselect" | "text" | "confirm";
  choices?: Array<{ value: string; label: string }>;
  defaultValue?: PromptValue;
  required?: boolean;
}

export interface GenerationContext {
  projectName: string;
  rootDirectory: string;
  selection: ProviderSelection;
  answers: Record<string, PromptValue>;
  directories: {
    frontend?: string;
    backend?: string;
  };
  log(message: string): void;
  run(command: string, args: string[], cwd: string): Promise<void>;
}

export interface ProviderRuntimeInstructions {
  installCommand?: string[];
  developmentCommand?: string[];
  productionCommand?: string[];
  testCommands?: RuntimeTestCommand[];
  localUrl?: string;
  healthCheckUrl?: string;
  notes?: string[];
  dependenciesInstalled?: boolean;
}

export interface RuntimeTestCommand {
  name: string;
  command: readonly string[];
  requires?: readonly string[];
}

export interface ProviderTestOption {
  id: string;
  name: string;
  description: string;
  testTypes: readonly TestSuiteType[];
  commands: readonly RuntimeTestCommand[];
  default?: boolean;
  isAvailable?(selection: ProviderSelection): boolean;
}

export interface ProviderTestGenerator {
  optionId: string;
  generate(context: TestingGenerationContext): Promise<void>;
}

export interface ProviderTestingSupport {
  options: ProviderTestOption[];
  generators: ProviderTestGenerator[];
}

export interface DependencyDeclaration {
  name: string;
  version: string;
  type: "runtime" | "development" | "python" | "java";
}

export interface ProviderGenerator {
  generate(context: GenerationContext): Promise<void>;
}

export interface PostInstallHook {
  name: string;
  run(context: GenerationContext): Promise<void>;
}

export interface StackForgeProvider {
  metadata: ProviderMetadata;
  compatibility: ProviderCompatibility;
  getPrompts?(selection: ProviderSelection): ProviderPrompt[];
  generator: ProviderGenerator;
  getDependencies?(context: GenerationContext): DependencyDeclaration[];
  postInstallHooks?: PostInstallHook[];
  testing?: ProviderTestingSupport;
}

export interface ProviderRegistry {
  register(provider: StackForgeProvider): void;
  get(providerId: string): StackForgeProvider | undefined;
  list(category?: ProviderCategory): StackForgeProvider[];
  has(providerId: string): boolean;
}

export interface GenerationEngine {
  generate(context: GenerationContext): Promise<GenerationResult>;
}

export type IntegrationPhase =
  | "connect-applications"
  | "connect-database"
  | "compose-infrastructure"
  | "finalize";

export interface IntegrationMetadata {
  id: string;
  name: string;
  description: string;
  providerIds: string[];
}

export interface StackForgeIntegration {
  metadata: IntegrationMetadata;
  phase?: IntegrationPhase;
  priority?: number;
  isApplicable?(selection: ProviderSelection): boolean;
  apply?(context: IntegrationContext): Promise<void>;
  /** @deprecated Use apply() with an explicit phase. */
  integrate?(context: GenerationContext): Promise<void>;
  /** @deprecated Contribute through context.result. */
  augmentResult?(result: GenerationResult, context: GenerationContext): Promise<void> | void;
  testing?: ProviderTestingSupport;
}

export type EnvironmentTarget = "root" | "frontend" | "backend";

export interface EnvironmentVariableContribution {
  name: string;
  exampleValue: string;
  description?: string;
  section?: string;
  targets: EnvironmentTarget[];
  sensitive?: boolean;
}

export interface EnvironmentAccumulator {
  add(contribution: EnvironmentVariableContribution): void;
}

export type ComposeComponent = "frontend" | "backend" | "database";

export interface ComposeBuildContribution {
  context: string;
  dockerfile?: string;
  args?: Record<string, string>;
}

export interface ComposeServiceContribution {
  image?: string;
  build?: ComposeBuildContribution;
  command?: string[];
  environment?: Record<string, string>;
  ports?: string[];
  volumes?: string[];
  dependsOn?: Record<string, { condition?: "service_started" | "service_healthy" }>;
  healthcheck?: {
    test: string[];
    interval?: string;
    timeout?: string;
    retries?: number;
  };
  networks?: string[];
  component?: ComposeComponent;
}

export interface ComposeAccumulator {
  addService(name: string, service: ComposeServiceContribution): void;
  addVolume(name: string): void;
  addNetwork(name: string): void;
}

export type DependencyManager = "npm" | "python" | "maven";
export type DependencyTarget = "frontend" | "backend";

export type DependencyContribution =
  | {
    manager: "npm";
    target: DependencyTarget;
    name: string;
    version?: string;
    development?: boolean;
  }
  | {
    manager: "python";
    target: "backend";
    name: string;
    version?: string;
    group?: "main" | "development";
  }
  | {
    manager: "maven";
    target: "backend";
    groupId: string;
    artifactId: string;
    version?: string;
    scope?: string;
  };

export interface DependencyAccumulator {
  add(contribution: DependencyContribution): void;
}

export interface PackageScriptContribution {
  target: DependencyTarget;
  name: string;
  command: string;
}

export interface PackageScriptAccumulator {
  add(contribution: PackageScriptContribution): void;
}

export interface DependencyInstallationOutcome {
  manager: DependencyManager;
  directory: string;
  status: "succeeded" | "skipped" | "failed" | "not-required";
  command?: string[];
  reason?: string;
}

export interface DocumentationContribution {
  id: string;
  title: string;
  content: string;
  target?: "root" | "frontend" | "backend";
  order?: number;
}

export interface DocumentationAccumulator {
  add(contribution: DocumentationContribution): void;
}

export interface DatabaseResultDetails {
  providerId: string;
  name: string;
  setupSteps: string[];
  localServiceName?: string;
}

export interface IntegrationConnectionResult {
  frontendProviderId: string;
  backendProviderId: string;
  apiEnvironmentVariable: string;
  apiUrl: string;
  healthUrl: string;
}

export interface GenerationResultBuilder {
  addWarning(message: string): void;
  addManualStep(id: string, message: string): void;
  setConnection(details: IntegrationConnectionResult): void;
  setDatabase(details: DatabaseResultDetails): void;
  setDocker(details: DockerGenerationResult): void;
  addEnvironmentFile(path: string): void;
  addDependencyOutcome(outcome: DependencyInstallationOutcome): void;
  addTestSuite(suite: GeneratedTestSuite): void;
}

export interface GeneratedFileWriter {
  create(relativePath: string, content: string): Promise<void>;
  replaceProviderFile(relativePath: string, content: string): Promise<void>;
  exists(relativePath: string): Promise<boolean>;
}

export interface IntegrationContext extends GenerationContext {
  readonly environment: EnvironmentAccumulator;
  readonly compose: ComposeAccumulator;
  readonly dependencies: DependencyAccumulator;
  readonly documentation: DocumentationAccumulator;
  readonly result: GenerationResultBuilder;
  readonly files: GeneratedFileWriter;
}

export interface TestingGenerationContext extends IntegrationContext {
  readonly scripts: PackageScriptAccumulator;
}

export interface GeneratedComponent {
  providerId: string;
  name: string;
  category: ProviderCategory;
  directory: string;
  relativeDirectory: string;
  runtime?: ProviderRuntimeInstructions;
}

export interface DockerGenerationResult {
  enabled: boolean;
  composeFile?: string;
  startsFullStack: boolean;
  command?: string[];
}

export interface GeneratedTestSuite {
  providerId?: string;
  integrationId?: string;
  component: TestSuiteComponent;
  optionId: string;
  name: string;
  directory: string;
  commands: readonly RuntimeTestCommand[];
}

export interface GenerationResult {
  projectName: string;
  rootDirectory: string;
  components: GeneratedComponent[];
  dependenciesInstalled: boolean;
  docker?: DockerGenerationResult;
  environmentFiles: string[];
  warnings: string[];
  completedSteps: string[];
  dependencyInstallations?: DependencyInstallationOutcome[];
  database?: DatabaseResultDetails;
  connection?: IntegrationConnectionResult;
  manualSteps?: string[];
  appliedIntegrations?: string[];
  testSuites?: GeneratedTestSuite[];
}
