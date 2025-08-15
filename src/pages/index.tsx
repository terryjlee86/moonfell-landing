// src/pages/index.tsx
import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";

/** -------------------------------------------
 *  HERO IMAGES (switch later by editing these)
 *  ------------------------------------------ */
const HERO_DESKTOP = "/images/hero/Desktop/Hero1D.webp";
const HERO_MOBILE  = "/images/hero/Mobile/Hero1M.webp";

/** FEATURES: one image per feature (square-ish) */
const FEATURE_IMAGES = [
  {
    src: "/images/feature/SquareBook.webp",
    alt: "Journal page with living script",
    title: "Text‑First RPG",
    body: "All play is prose. Describe anything you can imagine; the world answers in kind.",
  },
  {
    src: "/images/feature/SquareDice.webp",
    alt: "Carved dice over a weathered map",
    title: "Rules‑Driven Simulation",
    body: "Behind the scenes: stats, dice, distance rings, light & noise. The frontier plays fair.",
  },
  {
    src: "/images/feature/SquareBridge.webp",
    alt: "Frontier bridge in moonlight",
    title: "Persistent Frontier",
    body: "Single‑player, shared world. Your actions leave traces others may discover later.",
  },
];

/** UTM helper (original logic) */
function useUTM() {
  const [utm, set] = useState<Record<string, string>>({});
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
    const obj: Record<string, string> = {};
    keys.forEach((k) => {
      const v = p.get(k);
      if (v) obj[k] = v;
    });
    set(obj);
  }, []);
  return utm;
}

export default function Home() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [err, setErr] = useState<string>("");
  const utm = useUTM();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErr("");
    const f = e.currentTarget as any;
    const data = {
      name: f.name.value.trim(),
      email: f.email.value.trim(),
      consent: f.consent.checked,
      utm,
      hp: f.website.value, // honeypot
    };
    if (data.hp) { setStatus("ok"); return; }
    try {
      const r = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setStatus(r.ok ? "ok" : "err");
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error || "Something went wrong");
      }
    } catch {
      setStatus("err");
      setErr("Network error");
    }
  }

  return (
    <main className="bg-[var(--bg)] text-[var(--fg)]">
      {/* ========================= HERO ========================= */}
      <section className="relative isolate">
        {/* Background (taller, biased to show the top of the image) */}
        <div className="relative w-full h-[70vh] md:h-[82vh]">
          {/* Desktop background */}
          <div className="hidden md:block absolute inset-0 -z-10">
            <Image
              src={HERO_DESKTOP}
              alt="Moonfell hero"
              fill
              priority
              sizes="100vw"
              className="object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/70" />
          </div>
          {/* Mobile background */}
          <div className="md:hidden absolute inset-0 -z-10">
            <Image
              src={HERO_MOBILE}
              alt="Moonfell hero mobile"
              fill
              priority
              sizes="100vw"
              className="object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/75" />
          </div>

          {/* Soft fade into page bg to avoid a harsh cut */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[var(--bg)] pointer-events-none" />
        </div>

        {/* Foreground copy (no overlap now) */}
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 -mt-[56vh] md:-mt-[66vh] pb-8 md:pb-12">
          <div className="max-w-[720px]">
            {/* <img src="/logo-moonfell.svg" alt="Moonfell" className="h-10 md:h-12 w-auto select-none" draggable={false}/> */}
            <div className="uppercase tracking-[0.14em] text-sm text-[var(--accent)] font-bold">Moonfell</div>
            <h1 className="mt-2 text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight text-white">
              Write your legend into the wilds.
            </h1>
            <p className="mt-3 text-lg md:text-xl text-white/90">
              Limitless actions in a world that reacts with logic and law.
            </p>
          </div>
        </div>
      </section>

      {/* ========================= SIGNUP (much lower, before features) ========================= */}
      <section id="signup" className="mx-auto max-w-[900px] px-5 mt-24 sm:mt-28 md:mt-40 lg:mt-48 mb-10">
        <div className="rounded-2xl border border-white/10 bg-black/60 backdrop-blur p-5 sm:p-6 shadow-xl">
          <h2 className="text-xl sm:text-2xl font-semibold">The frontier opens soon.</h2>
          {status === "ok" ? (
            <p className="mt-2 text-[var(--muted)]">Thanks! Check your inbox to confirm your email.</p>
          ) : (
            <form onSubmit={onSubmit} className="mt-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  className="flex-1 rounded-lg border border-[#2b2b2b] bg-[#121416] px-3 py-3 text-[var(--fg)]"
                  type="text"
                  name="name"
                  placeholder="Name (optional)"
                  autoComplete="name"
                />
                <input
                  className="flex-1 rounded-lg border border-[#2b2b2b] bg-[#121416] px-3 py-3 text-[var(--fg)]"
                  type="email"
                  name="email"
                  placeholder="Email"
                  autoComplete="email"
                  required
                />
                <button
                  disabled={status === "loading"}
                  className="rounded-lg px-4 py-3 font-semibold bg-[var(--accent)] text-[#1a1714] disabled:opacity-70"
                >
                  {status === "loading" ? "Joining…" : "Join the Frontier"}
                </button>
              </div>

              {/* honeypot */}
              <input type="text" name="website" className="hidden" tabIndex={-1} autoComplete="off" />

              <label className="mt-3 flex gap-2 text-sm text-[var(--muted)]">
                <input type="checkbox" name="consent" required />
                <span>
                  I agree to receive updates about Moonfell and accept the{" "}
                  <a className="underline" href="/privacy">Privacy Policy</a>.
                </span>
              </label>

              {status === "err" && <small className="mt-2 block text-red-300">{err}</small>}
            </form>
          )}
          <small className="mt-2 block text-[var(--muted)]">
            <a className="underline" href="/privacy">Privacy</a> · <a className="underline" href="/terms">Terms</a>
          </small>
        </div>
      </section>

      {/* ========================= FEATURES ========================= */}
      <section className="py-8 sm:py-10">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURE_IMAGES.map((f) => (
              <article key={f.src} className="rounded-2xl overflow-hidden border border-white/10 bg-black/30">
                <div className="relative aspect-[4/3]">
                  <Image
                    src={f.src}
                    alt={f.alt}
                    fill
                    sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
                    className="object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent pointer-events-none" />
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-[var(--muted)] text-sm leading-relaxed">{f.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ========================= LONG COPY ========================= */}
      <section className="mx-auto max-w-[900px] px-5 pb-4">
        <h2>Not a menu of options. A world that reacts to you.</h2>
        <p>
          In Moonfell, your actions are whatever you can describe— in your own words. The framework checks your skills, the terrain, the timing, the weather, the distance, and the instincts of every
          creature and character in the world. The outcome is always grounded in the Rules of Moonfell.
        </p>

        <h2>The Rules of Moonfell</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Consistent</strong> — The same rules apply to you, your allies, and your enemies.</li>
          <li><strong>Responsive</strong> — Every action is tested against stats, skills, and the environment.</li>
          <li><strong>Unscripted</strong> — No two solutions are the same.</li>
        </ul>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-4">
          <div>
            <h3>Combat Freedom</h3>
            <p><em>Most games give you “attack” or “defend.” In Moonfell, you can grab a stump, brace, and rip a spider from its web. If you’re strong, close, and quick enough, it works. If not, it pulls you closer.</em></p>
          </div>
          <div>
            <h3>Environment Interaction</h3>
            <p><em>Most games give you “cross” or “don’t cross.” In Moonfell, you can cut the bridge to drop your pursuers, stake the rope, and haul yourself over. If you’ve got the timing and grip, you make it. If not, the gorge wins.</em></p>
          </div>
          <div>
            <h3>Dynamic Conversation</h3>
            <p><em>Most games give you a “Talk” option with a set list of responses. In Moonfell, you can say anything you want. Ask a guard about their family. Ask a merchant what they did last Tuesday. Ask a sailor their favourite colour. Maybe they’ll know the answer. Maybe they won’t. Maybe they’ll tell you something you never expected.</em></p>
          </div>
          <div>
            <h3>Live Any Life</h3>
            <p>You could be the Tavern Champion, rule the wilds, become a pirate, or map the frontier. If you can imagine it — and the Rules of Moonfell allow it — you can live it.</p>
          </div>
        </div>
      </section>

      {/* ========================= FAQ ========================= */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-[900px] px-5 py-12">
          <h2 className="text-2xl md:text-3xl font-semibold mb-4">FAQ</h2>
          <div className="space-y-3">
            <details className="group rounded-xl border border-white/10 bg-black/20 p-4 open:bg-black/30">
              <summary className="cursor-pointer list-none font-semibold">What is Moonfell?</summary>
              <div className="mt-2 text-[var(--muted)]">
                Moonfell is a text‑first, single‑player frontier RPG. You describe actions in your own words; the world responds using rules, stats and dice under the hood.
              </div>
            </details>
            <details className="group rounded-xl border border-white/10 bg-black/20 p-4 open:bg-black/30">
              <summary className="cursor-pointer list-none font-semibold">How do I join the playtest?</summary>
              <div className="mt-2 text-[var(--muted)]">
                Add your email above. We’ll invite waitlisters in waves and send regular development updates.
              </div>
            </details>
            <details className="group rounded-xl border border-white/10 bg-black/20 p-4 open:bg-black/30">
              <summary className="cursor-pointer list-none font-semibold">Is it really single‑player but a shared world?</summary>
              <div className="mt-2 text-[var(--muted)]">
                Yes. You play at your own pace, but the world persists. Changes you cause can be found by other players later (no real‑time multiplayer).
              </div>
            </details>
            <details className="group rounded-xl border border-white/10 bg-black/20 p-4 open:bg-black/30">
              <summary className="cursor-pointer list-none font-semibold">Is it text‑only?</summary>
              <div className="mt-2 text-[var(--muted)]">
                In‑game presentation is prose. You can attempt any reasonable action you can describe; outcomes are grounded in stats, skills, distance, light/noise, and dice.
              </div>
            </details>
            <details className="group rounded-xl border border-white/10 bg-black/20 p-4 open:bg-black/30">
              <summary className="cursor-pointer list-none font-semibold">When will it be available?</summary>
              <div className="mt-2 text-[var(--muted)]">
                We’ll announce playtest waves via email. Join the waitlist to be first through the gate.
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* ========================= FOOTER ========================= */}
      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-8 text-sm text-white/80 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Moonfell. All rights reserved.</p>
          <nav className="flex gap-5">
            <a className="hover:text-white" href="/privacy">Privacy</a>
            <a className="hover:text-white" href="/terms">Terms</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
