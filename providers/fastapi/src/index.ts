// SPDX-License-Identifier: MPL-2.0
import { spawnSync } from "node:child_process";
import type {
  ProviderHookContext,
  ProviderRuntimeInstructions,
  StackForgeProvider,
} from "@stackforge/core";
import { targetDirectory, writeText } from "@stackforge/core";
import { testing } from "./testing.js";

const uvRuntime: ProviderRuntimeInstructions = {
  developmentCommand: ["uv run fastapi dev app/main.py"],
  localUrl: "http://localhost:8000",
  healthCheckUrl: "http://localhost:8000/health",
  installCommand: ["uv sync"],
  dependenciesInstalled: false,
};

const venvRuntime: ProviderRuntimeInstructions = {
  developmentCommand: [
    "source .venv/bin/activate",
    "python -m uvicorn app.main:app --reload",
  ],
  localUrl: "http://localhost:8000",
  healthCheckUrl: "http://localhost:8000/health",
  installCommand: [
    "python3 -m venv .venv",
    ".venv/bin/python -m pip install -e .",
  ],
  dependenciesInstalled: false,
};

export function hasUvInstalled(): boolean {
  return spawnSync("uv", ["--version"], { stdio: "ignore" }).status === 0;
}

export function fastApiRuntimeInstructions(uvAvailable: boolean): ProviderRuntimeInstructions {
  return structuredClone(uvAvailable ? uvRuntime : venvRuntime);
}

export function fastApiReadme(uvAvailable: boolean): string {
  return [
    "# FastAPI backend",
    "",
    "## Preferred workflow with uv",
    "",
    "Install dependencies:",
    "",
    "```bash",
    "uv sync",
    "```",
    "",
    "Start development server:",
    "",
    "```bash",
    "uv run fastapi dev app/main.py",
    "```",
    "",
    "Run tests:",
    "",
    "```bash",
    "uv run pytest",
    "```",
    "",
    "## Standard Python workflow",
    "",
    "Create a virtual environment:",
    "",
    "```bash",
    "python3 -m venv .venv",
    "```",
    "",
    "Install the project:",
    "",
    "```bash",
    ".venv/bin/python -m pip install -e .",
    "```",
    "",
    "Start development server:",
    "",
    "```bash",
    "source .venv/bin/activate",
    "python -m uvicorn app.main:app --reload",
    "```",
    "",
    "Run tests:",
    "",
    "```bash",
    "source .venv/bin/activate",
    "python -m pytest",
    "```",
    "",
    uvAvailable
      ? "StackForge detected `uv` during generation and used it for dependency installation."
      : "StackForge did not detect `uv` during generation, so it created `.venv` and installed the project with `pip install -e .`.",
  ].join("\n");
}

export async function installFastApiDependencies(
  context: ProviderHookContext,
  commandAvailable: () => boolean = hasUvInstalled,
): Promise<void> {
  const target = targetDirectory(context, "backend");
  const uvAvailable = commandAvailable();
  context.setProviderRuntime("fastapi", fastApiRuntimeInstructions(uvAvailable));

  if (uvAvailable) {
    await context.run("uv", ["sync"], target);
    return;
  }

  await context.run("python3", ["-m", "venv", ".venv"], target);
  await context.run(".venv/bin/python", ["-m", "pip", "install", "-e", "."], target);
}

const provider: StackForgeProvider = {
  metadata: {
    id: "fastapi",
    name: "FastAPI",
    category: "backend",
    description: "Modern Python API framework",
    version: "latest",
    supportedLanguages: ["python"],
    tags: ["python", "api"],
    runtime: uvRuntime,
  },
  compatibility: { projectTypes: ["full-stack", "backend-only"] },
  generator: { async generate(context) {
    const target = targetDirectory(context, "backend");
    const uvAvailable = hasUvInstalled();
    await Promise.all([
      writeText(target, "pyproject.toml", '[build-system]\nrequires = ["setuptools>=68"]\nbuild-backend = "setuptools.build_meta"\n\n[project]\nname = "backend"\nversion = "0.1.0"\nrequires-python = ">=3.11"\ndependencies = ["fastapi>=0.115", "uvicorn[standard]>=0.30"]\n\n[tool.uv]\ndev-dependencies = ["pytest>=8.0", "ruff>=0.6"]\n'),
      writeText(target, "app/main.py", 'from fastapi import FastAPI\n\napp = FastAPI(title="StackForge API")\n\n@app.get("/health")\nasync def health() -> dict[str, str]:\n    return {"status": "ok"}\n'),
      writeText(target, "app/__init__.py", ""),
      writeText(target, "README.md", `${fastApiReadme(uvAvailable)}\n`),
    ]);
    if (context.selection.docker) {
      await writeText(target, "Dockerfile", `FROM python:3.12-slim AS build
WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip wheel --no-cache-dir --wheel-dir /wheels .

FROM python:3.12-slim AS runtime
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
COPY --from=build /wheels /wheels
RUN pip install --no-cache-dir /wheels/*
COPY app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
`);
    }
  } },
  getDependencies: () => [{ name: "fastapi", version: ">=0.115", type: "python" }],
  postInstallHooks: [{
    name: "Installing FastAPI dependencies",
    run: installFastApiDependencies,
  }],
  testing,
};
export default provider;
export { provider };
