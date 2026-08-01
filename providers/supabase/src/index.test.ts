// SPDX-License-Identifier: MPL-2.0
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import provider from "./index.js";

test("Supabase provider creates config, migrations, and seed files", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackforge-supabase-provider-"));

  try {
    await provider.generator.generate({
      projectName: "supabase-app",
      rootDirectory: root,
      selection: {
        projectType: "backend-only",
        providerIds: ["supabase"],
        docker: false,
        testing: {},
      },
      answers: {},
      directories: {},
      log() {},
      async run() {
        throw new Error("run should not be called by the Supabase provider");
      },
    });

    await Promise.all([
      access(join(root, "supabase", "config.toml")),
      access(join(root, "supabase", "migrations")),
      access(join(root, "supabase", "seed.sql")),
      access(join(root, "supabase", "README.md")),
    ]);

    assert.ok(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
