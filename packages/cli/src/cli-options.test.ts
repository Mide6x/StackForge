// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { formatHelpText, parseCliArguments } from "./cli-options.js";

test("parseCliArguments recognises help and version flags", () => {
  assert.deepEqual(parseCliArguments(["--help"]), {
    destination: undefined,
    help: true,
    version: false,
    yes: false,
    projectType: undefined,
    frontend: undefined,
    frontendLanguage: undefined,
    backend: undefined,
    backendLanguage: undefined,
    database: undefined,
    docker: undefined,
  });
  assert.deepEqual(parseCliArguments(["-v"]), {
    destination: undefined,
    help: false,
    version: true,
    yes: false,
    projectType: undefined,
    frontend: undefined,
    frontendLanguage: undefined,
    backend: undefined,
    backendLanguage: undefined,
    database: undefined,
    docker: undefined,
  });
});

test("parseCliArguments keeps the first positional destination", () => {
  assert.deepEqual(parseCliArguments(["./projects/my-app", "--help", "ignored"]), {
    destination: "./projects/my-app",
    help: true,
    version: false,
    yes: false,
    projectType: undefined,
    frontend: undefined,
    frontendLanguage: undefined,
    backend: undefined,
    backendLanguage: undefined,
    database: undefined,
    docker: undefined,
  });
});

test("parseCliArguments captures non-interactive generation overrides", () => {
  assert.deepEqual(parseCliArguments([
    "smoke-backend",
    "--yes",
    "--project-type", "backend-only",
    "--backend", "springboot",
    "--database", "none",
    "--no-docker",
  ]), {
    destination: "smoke-backend",
    help: false,
    version: false,
    yes: true,
    projectType: "backend-only",
    frontend: undefined,
    frontendLanguage: undefined,
    backend: "springboot",
    backendLanguage: undefined,
    database: "none",
    docker: false,
  });
});

test("formatHelpText documents supported invocation patterns", () => {
  const helpText = formatHelpText();
  assert.match(helpText, /create-stackforge \[project-directory\]/);
  assert.match(helpText, /create-stackforge \./);
});
