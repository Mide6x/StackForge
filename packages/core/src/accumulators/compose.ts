import { join } from "node:path";
import type {
  ComposeAccumulator,
  ComposeComponent,
  ComposeServiceContribution,
  DockerGenerationResult,
  GenerationContext,
} from "../contracts.js";
import { writeText } from "../files.js";

type OwnedService = {
  service: ComposeServiceContribution;
  owners: Set<string>;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  if (value && typeof value === "object") {
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, JSON.parse(stable(nested))]),
      ),
    );
  }
  return JSON.stringify(value);
}

function mergeValue(
  current: unknown,
  incoming: unknown,
  path: string,
  existingOwners: Set<string>,
  owner: string,
): unknown {
  if (current === undefined) return incoming;
  if (incoming === undefined) return current;
  if (stable(current) === stable(incoming)) return current;

  if (Array.isArray(current) && Array.isArray(incoming)) {
    return [...new Set([...current, ...incoming].map((item) => stable(item)))]
      .sort()
      .map((item) => JSON.parse(item));
  }

  if (
    current
    && incoming
    && typeof current === "object"
    && typeof incoming === "object"
    && !Array.isArray(current)
    && !Array.isArray(incoming)
  ) {
    const result: Record<string, unknown> = { ...(current as Record<string, unknown>) };
    for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
      result[key] = mergeValue(
        result[key],
        value,
        `${path}.${key}`,
        existingOwners,
        owner,
      );
    }
    return result;
  }

  throw new Error(
    `Compose conflict at "${path}": ${[...existingOwners].join(", ")} and ${owner} `
    + "contributed incompatible values.",
  );
}

function yamlScalar(value: string | number | boolean): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

function renderYaml(value: unknown, indent = 0): string[] {
  const padding = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${padding}[]`];
    return value.flatMap((item) => {
      if (item && typeof item === "object") {
        const nested = renderYaml(item, indent + 2);
        return [`${padding}-`, ...nested];
      }
      return [`${padding}- ${yamlScalar(item as string | number | boolean)}`];
    });
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0) return [`${padding}{}`];
    return entries.flatMap(([key, nested]) => {
      if (nested && typeof nested === "object") {
        return [`${padding}${key}:`, ...renderYaml(nested, indent + 2)];
      }
      return [`${padding}${key}: ${yamlScalar(nested as string | number | boolean)}`];
    });
  }

  return [`${padding}${yamlScalar(value as string | number | boolean)}`];
}

function toComposeService(service: ComposeServiceContribution): Record<string, unknown> {
  const { component: _component, dependsOn, ...rest } = service;
  return {
    ...rest,
    ...(dependsOn ? { depends_on: dependsOn } : {}),
  };
}

export class DefaultComposeAccumulator {
  private readonly services = new Map<string, OwnedService>();
  private readonly volumes = new Map<string, Set<string>>();
  private readonly networks = new Map<string, Set<string>>();

  scoped(owner: string): ComposeAccumulator {
    return {
      addService: (name, service) => this.addService(owner, name, service),
      addVolume: (name) => this.addVolume(owner, name),
      addNetwork: (name) => this.addNetwork(owner, name),
    };
  }

  addService(owner: string, name: string, service: ComposeServiceContribution): void {
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
      throw new Error(`Invalid Compose service name "${name}".`);
    }
    const existing = this.services.get(name);
    if (!existing) {
      this.services.set(name, { service: structuredClone(service), owners: new Set([owner]) });
      return;
    }

    existing.service = mergeValue(
      existing.service,
      service,
      `services.${name}`,
      existing.owners,
      owner,
    ) as ComposeServiceContribution;
    existing.owners.add(owner);
  }

  addVolume(owner: string, name: string): void {
    const owners = this.volumes.get(name) ?? new Set<string>();
    owners.add(owner);
    this.volumes.set(name, owners);
  }

  addNetwork(owner: string, name: string): void {
    const owners = this.networks.get(name) ?? new Set<string>();
    owners.add(owner);
    this.networks.set(name, owners);
  }

  hasServices(): boolean {
    return this.services.size > 0;
  }

  async finalize(context: GenerationContext): Promise<DockerGenerationResult | undefined> {
    if (!context.selection.docker || this.services.size === 0) return undefined;

    const services = Object.fromEntries(
      [...this.services.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, owned]) => [name, toComposeService(owned.service)]),
    );
    const compose: Record<string, unknown> = { services };
    if (this.networks.size > 0) {
      compose.networks = Object.fromEntries(
        [...this.networks.keys()].sort().map((name) => [name, {}]),
      );
    }
    if (this.volumes.size > 0) {
      compose.volumes = Object.fromEntries(
        [...this.volumes.keys()].sort().map((name) => [name, {}]),
      );
    }

    const composeFile = join(context.rootDirectory, "compose.yaml");
    await writeText(composeFile, "", `${renderYaml(compose).join("\n")}\n`);

    const components = new Set(
      [...this.services.values()]
        .map(({ service }) => service.component)
        .filter((component): component is ComposeComponent => Boolean(component)),
    );
    const selectedDatabase = context.selection.providerIds.find((id) =>
      id === "postgres" || id === "mongodb" || id === "supabase");
    const hasRequiredDatabase = !selectedDatabase || components.has("database");
    const startsFullStack = context.selection.projectType === "full-stack"
      && components.has("frontend")
      && components.has("backend")
      && hasRequiredDatabase;
    const databaseServices = [...this.services.entries()]
      .filter(([, owned]) => owned.service.component === "database")
      .map(([name]) => name)
      .sort();

    return {
      enabled: true,
      composeFile,
      startsFullStack,
      command: startsFullStack
        ? ["docker compose up --build"]
        : databaseServices.length > 0
          ? [`docker compose up ${databaseServices.join(" ")}`]
          : ["docker compose up --build"],
    };
  }
}
