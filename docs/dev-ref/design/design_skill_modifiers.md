# Skill Modifiers (Moonfell v1.0 Draft)

### Core Idea
Skill Modifiers represent **active combat techniques** that can temporarily alter a creature’s AC or impose penalties on enemies. Unlike passive stats, these must be **set in advance** and are **consumed** the next time the condition is met. They then enter **cooldown** before being available again.  

This creates a **layer of tactical timing** beyond raw dice rolls.

---

## 1. Structure of a Skill Modifier
Each skill has:
- **Trigger Condition** — when it activates (e.g., “when attacked in melee”).  
- **Effect** — how it modifies AC or impacts the attacker.  
- **Cooldown** — how long before it can be set again.  
- **Tags** — [defensive], [offensive], [reaction], etc. for quick categorization.  

---

## 2. Common Skill Modifiers

| Skill | Trigger Condition | Effect | Cooldown | Tags |
|-------|------------------|--------|-----------|------|
| **Parry** | Next time this creature is attacked in melee | +2 AC against that attack. If attack misses, attacker gains **Parried** (−2 to attack rolls until end of next turn) | 2 rounds | [defensive], [reaction] |
| **Dodge** | Next time any attack is made against this creature | +3 AC for that attack, but −1 to own attack rolls next round (off balance) | 1 round | [defensive] |
| **Riposte** | Next time this creature is attacked in melee | +1 AC; if attack misses, make immediate counterattack at −2 to hit | 3 rounds | [defensive], [offensive], [reaction] |
| **Shield Bash** | When successfully blocking with a shield | Attacker is knocked back 1m and gains **Disoriented** (−1 Defense until next action) | 2 rounds | [defensive], [control] |
| **Feint** | Next melee attack this creature makes | Attacker rolls with +2 to hit; target suffers −1 AC until their next action | 2 rounds | [offensive], [setup] |
| **Counterspell** | Next time targeted by a spell | Roll opposed Arcana; on success, spell fizzles. Attacker suffers **Backlash** (−1 INT until end of next turn) | 3 rounds | [defensive], [magic] |
| **Brace** | Next time struck by a heavy/charging attack | Reduce incoming damage by 3 (after soak). Attacker suffers **Rebounded** (−2 damage on their next strike) | 2 rounds | [defensive], [resilience] |
| **Lunge** | Next melee attack this creature makes | +2 to hit, but AC is reduced by 2 until start of next turn (exposed) | 1 round | [offensive], [risk-reward] |

---

## 3. Implementation in Play
1. On their turn, the player may **set one active skill modifier** (e.g. Parry).  
2. The GM/engine tracks until the **trigger condition** occurs.  
3. When it does, the **effect is applied automatically** and the skill goes on **cooldown**.  
4. Narration hints at this: *“You brace, blade angled; the raider’s swing meets steel and is turned aside.”*  

---

## 4. Why It Works
- **Player agency:** lets players decide *when to spend tactical advantage*.  
- **Narrative richness:** skills like Parry or Riposte change how fights are described.  
- **Cooldown pacing:** avoids spam, encourages planning.  
- **Condition effects:** introduce status interplay without needing huge stat bloat.  
