// src/state/environment.ts

export type EnvItem = {
  slug: string;        // machine-friendly id (e.g. "rock", "torch")
  name: string;        // human-friendly name ("Rock", "Torch")
  where: "ground" | "feature";  // location category
  qty: number;         // how many
  tags?: string[];     // optional: e.g. ["improv", "throwable", "cover"]
};

export type EnvironmentState = {
  items: EnvItem[];
};

let _env: EnvironmentState = {
  items: [],
};

// --- accessors ---
export function getEnvironment(): EnvironmentState {
  return _env;
}

// --- mutators ---
export function clearEnvironment() {
  _env = { items: [] };
}

export function upsertEnvItem(item: Omit<EnvItem, "qty"> & { qty?: number }) {
  const slug = item.slug.toLowerCase();
  const where = item.where;
  const existing = _env.items.find((it) => it.slug === slug && it.where === where);

  if (existing) {
    existing.qty += item.qty ?? 1;
    if (item.tags) {
      existing.tags = Array.from(new Set([...(existing.tags ?? []), ...item.tags]));
    }
  } else {
    _env.items.push({
      slug,
      name: item.name,
      where,
      qty: item.qty ?? 1,
      tags: item.tags ?? [],
    });
  }
}

export function removeQty(slug: string, where: "ground" | "feature", qty: number) {
  const existing = _env.items.find((it) => it.slug === slug && it.where === where);
  if (!existing) return false;
  if (existing.qty <= qty) {
    _env.items = _env.items.filter((it) => !(it.slug === slug && it.where === where));
  } else {
    existing.qty -= qty;
  }
  return true;
}