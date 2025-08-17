# Rolls Rules (Moonfell)

## Purpose
Decide **when** a player action should trigger a dice roll, and when it should not. These rules guide the Rolls DM only (players never see them).

---

## Categories

### 1) No Roll
Use narration only.
- Pure observation/input with no consequence intended: “look around”, “listen”, “sniff the air”.
- Casual ambient acts: “hum”, “sing a tune”, “whistle”, “stretch”, “swap grip” (when unpressured).
- Moving slowly within obvious safety, without contest or risk.

### 2) Auto-Success
Trivial actions that always succeed; no suspense added.
- Pick up an item at your feet when calm.
- Draw/sheath a ready weapon in calm conditions.
- Speak brief words.

### 3) Auto-Fail
Impossible under current physics, fiction, or demo boundaries.
- Leave the locked preview area.
- Leap implausible gaps; fly unaided; ignore encumbrance limits.

### 4) Fixed DC
Environmental/object interactions against a set difficulty.
- Climb, jump, force a door, balance, pick a lock.
- Choose ability by fiction (STR/AGI/INT/WIL), with optional DC hint (“easy/standard/hard/heroic”).

### 5) Opposed
Direct contests against creatures or resisting agents.
- Attack/dodge/block; shove/grapple; stealth vs perception; chase.

---

## Social / Mental Influence (Always Consider a Roll)
Any attempt to alter a creature/NPC’s **behaviour, mood, attention, or intent** (calm, lull, distract, intimidate, persuade) **requires a check**.
- Default **CHA**; allow **WIL/INT** when fictionally appropriate (prayer/ritual, tactical feint).
- Use **Opposed** vs **creature** when target resists; use **Fixed DC** if resistance is ambient/low.

---

## Ambience vs Influence (Tagging Rule)
- **Ambient actions** with **no stated intent to affect a creature** = **No Roll**.  
  Tag as `["ambient-action"]`.
- **Influence attempts** that aim to change a creature/NPC = **Roll required**.  
  Tag as `["social-influence"]`.
- When ambiguous, classify as **ambient** (do not assume influence intent).

---

## Criticals
- Nat 20 = strong success, Nat 1 = serious stumble. Narrate; do not expose math.

## Debug Mode
If the client requests debug, return a short, plain-language reason and relevant **tags** as above.