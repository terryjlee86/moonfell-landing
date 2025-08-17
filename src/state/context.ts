// src/state/context.ts
export type Nearby = {
  id: string;
  kind: string; // "goblin", "mirefold", etc.
  attitude: "hostile" | "wary" | "curious" | "ally";
  distanceM: number;
};

export type ContextState = {
  rails?: string[]; // e.g. ["demo-area-only"]
  nearby: Nearby[];
};

let _ctx: ContextState = {
  rails: ["demo-area-only"],
  nearby: [],
};

export function getContext(): ContextState { return _ctx; }
export function setContext(next: Partial<ContextState>) { _ctx = { ..._ctx, ...next }; }

export function upsertNearby(n: Nearby) {
  const i = _ctx.nearby.findIndex(x => x.id === n.id);
  if (i >= 0) _ctx.nearby[i] = n; else _ctx.nearby.push(n);
}
export function removeNearby(id: string) {
  _ctx.nearby = _ctx.nearby.filter(n => n.id !== id);
}