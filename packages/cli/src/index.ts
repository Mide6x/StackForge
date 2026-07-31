#!/usr/bin/env node
import { cancel, intro, outro, spinner } from "@clack/prompts";
import { DefaultGenerationEngine, InMemoryProviderRegistry, runCommand } from "@stackforge/core";
import { loadProviders } from "./provider-loader.js";
import { runWizard } from "./wizard.js";

async function main(): Promise<void> {
  const nameFromArgs = process.argv.slice(2).find((argument) => !argument.startsWith("-"));
  intro("StackForge");
  const registry = new InMemoryProviderRegistry();
  for (const provider of await loadProviders()) registry.register(provider);
  const setup = await runWizard(registry.list(), nameFromArgs);
  const engine = new DefaultGenerationEngine(registry);
  const progress = spinner();
  let activeMessage: string | undefined;

  await engine.generate({
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
  outro(`StackForge created ${setup.projectName}.`);
}

main().catch((error: unknown) => {
  cancel(`StackForge failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
