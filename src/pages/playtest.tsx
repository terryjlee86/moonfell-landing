import { FormEvent, useEffect, useRef, useState } from "react";
import RosterSidebar from "../ui/roster/RosterSidebar";
import { getRosterSnapshot } from "../state/selectors/roster_selector";
import { setNearby } from "../state/context";
import { rollInitiative } from "../services/initiative_service";
import { EntitySpawn } from "../encounters/types";
import { Attitude } from "../types/roster";
import { RosterEntry } from "../types/roster";

type Turn = { role: "user" | "assistant"; content: string };

export default function Playtest() {
  const [passcode, setPasscode] = useState("");
  const [authed, setAuthed] = useState(false);
  const [intro, setIntro] = useState<string>("");
  const [history, setHistory] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  // Debug toggles
  const [debug, setDebug] = useState(false);           // Arbiter + Observer debug
  const [debugRoll, setDebugRoll] = useState(false);   // Rolls math banner
  const [debugFeeds, setDebugFeeds] = useState(false); // NEW: feeds tag wall on/off

  // Roster UI state (local-only)
  const [openRoster, setOpenRoster] = useState(true);
  const [hostilesOnly, setHostilesOnly] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  const viewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    viewRef.current?.scrollTo({ top: viewRef.current.scrollHeight, behavior: "smooth" });
  }, [history, intro]);

  // Pull a snapshot for the roster UI (re-computed on render; inexpensive)
  const { entries } = getRosterSnapshot();

  // Ensure the player is included in the roster
  const playerEntry: RosterEntry = {
    id: 'player-id',
    name: 'Player',
    kind: 'humanoid',
    attitude: 'friendly',
    distanceM: 0,
    cover: null,
    status: [],
  };

  // Add player entry to the entries list if not already present
  const allEntries = entries.some(e => e.id === playerEntry.id) ? entries : [playerEntry, ...entries];

  // Convert RosterEntry objects to EntitySpawn objects
  const entitySpawns: EntitySpawn[] = allEntries.map(entry => ({
    kind: "humanoid", // Assuming all entries are humanoid for simplicity
    raceId: entry.kind, // Assuming kind can be used as raceId
    roleId: "default-role", // Placeholder roleId
    level: 1, // Default level
    count: 1, // Default count
    faction: entry.attitude === "enemy" ? "hostile" : "neutral", // Determine faction based on attitude
  }));

  // Prepare sorted entries using the initiative service
  const sortedEntries = rollInitiative(entitySpawns).map(({ actor, roll }) => {
    if (actor.kind === "humanoid") {
      return {
        actor: {
          id: actor.raceId, // Placeholder for id
          name: actor.raceId, // Placeholder for name
          kind: actor.raceId, // Placeholder for kind
          attitude: actor.faction === "hostile" ? "enemy" as Attitude : "neutral" as Attitude, // Convert faction to attitude
          distanceM: 0, // Placeholder for distance
          cover: null, // Placeholder for cover
          status: [], // Placeholder for statusone last time
        },
        roll,
      };
    } else {
      return {
        actor: {
          id: actor.speciesId, // Placeholder for id
          name: actor.speciesId, // Placeholder for name
          kind: actor.speciesId, // Placeholder for kind
          attitude: "neutral" as Attitude, // Default attitude
          distanceM: 0, // Placeholder for distance
          cover: null, // Placeholder for cover
          status: [], // Placeholder for status
        },
        roll,
      };
    }
  });

  // --- utility: pull numbered options from the most recent assistant message
  function extractNumberedOptionsFrom(text: string): Record<string, string> {
    // Matches lines that start with "1. Something", "2) Something", "3 - Something", etc.
    // We capture the number and the rest of the line as the option text.
    const lines = text.split(/\r?\n/);
    const map: Record<string, string> = {};
    for (const line of lines) {
      const m = line.match(/^\s*([1-5])[\.\)\-:]\s+(.*\S)\s*$/);
      if (m) {
        const num = m[1];
        const optionText = m[2];
        map[num] = optionText;
      }
    }
    return map;
  }

  // Get the latest assistant text (the one that listed the options)
  function getLastAssistantMessage(): string | null {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "assistant") return history[i].content || "";
    }
    return null;
  }

  function expandNumericSelectionIfAny(raw: string): string {
    const trimmed = raw.trim();
    // Only handle a bare 1–5 (optionally followed by punctuation/space)
    const m = trimmed.match(/^\s*([1-5])\s*([.!?)\]]+)?\s*$/);
    if (!m) return raw;

    const lastAssistant = getLastAssistantMessage();
    if (!lastAssistant) return raw;

    const options = extractNumberedOptionsFrom(lastAssistant);
    const selected = options[m[1]];
    // If we can resolve it, return that option phrase; otherwise keep the raw input
    return selected ? selected : raw;
  }

  async function unlock(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const r = await fetch("/api/test-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, init: true }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j?.error || "Could not unlock.");
        setLoading(false);
        return;
      }
      setIntro(j.intro || "Welcome to the Moonfell preview.");
      setAuthed(true);
      if (Array.isArray(j?.nearby)) setNearby(j.nearby);
    } catch (e: any) {
      setErr("Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    setErr("");

    // Expand numeric selection to the option text so it behaves as if the player typed it.
    const expanded = expandNumericSelectionIfAny(input);

    // Push the (possibly expanded) text to history as the user’s message
    const userTurn: Turn = { role: "user", content: expanded.trim() };
    setHistory((h) => [...h, userTurn]);
    setInput("");
    setLoading(true);

    try {
      const r = await fetch("/api/test-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passcode,
          message: userTurn.content,
          history,               // keep as-is (server already trims to last N)
          scenarioId: "forest_ambush",
          debug,                 // Arbiter/Observer
          debugRoll,             // Rolls
          debugFeeds,            // NEW: feeds tag wall
          targetId: selectedTargetId ?? undefined
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j?.error || "The engine stumbled.");
        if (j?.detail) console.warn("Engine detail:", j.detail);
        return;
      }
      const reply: string = j.reply || "(no reply)";
      if (Array.isArray(j?.nearby)) setNearby(j.nearby);

      // Optional: separate debug messages if backend ever returns them
      const debugMessages: Turn[] = Array.isArray(j.debugMessages) ? j.debugMessages : [];
      setHistory((h) => [
        ...h,
        ...debugMessages,
        { role: "assistant", content: reply },
      ]);
    } catch (e: any) {
      setErr("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      <section style={styles.card}>
        <header style={styles.headerRow}>
          <div>
            <h1 style={{ margin: 0 }}>Moonfell Playtest (Preview)</h1>
            <p style={{ marginTop: 6, color: "#444" }}>
              Text-only, rules-driven preview. Actions can be anything you can describe. Boundaries are tight for this demo.
            </p>
          </div>
          {/* Roster toggle lives in the header for quick access */}
          {authed && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                style={styles.ghostBtn}
                onClick={() => setOpenRoster((v) => !v)}
                title="Toggle roster sidebar"
              >
                {openRoster ? "Hide Roster" : "Show Roster"}
              </button>
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={hostilesOnly}
                  onChange={(e) => setHostilesOnly(e.target.checked)}
                />
                Hostiles only
              </label>
            </div>
          )}
        </header>

        {!authed ? (
          <form onSubmit={unlock} style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <input
              type="password"
              placeholder="Enter passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              style={styles.input}
              autoFocus
            />
            <button style={styles.button} disabled={loading || !passcode.trim()}>
              {loading ? "Unlocking…" : "Unlock"}
            </button>
          </form>
        ) : (
          <>
            <div ref={viewRef} style={styles.viewport} aria-live="polite">
              {intro && (
                <div style={{ ...styles.bubble, ...styles.assistant }}>
                  <div style={styles.label}>Scenario</div>
                  <div>{intro}</div>
                </div>
              )}
              {history.map((t, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.bubble,
                    ...(t.role === "user" ? styles.user : styles.assistant),
                  }}
                >
                  <div style={styles.label}>{t.role === "user" ? "You" : "Moonfell"}</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{t.content}</div>
                </div>
              ))}
              {loading && (
                <div style={{ ...styles.bubble, ...styles.assistant, opacity: 0.7 }}>
                  <div style={styles.label}>Moonfell</div>
                  <div>Thinking…</div>
                </div>
              )}
            </div>

            {/* Debug toggles + input row */}
            <div style={{ ...styles.inputRow, alignItems: "center", flexWrap: "wrap", rowGap: 8 }}>
              {/* Arbiter/Observer debug */}
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={debug}
                  onChange={(e) => setDebug(e.target.checked)}
                />
                Debug
              </label>

              {/* Rolls debug */}
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={debugRoll}
                  onChange={(e) => setDebugRoll(e.target.checked)}
                />
                Rolls
              </label>

              {/* Feeds toggle */}
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={debugFeeds}
                  onChange={(e) => setDebugFeeds(e.target.checked)}
                />
                Feeds
              </label>

              <form onSubmit={send} style={{ display: "flex", gap: 8, flex: 1, minWidth: 380 }}>
                <input
                  type="text"
                  placeholder="Describe exactly what you do…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  style={styles.input}
                />
                <button style={styles.button} disabled={loading || !input.trim()}>
                  Send
                </button>
              </form>
            </div>
          </>
        )}

        {err && (
          <div style={{ marginTop: 10, color: "#b00020", fontSize: 14 }} role="alert">
            {err}
          </div>
        )}
      </section>

      {/* Roster sidebar — fixed-position; safe to mount at root */}
      {authed && (
        <RosterSidebar
          sortedEntries={sortedEntries}
          open={openRoster}
          onToggle={() => setOpenRoster((v) => !v)}
          hostilesOnly={hostilesOnly}
          onToggleHostiles={setHostilesOnly}
          selectedTargetId={selectedTargetId}
          onSelectTarget={setSelectedTargetId}
          isActionTargeting={false}
        />
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(180deg, #0b0f17 0%, #121826 100%)",
    padding: "2vh 2vw",
  },
  card: {
    width: "min(1800px, 95vw)",
    height: "min(95vh, 1200px)",
    background: "white",
    borderRadius: 16,
    padding: "2vh 2vw",
    boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
    display: "flex",
    flexDirection: "column",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
  },
  viewport: {
    border: "1px solid #eee",
    borderRadius: 12,
    padding: "1.2rem",
    marginTop: 12,
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    background: "#fafafa",
  },
  bubble: {
    borderRadius: 12,
    padding: 12,
    margin: "8px 0",
    lineHeight: 1.5,
    fontSize: 16,
    color: "#000",
  },
  user: { background: "#e7f1ff", border: "1px solid #cfe4ff", color: "#000" },
  assistant: { background: "#f3f4f6", border: "1px solid #e5e7eb", color: "#000" },
  label: { fontSize: 13, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  inputRow: {
    marginTop: 12,
    display: "flex",
    gap: 12,
  },
  checkbox: { display: "inline-flex", alignItems: "center", gap: 8, marginRight: 8 },
  input: {
    flex: 1,
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    fontSize: 18,
  },
  button: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    background: "#111827",
    color: "white",
    cursor: "pointer",
    fontSize: 18,
  },
  ghostBtn: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #cfd3db",
    background: "#fff",
    color: "#111827",
    cursor: "pointer",
    fontSize: 14,
  },
};