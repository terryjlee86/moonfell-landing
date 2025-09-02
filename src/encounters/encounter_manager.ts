/**
 * FILE: src/encounters/encounter_manager.ts
 * WHAT: Orchestrator that decides IF an encounter spawns and builds a Blueprint.
 * HOW: Density roll → severity/mode → candidates → composer → derive targets → feed deltas.
 */

import { EncounterInputs, EncounterBlueprint, Severity, Mode, DerivedTargets, EntitySpawn } from "./types";
import { filterCandidates } from "./candidate_filter";
import { composeEncounter } from "./composer";
import { deriveTargets } from "./derive_targets";

export function maybeSpawnEncounter(input: EncounterInputs): EncounterBlueprint | null {
  if (!rollDensity(input.context.desiredDensity)) return null;

  const seed = input.toggles?.seed ?? Date.now();
  const { severity, severityMultiplier, mode, intent } = pickEnvelope(input);
  const candidates = filterCandidates({
    biome: input.context.biome, timeOfDay: input.context.timeOfDay,
    severityWindow: levelWindow(severity), playerLevel: input.playerLevel
  });

  const { picks, debug } = composeEncounter({
    rngSeed: seed, playerLevel: input.playerLevel,
    severityMultiplier, candidates
  });

  if (picks.length === 0) return null;

  const composition: EntitySpawn[] = picks.map(p => {
    if (p.cand.kind === "creature") {
      return { kind:"creature", speciesId:p.cand.speciesId, level:p.level, count:p.count };
    }
    return { kind:"humanoid", raceId:p.cand.raceId, roleId:p.cand.roleId, faction:p.cand.faction, level:p.level, count:p.count };
  });

  const targets: Record<string, DerivedTargets> = {};
  composition.forEach(spawn => {
    const key = keyOf(spawn);
    if (!targets[key]) {
      // VERY light placeholders for now (no gear lookup for humanoids yet)
      const baseStats = spawn.kind === "creature" ? (picks.find(x=>x.cand.kind==="creature" && x.cand.speciesId===spawn.speciesId)!.cand.meta.baseStats)
                                                  : (picks.find(x=>x.cand.kind==="humanoid" && x.cand.raceId===spawn.raceId)!.cand.meta.race.baseStats);
      const profs     = spawn.kind === "creature" ? (picks.find(x=>x.cand.kind==="creature" && x.cand.speciesId===spawn.speciesId)!.cand.meta.proficiencies)
                                                  : mergedProfsForHumanoid(picks, spawn);
      targets[key] = deriveTargets({ level: spawn.level, stats: baseStats, profs, armor: spawn.kind==="humanoid" ? "leather" : undefined, shield:false });
    }
  });

  const deltas = composition.map(spawn => {
    const idPart = spawn.kind==="creature" ? spawn.speciesId : `${spawn.raceId}:${spawn.roleId}`;
    return `add context:${spawn.kind}:${idPart}:hostile:12m x${spawn.count}`;
  });

  const blueprint: EncounterBlueprint = {
    id: `enc_${seed.toString(36)}`,
    seed, mode, severity, intent,
    locationHints: [], composition, targets, deltas,
  };
  if (input.toggles?.debug) console.info("[encounter]", { debug, blueprint });
  return blueprint;
}

// helpers

function rollDensity(d:"low"|"med"|"high"){ const r=Math.random(); return d==="high"? r<0.45 : d==="med"? r<0.25 : r<0.12; }

function pickEnvelope(input: EncounterInputs): { severity:Severity; severityMultiplier:number; mode:Mode; intent:string } {
  // simple default; expand later
  const severity: Severity = "standard";
  const severityMultiplier = 4; // standard
  const mode: Mode = "combat";
  const intent = "pack-hunt";
  return { severity, severityMultiplier, mode, intent };
}

function levelWindow(severity: Severity): [number,number] {
  if (severity==="standard") return [-1, +1];
  if (severity==="hard") return [0, +2];
  if (severity==="deadly") return [+1, +3];
  return [0, 0];
}

function keyOf(spawn: EntitySpawn){
  return spawn.kind==="creature" ? `creature:${spawn.speciesId}@L${spawn.level}` :
    `humanoid:${spawn.raceId}+${spawn.roleId}@L${spawn.level}`;
}

function mergedProfsForHumanoid(picks: any[], spawn: EntitySpawn){
  const raceProfs = picks.find(x=>x.cand.kind==="humanoid" && x.cand.raceId === (spawn as any).raceId)!.cand.meta.race.proficiencies;
  const roleMods  = picks.find(x=>x.cand.kind==="humanoid" && x.cand.roleId === (spawn as any).roleId)!.cand.meta.role.profMods ?? {};
  return {
    melee:(raceProfs.melee??0)+(roleMods.melee??0),
    ranged:(raceProfs.ranged??0)+(roleMods.ranged??0),
    stealth:(raceProfs.stealth??0)+(roleMods.stealth??0),
    perception:(raceProfs.perception??0)+(roleMods.perception??0),
  };
}