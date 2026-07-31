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
    await writeText(context.rootDirectory, "supabase/README.md", "# Supabase\n\nCreate a Supabase project, then add its public URL and anonymous key to `.env`. Never commit real credentials.\n");
  } },
};
export default provider;
export { provider };
