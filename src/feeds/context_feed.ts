import { getContext } from "../state/context";

export function contextFeed() {
  const ctx = getContext();
  const tags: string[] = [];

  if (ctx.rails?.length) tags.push(...ctx.rails.map(r => `rail:${r}`));

  for (const n of ctx.nearby) {
    tags.push(`creature:${n.kind}:${n.attitude}:${Math.round(n.distanceM)}m`);
  }

  // NEW — observed items become ground-truth environment tags
  if (ctx.observed?.length) {
    for (const o of ctx.observed) {
      tags.push(`env:item:${o.slug}`);
      if (o.kind === "improv") tags.push(`env:improv:${o.slug}`);
    }
  }

  return { tags };
}