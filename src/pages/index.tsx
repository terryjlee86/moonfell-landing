// pages/index.tsx
import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";

// HERO: picked Hero1 for both
const HERO_DESKTOP = "/images/hero/Desktop/Hero1D.webp";
const HERO_MOBILE = "/images/hero/Mobile/Hero1M.webp";

// FEATURES
const FEATURE_IMAGES = [
  { src: "/images/feature/SquareBook.webp", alt: "Journal page with living script", title: "Text-First RPG", body: "All play is prose. Describe anything you can imagine; the world answers in kind." },
  { src: "/images/feature/SquareDice.webp", alt: "Carved dice over a weathered map", title: "Rules-Driven Simulation", body: "Behind the scenes: stats, dice, distance rings, light & noise. The frontier plays fair." },
  { src: "/images/feature/SquareBridge.webp", alt: "Frontier bridge in moonlight", title: "Persistent Frontier", body: "Single-player, shared world. Your actions leave traces others may discover later." },
];

// UTM helper
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

// Pixel + GA event helpers
const fbqEvent = (name: string) => {
  if (typeof window !== "undefined" && (window as any).fbq) {
    (window as any).fbq("track", name);
  }
};
const gaEvent = (action: string, params?: Record<string, any>) => {
  if (typeof window !== "undefined" && (window as any).gtag) {
    (window as any).gtag("event", action, params);
  }
};

export default function Home() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [err, setErr] = useState<string>("");
  const utm = useUTM();

  const handleCtaClick = () => {
    gaEvent("click_signup_cta", { location: "signup_card", page: "landing" });
    fbqEvent("Lead");
  };

  const handleDiscordClick = () => {
    gaEvent("click_discord", { location: "footer", page: "landing" });
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
      {/* HERO */}
      <section className="relative isolate">
        {/* Desktop background */}
        <div className="hidden md:block absolute inset-0 -z-10">
          <Image src={HERO_DESKTOP} alt="Moonfell hero" fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60" />
        </div>
        {/* Mobile background */}
        <div className="md:hidden absolute inset-0 -z-10">
          <Image src={HERO_MOBILE} alt="Moonfell hero mobile" fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/70" />
        </div>

        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-16 md:py-24 lg:py-28 flex flex-col items-start">
          <Image src="/logo-moonfell.svg" alt="Moonfell" width={360} height={120} priority />
          <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-extrabold leading-tight text-white">
            Write your legend into the wilds.
          </h1>
          <p className="mt-3 text-lg md:text-xl text-white/90">
            Limitless actions in a world that reacts with logic and law.
          </p>
        </div>
      </section>

      {/* SIGNUP */}
      <section id="signup" className="py-10 sm:py-14">
        <div className="mx-auto max-w-[520px] px-4">
          {status === "ok" ? (
            <p>Thanks! Check your inbox to confirm your email.</p>
          ) : (
            <form className="form" onSubmit={onSubmit}>
              <input type="text" name="name" placeholder="Name (optional)" autoComplete="name" />
              <input type="email" name="email" placeholder="Email" autoComplete="email" required />
              <input type="text" name="website" style={{ display: "none" }} tabIndex={-1} autoComplete="off" />
              <label>
                <input type="checkbox" name="consent" required /> I agree to receive updates about Moonfell and accept the{" "}
                <a href="/privacy">Privacy Policy</a>.
              </label>
              <button onClick={handleCtaClick} disabled={status === "loading"}>
                {status === "loading" ? "Joining…" : "Join the Frontier"}
              </button>
              {status === "err" && <small>{err}</small>}
            </form>
          )}
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-10 sm:py-12">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURE_IMAGES.map((f) => (
              <article key={f.src} className="rounded-2xl overflow-hidden border border-white/10 bg-black/30">
                <div className="relative aspect-square">
                  <Image src={f.src} alt={f.alt} fill sizes="(max-width:768px) 100vw, (max-width:1024px) 50vw, 33vw" className="object-cover" loading="lazy" />
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

      {/* DISCORD CTA */}
      <section className="py-8 text-center">
        <a
          onClick={handleDiscordClick}
          href="https://discord.gg/hdafA58Nn"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-lg bg-[#5865F2] px-6 py-3 font-semibold text-white hover:brightness-95"
        >
          Join our Discord Community
        </a>
      </section>
    </main>
  );
}
