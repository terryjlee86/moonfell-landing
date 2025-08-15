// src/pages/privacy.tsx
import Head from "next/head";

const COMPANY = "Moonfell";
const DOMAIN = "https://yourdomain.com";
const CONTACT_EMAIL = "hello@yourdomain.com";

export default function Privacy() {
  return (
    <>
      <Head>
        <title>Privacy Policy — {COMPANY}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="bg-[var(--bg)] text-[var(--fg)]">
        <section className="mx-auto max-w-[900px] px-5 py-10">
          <h1 className="text-3xl font-semibold">Privacy Policy</h1>
          <p className="mt-2 text-[var(--muted)]">Last updated: {new Date().toLocaleDateString("en-GB")}</p>

          <h2 className="mt-6 text-2xl font-semibold">Who we are</h2>
          <p className="mt-2">
            {COMPANY} (“we”, “us”) operates the website at {DOMAIN}. We build a text-first role-playing experience. This policy explains what
            personal data we collect and how we use it.
          </p>

          <h2 className="mt-6 text-2xl font-semibold">What we collect</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Signup details</strong>: name (optional) and email address.</li>
            <li><strong>Consent flag</strong>: whether you agreed to receive updates.</li>
            <li><strong>UTM tags</strong>: marketing source/medium/campaign if present in the URL.</li>
            <li><strong>Analytics</strong>: page views and events (via Google Analytics 4 / Meta Pixel) using pseudonymous identifiers.</li>
          </ul>

          <h2 className="mt-6 text-2xl font-semibold">How we use data</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>To send newsletters, playtest invitations, and product updates.</li>
            <li>To measure interest and improve the website and product.</li>
            <li>To secure and maintain the service (debugging, preventing abuse).</li>
          </ul>

          <h2 className="mt-6 text-2xl font-semibold">Sharing</h2>
          <p className="mt-2">
            We share data with service providers who help us run {COMPANY}, including our email provider (Beehiiv) and analytics providers (Google/META).
            We do not sell personal data. We may disclose information if required by law or to protect our rights.
          </p>

          <h2 className="mt-6 text-2xl font-semibold">Retention</h2>
          <p className="mt-2">
            We keep your data while you remain subscribed or as needed to provide the service. You can unsubscribe anytime; we then remove you from active mailing lists and
            may retain minimal records to honor future opt-out requests and comply with obligations.
          </p>

          <h2 className="mt-6 text-2xl font-semibold">Your rights</h2>
          <p className="mt-2">
            Depending on where you live (e.g., UK/EU GDPR), you may have rights to access, correct, delete, or object to certain processing. To exercise your rights, contact us at{" "}
            <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>

          <h2 className="mt-6 text-2xl font-semibold">International transfers</h2>
          <p className="mt-2">
            We may process data outside your country. When we transfer data internationally, we rely on appropriate safeguards such as standard contractual clauses.
          </p>

          <h2 className="mt-6 text-2xl font-semibold">Children</h2>
          <p className="mt-2">
            {COMPANY} is not directed to children under 13 (or the minimum age in your jurisdiction). Do not sign up if you are under that age.
          </p>

          <h2 className="mt-6 text-2xl font-semibold">Contact</h2>
          <p className="mt-2">
            Questions about this policy? Email <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </section>
      </main>
    </>
  );
}
