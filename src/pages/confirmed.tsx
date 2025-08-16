// src/pages/confirmed.tsx
import Head from "next/head";

export default function Confirmed() {
  return (
    <main className="bg-[var(--bg)] text-[var(--fg)] min-h-screen flex items-center justify-center px-6 py-16">
      <Head>
        <title>Moonfell – Subscription Confirmed</title>
      </Head>
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-3xl md:text-4xl font-extrabold">You’re in.</h1>
        <p className="text-lg text-[var(--muted)]">
          Thanks for confirming your subscription to <strong>Moonfell</strong>.
        </p>

        <div className="rounded-2xl border border-white/10 bg-black/50 p-6 space-y-4 shadow-lg">
          <h2 className="text-xl font-semibold">What to Expect Next</h2>
          <ul className="list-disc text-left pl-6 text-[var(--muted)] space-y-2">
            <li>Bi-weekly updates about progress and development.</li>
            <li>Behind-the-scenes looks at lore, mechanics, and playtests.</li>
            <li>Opportunities to join early playtest waves.</li>
          </ul>
        </div>

        <div className="mt-6">
          <a
            href="https://discord.gg/hdafA58Nn"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-[#5865F2] px-5 py-3 font-semibold text-white hover:brightness-95"
          >
            Join our Discord Community
          </a>
        </div>

        <p className="text-sm text-[var(--muted)] mt-6">
          We’re excited to have you with us on the frontier. Watch your inbox for the first update soon.
        </p>
      </div>
    </main>
  );
}
