# StackForge

[![GitHub stars](https://img.shields.io/github/stars/Mide6x/StackForge?style=for-the-badge)](https://github.com/Mide6x/StackForge/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/Mide6x/StackForge?style=for-the-badge)](https://github.com/Mide6x/StackForge/network/members)
[![GitHub issues](https://img.shields.io/github/issues/Mide6x/StackForge?style=for-the-badge)](https://github.com/Mide6x/StackForge/issues)
[![License](https://img.shields.io/github/license/Mide6x/StackForge?style=for-the-badge)](https://github.com/Mide6x/StackForge/blob/main/LICENSE)

**StackForge** is an extensible TypeScript CLI for scaffolding modern frontend, backend, and full-stack applications through a provider-driven architecture.

Instead of maintaining one large generator filled with framework-specific conditionals, StackForge keeps each technology inside an isolated provider. The CLI discovers the available providers, collects the user's choices, validates compatibility, and asks the generation engine to compose the selected stack.

> StackForge is currently in active MVP development. The architecture and built-in providers are available, but some cross-stack integrations and publishing workflows are still being completed.

## Vision

The long-term goal is a single command that lets a developer choose the technologies they want and receive a connected, runnable project with sensible defaults:

```bash
npm create stackforge my-app
```

or:

```bash
npx create-stackforge my-app
```

During local development, the current command is:

```bash
npm run dev -- my-app
```

StackForge is designed to support:

- Full-stack applications
- Frontend-only applications
- Backend-only applications
- Framework-specific configuration prompts
- Database and service integrations
- Optional Docker support
- Third-party providers and integrations
- Future commands such as `stackforge add`, `stackforge doctor`, and `stackforge upgrade`

## Why StackForge?

Starting a modern application often means repeating the same setup work:

- Running multiple framework generators
- Creating frontend and backend directories
- Configuring environment variables
- Adding Dockerfiles and Compose services
- Connecting the frontend to the API
- Connecting the backend to a database
- Choosing compatible packages and development commands
- Writing setup documentation for the generated project

StackForge aims to turn that work into one guided CLI flow while keeping the implementation modular.

## Current Built-in Providers

### Frontend

| Provider | Languages | Generator |
| --- | --- | --- |
| Next.js | TypeScript, JavaScript | `create-next-app` |
| React with Vite | TypeScript, JavaScript | `create-vite` |
| Vue with Vite | TypeScript, JavaScript | `create-vite` |

### Backend

| Provider | Language | Default development URL |
| --- | --- | --- |
| Express | TypeScript or JavaScript | `http://localhost:3001` |
| FastAPI | Python | `http://localhost:8000` |
| Spring Boot | Java | `http://localhost:8080` |

Each backend scaffold includes a basic health endpoint at `/health`.

### Database

| Provider | Current generated configuration |
| --- | --- |
| PostgreSQL | `DATABASE_URL` example and optional Docker Compose service |
| MongoDB | `MONGODB_URI` example and optional Docker Compose service |
| Supabase | Environment variable placeholders and setup guidance |

Database-to-backend ORM, driver, and client integrations are part of the active MVP roadmap.

## Example Interactive Flow

```text
┌  StackForge
│
◇  What would you like to create?
│  Full Stack
│
◇  Choose frontend
│  Next.js
│
◇  Choose frontend language
│  TypeScript
│
◇  Choose backend
│  Express
│
◇  Choose backend language
│  TypeScript
│
◇  Choose database
│  PostgreSQL
│
◇  Would you like Docker support?
│  Yes
│
◇  Project name
│  my-app
│
└  StackForge created my-app
```

The interactive interface is built with [Clack](https://github.com/bombshell-dev/clack) to provide accessible prompts, cancellation handling, spinners, and structured terminal output.

## Project Destination Behaviour

StackForge is being designed to support both named project directories and generation inside the current directory.

### Create a new project directory

```bash
npm run dev -- my-app
```

Expected structure:

```text
my-app/
├── frontend/
├── backend/
├── .editorconfig
├── .env.example
├── .gitignore
└── README.md
```

A nested relative path may also be supplied:

```bash
npm run dev -- ./projects/my-app
```

### Use the current directory

The intended published CLI behaviour will also support:

```bash
npm create stackforge .
```

When `.` is used, StackForge will generate directly inside the current directory and derive the project name from the directory name.

Destination handling will protect existing files. StackForge will not silently overwrite a non-empty project directory.

## Generated Layouts

### Full-stack project

```text
my-app/
├── frontend/
│   ├── package.json
│   ├── src/
│   └── Dockerfile        # when Docker is selected
├── backend/
│   ├── src/ or app/
│   ├── package.json, pyproject.toml, or pom.xml
│   └── Dockerfile        # when Docker is selected
├── docker-compose.yml    # when supplied by a selected provider
├── .editorconfig
├── .env.example
├── .gitignore
└── README.md
```

### Frontend-only project

For a frontend-only selection, the chosen frontend is generated directly into the project root.

```text
my-frontend/
├── src/
├── package.json
├── Dockerfile            # optional
├── .editorconfig
├── .gitignore
└── README.md
```

### Backend-only project

For a backend-only selection, the chosen backend is generated directly into the project root.

```text
my-api/
├── src/ or app/
├── package.json, pyproject.toml, or pom.xml
├── Dockerfile            # optional
├── .env.example
├── .editorconfig
├── .gitignore
└── README.md
```

## Intended Completion Summary

A successful generator should not leave the developer guessing what to do next. StackForge is being developed to finish with provider-specific locations, commands, URLs, and environment setup instructions.

Example:

```text
◇ Project created successfully

Project root
  ./my-app

Frontend
  Created at: ./my-app/frontend

  cd my-app/frontend
  npm run dev

  http://localhost:3000

Backend
  Created at: ./my-app/backend

  cd my-app/backend
  npm run dev

  API:    http://localhost:3001
  Health: http://localhost:3001/health

Database
  PostgreSQL configuration added to .env.example

Docker
  cd my-app
  docker compose up --build

└ StackForge is ready. Start building.
```

The exact instructions will adapt to the selected providers. For example, a FastAPI project will show its Python command, while a Spring Boot project will show its Maven command.

## Architecture

StackForge is an npm-workspaces monorepo.

```text
stackforge/
├── packages/
│   ├── cli/
│   └── core/
├── providers/
│   ├── nextjs/
│   ├── react/
│   ├── vue/
│   ├── express/
│   ├── fastapi/
│   ├── springboot/
│   ├── postgres/
│   ├── mongodb/
│   └── supabase/
├── integrations/
├── package.json
└── tsconfig.base.json
```

### `packages/core`

The core package contains the framework-agnostic contracts and orchestration logic:

- Provider types and metadata
- Provider compatibility rules
- Provider-specific prompt contracts
- The in-memory provider registry
- Dynamic provider loading
- Shared filesystem helpers
- The default generation engine
- Command execution utilities

The core package does not need to understand Next.js, Express, PostgreSQL, or any other specific technology.

### `packages/cli`

The CLI package is responsible for the terminal experience:

- Loading built-in providers
- Asking project and provider questions
- Handling cancellation
- Resolving the project destination
- Starting the generation engine
- Displaying progress and completion output

Framework generation logic should not be placed directly in the CLI.

### `providers/*`

Each provider owns the knowledge required to scaffold one technology, including:

- Provider metadata
- Supported project types and languages
- Compatibility rules
- Provider-specific prompts
- File or official-generator execution
- Dependency declarations
- Optional post-install hooks
- Runtime instructions

A simplified provider looks like this:

```ts
import type { StackForgeProvider } from "@stackforge/core";

const provider: StackForgeProvider = {
  metadata: {
    id: "example",
    name: "Example Framework",
    category: "frontend",
    description: "Example StackForge provider",
    supportedLanguages: ["typescript"],
  },

  compatibility: {
    projectTypes: ["full-stack", "frontend-only"],
  },

  generator: {
    async generate(context) {
      // Create files or run an official framework generator.
    },
  },
};

export default provider;
```

## Provider-driven Design

The CLI works with the common `StackForgeProvider` contract rather than checking concrete provider classes.

This allows it to treat providers uniformly:

```ts
for (const provider of selectedProviders) {
  await provider.generator.generate(context);
}
```

This design provides:

- Separation of concerns
- Strong TypeScript contracts
- Easier provider testing
- Compatibility validation before generation
- A path toward third-party plugins
- Less framework-specific branching inside the CLI

The current built-in provider package list is still registered by the CLI. Fully external provider discovery is planned for a later release.

## Local Development

### Requirements

- Node.js 20 or later
- npm with workspace support
- Additional runtimes for the providers you test:
  - Python 3.11 or later for FastAPI
  - Java 21 and Maven for Spring Boot
  - Docker for Docker-enabled generation

### Install dependencies

```bash
npm install
```

### Build all workspaces

```bash
npm run build
```

### Run the CLI locally

```bash
npm run dev -- my-app
```

This creates `my-app` relative to the current working directory.

### Run workspace tests

```bash
npm test
```

Tests are expected to grow into a generation matrix that verifies provider scaffolds, compatibility rules, destination handling, Docker output, and generated application builds.

## Root Scripts

| Script | Purpose |
| --- | --- |
| `npm run build` | Build the core, CLI, and provider workspaces that expose build scripts |
| `npm run dev -- <path>` | Run the local StackForge CLI and generate a project |
| `npm run create -- <path>` | Alias for running the local creation CLI |
| `npm test` | Run tests exposed by workspace packages |

## Current MVP Limitations

StackForge is under active development. The following areas are not yet complete across every provider combination:

- Frontend-to-backend API wiring
- Backend CORS configuration
- Database drivers, ORMs, and generated connection code
- Unified Docker Compose generation for the complete selected stack
- Central dependency installation and deduplication
- Execution of provider-specific prompt definitions
- Dynamic third-party provider discovery
- Transactional cleanup after a failed generation
- A complete provider-combination test matrix
- npm publishing for `create-stackforge`

These are implementation priorities, not hidden limitations. Contributions and focused pull requests are welcome.

## Development Priorities

### 1. Golden full-stack path

Create one fully connected and tested reference stack:

```text
Next.js + Express + PostgreSQL + Docker
```

The generated project should:

- Install successfully
- Build successfully
- Connect the frontend to the backend
- Connect the backend to PostgreSQL
- Provide environment templates
- Run with local commands
- Run through one Docker Compose command
- Print accurate completion instructions

### 2. Provider completion

Make each advertised frontend, backend, and database selection independently runnable and documented.

### 3. Shared generation contributions

Introduce shared models for:

- Environment variables
- Dependencies
- Docker Compose services
- Runtime instructions
- Generated component summaries

This will allow providers to collaborate instead of overwriting shared files.

### 4. Reliability

Add:

- Unit tests
- Generated-project smoke tests
- CI build matrices
- Destination conflict checks
- Failure cleanup
- Reproducible framework version handling

## Roadmap

Planned commands and integrations include:

```bash
stackforge add prisma
stackforge add redis
stackforge add rabbitmq
stackforge add swagger
stackforge doctor
stackforge upgrade
```

Other roadmap items:

- Package-manager selection
- Authentication recipes
- API documentation setup
- Linting and formatting presets
- Testing framework selection
- Monorepo task runners
- External provider installation
- Stack presets for common combinations
- Non-interactive and CI-friendly generation

## Contributing

StackForge is intended to be open and extensible.

A contribution may include:

- A new provider
- A provider integration recipe
- Improvements to the CLI experience
- Compatibility rules
- Generation tests
- Documentation
- Bug fixes

Recommended workflow:

```bash
git clone https://github.com/Mide6x/StackForge.git
cd StackForge
npm install
npm run build
npm test
```

Then create a focused branch and pull request describing:

- What changed
- Why the change is needed
- Which provider combinations were tested
- Any generated output or commands used for validation

## Security and Generated Secrets

StackForge should only generate placeholder environment values.

Never commit real credentials, API keys, service-role keys, database passwords, or JWT secrets. Generated projects should copy `.env.example` to `.env` and keep `.env` ignored by Git.

## Status

StackForge is currently in **MVP development**.

The provider architecture, core generation engine, registry, dynamic module loader, Clack wizard, and initial built-in providers are implemented. The current focus is making provider combinations collaborate as one connected application and improving the generation completion experience.

## License

This repository is currently distributed under the license included in [`LICENSE`](./LICENSE).
