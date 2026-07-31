// SPDX-License-Identifier: MPL-2.0
import type { StackForgeProvider } from "@stackforge/core";
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
      notes: ["Connection settings and local Compose services are contributed by integrations."],
    },
  },
  compatibility: { projectTypes: ["full-stack", "backend-only"] },
  generator: { async generate() {} },
};
export default provider;
export { provider };
