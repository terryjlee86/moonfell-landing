export type Nearby = {
  id: string;
  kind: string; // "goblin", "mirefold", etc.
  name?: string;
  attitude: "hostile" | "wary" | "curious" | "ally" | "neutral" | "friendly";
  distanceM: number;
  cover?: string | null;
  status?: string[];
};

export type ObservedItem = { slug: string; kind?: "improv" | "loot" | "scenery" };

export type ContextState = {
  rails?: string[];
  nearby: Nearby[];
  observed?: ObservedItem[];
};

let _ctx: ContextState = {
  rails: ["demo-area-only"],
  nearby: [],
  observed: [],
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

export function setNearby(list: Nearby[]) {
  _ctx.nearby = Array.isArray(list) ? list.slice() : [];
}
export function clearNearby() { _ctx.nearby = []; }

export function observeItem(slug: string, kind: ObservedItem["kind"] = "improv") {
  const s = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (!_ctx.observed!.some(o => o.slug === s)) _ctx.observed!.push({ slug: s, kind });
}
export function clearObserved(slug?: string) {
  if (!slug) { _ctx.observed = []; return; }
  const s = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  _ctx.observed = _ctx.observed!.filter(o => o.slug !== s);
}