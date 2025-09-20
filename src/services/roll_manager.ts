// src/services/roll_manager.ts
//
// Roll Manager: thin coordinator between the Arbiter decision and the pure roll resolver.
// - Does NOT narrate.
// - Does NOT embed gameplay math (that lives in roll_resolver.ts).
// - Gathers the minimal inputs (ability, dc/defense, tags, seed) and calls resolveHit().
// - Returns a compact result + an optional one-line debug string for [roll: …].
//
// Usage (from test-chat):
//   import { resolveActionHit } from "@/services/roll_manager";
//   const out = resolveActionHit({ decision, sceneTags, inventoryTags, learnedTags, seedParts, debugRoll });
//   if (out.handled && out.debugLine) prepend it; then steer narration from out.result.tier.

import type { ArbiterDecision } from "./rolls_dm";
import { resolveHit } from "./roll_resolver";

// --- local types mirrored from roll_resolver minimal surface ---
type Ability = "STR" | "AGI" | "END" | "INT" | "WIL" | "CHA";
type Mode = "normal" | "adv" | "dis";

export type SeedParts = {
  scenarioId?: string;
  turn?: number;
  userHash?: string;
  extra?: string;
};

export type ResolveActionHitInput = {
  decision: ArbiterDecision;

  // feeds (already compact/safe from your feed modules)
  sceneTags: string[];
  inventoryTags: string[];
  learnedTags: string[];

  // seeding & debug
  seedParts: SeedParts;
  debugRoll?: boolean;

  // simple baselines (tunable later)
  defenderDefenseBonus?: number; // default 2
  attackerAbilityBonus?: number; // default 0 (you can later compute from stats if desired)
  armorClass?: number; // New property for AC
};

export type ResolveActionHitOutput = {
  handled: boolean;              // true if we resolved a fixed/opposed hit
  result?: {
    tier: "fail" | "mixed" | "success" | "strong" | "crit-fail" | "crit-success";
    margin: number;
    critical?: "nat1" | "nat20";
    debug?: {
      d20: number; second?: number; used: number;
      mode: Mode;
      modsAttack: Array<{source:string; value:number|"adv"|"dis"}>;
      modsDefense?: Array<{source:string; value:number|"adv"|"dis"}>;
      target: string; total: number; margin: number;
      abilityBonus?: number;
      modsAttackTotal?: number;
    };
  };
  // single compact line for [roll: …] if debugRoll=true
  debugLine?: string;
};

// --- make dbg non-optional inside the formatter by defining a concrete type ---
type RollDebug = {
  d20: number; second?: number; used: number;
  mode: Mode;
  modsAttack: Array<{ source: string; value: number | "adv" | "dis" }>;
  modsDefense?: Array<{ source: string; value: number | "adv" | "dis" }>;
  target: string;
  total: number;
  margin: number;
  abilityBonus?: number;
  modsAttackTotal?: number;
};

// --- small helper to format the one-line debug ---
function formatRollDebugLabel(decision: ArbiterDecision): string {
  switch (decision.kind) {
    case "fixed":
      return `fixed ${decision.ability ?? "AGI"}`;
    case "opposed":
      return `opposed ${decision.attackerAbility ?? "STR"} vs ${decision.defender ?? "creature"}`;
    default:
      return decision.kind;
  }
}

function formatRollDebugLine(label: string, dbg: RollDebug): string {
  const parts: string[] = [];
  // Make this unmistakably a hit-success debug line
  parts.push(`Success Roll: ${label}`);

  parts.push(`d20=${dbg.used}`);
  if (typeof dbg.second === "number") parts.push(`(a=${dbg.d20}, b=${dbg.second})`);
  if (dbg.mode !== "normal") parts.push(`${dbg.mode}`);

  if (dbg.modsAttack?.length) {
    const mods = dbg.modsAttack.map(m => `${m.source}:${m.value}`).join(",");
    parts.push(`mods=[${mods}]`);
  }
  if (dbg.modsDefense?.length) {
    const dmods = dbg.modsDefense.map(m => `${m.source}:${m.value}`).join(",");
    parts.push(`defmods=[${dmods}]`);
  }

  parts.push(`target=${dbg.target}`);
  parts.push(`total=${dbg.total}`);
  parts.push(`margin=${dbg.margin}`);

  const tierStr =
    dbg.margin >= 5 ? "strong" :
    dbg.margin >= 0 ? "success" :
    dbg.margin >= -4 ? "mixed" : "fail";

  const line = `[roll: ${parts.join(" ")} → ${tierStr}]`;
  // Optional arithmetic breakdown (balanced with total)
  const abi = typeof dbg.abilityBonus === "number" ? dbg.abilityBonus : 0;
  const mods = typeof dbg.modsAttackTotal === "number" ? dbg.modsAttackTotal : 0;
  const breakdown = `breakdown: ${dbg.used} + ability(${abi}) + mods(${mods}) = ${dbg.total}`;
  return `${line}\n  ${breakdown}`;
}

// --- the manager itself ---
export function resolveActionHit(input: ResolveActionHitInput): ResolveActionHitOutput {
  const { decision } = input;

  // We only handle "fixed" and "opposed" here; other kinds should be ignored by this manager.
  if (decision.kind !== "fixed" && decision.kind !== "opposed") {
    return { handled: false };
  }

  // Build roll context for resolveHit
  if (decision.kind === "fixed") {
    const ability: Ability = (decision.ability as Ability) || "AGI";
    const dcHint = decision.dcHint || "standard";

    const result = resolveHit({
      seedParts: input.seedParts,
      debugRoll: input.debugRoll,

      sceneTags: input.sceneTags,
      inventoryTags: input.inventoryTags,
      learnedTags: input.learnedTags,

      ability,
      attackerAbilityBonus: input.attackerAbilityBonus ?? 0,
      armorClass: input.armorClass, // Pass armorClass to resolveHit

      opposed: false,
      dcHint
    });

    const label = formatRollDebugLabel(decision);
    const debugLine =
      input.debugRoll && result.debug
        ? formatRollDebugLine(label, result.debug as RollDebug)
        : undefined;

    return { handled: true, result, debugLine };
  }

  // opposed case
  const ability: Ability = (decision.attackerAbility as Ability) || "STR";
  const defenderDefenseBonus = input.defenderDefenseBonus ?? 2; // small baseline for now

  const result = resolveHit({
    seedParts: input.seedParts,
    debugRoll: input.debugRoll,

    sceneTags: input.sceneTags,
    inventoryTags: input.inventoryTags,
    learnedTags: input.learnedTags,

    ability,
    attackerAbilityBonus: input.attackerAbilityBonus ?? 0,
    armorClass: input.armorClass, // Pass armorClass to resolveHit

    opposed: true,
    defenderDefenseBonus
  });

  const label = formatRollDebugLabel(decision);
  const debugLine =
    input.debugRoll && result.debug
      ? formatRollDebugLine(label, result.debug as RollDebug)
      : undefined;

  return { handled: true, result, debugLine };
}