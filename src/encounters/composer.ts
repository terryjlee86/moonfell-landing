/**
 * FILE: src/encounters/composer.ts
 * WHAT: Greedy, seeded composer that fills a budget with a coherent group.
 * HOW: Picks a primary candidate → locks cohortKey → adds more from same cohort only.
 */

import seedrandom from "seedrandom";
import { Candidate } from "./candidate_filter";

export interface ComposeInput {
  rngSeed: number;
  playerLevel: number;
  severityMultiplier: number; // e.g. 4 (standard), 6 (hard), 8 (deadly)
  candidates: Candidate[];
}

export interface ComposeResult {
  picks: Array<{ cand: Candidate; count: number; level: number }>;
  debug: string[];
}

export function composeEncounter(input: ComposeInput): ComposeResult {
  const rng = seedrandom(String(input.rngSeed));
  const baseBudget = 2 + Math.floor(input.playerLevel / 2);
  let budget = baseBudget * input.severityMultiplier;

  const debug: string[] = [];
  if (input.candidates.length === 0) return { picks: [], debug: ["[compose] no candidates"] };

  // pick primary
  const primary = input.candidates[Math.floor(rng() * input.candidates.length)];
  const cohortKey = primary.cohortKey;
  const pool = input.candidates.filter(c => c.cohortKey === cohortKey);
  debug.push(`[compose] primary=${describe(primary)} cohort=${cohortKey} budget=${budget}`);

  const picks: ComposeResult["picks"] = [];

  // ensure at least one unit
  const first = { cand: primary, count: 1, level: clampLevel(input.playerLevel + primary.baseLevelBias) };
  picks.push(first); budget -= costOf(first);
  debug.push(`[compose] +1 ${describe(primary)} → budget ${budget}`);

  // pack/communal bias if creature
  let tryMore = 8; // cap attempts
  while (budget > 0 && tryMore-- > 0) {
    const cand = pool[Math.floor(rng() * pool.length)];
    const addCount = groupSizeHint(cand); // e.g., wolves 2–3, boar 3–5, humanoids 1–2
    const add = { cand, count: addCount, level: clampLevel(input.playerLevel + cand.baseLevelBias) };
    const cost = costOf(add);
    if (cost <= budget) {
      picks.push(add); budget -= cost;
      debug.push(`[compose] +${addCount} ${describe(cand)} (cost=${cost}) → budget ${budget}`);
    } else {
      debug.push(`[compose] skip ${describe(cand)} (cost=${cost} > budget)`);
    }
  }

  return { picks, debug };
}

// helpers

function costOf(pick: { cand: Candidate; count: number; level: number }) {
  const levelDelta = Math.max(0, pick.level - 1); // simple level scaling
  return pick.count * (1 + levelDelta);
}

function clampLevel(l:number){ return Math.max(1, Math.min(20, l)); }

function groupSizeHint(c: Candidate){
  if (c.kind === "creature") {
    const s = c.meta as any;
    if (s.solitary) return 1;
    if (s.packHunter) return 2 + Math.floor(Math.random()*2); // 2–3
    if (s.communal) return 3 + Math.floor(Math.random()*3);   // 3–5
  }
  // humanoids default small groups
  return 1 + Math.floor(Math.random()*2); // 1–2
}

function describe(c: Candidate){
  return c.kind === "creature" ? `creature:${c.speciesId}` : `humanoid:${c.raceId}+${c.roleId}${c.faction?`@${c.faction}`:""}`;
}