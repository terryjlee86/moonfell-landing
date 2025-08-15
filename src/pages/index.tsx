// src/pages/index.tsx
import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { gaEvent, fbqEvent } from "../lib/analytics";

/** HERO IMAGES */
const HERO_DESKTOP = "/images/hero/Desktop/Hero1D.webp";
const HERO_MOBILE = "/images/hero/Mobile/Hero1M.webp";

/** FEATURE IMAGES */
const FEATURE_IMAGES = [
  {
    src: "/images/feature/SquareBook.webp",
    alt: "Journal page with living script",
    title: "Text-First RPG",
    body: "All play is prose. Describe anything you can imagine; the world answers in kind.",
  },
  {
    src: "/images/feature/SquareDice.webp",
    alt: "Carved dice over a weathered map",
    title: "Rules-Driven Simulation",
    body: "Behind the scenes: stats, dice, distance rings, light & noise. The frontier plays fair.",
  },
  {
    src: "/images/feature/SquareBridge.webp",
    alt: "Frontier bridge in moonlight",
    title: "Persistent Frontier",
    body: "Single-player, shared world. Your actions leave traces others may discover later.",
  },
];

/** Capture UTM parameters */
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

  // ---- Micro-conversion handlers ----
  const handleCtaClick = () => {
    gaEvent("click_signup_cta", { location: "signup_card", page: "landing" });
    fbqEvent("Lead");
  };

  const handleDiscordClick = () => {
    gaEvent("click_discord", { location: "signup_card", page: "landing" });
    fbqEvent("Contact");
  };

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
    if (data.hp) {
      setStatus("ok");
      return;
    }
    try {
      const r = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      setStatus(r.ok ? "ok" : "err");
      if (r.ok) {
        gaEvent("signup", { method: "beehiiv" });
        fbqEvent("CompleteRegistration");
      } else {
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
        <div className="relative w-full h-[70vh] md:h-[82vh]">
          {/* Desktop */}
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
          {/* Mobile */}
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
          {/* Fade into page */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[var(--bg)] pointer-events-none" />
        </div>

        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 -mt-[56vh] md:-mt-[66vh] pb-8 md:pb-12">
          <div className="max-w-[720px]">
            {/* LOGO wordmark (left-aligned) — ~3× larger */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-moonfell.svg"
              alt="Moonfell"
              className="h-[120px] md:h-[144px] w-auto select-none"
              draggable={false}
            />
            <h1 className="mt-4 text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight text-white">
              Write your legend into the wilds.
            </h1>
            <p className="mt-3 text-lg md:text-xl text-white/90">
              Limitless actions in a world that reacts with logic and law.
            </p>
          </div>
        </div>
      </section>

      {/* ========================= SIGNUP (below hero) ========================= */}
      <section id="signup" className="mx-auto max-w-[900px] px-5 mt-48 sm:mt-56 md:mt-72 lg:mt-80 mb-10">
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
                  onClick={handleCtaClick}
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

          {/* Discord (permanent invite) */}
          <div className="mt-4">
            <a
              onClick={handleDiscordClick}
              href="https://discord.gg/hdafA58Nn"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg bg-[#5865F2] px-4 py-2 font-semibold text-white hover:brightness-95"
            >
              Join our Discord Community
            </a>
          </div>

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

      {/* ========================= LORE / SYSTEM COPY ========================= */}
      <section className="mx-auto max-w-[900px] px-5 pb-4">
        <h2 className="text-2xl md:text-3xl font-semibold">A world that listens — and pushes back.</h2>
        <p className="mt-2">
          Describe your intent in your own words. Moonfell resolves outcomes with stats, distance, timing, light and noise,
          and the instincts of every creature in play. The result is simulation first — narrative second.
        </p>

        <h2 className="mt-8 text-2xl md:text-3xl font-semibold">The Rules of Moonfell</h2>
        <ul className="list-disc pl-6 space-y-2 mt-2">
          <li><strong>Consistent</strong> — The same rules apply to you, your allies, and your enemies.</li>
          <li><strong>Responsive</strong> — Every action is tested against stats, skills, and environment.</li>
          <li><strong>Unscripted</strong> — No fixed choices. Creativity matters.</li>
        </ul>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-6">
          <div>
            <h3 className="text-lg font-semibold">Combat Freedom</h3>
            <p className="mt-1 text-[var(--muted)]">
              Brace on a stump and rip a spider from its web. If you’re strong, close, and quick enough — it works. If not, you’re pulled in.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Environment Interaction</h3>
            <p className="mt-1 text-[var(--muted)]">
              Cut a rope bridge, stake it, and swing across — if timing and grip checks pass. Fail, and the gorge decides.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Dynamic Conversation</h3>
            <p className="mt-1 text-[var(--muted)]">
              Say anything. Persuasion rolls test Charisma against willpower and wit — and critical failures can turn tempers.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Live Any Life</h3>
            <p className="mt-1 text-[var(--muted)]">
              Map the frontier, raise a sky-city, rule a port, or vanish into the wilds. If the rules allow it, it’s possible.
            </p>
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
                Moonfell is a text-first, single-player frontier RPG. You describe actions in your own words; the world responds using rules, stats and dice under the hood.
              </div>
            </details>
            <details className="group rounded-xl border border-white/10 bg-black/20 p-4 open:bg-black/30">
              <summary className="cursor-pointer list-none font-semibold">How do I join the playtest?</summary>
              <div className="mt-2 text-[var(--muted)]">
                Add your email above. We’ll invite waitlisters in waves and send regular development updates.
              </div>
            </details>
            <details className="group rounded-xl border border-white/10 bg-black/20 p-4 open:bg-black/30">
              <summary className="cursor-pointer list-none font-semibold">Is it really single-player but a shared world?</summary>
              <div className="mt-2 text-[var(--muted)]">
                Yes. You play at your own pace, but the world persists. Changes you cause can be found by other players later (no real-time multiplayer).
              </div>
            </details>
            <details className="group rounded-xl border border-white/10 bg-black/20 p-4 open:bg-black/30">
              <summary className="cursor-pointer list-none font-semibold">Is it text-only?</summary>
              <div className="mt-2 text-[var(--muted)]">
                In-game presentation is prose. You can attempt any reasonable action you can describe; outcomes are grounded in stats, skills, distance, light/noise, and dice.
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
