## Moonfell Quick Reference

### What this is
- Text-first, rules-driven single-player RPG preview with a marketing landing.
- Next.js 14 (pages router), React 18, TypeScript, Tailwind 4.

### Commands
- dev: `next dev`
- build: `next build`
- start: `next start`
- lint: `next lint`

### Required env vars
- OPENAI_API_KEY
- TEST_CLIENT_PASSCODE
- OPENAI_MODEL (default: gpt-4o-mini)
- BEEHIIV_PUBLICATION_ID, BEEHIIV_API_KEY
- NEXT_PUBLIC_GA_ID, NEXT_PUBLIC_META_PIXEL_ID

### Key directories
- src/pages
  - index.tsx: Landing (hero, features, waitlist form → /api/subscribe)
  - playtest.tsx: Passcode-gated chat UI for preview encounter
  - api/subscribe.ts: Beehiiv subscribe POST
  - api/test-chat.ts: Encounter orchestration + OpenAI call
- src/components: HeroBasic, FollowSignup
- src/ui/roster: RosterSidebar (playtest)
- src/lib: analytics.ts (GA/Meta helpers)
- src/prompts: system.md, conductor.md, encounter.md, world.md, scenarios/forest_ambush.ts
- src/services: dice_engine, roll_manager, roll_resolver, rolls_dm, narration_observer, delta_applier
- src/feeds: character_feed, inventory_feed, context_feed, learned_feed, context_roster_feed
- src/state: character, inventory, environment, learned (+ selectors)
- src/encounters: types + barrel export

### Landing flow
1) index.tsx collects { name, email, consent, utm, hp }
2) POST /api/subscribe → Beehiiv API
3) GA/META events on success; honeypot (`hp`) short-circuits bots

### Playtest flow
1) Unlock: POST /api/test-chat { passcode, init: true } → seeds inventory from scenario
2) Send: { message, history, debug flags }
3) Server:
   - Builds feeds (character/inventory/context/learned)
   - Expands numeric selections (1–5) from last assistant or feeds fallback
   - Arbiter decision via rolls_dm → normalized (melee/thrown) using feeds
   - Applies deltas (apply_now); resolves hit with roll_manager (seeded dice_engine)
   - Calls OpenAI with prompt docs; narration + 3–5 numbered options
   - narration_observer proposes environment additions (deduped) → apply deltas
   - Optional debug lines: arbiter, feeds, observer, rolls

### Debug toggles (playtest.tsx)
- Debug: prepend arbiter + optional feeds/observer info
- Rolls: show rolls math banner
- Feeds: include a tags line in debug

### Notable files
- src/services/dice_engine.ts: Deterministic d20 with adv/dis; seedFromParts/hash32
- src/pages/api/subscribe.ts: Minimal, robust Beehiiv payload with UTM; 409 treated as success
- src/pages/api/test-chat.ts: Prompt assembly, feeds contract, normalization, delta flow, OpenAI call
