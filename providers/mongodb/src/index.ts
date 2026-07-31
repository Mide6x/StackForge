// SPDX-License-Identifier: MPL-2.0
import type { StackForgeProvider } from "@stackforge/core";
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
      notes: ["Connection settings and local Compose services are contributed by integrations."],
    },
  },
  compatibility: { projectTypes: ["full-stack", "backend-only"] },
  generator: { async generate() {} },
};
export default provider;
export { provider };
