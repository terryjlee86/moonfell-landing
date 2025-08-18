# Rolls Rules (Moonfell)

## Purpose
Decide **when** a player action should trigger a dice roll, and when it should not.  
These rules guide the Rolls DM only (players never see them).

The AI must use **feeds** (`inventory`, `learned`, `context`, `character`) as the **ground truth** for what the player can or cannot do.

- If a required item, spell, or condition is **missing in feeds**, return **auto-fail** with a clear reason and tag (e.g. `needs-bow`, `needs-spell:fireball`).
- If the action is possible but requires chance, return a **roll** (fixed or opposed).
- If the action is pure ambience, return **no-roll**.

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
Environmental/object interactions with a set difficulty.
- Climb, jump, force a door, balance, pick a lock.
- Choose ability by fiction:
  - STR → brute force (shove, lift, break).
  - AGI → balance, speed, accuracy, throwing.
  - END → stamina, resisting fatigue/poison.
  - INT → analysis, recall, tactics, device use.
  - WIL → focus, resisting fear/pain, keeping calm.
  - CHA → inspiring allies, rallying crowds.
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

- Default **CHA**; allow **WIL/INT** when fictionally appropriate (prayer/ritual, tactical feint).
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
- If the player asks for a **similar but non-existent item** (e.g., “short sword” but inventory has a **longsword**), prefer to **substitute the closest match from feeds** and proceed with a roll.  
  **Tag:** `["fuzzy-match:<chosen-id>"]` and explain in `reason`.

---

## Improvised Items (Environment & Ground) — **Allowed if present in feeds**
Players may use **existing** objects as improvised tools/weapons **if the object exists in feeds**:
- Sources considered valid:
  - Inventory/pack items
  - Items on the **ground** (nearby)
  - **Observed environment items** (e.g., `env:item:rock`) that have been surfaced by the game state
- Improvised melee → usually **Fixed (STR)** or **Opposed (STR vs creature)** depending on context.
- Improvised thrown → usually **Fixed/Opposed (AGI)**.

**Do not** invent objects that are not in feeds.  
If the player references a non-existent object, return **auto-fail** with a clear `needs-<thing>` tag.

**Examples:**
- “pick up the **rock** and throw it” → If `env:item:rock` or a ground rock exists in feeds → **Opposed (AGI vs creature)** or **Fixed (AGI)** with `["improvised-attack"]`.
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

## Examples (authoritative)
- “sing a tune” → **No Roll**, `["ambient-action"]`.
- “sing a tune **to lull the creature**” → **Opposed**, `atk=CHA vs creature`, `["social-influence"]`.
- “whisper a prayer to steady my nerves” → **Fixed (WIL)**, `["self-bolster"]`.
- “shove the goblin” → **Opposed (STR vs creature)**.
- “sneak past the lookout” → **Opposed (AGI vs perception)**.
- “shoot my bow” when **no bow in feeds** → **Auto-Fail**, reason “You don’t have a bow.”, `["needs-bow"]`.
- “use my **short sword**” when only a **longsword** exists → **Fixed**, reason “Interpreted as longsword (closest match).”, `["fuzzy-match:longsword"]`.
- “pick up the **rock** and throw it” when `env:item:rock` is present → **Opposed (AGI vs creature)**, `["improvised-attack"]`.
- “pick up the **rock** and throw it” when no rock is present in feeds → **Auto-Fail**, `["needs-rock"]`.

---

## Criticals
- Nat 20 = strong success; Nat 1 = serious stumble.  
Narrate outcomes; never expose raw math.

---

## Debug Mode
If the client requests debug, include:
- Category (no-roll / auto-success / auto-fail / fixed / opposed)
- **Reason**
- Any `needs-*`, `fuzzy-match:*`, `improvised-*`, or `rail-block` tags