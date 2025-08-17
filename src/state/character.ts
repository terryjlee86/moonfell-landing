// src/state/character.ts

export type Stats = {
  STR: number;  // Strength: physical power
  AGI: number;  // Agility: speed, reflexes, finesse
  END: number;  // Endurance: stamina, toughness
  INT: number;  // Intelligence: analysis, memory
  WIL: number;  // Willpower: focus, resolve
  CHA: number;  // Charisma: presence, persuasion
};

export type Conditions = {
  blinded?: boolean;
  wounded?: boolean;
  poisoned?: boolean;
  stunned?: boolean;
};

export type CharacterState = {
  name: string;
  stats: Stats;
  conditions: Conditions;
  stance?: "neutral" | "braced" | "sprinting";
};

let _state: CharacterState = {
  name: "You",
  stats: { STR: 10, AGI: 10, END: 10, INT: 10, WIL: 10, CHA: 10 },
  conditions: {},
  stance: "neutral",
};

// --- accessors ---
export function getCharacter(): CharacterState {
  return _state;
}

export function setCharacter(next: Partial<CharacterState>) {
  _state = { ..._state, ...next };
}

// --- reducer helpers ---
export function applyCondition(key: keyof Conditions, on = true) {
  _state = {
    ..._state,
    conditions: { ..._state.conditions, [key]: on },
  };
}