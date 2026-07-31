import type { StackForgeProvider } from "@stackforge/core";
import { writeText } from "@stackforge/core";

const provider: StackForgeProvider = {
  metadata: {
    id: "postgres",
    name: "PostgreSQL",
    category: "database",
    description: "Relational database",
    version: "16",
    tags: ["sql", "relational"],
    runtime: {
      localUrl: "postgresql://postgres:postgres@localhost:5432/app",
      notes: ["Connection value is written to .env.example."],
    },
  },
  compatibility: { projectTypes: ["full-stack", "backend-only"] },
  generator: { async generate(context) {
    await writeText(context.rootDirectory, ".env.example", "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app\nJWT_SECRET=\n");
    if (context.selection.docker) await writeText(context.rootDirectory, "docker-compose.yml", 'services:\n  postgres:\n    image: postgres:16-alpine\n    environment:\n      POSTGRES_DB: app\n      POSTGRES_USER: postgres\n      POSTGRES_PASSWORD: postgres\n    ports:\n      - "5432:5432"\n    volumes:\n      - postgres_data:/var/lib/postgresql/data\nvolumes:\n  postgres_data:\n');
  } },
};
export default provider;
export { provider };
