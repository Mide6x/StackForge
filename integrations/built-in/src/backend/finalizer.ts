import type { StackForgeIntegration } from "@stackforge/core";
import {
  backendDirectoryName,
  backendIds,
  databaseIds,
  frontendIds,
  frontends,
  isJavaScript,
  selectedId,
} from "../catalog.js";
import { renderBackendFiles } from "./renderers.js";
import { goldenPathTesting } from "../testing.js";

export const backendSourceFinalizer: StackForgeIntegration = {
  metadata: {
    id: "backend-source-finalizer",
    name: "Backend source finalization",
    description: "Renders one CORS-restricted, database-aware backend entrypoint.",
    providerIds: [],
  },
  phase: "finalize",
  priority: -100,
  testing: goldenPathTesting,
  isApplicable(selection) {
    const hasBackendAndDatabase = Boolean(selectedId(selection.providerIds, backendIds))
      && Boolean(selectedId(selection.providerIds, databaseIds));
    if (selection.projectType === "backend-only") return hasBackendAndDatabase;
    return selection.projectType === "full-stack"
      && hasBackendAndDatabase
      && Boolean(selectedId(selection.providerIds, frontendIds));
  },
  async apply(context) {
    const frontendId = selectedId(context.selection.providerIds, frontendIds);
    const backendId = selectedId(context.selection.providerIds, backendIds);
    const databaseId = selectedId(context.selection.providerIds, databaseIds);
    if (!backendId || !databaseId) return;

    const backendDirectory = context.selection.projectType === "backend-only"
      ? ""
      : backendDirectoryName(context.directories);
    const frontendOrigin = frontendId
      ? `http://localhost:${frontends[frontendId].port}`
      : undefined;
    const files = renderBackendFiles(
      backendId,
      databaseId,
      frontendOrigin,
      !isJavaScript(context.selection.backendLanguage),
    );

    for (const file of files) {
      const path = backendDirectory ? `${backendDirectory}/${file.path}` : file.path;
      if (file.replace) {
        await context.files.replaceProviderFile(path, file.content);
      } else {
        await context.files.create(path, file.content);
      }
    }
  },
};
