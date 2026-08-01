// SPDX-License-Identifier: MPL-2.0
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const releaseChannel = process.argv[2];

if (releaseChannel !== "next" && releaseChannel !== "latest") {
  console.error('Usage: node scripts/release-package.mjs <next|latest>');
  process.exit(1);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
    ...options,
  }).trim();
}

function runInherited(command, args, options = {}) {
  execFileSync(command, args, {
    stdio: "inherit",
    ...options,
  });
}

function assertCleanGitTree() {
  const trackedChanges = run("git", ["status", "--porcelain"]);
  if (trackedChanges.length > 0) {
    console.error("Refusing to publish from a dirty git working tree.");
    console.error("Commit or stash your changes first.");
    process.exit(1);
  }
}

function updateRootCliDependency(nextVersion) {
  const manifestPath = "package.json";
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.dependencies?.["@mide6x/create-stackforge"]) {
    manifest.dependencies["@mide6x/create-stackforge"] = `^${nextVersion}`;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }
}

function currentCliVersion() {
  const manifest = JSON.parse(readFileSync("packages/cli/package.json", "utf8"));
  return manifest.version;
}

function nextVersionArgs(channel) {
  if (channel === "next") {
    return ["version", "prerelease", "--preid", "alpha", "--workspace=@mide6x/create-stackforge", "--no-git-tag-version"];
  }

  return ["version", "patch", "--workspace=@mide6x/create-stackforge", "--no-git-tag-version"];
}

assertCleanGitTree();

const previousVersion = currentCliVersion();
runInherited("npm", nextVersionArgs(releaseChannel));
const bumpedVersion = currentCliVersion();

if (previousVersion === bumpedVersion) {
  console.error(`Version did not change. Current version is still ${bumpedVersion}.`);
  process.exit(1);
}

updateRootCliDependency(bumpedVersion);
runInherited("npm", ["install", "--package-lock-only"]);

const tag = releaseChannel === "next" ? "next" : "latest";
runInherited("npm", ["publish", "--workspace=@mide6x/create-stackforge", "--tag", tag, "--access", "public"]);
