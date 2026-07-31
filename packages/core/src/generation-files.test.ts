import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DefaultGeneratedFileWriter } from "./generation-files.js";

test("integrations can create files and intentionally replace provider files", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackforge-files-"));
  const providerPath = join(root, "frontend/page.tsx");
  try {
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(join(root, "frontend"), { recursive: true }));
    await writeFile(providerPath, "provider\n", "utf8");
    const writer = new DefaultGeneratedFileWriter(root, new Set([providerPath]));
    await writer.scoped("connector").replaceProviderFile("frontend/page.tsx", "connected\n");
    await writer.scoped("connector").create("frontend/lib/api.ts", "export {};\n");

    assert.equal(await readFile(providerPath, "utf8"), "connected\n");
    assert.equal(await readFile(join(root, "frontend/lib/api.ts"), "utf8"), "export {};\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generated-file ownership prevents unsafe overwrites and traversal", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackforge-files-conflict-"));
  const providerPath = join(root, "page.tsx");
  try {
    await writeFile(providerPath, "provider\n", "utf8");
    const writer = new DefaultGeneratedFileWriter(root, new Set([providerPath]));
    await writer.scoped("first").replaceProviderFile("page.tsx", "first\n");
    await assert.rejects(
      writer.scoped("second").replaceProviderFile("page.tsx", "second\n"),
      /both attempted to replace/,
    );
    await assert.rejects(
      writer.scoped("second").create("../outside.txt", "unsafe"),
      /escapes the project root/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
