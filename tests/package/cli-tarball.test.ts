// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const cliWorkspaceName = "@mide6x/create-stackforge";

async function runNpm(args: readonly string[], cwd: string, cacheDirectory: string) {
  return execFileAsync("npm", ["--cache", cacheDirectory, ...args], {
    cwd,
    env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" },
  });
}

test("packed CLI installs offline and runs without unpublished internal registry dependencies", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "stackforge-package-"));
  const packDirectory = join(tempRoot, "pack");
  const installDirectory = join(tempRoot, "install");
  const cacheDirectory = join(tempRoot, "npm-cache");
  const generatedProjectName = "smoke-backend";
  await Promise.all([
    mkdir(packDirectory, { recursive: true }),
    mkdir(installDirectory, { recursive: true }),
    mkdir(cacheDirectory, { recursive: true }),
  ]);

  await runNpm(
    ["run", "build", "--workspace", cliWorkspaceName],
    repositoryRoot,
    cacheDirectory,
  );

  const { stdout: packOutput } = await runNpm(
    ["pack", "--json", "--workspace", cliWorkspaceName, "--pack-destination", packDirectory],
    repositoryRoot,
    cacheDirectory,
  );
  const [{ filename: tarballName, files }] = JSON.parse(packOutput) as Array<{
    filename: string;
    files: Array<{ path: string }>;
  }>;
  const tarballPath = join(packDirectory, tarballName);
  const tarballEntries = files.map((file) => file.path).sort();

  assert.ok(tarballEntries.includes("dist/index.js"));
  assert.ok(tarballEntries.includes("README.md"));
  assert.ok(tarballEntries.includes("LICENSE"));
  assert.ok(tarballEntries.includes("NOTICE"));
  assert.ok(tarballEntries.includes("TRADEMARKS.md"));

  await runNpm(["install", "--offline", tarballPath], installDirectory, cacheDirectory);

  const installedManifestPath = join(installDirectory, "node_modules", "@mide6x", "create-stackforge", "package.json");
  const manifest = JSON.parse(await readFile(installedManifestPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assert.equal(Object.keys(manifest.dependencies ?? {}).filter((dependency) => dependency.startsWith("@stackforge/")).length, 0);
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
  assert.ok((manifest.devDependencies?.["@stackforge/core"] ?? "").length > 0);

  const executablePath = join(installDirectory, "node_modules", ".bin", "create-stackforge");
  const { stdout } = await execFileAsync(
    executablePath,
    ["--help"],
    { cwd: installDirectory },
  );

  assert.match(stdout, /Usage:/);
  assert.match(stdout, /create-stackforge \[project-directory\]/);

  const generation = await execFileAsync(
    executablePath,
    [
      generatedProjectName,
      "--yes",
      "--project-type", "backend-only",
      "--backend", "springboot",
      "--database", "none",
      "--no-docker",
    ],
    { cwd: installDirectory },
  );

  assert.match(generation.stdout, /Project created successfully|Backend project created successfully/);

  const generatedPom = await readFile(
    join(installDirectory, generatedProjectName, "pom.xml"),
    "utf8",
  );
  assert.match(generatedPom, /spring-boot-starter-web/);

  const generatedHealthSource = await readFile(
    join(installDirectory, generatedProjectName, "src/main/java/com/stackforge/backend/Application.java"),
    "utf8",
  );
  assert.match(generatedHealthSource, /@GetMapping\("\/health"\)/);

  const installedNodeModules = await readFile(
    join(installDirectory, "node_modules", "@mide6x", "create-stackforge", "dist", "index.js"),
    "utf8",
  );
  assert.doesNotMatch(installedNodeModules, /@stackforge\/provider-nextjs/);

  const { stdout: versionOutput } = await execFileAsync(
    join(installDirectory, "node_modules", ".bin", "create-stackforge"),
    ["--version"],
    { cwd: installDirectory },
  );
  assert.equal(versionOutput.trim(), "0.1.0-alpha.1");
});
