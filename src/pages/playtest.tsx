import { FormEvent, useEffect, useRef, useState } from "react";

type Turn = { role: "user" | "assistant"; content: string };

export default function Playtest() {
  const [passcode, setPasscode] = useState("");
  const [authed, setAuthed] = useState(false);
  const [intro, setIntro] = useState<string>("");
  const [history, setHistory] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const viewRef = useRef<HTMLDivElement>(null);

  // scroll to bottom on new message
  useEffect(() => {
    viewRef.current?.scrollTo({ top: viewRef.current.scrollHeight, behavior: "smooth" });
  }, [history, intro]);

  async function unlock(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      // hit API with init=true to get scenario intro (no token spend on our side)
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
    const userTurn: Turn = { role: "user", content: input.trim() };
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
          history,
          scenarioId: "forest_ambush",
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j?.error || "The engine stumbled.");
        if (j?.detail) console.warn("Engine detail:", j.detail);
        return;
      }
      const reply: string = j.reply || "(no reply)";
      setHistory((h) => [...h, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setErr("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      <section style={styles.card}>
        <h1 style={{ margin: 0 }}>Moonfell Playtest (Preview)</h1>
        <p style={{ marginTop: 6, color: "#666" }}>
          Text-only, rules-driven preview. Actions can be anything you can describe. Boundaries are tight for this demo.
        </p>

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

            <form onSubmit={send} style={{ marginTop: 12, display: "flex", gap: 8 }}>
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
          </>
        )}

        {err && (
          <div style={{ marginTop: 10, color: "#b00020", fontSize: 14 }} role="alert">
            {err}
          </div>
        )}
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(180deg, #0b0f17 0%, #121826 100%)",
    padding: 16,
  },
  card: {
    width: "min(900px, 100%)",
    background: "white",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
  },
  viewport: {
    border: "1px solid #eee",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    height: 420,
    overflow: "auto",
    background: "#fafafa",
  },
  bubble: {
    borderRadius: 12,
    padding: 12,
    margin: "8px 0",
    lineHeight: 1.4,
    fontSize: 15,
    color: "#000", // Force black text
  },
  user: { background: "#e7f1ff", border: "1px solid #cfe4ff", color: "#000" },
  assistant: { background: "#f3f4f6", border: "1px solid #e5e7eb", color: "#000" },
  label: { fontSize: 12, color: "#666", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  input: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    fontSize: 16,
  },
  button: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    background: "#111827",
    color: "white",
    cursor: "pointer",
    fontSize: 16,
  },
};
