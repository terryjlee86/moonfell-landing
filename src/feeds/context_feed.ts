import { getContext } from "../state/context";
import { getEnvironment } from "../state/environment";

export function contextFeed() {
  const ctx = getContext();
  const env = getEnvironment();
  const tags: string[] = [];

  // Rails
  if (ctx.rails?.length) tags.push(...ctx.rails.map(r => `rail:${r}`));

  // Nearby creatures
  for (const n of ctx.nearby) {
    tags.push(`creature:${n.kind}:${n.attitude}:${Math.round(n.distanceM)}m`);
  }

  // Environment items
  for (const item of env.items) {
    tags.push(`env:item:${item.slug}`);
    tags.push(`env:${item.where}:${item.slug}`); // e.g. env:ground:rock
    if (item.tags?.length) {
      for (const t of item.tags) {
        tags.push(`env:${t}:${item.slug}`);
      }
    }
    // Quantities — optional but helpful
    if (item.qty > 1) {
      tags.push(`env:qty:${item.slug}:${item.qty}`);
    }
  }

  return { tags };
}