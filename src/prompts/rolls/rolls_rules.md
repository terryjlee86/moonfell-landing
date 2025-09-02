
# Rolls Rules (Moonfell)

## Purpose
Decide **when** a player action should trigger a dice roll, and when it should not.  
These rules guide the Rolls DM only (players never see them).

The AI must use **feeds** (`inventory`, `learned`, `context`, `character`) as the **ground truth** for what the player can or cannot do.

- If a required item, spell, or condition is **missing in feeds**, return **auto-fail** with a clear reason and tag (e.g. `needs-bow`, `needs-spell:fireball`).
- If the action is possible but requires chance, return a **roll** (fixed or opposed).
- If the action is pure ambience, return **no-roll**.
- If the action uses an **existing non-weapon item** (book, rock, lantern, rope) as a weapon/tool, treat it as **improvised** (see below).
- The AI should also decide which **stat** (ability) to use for the roll by reasoning from fiction + rules below, not just keyword match.

---

## Categories

### 1) No Roll
Use narration only — no dice, no suspense.
- Pure observation/input with no consequence intended: “look around”, “listen”, “sniff the air”.
- Casual ambient acts: “hum”, “sing a tune”, “whistle”, “stretch”, “swap grip” (when unpressured).
- Moving slowly within obvious safety, without contest or risk.

**Tag:** `["ambient-action"]`  
**Heuristic:** Only classify as *no-roll* if the player’s action has **no intent** to affect the world, a creature, or their own state.

---

### 2) Auto-Success
Trivial actions that always succeed; rolling adds no value.
- Pick up an item at your feet in calm conditions.
- Draw/sheath a weapon when unopposed.
- Speak a few words aloud.

**Tag:** `["auto-success"]`

---

### 3) Auto-Fail
Impossible under current physics or fiction, or **feeds prove** a required prerequisite is missing.
- **Rails (tight scope):** only block **leaving** the preview area (e.g., “leave/exit/go beyond the gorge”).  
  Do **not** rail-block ordinary in-scene interactions like throwing a rock, using a rope, or attacking.
- Leap implausible gaps; fly unaided; ignore encumbrance limits.
- Cast a spell the character does not know (**check feeds**).
- Use a specific item/weapon that the character does not possess (**check feeds**).

**Tags:**
- `["rail-block"]` only when the player explicitly tries to leave the demo boundary.
- `["needs-bow"]`, `["needs-crossbow"]`, `["needs-handcannon"]`, `["needs-spell:fireball"]`, etc. for missing prerequisites.

**Heuristic:** Use auto-fail **only** when **feeds prove** the player lacks the required item/spell/capability. Never auto-fail just because the model “feels” it’s unlikely.

---

### 4) Fixed DC
- Choose ability by **fictional context**, not just keywords:
  - STR → brute force (shove, lift, break; also heavy blunt improvised attacks).
  - AGI → balance, speed, finesse, accuracy, ranged throws (stones, knives, spears).
  - END → stamina, resisting fatigue/poison/environmental hardship.
  - INT → analysis, recall, tactics, device use, reasoning.
  - WIL → focus, resisting fear/pain, keeping calm, magical will.
  - CHA → inspiring allies, persuasion, intimidation, deception.
- Optional DC hint: `easy | standard | hard | heroic`.

**Tag:** `["fixed-action"]`

---

### 5) Opposed
Direct contests against creatures or resisting agents.
- Attack/dodge/block.
- Shove, grapple, restrain.
- Stealth vs perception.
- Chase/contest of speed.

**Format:** `opposed atk=<ability> vs <creature/environment/player>`.

---

## Social / Mental Influence (Roll REQUIRED if intent stated)
Any attempt to alter a creature/NPC’s **behaviour, mood, attention, or intent** requires a roll.

Examples: calm, lull, distract, charm, soothe, frighten, intimidate, persuade, lure, mesmerise, confuse, taunt, mislead.

- Default **CHA**; allow **WIL/INT** when fictionally appropriate (prayer, ritual, tactical feint).
- Use **Opposed vs creature** when a target resists; use **Fixed DC** if resistance is ambient/low.

**Intent heuristic (strict):**  
If the player’s text includes an **influence verb** (calm, lull, distract, frighten, charm, persuade, lure, mesmerise, etc.) **and** references a creature/NPC (explicitly or by pronoun/description), classify as **roll required** (usually opposed). Do **not** treat as ambient.

**Tag:** `["social-influence"]`

---

## Weapons & Items (Feeds are ground truth)
- If the player specifies a **weapon or item**, check feeds for a matching capability/item tag.
  - Bow → requires `pc:bow`.
  - Crossbow → requires `pc:crossbow`.
  - Handcannon / pistol / musket / rifle → requires `pc:handcannon` (until further granularity is added).
  - Throwing axe → requires `pc:throwing-axe:N` with `N > 0`.
  - Rope → requires `pc:rope`.
  - Torch/Lantern → requires `pc:light:lit` or `pc:light:unlit`.
- If the specific item is **not in feeds**, auto-fail with clear reason + tag.
- If the player asks for a **similar but non-existent item** (e.g., “short sword” but inventory has a **longsword**), prefer to **substitute the closest match** from feeds and proceed with a roll.  
  **Tag:** `["fuzzy-match:<chosen-id>"]` and explain in `reason`.

**Ambient affordances caveat (priority):**  
When a player names a **generic, naturally occurring material** and it is **plausible for the current biome**:

1) **If a matching environment tag exists** (e.g. `env:item:rock`, `env:ground:rock`): treat it as usable now.  
2) **Else**: apply **Ambient Affordances (Immediate)** — add **one** such item via `apply_now` (tag `env:auto-added`) and proceed this turn.  
3) **Else** (not generic or not biome-plausible): return **auto-fail** with `["needs-<thing>"]`.

This is category-based reasoning (generic, plausible, hand-scale), not a named list.

---

## Improvised Items (Environment & Ground) — **Allowed if present in feeds**
Players may use **existing** objects as improvised tools/weapons **if the object exists in feeds**:
- Sources considered valid:
  - Inventory/pack items.
  - Items on the **ground** (nearby).
  - **Observed environment items** (e.g., `env:item:rock`) that have been surfaced by the game state.
- Improvised melee → usually **Fixed (STR)** or **Opposed (STR vs creature)** depending on context.
- Improvised thrown → usually **Fixed/Opposed (AGI)**.
- “throw my **torch**” → If a torch exists in inventory/ground/observed → **Opposed (AGI vs creature)**, tag `["improvised-attack"]`. On success, **consume/move** the torch from hand and **add** a torch to **ground** (it lands).
- “lasso with my **rope**” → If rope exists in inventory → **Fixed or Opposed (AGI or STR)** depending on fiction (snag / trip / bind), tag `["improvised-action"]`. If no rope in feeds → **Auto-Fail**, `["needs-rope"]`.

**Do not** invent objects that are not in feeds **unless** the case meets **Ambient Affordances (Immediate)** (generic + biome-plausible). Otherwise, auto-fail with a clear `needs-<thing>` tag.

**Ability choice for improvised items:**
- Thrown items (stones, knives, bottles) → **AGI** by default (accuracy/finesse).
- Heavy blunt melee improvised (logs, chairs, big rocks) → **STR**.
- Fragile, finesse-based (lanterns, delicate distractions) → **AGI**.
- Rope / binding actions → **AGI or STR** depending on fiction (snag vs raw strength).


## Player Assertions vs Ground Truth

- A player **claiming** an object exists (e.g. *“there is a seashell on the floor”*) does **not** make it real.  
- Only accept objects if they are:
  - Present in **feeds** (inventory, ground, observed environment), OR
  - **Biome-plausible** (rocks in a gorge, branches in a forest).  
- If the player asserts something implausible for the biome and it is not in feeds, return **auto-fail** with a clear `needs-*` tag.  
- Never promote player-asserted items into the environment just because the phrasing suggests it’s visible.  
- Always decide the roll’s **ability** based on the fiction of the action (see Fixed DC + Improvised Items). Do not assume STR for all improvised weapons.

**Examples:**  
- “There is a seashell on the floor, I pick it up” → **Auto-Fail**, `["needs-sea-shell"]` (not biome-plausible).  
- “There is a rock on the floor, I pick it up” → Allowed, because rocks are biome-plausible in a gorge → **Fixed/Opposed (AGI)** with `["improvised-attack","env:auto-added"]`.  

**Examples:**
- “pick up the **rock** and throw it” → If `env:item:rock` / `env:ground:rock` exists in feeds → **Opposed (AGI vs creature)** or **Fixed (AGI)** with `["improvised-attack"]`.
- “smash with a **book**” → If a book exists in pack/ground/observed → **Opposed (STR vs creature)** with `["improvised-attack"]`. If not → **Auto-Fail**, `["needs-book"]`.

---

## Rails (tight)
- Only apply `rail-block` if the player **explicitly tries to leave** the preview area (e.g., “leave/exit/go beyond the gorge”).  
- **Do not** rail-block ordinary in-scene interactions (throwing a rock, using rope, attacking, lighting a torch, etc.).

---

## Ambience vs Influence (Tagging Rule)
- **Ambient actions** with **no stated intent to affect a creature** = **No Roll**. Tag `["ambient-action"]`.
- **Influence attempts** that aim to change a creature/NPC = **Roll required**. Tag `["social-influence"]`.
- When ambiguous, prefer **ambient** (don’t assume intent).

---

## Ambient Affordances (Immediate)
If the player requests a **generic, naturally occurring material** that is **plausible for the current biome** (e.g., common ground debris or simple natural matter), you may add **exactly one** such item to the scene **immediately** so the action can proceed this turn.

**Use this only if ALL are true:**
- **Generic**: a broad noun category (natural/low-value), not manufactured gear or a specific crafted item.
- **Plausible**: consistent with the current setting/biome (terrain/scene tags); not out of place.
- **Low value & low complexity**: trivial to obtain; not a quest/rare/object of economic value.
- **Small & hand-scale**: the object can be held/thrown/used one-handed by a human.

**Add as:**
- `apply_now`: an environment add of **one** such item at ground, tagged `env:auto-added` (and any obvious affordances like `"throwable"` if appropriate), then any inventory move needed to use it **this turn**.
- Choose roll type by fiction (thrown → usually **AGI**; blunt melee → usually **STR**).
- If the material is **implausible** for the biome (or not generic), **auto-fail** with `["needs-<thing>"]`.

> This rule is **category-based**. Do not name or enumerate items; reason from biome plausibility and genericness.

**Example:** “pick up a rock and throw it” in a gorge → **Opposed (AGI vs creature)**; add one rock to ground (see delta fields below).

---

## Decision JSON (with optional deltas)
Alongside the decision, include optional **state deltas** so the engine can apply them without an extra pass.

```json
{
  "kind": "no-roll | auto-success | auto-fail | fixed | opposed",
  "reason": "short, plain language why",
  "tags": ["optional","tags","for","debug"],

  "apply_now": [
    { "type":"environment","op":"add","slug":"rock","name":"Rock","where":"ground","qty":1,"tags":["improv","throwable","env:auto-added"] },
    { "type":"inventory","op":"move","item":"rock","from":"ground","to":"hand","qty":1 }
  ],

  "on_success": [
    { "type":"inventory","op":"consume","item":"rock","qty":1 },
    { "type":"environment","op":"add","slug":"rock","where":"ground","qty":1 }
  ],

  "on_failure": [
    { "type":"inventory","op":"move","item":"rock","from":"hand","to":"ground","qty":1 }
  ]
}
```

**Rules for deltas:**
- Use **`apply_now`** only for small, reversible changes (ready/move/add **one** generic ambient item).
- Use **`on_success` / `on_failure`** for outcome-based changes (consume, drop, land).
- Never add **non-generic gear** via `apply_now`. If a named gear item is missing (e.g., bow), return **auto-fail** with `["needs-bow"]`.

---

## Examples (authoritative)
- “sing a tune” → **No Roll**, `["ambient-action"]`.
- “sing a tune **to lull the creature**” → **Opposed**, `atk=CHA vs creature`, `["social-influence"]`.
- “whisper a prayer to steady my nerves” → **Fixed (WIL)**, `["self-bolster"]`.
- “shove the goblin” → **Opposed (STR vs creature)`.
- “sneak past the lookout” → **Opposed (AGI vs perception)`.
- “shoot my bow” when **no bow in feeds** → **Auto-Fail**, reason “You don’t have a bow.”, `["needs-bow"]`.
- “use my **short sword**” when only a **longsword** exists → **Fixed**, reason “Interpreted as longsword (closest match).”, `["fuzzy-match:longsword"]`.
- “pick up the **rock** and throw it” when `env:item:rock` is present → **Opposed (AGI vs creature)**, `["improvised-attack"]`.
- “pick up a **rock** and throw it” when none have been promoted yet but rocks are plausible for the biome → **Opposed (AGI vs creature)** with `apply_now` adding 1 `rock@ground` (`env:auto-added`).
- “pick up the **rock** and throw it” when rocks are implausible here → **Auto-Fail**, `["needs-rock"]`.

---

## Criticals
- Nat 20 = strong success; Nat 1 = serious stumble.  
Narrate outcomes; never expose raw math.

---

## Debug Mode
If the client requests debug, include:
- Category (no-roll / auto-success / auto-fail / fixed / opposed)
- **Reason**
- Any `needs-*`, `fuzzy-match:*`, `improvised-*`, `env:auto-added`, or `rail-block` tags
