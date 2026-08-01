// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ProviderHookContext, ProviderRuntimeInstructions } from "@stackforge/core";
import {
  fastApiReadme,
  fastApiRuntimeInstructions,
  installFastApiDependencies,
} from "./index.js";
import { fastApiPytestCommands } from "./testing.js";

function createContext(
  rootDirectory: string,
  run: ProviderHookContext["run"],
  setProviderRuntime: (providerId: string, runtime: ProviderRuntimeInstructions) => void,
): ProviderHookContext {
  return {
    projectName: "backend",
    rootDirectory,
    selection: {
      projectType: "backend-only",
      providerIds: ["fastapi"],
      backendLanguage: "python",
      docker: false,
    },
    answers: {},
    directories: {},
    log() {},
    run,
    setProviderRuntime,
  };
}

test("uv runtime instructions use uv commands", () => {
  const runtime = fastApiRuntimeInstructions(true);
  assert.deepEqual(runtime.installCommand, ["uv sync"]);
  assert.deepEqual(runtime.developmentCommand, ["uv run fastapi dev app/main.py"]);
});

test("venv runtime instructions use activation and uvicorn", () => {
  const runtime = fastApiRuntimeInstructions(false);
  assert.deepEqual(runtime.installCommand, ["python3 -m venv .venv", ".venv/bin/python -m pip install -e ."]);
  assert.deepEqual(runtime.developmentCommand, [
    "source .venv/bin/activate",
    "python -m uvicorn app.main:app --reload",
  ]);
});

test("FastAPI README documents both workflows without requirements.txt", () => {
  const readme = fastApiReadme(false);
  assert.match(readme, /uv sync/);
  assert.match(readme, /python3 -m venv \.venv/);
  assert.match(readme, /\.venv\/bin\/python -m pip install -e \./);
  assert.doesNotMatch(readme, /requirements\.txt/);
});

test("FastAPI pytest commands use uv when available", () => {
  assert.deepEqual(fastApiPytestCommands(true), [
    { name: "Unit and API integration tests", command: ["uv", "run", "pytest"] },
  ]);
});

test("FastAPI pytest commands use venv when uv is unavailable", () => {
  assert.deepEqual(fastApiPytestCommands(false), [
    { name: "Activate virtual environment", command: ["source", ".venv/bin/activate"] },
    { name: "Unit and API integration tests", command: ["python", "-m", "pytest"] },
  ]);
});

test("installFastApiDependencies creates .venv and installs with pip when uv is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackforge-fastapi-venv-"));
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "pyproject.toml"), "[project]\nname = \"backend\"\nversion = \"0.1.0\"\n");
  const commands: Array<{ command: string; args: string[]; cwd: string }> = [];
  let runtime: ProviderRuntimeInstructions | undefined;
  const previousPath = process.env.PATH;
  process.env.PATH = "";

  try {
    await installFastApiDependencies(createContext(
      root,
      async (command, args, cwd) => {
        commands.push({ command, args, cwd });
        if (command === "python3" && args.join(" ") === "-m venv .venv") {
          await mkdir(join(cwd, ".venv", "bin"), { recursive: true });
          await writeFile(join(cwd, ".venv", "bin", "python"), "");
        }
      },
      (_providerId, value) => { runtime = value; },
    ), () => false);
  } finally {
    process.env.PATH = previousPath;
  }

  assert.deepEqual(commands, [
    { command: "python3", args: ["-m", "venv", ".venv"], cwd: root },
    { command: ".venv/bin/python", args: ["-m", "pip", "install", "-e", "."], cwd: root },
  ]);
  assert.equal(await readFile(join(root, ".venv", "bin", "python"), "utf8"), "");
  assert.deepEqual(runtime?.developmentCommand, [
    "source .venv/bin/activate",
    "python -m uvicorn app.main:app --reload",
  ]);
});

test("installFastApiDependencies uses uv when available", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackforge-fastapi-uv-"));
  await mkdir(root, { recursive: true });
  const commands: Array<{ command: string; args: string[]; cwd: string }> = [];
  let runtime: ProviderRuntimeInstructions | undefined;

  await installFastApiDependencies(createContext(
    root,
    async (command, args, cwd) => {
      commands.push({ command, args, cwd });
    },
    (_providerId, value) => { runtime = value; },
  ), () => true);

  assert.deepEqual(commands, [
    { command: "uv", args: ["sync"], cwd: root },
  ]);
  assert.deepEqual(runtime?.developmentCommand, ["uv run fastapi dev app/main.py"]);
});
