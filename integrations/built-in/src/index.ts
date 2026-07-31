// SPDX-License-Identifier: MPL-2.0
import type { StackForgeIntegration } from "@stackforge/core";
import { backendSourceFinalizer } from "./backend/finalizer.js";
import {
  backendDatabaseIntegrations,
  createBackendDatabaseConnector,
} from "./database/connectors.js";
import {
  createFrontendBackendConnector,
  frontendBackendIntegrations,
} from "./frontend/connectors.js";
import { fullStackComposeIntegration } from "./infrastructure/compose.js";

export {
  backendDatabaseIntegrations,
  backendSourceFinalizer,
  createBackendDatabaseConnector,
  createFrontendBackendConnector,
  frontendBackendIntegrations,
  fullStackComposeIntegration,
};

export const integrations: StackForgeIntegration[] = [
  ...frontendBackendIntegrations,
  ...backendDatabaseIntegrations,
  fullStackComposeIntegration,
  backendSourceFinalizer,
];

export default integrations;
