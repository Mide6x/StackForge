import type { IntegrationContext, StackForgeIntegration } from "@stackforge/core";
import {
  backendDirectoryName,
  backends,
  type BackendId,
  frontendDirectoryName,
  frontends,
  type FrontendId,
  isJavaScript,
} from "../catalog.js";
import { renderFrontendFiles } from "./renderers.js";

function fullStackPath(directory: string, relativePath: string): string {
  return `${directory}/${relativePath}`;
}

function addBackendCorsDependencies(
  context: IntegrationContext,
  backendId: BackendId,
): void {
  if (backendId !== "express") return;
  context.dependencies.add({
    manager: "npm",
    target: "backend",
    name: "cors",
    version: "^2.8.5",
  });
  context.dependencies.add({
    manager: "npm",
    target: "backend",
    name: "dotenv",
    version: "^17.2.1",
  });
  if (!isJavaScript(context.selection.backendLanguage)) {
    context.dependencies.add({
      manager: "npm",
      target: "backend",
      name: "@types/cors",
      version: "^2.8.19",
      development: true,
    });
  }
}

export function createFrontendBackendConnector(
  frontendId: FrontendId,
  backendId: BackendId,
): StackForgeIntegration {
  const frontend = frontends[frontendId];
  const backend = backends[backendId];
  const id = `${frontendId}-${backendId}`;

  return {
    metadata: {
      id,
      name: `${frontend.name} + ${backend.name}`,
      description: `Connects ${frontend.name} to the ${backend.name} API.`,
      providerIds: [frontendId, backendId],
    },
    phase: "connect-applications",
    isApplicable(selection) {
      return selection.projectType === "full-stack";
    },
    async apply(context) {
      const frontendDirectory = frontendDirectoryName(context.directories);
      const backendDirectory = backendDirectoryName(context.directories);
      const backendUrl = `http://localhost:${backend.port}`;
      const frontendOrigin = `http://localhost:${frontend.port}`;
      const rendered = renderFrontendFiles(
        frontend,
        backendUrl,
        !isJavaScript(context.selection.frontendLanguage),
      );

      context.environment.add({
        name: frontend.apiEnvironmentVariable,
        exampleValue: backendUrl,
        description: `Public URL used by ${frontend.name} to reach the API.`,
        section: "Frontend API",
        targets: ["root", "frontend"],
      });
      context.environment.add({
        name: "FRONTEND_URL",
        exampleValue: frontendOrigin,
        description: "Allowed browser origin for backend CORS.",
        section: "Application connection",
        targets: ["backend"],
      });
      context.environment.add({
        name: "PORT",
        exampleValue: String(backend.port),
        description: `${backend.name} HTTP port.`,
        section: "Application connection",
        targets: ["backend"],
      });

      addBackendCorsDependencies(context, backendId);
      await context.files.create(
        fullStackPath(frontendDirectory, rendered.apiPath),
        rendered.apiSource,
      );
      await context.files.replaceProviderFile(
        fullStackPath(frontendDirectory, rendered.pagePath),
        rendered.pageSource,
      );

      context.result.setConnection({
        frontendProviderId: frontendId,
        backendProviderId: backendId,
        apiEnvironmentVariable: frontend.apiEnvironmentVariable,
        apiUrl: backendUrl,
        healthUrl: `${backendUrl}/health`,
      });
      context.documentation.add({
        id: "application-connection",
        title: "Frontend and API",
        order: 20,
        content:
          `${frontend.name} reads \`${frontend.apiEnvironmentVariable}\` and calls `
          + `${backend.name} at \`${backendUrl}\`. The API accepts browser requests only `
          + `from \`${frontendOrigin}\` by default.`,
      });
      context.result.addManualStep(
        `environment:${id}`,
        `Copy ${frontendDirectory}/.env.example and ${backendDirectory}/.env.example before local development.`,
      );
    },
  };
}

export const frontendBackendIntegrations: StackForgeIntegration[] = (
  Object.keys(frontends) as FrontendId[]
).flatMap((frontendId) =>
  (Object.keys(backends) as BackendId[]).map((backendId) =>
    createFrontendBackendConnector(frontendId, backendId)));
