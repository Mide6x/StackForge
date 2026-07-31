import { cancel, confirm, isCancel, select, text } from "@clack/prompts";
import type {
  ProjectType,
  ProviderCategory,
  ProviderSelection,
  StackForgeProvider,
  SupportedLanguage,
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

  const targetInput = initialName
    ? initialName
    : await askForDestination();
  const destination = resolveDestination(invocationDirectory, targetInput);
  await assertDestinationWritable(destination.rootDirectory);
  await confirmDestinationSafety(destination.rootDirectory);

  return {
    projectName: destination.projectName,
    rootDirectory: destination.rootDirectory,
    selection: { projectType, providerIds, frontendLanguage, backendLanguage, docker },
  };
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
