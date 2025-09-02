// src/services/dice_engine.ts
//
// Minimal, deterministic d20 roller with advantage/disadvantage.
// Pure functions; no side effects. Unit-test friendly.
//
// Usage:
//   const seed = seedFromParts({ scenarioId: "forest_ambush", turn: 12, userHash: "abc" });
//   const r = rollD20({ seed, mode: "adv" });
//   // r = { d20: 17, second: 9, used: 17, mode: "adv", seed }
//
// Notes:
// - We keep the engine generic; game math (mods, DCs, tiers) lives in roll_resolver.ts.
// - Seeded RNG ensures reproducible results for the same (scenario, turn, user).

export type RollMode = "normal" | "adv" | "dis";

export type D20Result = {
  d20: number;          // primary d20 (1..20)
  second?: number;      // secondary d20 when adv/dis (1..20)
  used: number;         // final die face actually used (after adv/dis)
  mode: RollMode;       // "normal" | "adv" | "dis"
  seed: number;         // the seed used to roll
};

// ----- Deterministic RNG (Mulberry32) -----
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296; // [0,1)
  };
}

/** Produce a stable 32-bit seed from a string. */
export function hash32(s: string): number {
  let h = 2166136261 >>> 0; // FNV-1a base
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Build a deterministic seed from common parts.
 * Provide any subset; empty parts will still yield a stable integer.
 */
export function seedFromParts(parts: {
  scenarioId?: string;
  turn?: number;
  userHash?: string;
  extra?: string; // e.g., "fixed:throw-stone"
}): number {
  const s =
    (parts.scenarioId ?? "") +
    "|" + String(parts.turn ?? "") +
    "|" + (parts.userHash ?? "") +
    "|" + (parts.extra ?? "");
  return hash32(s);
}

/** Convenience: derive a fresh RNG from a seed. */
export function rngFromSeed(seed: number) {
  return mulberry32(seed >>> 0);
}

/** Roll one d20 using the provided RNG function. */
function rollOneD20(next: () => number): number {
  // next() ∈ [0,1) → scale to 1..20 inclusive
  return 1 + Math.floor(next() * 20);
}

/**
 * Roll a d20 with optional advantage/disadvantage.
 * Returns both faces (when relevant) and which one was used.
 */
export function rollD20(opts: { seed: number; mode?: RollMode }): D20Result {
  const mode: RollMode = opts.mode ?? "normal";
  const next = rngFromSeed(opts.seed);

  const a = rollOneD20(next);
  if (mode === "normal") {
    return { d20: a, used: a, mode, seed: opts.seed };
  }

  const b = rollOneD20(next);
  const used = mode === "adv" ? Math.max(a, b) : Math.min(a, b);
  return { d20: a, second: b, used, mode, seed: opts.seed };
}