// SPDX-License-Identifier: MPL-2.0
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  ".github/CODEOWNERS",
  ".github/dependabot.yml",
  ".github/workflows/ci.yml",
  ".github/pull_request_template.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  "CONTRIBUTING.md",
  "LICENSE",
  "NOTICE",
  "README.md",
  "SECURITY.md",
  "TRADEMARKS.md",
];

const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(file)) failures.push(`Missing required governance file: ${file}`);
}

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const manifests = trackedFiles.filter(
  (file) =>
    file === "package.json" ||
    /^(packages|providers|integrations)\/[^/]+\/package\.json$/.test(file),
);

for (const manifest of manifests) {
  const parsed = JSON.parse(readFileSync(manifest, "utf8"));
  if (parsed.license !== "MPL-2.0") {
    failures.push(`${manifest} must declare "license": "MPL-2.0".`);
  }
}

const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8"));
for (const manifest of manifests) {
  const workspace = manifest === "package.json" ? "" : manifest.replace(/\/package\.json$/, "");
  if (lockfile.packages?.[workspace]?.license !== "MPL-2.0") {
    failures.push(`package-lock.json entry "${workspace}" must declare MPL-2.0.`);
  }
}

const sourceFiles = trackedFiles.filter(
  (file) =>
    /^(packages|providers|integrations|scripts|tests)\//.test(file) &&
    /\.(?:[cm]?[jt]sx?)$/.test(file),
);

for (const file of sourceFiles) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const expectedLine = lines[0]?.startsWith("#!") ? 1 : 0;
  if (lines[expectedLine] !== "// SPDX-License-Identifier: MPL-2.0") {
    failures.push(`${file} is missing its MPL-2.0 SPDX header.`);
  }
}

for (const file of trackedFiles.filter((entry) => /^\.github\/.*\.ya?ml$/.test(entry))) {
  if (!readFileSync(file, "utf8").startsWith("# SPDX-License-Identifier: MPL-2.0\n")) {
    failures.push(`${file} is missing its MPL-2.0 SPDX header.`);
  }
}

const cliEntry = readFileSync("packages/cli/src/index.ts", "utf8");
if (!cliEntry.startsWith("#!/usr/bin/env node\n// SPDX-License-Identifier: MPL-2.0\n")) {
  failures.push("The CLI entrypoint must keep its shebang first and SPDX header second.");
}

const licenseHash = createHash("sha256").update(readFileSync("LICENSE")).digest("hex");
const officialMplHash = "3f3d9e0024b1921b067d6f7f88deb4a60cbe7a78e76c64e3f1d7fc3b779b9d04";
if (licenseHash !== officialMplHash) {
  failures.push("LICENSE must exactly match Mozilla's official MPL 2.0 plain text.");
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Governance validation passed for ${manifests.length} package manifests and ${sourceFiles.length} source files.`,
  );
}
