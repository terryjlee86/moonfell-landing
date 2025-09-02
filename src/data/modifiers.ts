// src/data/modifiers.ts
export type Phase = "attack" | "defense";
export type Ability = "STR" | "AGI" | "END" | "INT" | "WIL" | "CHA";
export type Mode = "normal" | "adv" | "dis";

export type ModSummary = {
  bonus: number;           // sum of +/- modifiers (clamped)
  mode: Mode;              // normal/adv/dis
  applied: Array<{ source: string; value: number | "adv" | "dis" }>;
};

export function gatherMods(phase: Phase, ability: Ability, tags: string[]): ModSummary {
  const has = (t: string) => tags.some(x => x === t || x.startsWith(t + ":"));
  const applied: Array<{ source: string; value: any }> = [];
  let bonus = 0;
  let mode: Mode = "normal";

  // Examples — adjust freely later
  if (phase === "attack" && ability === "AGI" && has("light:unlit")) {
    mode = "dis"; applied.push({ source: "light:unlit", value: "dis" });
  }
  if (phase === "defense" && has("pc:shield")) {
    bonus += 2; applied.push({ source: "pc:shield", value: +2 });
  }
  if (has("stance:braced") && phase === "defense") {
    bonus += 2; applied.push({ source: "stance:braced", value: +2 });
  }
  if (has("condition:blinded") && phase === "attack") {
    mode = "dis"; applied.push({ source: "condition:blinded", value: "dis" });
  }

  if (bonus > 5) bonus = 5;
  if (bonus < -5) bonus = -5;

  return { bonus, mode, applied };
}