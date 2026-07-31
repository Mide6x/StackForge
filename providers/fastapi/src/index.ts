// SPDX-License-Identifier: MPL-2.0
import type { StackForgeProvider } from "@stackforge/core";
import { targetDirectory, writeText } from "@stackforge/core";
import { testing } from "./testing.js";

const provider: StackForgeProvider = {
  metadata: {
    id: "fastapi",
    name: "FastAPI",
    category: "backend",
    description: "Modern Python API framework",
    version: "latest",
    supportedLanguages: ["python"],
    tags: ["python", "api"],
    runtime: {
      developmentCommand: ["uv run uvicorn app.main:app --reload"],
      localUrl: "http://localhost:8000",
      healthCheckUrl: "http://localhost:8000/health",
      installCommand: ["uv sync"],
      dependenciesInstalled: false,
    },
  },
  compatibility: { projectTypes: ["full-stack", "backend-only"] },
  generator: { async generate(context) {
    const target = targetDirectory(context, "backend");
    await Promise.all([
      writeText(target, "pyproject.toml", '[build-system]\nrequires = ["setuptools>=68"]\nbuild-backend = "setuptools.build_meta"\n\n[project]\nname = "backend"\nversion = "0.1.0"\nrequires-python = ">=3.11"\ndependencies = ["fastapi>=0.115", "uvicorn[standard]>=0.30"]\n\n[tool.uv]\ndev-dependencies = ["pytest>=8.0", "ruff>=0.6"]\n'),
      writeText(target, "app/main.py", 'from fastapi import FastAPI\n\napp = FastAPI(title="StackForge API")\n\n@app.get("/health")\nasync def health() -> dict[str, str]:\n    return {"status": "ok"}\n'),
      writeText(target, "app/__init__.py", ""),
      writeText(target, "README.md", "# FastAPI backend\n\nRun with `uv run uvicorn app.main:app --reload`.\n"),
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
  testing,
};
export default provider;
export { provider };
