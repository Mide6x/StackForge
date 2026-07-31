export type ProviderCategory =
  | "frontend"
  | "backend"
  | "database"
  | "integration";

export type SupportedLanguage = "typescript" | "javascript" | "python" | "java";

export type ProjectType = "full-stack" | "frontend-only" | "backend-only";

export interface ProviderMetadata {
  id: string;
  name: string;
  category: ProviderCategory;
  description: string;
  version?: string;
  supportedLanguages?: SupportedLanguage[];
  tags?: string[];
}

export interface ProviderSelection {
  projectType: ProjectType;
  providerIds: string[];
  frontendLanguage?: SupportedLanguage;
  backendLanguage?: SupportedLanguage;
  docker: boolean;
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
}

export interface ProviderRegistry {
  register(provider: StackForgeProvider): void;
  get(providerId: string): StackForgeProvider | undefined;
  list(category?: ProviderCategory): StackForgeProvider[];
  has(providerId: string): boolean;
}

export interface GenerationEngine {
  generate(context: GenerationContext): Promise<void>;
}
