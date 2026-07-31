import { cancel, confirm, isCancel, multiselect, select, text } from "@clack/prompts";
import type {
  ProjectType,
  ProviderCategory,
  ProviderSelection,
  StackForgeProvider,
  StackForgeIntegration,
  SupportedLanguage,
  TestingSelection,
} from "@stackforge/core";
import {
  assertDestinationWritable,
  ensureDestinationApproved,
  inspectDestination,
  resolveDestination,
} from "./destination.js";

type Choice = {
  value: string;
  label: string;
  hint?: string;
};

function categoryChoices(providers: StackForgeProvider[], category: ProviderCategory): Choice[] {
  return providers
    .filter((provider) => provider.metadata.category === category)
    .map((provider) => ({
      value: provider.metadata.id,
      label: provider.metadata.name,
      hint: provider.metadata.description,
    }));
}

function languageLabel(language: SupportedLanguage): string {
  switch (language) {
    case "typescript":
      return "TypeScript";
    case "javascript":
      return "JavaScript";
    case "python":
      return "Python";
    case "java":
      return "Java";
  }
}

function ensurePromptValue<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Project creation cancelled.");
    process.exit(0);
  }

  return value;
}

async function chooseLanguage(provider: StackForgeProvider, title: string): Promise<SupportedLanguage> {
  const languages = provider.metadata.supportedLanguages ?? [];
  if (languages.length === 1) return languages[0]!;

  const selected = await select({
    message: title,
    options: languages.map((language) => ({
      value: language,
      label: languageLabel(language),
    })),
  });

  return ensurePromptValue(selected as SupportedLanguage | symbol);
}

export async function runWizard(
  providers: StackForgeProvider[],
  integrations: StackForgeIntegration[],
  initialName?: string,
): Promise<{ selection: ProviderSelection; rootDirectory: string; projectName: string }> {
  const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
  const projectType = ensurePromptValue(await select({
    message: "What would you like to create?",
    options: [
      { value: "full-stack", label: "Full Stack", hint: "Frontend and backend" },
      { value: "frontend-only", label: "Frontend Only", hint: "Client application only" },
      { value: "backend-only", label: "Backend Only", hint: "API or server only" },
    ],
  }) as ProjectType | symbol);

  const providerIds: string[] = [];
  let frontendLanguage: SupportedLanguage | undefined;
  let backendLanguage: SupportedLanguage | undefined;

  if (projectType !== "backend-only") {
    const frontendId = ensurePromptValue(await select({
      message: "Choose frontend",
      options: categoryChoices(providers, "frontend"),
    }) as string | symbol);

    providerIds.push(frontendId);
    frontendLanguage = await chooseLanguage(
      providers.find((item) => item.metadata.id === frontendId)!,
      "Choose frontend language",
    );
  }

  if (projectType !== "frontend-only") {
    const backendId = ensurePromptValue(await select({
      message: "Choose backend",
      options: categoryChoices(providers, "backend"),
    }) as string | symbol);

    providerIds.push(backendId);
    backendLanguage = await chooseLanguage(
      providers.find((item) => item.metadata.id === backendId)!,
      "Choose backend language",
    );

    const databaseId = ensurePromptValue(await select({
      message: "Choose database",
      options: [
        ...categoryChoices(providers, "database"),
        { value: "none", label: "None", hint: "Skip database setup" },
      ],
    }) as string | symbol);

    if (databaseId !== "none") providerIds.push(databaseId);
  }

  const docker = ensurePromptValue(await confirm({
    message: "Would you like Docker support?",
    initialValue: true,
  }) as boolean | symbol);

  const selectionForTesting: ProviderSelection = {
    projectType,
    providerIds,
    frontendLanguage,
    backendLanguage,
    docker,
    testing: {},
  };
  const testing = await askForTesting(providers, integrations, selectionForTesting);

  const targetInput = initialName
    ? initialName
    : await askForDestination();
  const destination = resolveDestination(invocationDirectory, targetInput);
  await assertDestinationWritable(destination.rootDirectory);
  await confirmDestinationSafety(destination.rootDirectory);

  return {
    projectName: destination.projectName,
    rootDirectory: destination.rootDirectory,
    selection: { projectType, providerIds, frontendLanguage, backendLanguage, docker, testing },
  };
}

export function availableTestOptions(
  provider: StackForgeProvider | undefined,
  selection: ProviderSelection,
) {
  return provider?.testing?.options.filter((option) => option.isAvailable?.(selection) !== false) ?? [];
}

export function availableFullStackTestOptions(
  integrations: StackForgeIntegration[],
  selection: ProviderSelection,
) {
  return integrations.flatMap((integration) =>
    (integration.testing?.options ?? [])
      .filter((option) => option.isAvailable?.(selection) !== false)
      .map((option) => ({ integration, option })));
}

export function testingPromptComponents(projectType: ProjectType): Array<"frontend" | "backend" | "full-stack"> {
  if (projectType === "frontend-only") return ["frontend"];
  if (projectType === "backend-only") return ["backend"];
  return ["frontend", "backend", "full-stack"];
}

async function askForTesting(
  providers: StackForgeProvider[],
  integrations: StackForgeIntegration[],
  selection: ProviderSelection,
): Promise<TestingSelection> {
  const frontend = providers.find((provider) =>
    provider.metadata.category === "frontend" && selection.providerIds.includes(provider.metadata.id));
  const backend = providers.find((provider) =>
    provider.metadata.category === "backend" && selection.providerIds.includes(provider.metadata.id));
  const testing: TestingSelection = {};

  if (testingPromptComponents(selection.projectType).includes("frontend")) {
    const values = await askProviderTests(
      frontend,
      selection,
      selection.projectType === "full-stack" ? "Add frontend tests?" : "Add tests?",
      "Select frontend test coverage",
    );
    if (values) testing.frontend = values;
  }
  if (testingPromptComponents(selection.projectType).includes("backend")) {
    const values = await askProviderTests(
      backend,
      selection,
      selection.projectType === "full-stack" ? "Add backend tests?" : "Add tests?",
      "Select backend test coverage",
    );
    if (values) testing.backend = values;
  }
  if (testingPromptComponents(selection.projectType).includes("full-stack")) {
    const options = availableFullStackTestOptions(integrations, selection);
    if (options.length > 0) {
      const addTests = ensurePromptValue(await confirm({
        message: "Add full-stack end-to-end tests?",
        initialValue: false,
      }) as boolean | symbol);
      if (addTests) {
        const values = ensurePromptValue(await multiselect({
          message: "Select full-stack end-to-end coverage",
          options: options.map(({ option }) => ({ value: option.id, label: option.name, hint: option.description })),
          required: false,
        }) as string[] | symbol);
        if (values.length > 0) testing.fullStack = values;
      }
    }
  }
  return testing;
}

async function askProviderTests(
  provider: StackForgeProvider | undefined,
  selection: ProviderSelection,
  confirmMessage: string,
  selectMessage: string,
): Promise<string[] | undefined> {
  const options = availableTestOptions(provider, selection);
  if (options.length === 0) return undefined;
  const addTests = ensurePromptValue(await confirm({ message: confirmMessage, initialValue: true }) as boolean | symbol);
  if (!addTests) return undefined;
  const selected = ensurePromptValue(await multiselect({
    message: selectMessage,
    options: options.map((option) => ({ value: option.id, label: option.name, hint: option.description })),
    initialValues: options.filter((option) => option.default).map((option) => option.id),
    required: false,
  }) as string[] | symbol);
  return selected;
}

async function confirmDestinationSafety(rootDirectory: string): Promise<void> {
  const inspection = await inspectDestination(rootDirectory);
  await ensureDestinationApproved(
    inspection,
    async () => ensurePromptValue(await select({
      message: "The destination folder is not empty.",
      options: [
        { value: "cancel", label: "Cancel" },
        { value: "continue", label: "Continue without overwriting existing files" },
      ],
    }) as "cancel" | "continue" | symbol),
    () => {
      cancel("Project creation cancelled.");
      process.exit(0);
    },
  );
}

async function askForDestination(): Promise<string> {
  const destinationMode = ensurePromptValue(await select({
    message: "Where should StackForge create the project?",
    options: [
      { value: "new-directory", label: "Create a new project folder" },
      { value: "current-directory", label: "Use the current folder" },
    ],
  }) as "new-directory" | "current-directory" | symbol);

  if (destinationMode === "current-directory") {
    return ".";
  }

  return ensurePromptValue(await text({
    message: "What is your project name?",
    placeholder: "my-app",
    validate(value) {
      const trimmed = (value ?? "").trim();

      if (!trimmed) return "Project name is required.";
      if (trimmed === "." || trimmed === "..") return "Please provide a valid project name.";
    },
  }) as string | symbol);
}
