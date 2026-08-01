#!/usr/bin/env node
// SPDX-License-Identifier: MPL-2.0
import { createRequire } from "node:module";
import { cancel, intro, outro, spinner } from "@clack/prompts";
import { DefaultGenerationEngine, GenerationFailure, InMemoryProviderRegistry, runCommand } from "@stackforge/core";
import { formatHelpText, parseCliArguments } from "./cli-options.js";
import { loadIntegrations, loadProviders } from "./provider-loader.js";
import { formatGenerationFailure, formatGenerationSummary } from "./ui/summary.js";
import { runWizard } from "./wizard.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

async function main(): Promise<void> {
  const args = parseCliArguments(process.argv.slice(2));
  if (args.help) {
    console.log(formatHelpText());
    return;
  }

  if (args.version) {
    console.log(packageJson.version);
    return;
  }

  const nameFromArgs = args.destination;
  const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
  intro("StackForge");
  const registry = new InMemoryProviderRegistry();
  for (const provider of await loadProviders()) registry.register(provider);
  const integrations = await loadIntegrations();
  const setup = await runWizard(registry.list(), integrations, nameFromArgs, args);
  const engine = new DefaultGenerationEngine(registry, integrations);
  const progress = spinner();
  let activeMessage: string | undefined;

  try {
    const result = await engine.generate({
      ...setup,
      answers: {},
      directories: setup.selection.projectType === "full-stack" ? { frontend: "frontend", backend: "backend" } : {},
      log: (message) => {
        if (activeMessage) progress.stop(activeMessage.replace(/^Generating /, "").replace(/\.\.\.$/, " ready"));
        activeMessage = message;
        progress.start(message);
      },
      run: runCommand,
    });

    if (activeMessage) progress.stop("Project generated");
    console.log(formatGenerationSummary(result, invocationDirectory));
    outro("StackForge is ready. Start building.");
  } catch (error) {
    if (activeMessage) progress.stop("Project generation stopped");
    if (error instanceof GenerationFailure) {
      cancel(formatGenerationFailure(error));
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  cancel(`StackForge failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
