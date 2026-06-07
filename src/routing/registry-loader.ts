import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { IntentRegistry, IntentClass, SlotSchemas, Domain } from "../types/index.js";

let registryCache: Map<string, IntentRegistry> = new Map();
let schemaCache: Map<string, SlotSchemas> = new Map();

export function loadIntentRegistry(domain: Domain): IntentRegistry {
  const cached = registryCache.get(domain);
  if (cached) return cached;

  const path = `src/routing/intent-registry.yaml`;
  const raw = readFileSync(path, "utf-8");
  const registry = parseYaml(raw) as IntentRegistry;

  if (!registry.domain || !Array.isArray(registry.intents)) {
    throw new Error(`Invalid intent registry at ${path}`);
  }

  for (const intent of registry.intents) {
    if (!intent.id || !intent.route) {
      throw new Error(`Invalid intent in registry: missing id or route for ${intent.id ?? "unknown"}`);
    }
  }

  registryCache.set(domain, registry);
  return registry;
}

export function getIntentById(domain: Domain, intentId: string): IntentClass | undefined {
  const registry = loadIntentRegistry(domain);
  return registry.intents.find((i) => i.id === intentId);
}

export function getIntentByRoute(domain: Domain, route: string): IntentClass | undefined {
  const registry = loadIntentRegistry(domain);
  return registry.intents.find((i) => i.route === route);
}

export function listIntentIds(domain: Domain): string[] {
  return loadIntentRegistry(domain).intents.map((i) => i.id);
}

// ── Slot Schemas ──

export function loadSlotSchemas(domain: Domain): SlotSchemas {
  const cached = schemaCache.get(domain);
  if (cached) return cached;

  const path = `src/routing/slot-schemas/${domain}.yaml`;
  const raw = readFileSync(path, "utf-8");
  const parsed = parseYaml(raw) as { slots: SlotSchemas };

  if (!parsed || !parsed.slots) {
    throw new Error(`Invalid slot schema at ${path}`);
  }

  schemaCache.set(domain, parsed.slots);
  return parsed.slots;
}

export function getRequiredSlots(domain: Domain, intentId: string): string[] {
  const intent = getIntentById(domain, intentId);
  return intent?.required_slots ?? [];
}

export function getOptionalSlots(domain: Domain, intentId: string): string[] {
  const intent = getIntentById(domain, intentId);
  return intent?.optional_slots ?? [];
}

export function getSlotPromptVi(domain: Domain, slotName: string): string {
  const schemas = loadSlotSchemas(domain);
  return schemas[slotName]?.prompt_vi ?? slotName;
}

export function isPrivacySlot(domain: Domain, slotName: string): boolean {
  const schemas = loadSlotSchemas(domain);
  return schemas[slotName]?.privacy ?? false;
}

export function clearCaches(): void {
  registryCache.clear();
  schemaCache.clear();
}
