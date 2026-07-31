#!/usr/bin/env node
import { cancel, intro, outro, spinner } from "@clack/prompts";
import { DefaultGenerationEngine, GenerationFailure, InMemoryProviderRegistry, runCommand } from "@stackforge/core";
import { loadIntegrations, loadProviders } from "./provider-loader.js";
import { formatGenerationFailure, formatGenerationSummary } from "./ui/summary.js";
import { runWizard } from "./wizard.js";

async function main(): Promise<void> {
  const nameFromArgs = process.argv.slice(2).find((argument) => !argument.startsWith("-"));
  const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
  intro("StackForge");
  const registry = new InMemoryProviderRegistry();
  for (const provider of await loadProviders()) registry.register(provider);
  const integrations = await loadIntegrations();
  const setup = await runWizard(registry.list(), integrations, nameFromArgs);
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
