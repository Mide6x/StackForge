# StackForge

[![GitHub stars](https://img.shields.io/github/stars/Mide6x/StackForge?style=for-the-badge)](https://github.com/Mide6x/StackForge/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/Mide6x/StackForge?style=for-the-badge)](https://github.com/Mide6x/StackForge/network/members)
[![GitHub issues](https://img.shields.io/github/issues/Mide6x/StackForge?style=for-the-badge)](https://github.com/Mide6x/StackForge/issues)
[![License](https://img.shields.io/github/license/Mide6x/StackForge?style=for-the-badge)](https://github.com/Mide6x/StackForge/blob/main/LICENSE)

StackForge is an extensible TypeScript CLI for scaffolding modern full-stack apps with a provider-driven architecture.

`npm create stackforge`

`npx create-stackforge`

## Why StackForge

- Generate full-stack, frontend-only, or backend-only projects from one CLI.
- Keep framework logic inside provider packages instead of hardcoding it in the CLI.
- Start from official generators when they exist, then layer on StackForge conventions.
- Stay ready for future commands like `stackforge add prisma`, `stackforge doctor`, and `stackforge upgrade`.

## MVP Support

Frontend:

- Next.js
- React with Vite
- Vue with Vite

Backend:

- Express
- FastAPI
- Spring Boot

Databases:

- PostgreSQL
- MongoDB
- Supabase

## Example Flow

```text
What would you like to create?
  Full Stack
  Frontend Only
  Backend Only

Choose frontend -> Next.js
Choose backend -> FastAPI
Choose database -> PostgreSQL
Docker support -> Yes
Project name -> my-app
```

## Monorepo Layout

```text
packages/
  cli/
  core/
providers/
  nextjs/
  react/
  vue/
  express/
  fastapi/
  springboot/
  postgres/
  mongodb/
  supabase/
```

## Development

```bash
npm install
npm run build
npm run dev -- my-app
```

## Architecture

- `packages/core` contains contracts, the provider registry, dynamic loading, and the generation engine.
- `packages/cli` contains the interactive Clack-based wizard.
- `providers/*` contains isolated framework and database providers.

This separation keeps StackForge modular, strongly typed, and easy to extend without rewriting the CLI.

## Roadmap

- `stackforge add redis`
- `stackforge add rabbitmq`
- `stackforge add swagger`
- `stackforge add prisma`
- `stackforge doctor`
- `stackforge upgrade`

## Status

StackForge is currently in MVP development.

## License

MIT
