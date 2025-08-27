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
    try {
      localStorage.setItem("moonfell_utm", JSON.stringify(obj));
    } catch {}
  }, []);
  return utm;
}

export default function Home() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [err, setErr] = useState<string>("");
  const utm = useUTM();

  // Discord micro-conversion
  const handleDiscordClick = () => {
    gaEvent("click_discord", { location: "signup_card", page: "landing" });
    fbqEvent("Contact");
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErr("");

    const f = e.currentTarget as any;

    // Fallback to persisted UTM if hook is empty
    let utmPayload = utm;
    try {
      if (!utmPayload || Object.keys(utmPayload).length === 0) {
        const fromStorage = JSON.parse(localStorage.getItem("moonfell_utm") || "{}");
        if (fromStorage && typeof fromStorage === "object") utmPayload = fromStorage;
      }
    } catch {}

    const data = {
      name: f.name.value.trim(),
      email: f.email.value.trim(),
      consent: f.consent.checked,
      utm: utmPayload,
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

          {/* Foreground copy */}
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 pt-10 md:pt-14">
            <div className="max-w-[720px]">
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

          {/* Soft fade */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[var(--bg)] pointer-events-none" />

          {/* ========================= SIGNUP OVERLAY ========================= */}
          <div
            id="signup"
            className="
              absolute inset-0 z-50 px-5
              flex items-end justify-center
              pb-12 sm:pb-16 md:pb-20
              pointer-events-none
            "
          >
            <div className="w-full max-w-[560px] pointer-events-auto">
              <div className="rounded-2xl border border-white/10 bg-black/70 backdrop-blur p-5 sm:p-6 shadow-2xl">
                <h2 className="text-xl sm:text-2xl font-semibold text-white">
                  The frontier opens soon.
                </h2>

                {status === "ok" ? (
                  <p className="mt-2 text-[var(--muted)]" aria-live="polite">
                    Thanks! Check your inbox to confirm your email.
                  </p>
                ) : (
                  <form onSubmit={onSubmit} className="mt-3" noValidate>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        id="name"
                        className="w-full sm:flex-1 rounded-lg border border-[#2b2b2b] bg-[#121416] px-3 py-3 text-[var(--fg)]"
                        type="text"
                        name="name"
                        placeholder="Name (optional)"
                        autoComplete="name"
                      />
                      <input
                        id="email"
                        className="w-full sm:flex-1 rounded-lg border border-[#2b2b2b] bg-[#121416] px-3 py-3 text-[var(--fg)]"
                        type="email"
                        name="email"
                        placeholder="Email"
                        autoComplete="email"
                        required
                        inputMode="email"
                      />
                      <button
                        disabled={status === "loading"}
                        className="rounded-lg px-4 py-3 font-semibold bg-[var(--accent)] text-[#1a1714] disabled:opacity-70"
                        aria-busy={status === "loading" ? "true" : "false"}
                      >
                        {status === "loading" ? "Joining…" : "Join the Frontier"}
                      </button>
                    </div>

                    {/* honeypot */}
                    <input type="text" name="website" className="hidden" tabIndex={-1} autoComplete="off" />

                    <label htmlFor="consent" className="mt-3 flex gap-2 text-sm text-[var(--muted)]">
                      <input id="consent" type="checkbox" name="consent" required />
                      <span>
                        I agree to receive updates about Moonfell and accept the{" "}
                        <a className="underline" href="/privacy">Privacy Policy</a>.
                      </span>
                    </label>

                    {status === "err" && (
                      <small className="mt-2 block text-red-300" role="alert">
                        {err}
                      </small>
                    )}
                  </form>
                )}

                <div className="mt-4">
                  <a
                    onClick={handleDiscordClick}
                    href="https://discord.gg/hdafA58Nn"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Join our Discord Community (opens in a new tab)"
                    className="inline-block rounded-lg bg-[#5865F2] px-4 py-2 font-semibold text-white hover:brightness-95"
                  >
                    Join our Discord Community
                  </a>
                </div>

                <small className="mt-2 block text-[var(--muted)]">
                  <a className="underline" href="/privacy">Privacy</a> · <a className="underline" href="/terms">Terms</a>
                </small>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Spacer */}
      <div className="h-10 md:h-16" />

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

      {/* ========================= LORE ========================= */}
      {/* (unchanged from your original) */}
    </main>
  );
}