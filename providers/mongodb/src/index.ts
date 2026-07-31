import type { StackForgeProvider } from "@stackforge/core";
import { writeText } from "@stackforge/core";

const provider: StackForgeProvider = {
  metadata: {
    id: "mongodb",
    name: "MongoDB",
    category: "database",
    description: "Document database",
    version: "8",
    tags: ["nosql", "document"],
    runtime: {
      localUrl: "mongodb://localhost:27017/app",
      notes: ["Connection value is written to .env.example."],
    },
  },
  compatibility: { projectTypes: ["full-stack", "backend-only"] },
  generator: { async generate(context) {
    await writeText(context.rootDirectory, ".env.example", "MONGODB_URI=mongodb://localhost:27017/app\nJWT_SECRET=\n");
    if (context.selection.docker) await writeText(context.rootDirectory, "docker-compose.yml", 'services:\n  mongodb:\n    image: mongo:8\n    ports:\n      - "27017:27017"\n    volumes:\n      - mongo_data:/data/db\nvolumes:\n  mongo_data:\n');
  } },
};
export default provider;
export { provider };
