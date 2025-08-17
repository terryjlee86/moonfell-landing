// src/state/learned.ts
// Tracks what THIS character knows (ids reference src/data/* catalogs)

export type LearnedState = {
  skills: string[]; // e.g. ["stealth","social"]
  spells: string[]; // e.g. ["sootheTone","sparkLight"]
};

let _learned: LearnedState = {
  skills: ["melee", "social"],  // seed as you like
  spells: [],                   // start empty
};

export function getLearned(): LearnedState {
  return _learned;
}

export function setLearned(next: Partial<LearnedState>) {
  _learned = { ..._learned, ...next };
}

export function learnSkill(id: string) {
  if (!_learned.skills.includes(id)) _learned.skills = [..._learned.skills, id];
}

export function forgetSkill(id: string) {
  _learned.skills = _learned.skills.filter(x => x !== id);
}

export function learnSpell(id: string) {
  if (!_learned.spells.includes(id)) _learned.spells = [..._learned.spells, id];
}

export function forgetSpell(id: string) {
  _learned.spells = _learned.spells.filter(x => x !== id);
}