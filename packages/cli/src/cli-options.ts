// SPDX-License-Identifier: MPL-2.0
export interface ParsedCliArguments {
  destination?: string;
  help: boolean;
  version: boolean;
  yes: boolean;
  projectType?: "full-stack" | "frontend-only" | "backend-only";
  frontend?: string;
  frontendLanguage?: "typescript" | "javascript" | "python" | "java";
  backend?: string;
  backendLanguage?: "typescript" | "javascript" | "python" | "java";
  database?: string;
  docker?: boolean;
}

export function parseCliArguments(args: readonly string[]): ParsedCliArguments {
  let destination: string | undefined;
  let help = false;
  let version = false;
  let yes = false;
  let projectType: ParsedCliArguments["projectType"];
  let frontend: string | undefined;
  let frontendLanguage: ParsedCliArguments["frontendLanguage"];
  let backend: string | undefined;
  let backendLanguage: ParsedCliArguments["backendLanguage"];
  let database: string | undefined;
  let docker: boolean | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }

    if (argument === "--version" || argument === "-v") {
      version = true;
      continue;
    }

    if (argument === "--yes" || argument === "-y") {
      yes = true;
      continue;
    }

    if (argument === "--docker") {
      docker = true;
      continue;
    }

    if (argument === "--no-docker") {
      docker = false;
      continue;
    }

    if (argument === "--project-type") {
      projectType = args[index + 1] as ParsedCliArguments["projectType"];
      index += 1;
      continue;
    }

    if (argument === "--frontend") {
      frontend = args[index + 1];
      index += 1;
      continue;
    }

    if (argument === "--frontend-language") {
      frontendLanguage = args[index + 1] as ParsedCliArguments["frontendLanguage"];
      index += 1;
      continue;
    }

    if (argument === "--backend") {
      backend = args[index + 1];
      index += 1;
      continue;
    }

    if (argument === "--backend-language") {
      backendLanguage = args[index + 1] as ParsedCliArguments["backendLanguage"];
      index += 1;
      continue;
    }

    if (argument === "--database") {
      database = args[index + 1];
      index += 1;
      continue;
    }

    if (!argument.startsWith("-") && destination === undefined) {
      destination = argument;
    }
  }

  return {
    destination,
    help,
    version,
    yes,
    projectType,
    frontend,
    frontendLanguage,
    backend,
    backendLanguage,
    database,
    docker,
  };
}

export function formatHelpText(): string {
  return [
    "StackForge",
    "",
    "Usage:",
    "  create-stackforge [project-directory]",
    "  stackforge [project-directory]",
    "",
    "Examples:",
    "  create-stackforge my-app",
    "  create-stackforge ./projects/my-app",
    "  create-stackforge .",
    "  create-stackforge smoke-backend --yes --project-type backend-only --backend springboot --database none --no-docker",
  ].join("\n");
}
