// SPDX-License-Identifier: MPL-2.0
import { spawnSync } from "node:child_process";
import type {
  ProviderTestingSupport,
  RuntimeTestCommand,
  TestingGenerationContext,
} from "@stackforge/core";
import { targetDirectory } from "@stackforge/core";

export function fastApiPytestCommands(uvAvailable: boolean): readonly RuntimeTestCommand[] {
  return uvAvailable
    ? [{ name: "Unit and API integration tests", command: ["uv", "run", "pytest"] }]
    : [
      { name: "Activate virtual environment", command: ["source", ".venv/bin/activate"] },
      { name: "Unit and API integration tests", command: ["python", "-m", "pytest"] },
    ];
}

function hasUvInstalled(): boolean {
  return spawnSync("uv", ["--version"], { stdio: "ignore" }).status === 0;
}

const pytestHttpxOption = {
  id: "pytest-httpx",
  name: "pytest + HTTPX",
  description: "Unit and API integration tests against the importable FastAPI application.",
  testTypes: ["unit", "integration"] as const,
  commands: fastApiPytestCommands(true),
  default: true,
};

function prefix(context: TestingGenerationContext): string {
  return context.selection.projectType === "full-stack" ? `${context.directories.backend ?? "backend"}/` : "";
}

async function generatePytestHttpx(context: TestingGenerationContext): Promise<void> {
  const root = prefix(context);
  context.dependencies.add({ manager: "python", target: "backend", name: "pytest", version: ">=8.0", group: "development" });
  context.dependencies.add({ manager: "python", target: "backend", name: "httpx", version: ">=0.28", group: "development" });
  const hasDatabase = context.selection.providerIds.some((id) => id === "postgres" || id === "mongodb" || id === "supabase");
  await context.files.create(`${root}tests/test_health.py`, `from fastapi.testclient import TestClient
${hasDatabase ? "from unittest.mock import AsyncMock, patch\n" : ""}

from app.main import app


def test_health() -> None:
${hasDatabase ? "    with patch(\"app.main.check_database\", new=AsyncMock()):\n        with TestClient(app) as client:\n            response = client.get(\"/health\")" : "    with TestClient(app) as client:\n        response = client.get(\"/health\")"}

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
`);
  context.result.addTestSuite({
    providerId: "fastapi",
    component: "backend",
    optionId: pytestHttpxOption.id,
    name: pytestHttpxOption.name,
    directory: targetDirectory(context, "backend"),
    commands: fastApiPytestCommands(hasUvInstalled()),
  });
}

export const testing: ProviderTestingSupport = {
  options: [pytestHttpxOption],
  generators: [{ optionId: pytestHttpxOption.id, generate: generatePytestHttpx }],
};
