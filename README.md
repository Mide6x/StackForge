# StackForge

[![GitHub stars](https://img.shields.io/github/stars/Mide6x/StackForge?style=for-the-badge)](https://github.com/Mide6x/StackForge/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/Mide6x/StackForge?style=for-the-badge)](https://github.com/Mide6x/StackForge/network/members)
[![GitHub issues](https://img.shields.io/github/issues/Mide6x/StackForge?style=for-the-badge)](https://github.com/Mide6x/StackForge/issues)
[![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-blue?style=for-the-badge)](https://github.com/Mide6x/StackForge/blob/main/LICENSE)

**StackForge** is an extensible TypeScript CLI for scaffolding modern frontend, backend, and full-stack applications through a provider-driven architecture.

Instead of maintaining one large generator filled with framework-specific conditionals, StackForge keeps each technology inside an isolated provider. The CLI discovers the available providers, collects the user's choices, validates compatibility, and asks the generation engine to compose the selected stack.

> StackForge is currently in active MVP development. All advertised frontend, backend, and database combinations now receive composable application and database wiring. Generated-build coverage, container-image validation, and npm publishing are still being expanded.

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
| PostgreSQL | Backend client or persistence configuration, `DATABASE_URL`, health integration, and optional Compose service |
| MongoDB | Backend client configuration, `MONGODB_URI`, health integration, and optional Compose service |
| Supabase | Backend client configuration, separated public/server credentials, health integration, and setup guidance |

Database dependencies and generated source are selected for Express, FastAPI, or Spring Boot. Supabase service-role credentials are restricted to backend and root environment templates and are never written to frontend output.

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

## Optional Generated Tests

StackForge never installs a test framework by default. During creation, it asks about tests only for the applications you selected: frontend-only projects receive frontend questions, backend-only projects receive backend questions, and full-stack projects receive separate frontend, backend, and optional full-stack end-to-end questions.

```text
◇ Add frontend tests?
│ Yes
│
◇ Select frontend test coverage
│ ◼ Vitest + React Testing Library
│ ◻ Playwright
│
◇ Add backend tests?
│ Yes
│
◇ Select backend test coverage
│ ◼ Vitest + Supertest
│
◇ Add full-stack end-to-end tests?
│ No
```

The wizard records selected option IDs only. Providers and integrations generate the dependencies, scripts, configuration, example tests, and runtime instructions after the selected stack has been connected.

| Provider | Unit/component | API integration | Browser E2E |
| --- | --- | --- | --- |
| Next.js | Vitest + React Testing Library | — | Playwright |
| React with Vite | Vitest + React Testing Library | — | Playwright |
| Vue with Vite | Vitest + Vue Test Utils | — | Playwright |
| Express | Vitest | Supertest | — |
| FastAPI | pytest | HTTPX/TestClient | — |
| Spring Boot | JUnit 5 | MockMvc, optional Testcontainers | — |

Testcontainers is database integration testing, not browser end-to-end testing. It appears only when PostgreSQL or MongoDB is selected. The Next.js + Express + PostgreSQL stack also offers an opt-in full-stack Playwright health-flow test. Start PostgreSQL, Express, and Next.js first, then run its generated command. Browser suites require `npx playwright install` before their first run.

Generated commands are shown only for selected suites. Typical Node commands are:

```bash
npm test
npm run test:watch
npm run test:e2e
```

FastAPI uses `uv run pytest`; Spring Boot uses `mvn test` until a Maven wrapper is generated.

## Project Destination Behaviour

StackForge supports both named project directories and generation inside the current directory.

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

StackForge treats destination input as security-sensitive. The local CLI accepts
project paths relative to the directory where the command is invoked and
canonicalizes the approved root before generation begins. It does not follow a
symlinked destination path out of that invocation directory.

### Use the current directory

The local CLI supports:

```bash
npm run dev -- .
```

The published CLI is intended to support:

```bash
npm create stackforge .
```

When `.` is used, StackForge will generate directly inside the current directory and derive the project name from the directory name.

Destination handling will protect existing files. StackForge will not silently overwrite a non-empty project directory.

Absolute destinations and parent-directory escapes such as `../outside` are
rejected by the CLI. Generated files, environment outputs, Compose files, and
integration-created files are constrained to the approved project root.

### Existing-directory limitation

When generating a frontend-only or backend-only application directly into an existing directory, StackForge only proceeds if the destination is empty or contains harmless ignored files such as `.DS_Store`. It does not attempt to merge generated framework files with an existing project. This is intentional because tools such as `create-next-app` and `create-vite` are designed to create new applications, not safely merge into existing ones.

If the selected folder already contains project files, StackForge reports:

```text
StackForge cannot generate this application in the selected folder because it
already contains project files.

Choose an empty folder, create a new project directory, or run StackForge from
another location.
```

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
├── compose.yaml          # when Docker is selected
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

## Completion Summary

A successful generation finishes with provider-specific locations, commands, URLs, dependency state, health checks, database setup, environment files, and accurate Docker instructions.

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

The exact instructions adapt to the selected providers. Integration modules contribute summary details instead of requiring the CLI to hardcode framework commands. Supabase summaries explicitly describe its remote setup, and Docker output does not claim to start a complete stack when an external service is still required.

## Integration and Validation Support

StackForge distinguishes four levels of support:

- **Scaffolded**: the official generator or provider template creates the application.
- **Connected**: the frontend has an API client and environment variable, the backend has restricted CORS, and the backend has database configuration and a database-aware health endpoint.
- **Build validated**: an automated generated-project smoke test has built or syntax-checked the output.
- **Docker validated**: the generated Compose model has passed `docker compose config`. This does not mean every image has been built or started.

### Frontend and backend connectors

Every frontend/backend pairing is implemented through reusable connector factories:

| Frontend | Express | FastAPI | Spring Boot |
| --- | --- | --- | --- |
| Next.js | Connected | Connected | Connected |
| React with Vite | Connected | Connected | Connected |
| Vue with Vite | Connected | Connected | Connected |

Each connector supplies the correct frontend API variable, a small API client, a health request, the expected local ports, and backend CORS restricted to the frontend development origin.

### Backend and database connectors

| Backend | PostgreSQL | MongoDB | Supabase |
| --- | --- | --- | --- |
| Express | Connected | Connected | Connected |
| FastAPI | Connected | Connected | Connected |
| Spring Boot | Connected | Connected | Connected, experimental REST-client model |

These two connector layers compose into all 27 advertised full-stack combinations without one package per three-provider permutation.

### Generated-project validation matrix

| Generated path | Current validation |
| --- | --- |
| Next.js TypeScript frontend-only | Build validated |
| Next.js JavaScript frontend-only | Build validated |
| React TypeScript frontend-only | Build validated |
| Vue TypeScript frontend-only | Build validated |
| Express TypeScript backend-only | Build validated |
| Express JavaScript backend-only | Syntax validated |
| FastAPI backend-only | Python compile validated |
| Spring Boot backend-only | Test exists; not run locally without Maven and Java 21 |
| Next.js TS + Express TS + PostgreSQL | Build validated |
| Next.js JS + Express JS + PostgreSQL | Build validated |
| React + FastAPI + MongoDB | Frontend build and backend compile validated |
| Vue + Spring Boot + PostgreSQL | Test exists; not run locally without Maven and Java 21 |
| Next.js + FastAPI + Supabase | Frontend build and backend compile validated |

All 27 combinations are covered by fast integration tests that verify generated source, dependencies, environment contributions, summary data, and connector applicability. The table above separately identifies combinations exercised through real generated-project commands.

For local PostgreSQL and MongoDB stacks, Compose includes frontend, backend, and database services. Supabase remains an external service, so its Compose result is intentionally not reported as starting the complete stack.

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
│   ├── built-in/
│   └── nextjs-express-postgres/ # legacy compatibility fixture
├── tests/
│   ├── generated/
│   └── docker/
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
- Environment, Compose, dependency, documentation, and result accumulators
- A phase-ordered integration runner
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

### `integrations/*`

Integration recipes enrich compatible providers without forcing providers to know each other's internals. Built-in integrations are composed from:

```text
frontend/backend connector
        +
backend/database connector
        +
backend source finalizer
        +
infrastructure contributor
```

The generation lifecycle is phase ordered:

```text
validate selection
scaffold providers
connect applications
connect database
contribute infrastructure
finalize integration source
apply and install contributed dependencies
write merged environment, documentation, and Compose files
validate output
build GenerationResult
```

Shared files are produced through accumulators. Environment keys, Compose services, and dependency versions are deduplicated, while incompatible duplicate contributions fail with an ownership-aware conflict error. Integrations write through a controlled generated-file API so they cannot silently replace unrelated user files.

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

Run the opt-in generated-project suite, which downloads framework dependencies and executes generated build or syntax commands:

```bash
STACKFORGE_RUN_GENERATED_TESTS=1 npm run test:generated
STACKFORGE_RUN_GENERATED_SMOKE=1 npm run test:generated
```

The non-required `generated-project-tests` CI job runs both tiers with Java 21,
Maven, and `uv` available. Browser-dependent Playwright execution remains in its
separate slower tier.

Run Compose validation:

```bash
npm run test:docker
```

The Docker suite skips clearly if the Docker CLI is unavailable. Compose configuration validation does not require starting containers.

Destination-safety validation lives in the normal test suites. The core and CLI
tests cover:

- destination canonicalization inside the invocation directory
- rejection of traversal and absolute destination input
- rejection of unsafe frontend/backend directory configuration
- rejection of writes through symlinked project paths
- root-constrained managed deletion helpers
- generated-file escape prevention

CodeQL should only be added as a required merge check after a clean remote
analysis has completed for the hardened destination-path branch or a merge
candidate derived from it.

## Root Scripts

| Script | Purpose |
| --- | --- |
| `npm run build` | Build the core, CLI, and provider workspaces that expose build scripts |
| `npm run dev -- <path>` | Run the local StackForge CLI and generate a project |
| `npm run create -- <path>` | Alias for running the local creation CLI |
| `npm test` | Run core, CLI, built-in integration, and legacy compatibility tests |
| `npm run test:unit` | Run core and CLI tests |
| `npm run test:integration` | Run integration package tests |
| `npm run test:generated` | Run generated-project tests; builds use `STACKFORGE_RUN_GENERATED_SMOKE=1`, generated test suites use `STACKFORGE_RUN_GENERATED_TESTS=1` |
| `npm run test:generated:e2e` | Run the opt-in generated full-stack browser-suite setup tier |
| `npm run test:docker` | Validate generated Compose configuration when Docker is available |
| `npm run test:all` | Build and run the default test tiers |

## Current MVP Limitations

StackForge is under active development. Current limitations include:

- Generated-project builds are sampled across provider families rather than running all 27 expensive combinations in the default test job
- Docker Compose configuration is validated, but container-image builds and full container startup are not part of the default suite
- Supabase is remote infrastructure and is therefore not started by generated Compose output
- Spring Boot + Supabase uses an explicit REST-client approach rather than claiming a special Spring persistence layer
- Spring generated builds require Java 21 and Maven in the test environment
- FastAPI dependency installation requires `uv`; when it is unavailable, the summary reports the manual setup instead of claiming installation succeeded
- Browser test execution requires Playwright browser binaries and remains outside the default fast test run
- Full-stack Playwright tests require separately started frontend, backend, and database services
- Execution of provider-specific prompt definitions
- Dynamic third-party provider discovery
- Transactional cleanup after a failed generation
- npm publishing for `create-stackforge`

These are implementation priorities, not hidden limitations. Contributions and focused pull requests are welcome.

## Development Priorities

### 1. Broaden generated-build validation

Promote more of the 27 integrated combinations from fast source-shape tests to real generated-project builds.

### 2. Container validation

Add slower opt-in jobs for `docker compose build` and representative service startup without slowing down the default unit suite.

### 3. Provider polish

Move Spring Boot scaffolding to a richer Initializr-compatible workflow, strengthen Python environment bootstrapping, and add provider-specific configuration prompts.

### 4. Reliability and publishing

Add:

- CI build matrices
- Failure cleanup
- npm publishing and provenance

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

StackForge accepts outside contributions through pull requests. Start with the
development checks below:

```bash
git clone https://github.com/Mide6x/StackForge.git
cd StackForge
npm install
npm run build
npm test
```

The `main` branch is protected. Pull requests must pass CI, resolve review
conversations, and receive the required review before an official merge by
`@Mide6x`.

Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the development workflow,
testing expectations, contribution licence terms, and pull-request guidance.

## Repository Workflow

```text
main
  stable and release-ready
  protected from direct pushes, force pushes, and deletion

feature branches and forks
  focused implementation work
  pull requests targeting main

pull requests
  build and test checks
  CODEOWNER review
  resolved conversations
  squash merge by Mide6x
```

Public contributors do not need write access to the official repository.
Fork-based pull requests are the normal contribution path.

## Security and Generated Secrets

StackForge should only generate placeholder environment values.

Never commit real credentials, API keys, service-role keys, database passwords, or JWT secrets. Generated projects should copy `.env.example` to `.env` and keep `.env` ignored by Git.

Report exploitable vulnerabilities privately as described in
[`SECURITY.md`](./SECURITY.md). Do not include secrets or personal data in
issues, pull requests, or logs.

## Status

StackForge is currently in **MVP development**.

The provider architecture, phase-ordered generation engine, shared contribution accumulators, Clack wizard, nine application connectors, nine database connectors, and all 27 composable full-stack combinations are implemented. The current focus is broadening real generated-build and container validation before describing every combination as production-ready.

## License

StackForge is licensed under the Mozilla Public License 2.0. See
[`LICENSE`](./LICENSE) for the complete terms.

In brief, MPL 2.0 permits use, study, modification, and distribution.
Distributed modifications to MPL-covered files must remain available under MPL
2.0, and copyright and licence notices must be preserved. Separate files may be
licensed differently where MPL 2.0 permits. This summary is not legal advice.

Copyright © 2026 Olumide Adewole. See [`NOTICE`](./NOTICE).

## Branding

“StackForge” and the StackForge logo are trademarks of Olumide Adewole. The
source-code licence does not grant permission to present unofficial forks or
modified distributions as official StackForge releases. Reasonable, truthful
references and clearly named forks are permitted.

See [`TRADEMARKS.md`](./TRADEMARKS.md) for the complete branding policy.
