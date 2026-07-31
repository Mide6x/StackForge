import assert from "node:assert/strict";
import test from "node:test";
import type { StackForgeIntegration } from "./contracts.js";
import { matchingIntegrations } from "./integration-runner.js";

function integration(
  id: string,
  phase: NonNullable<StackForgeIntegration["phase"]>,
  priority = 0,
): StackForgeIntegration {
  return {
    metadata: { id, name: id, description: id, providerIds: ["frontend"] },
    phase,
    priority,
    async apply() {},
  };
}

test("integrations are ordered by phase, priority, and id", () => {
  const ordered = matchingIntegrations([
    integration("z-final", "finalize"),
    integration("b-connect", "connect-applications", 10),
    integration("a-connect", "connect-applications", 10),
    integration("database", "connect-database"),
  ], {
    projectType: "full-stack",
    providerIds: ["frontend"],
    docker: false,
  });
  assert.deepEqual(ordered.map((item) => item.metadata.id), [
    "a-connect",
    "b-connect",
    "database",
    "z-final",
  ]);
});

test("duplicate integration ids and mixed legacy/phased modes are rejected", () => {
  const phased = integration("duplicate", "finalize");
  assert.throws(
    () => matchingIntegrations([phased, phased], {
      projectType: "full-stack",
      providerIds: ["frontend"],
      docker: false,
    }),
    /Duplicate integration id/,
  );

  const legacy: StackForgeIntegration = {
    metadata: { id: "legacy", name: "legacy", description: "legacy", providerIds: ["frontend"] },
    async integrate() {},
  };
  assert.throws(
    () => matchingIntegrations([legacy, phased], {
      projectType: "full-stack",
      providerIds: ["frontend"],
      docker: false,
    }),
    /cannot be mixed/,
  );
});
