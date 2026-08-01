// SPDX-License-Identifier: MPL-2.0
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { StackForgeProvider } from "@stackforge/core";
import { writeText } from "@stackforge/core";

const provider: StackForgeProvider = {
  metadata: {
    id: "supabase",
    name: "Supabase",
    category: "database",
    description: "Hosted Postgres, authentication, and storage platform",
    version: "latest",
    tags: ["postgres", "backend-as-a-service"],
    runtime: {
      notes: [
        "Create or select a Supabase project.",
        "Copy the project URL and keys.",
        "Add them to .env.",
      ],
    },
  },
  compatibility: { projectTypes: ["full-stack", "backend-only"] },
  generator: { async generate(context) {
    await mkdir(join(context.rootDirectory, "supabase", "migrations"), { recursive: true });
    await Promise.all([
      writeText(context.rootDirectory, "supabase/config.toml", [
        "# Local Supabase configuration scaffolded by StackForge",
        "",
        "[project]",
        'name = "stackforge-app"',
        "",
        "[api]",
        "enabled = true",
      ].join("\n")),
      writeText(context.rootDirectory, "supabase/seed.sql", [
        "-- Seed data for local Supabase development",
        "-- Add INSERT statements here when your schema is ready.",
        "",
      ].join("\n")),
      writeText(context.rootDirectory, "supabase/README.md", "# Supabase\n\nCreate a Supabase project, then add its public URL and anonymous key to `.env`. Never commit real credentials.\n"),
    ]);
  } },
};
export default provider;
export { provider };
