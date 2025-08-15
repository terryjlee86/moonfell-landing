// src/pages/terms.tsx
import Head from "next/head";

const COMPANY = "Moonfell";
const DOMAIN = "https://yourdomain.com";
const CONTACT_EMAIL = "hello@yourdomain.com";

export default function Terms() {
  return (
    <>
      <Head>
        <title>Terms of Service — {COMPANY}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="bg-[var(--bg)] text-[var(--fg)]">
        <section className="mx-auto max-w-[900px] px-5 py-10">
          <h1 className="text-3xl font-semibold">Terms of Service</h1>
          <p className="mt-2 text-[var(--muted)]">Last updated: {new Date().toLocaleDateString("en-GB")}</p>

          <h2 className="mt-6 text-2xl font-semibold">Overview</h2>
          <p className="mt-2">
            By accessing {DOMAIN} you agree to these Terms. If you do not agree, do not use the site.
          </p>

          <h2 className="mt-6 text-2xl font-semibold">Use of the site</h2>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>You may browse the site and join our mailing list for updates and playtest invitations.</li>
            <li>You must provide accurate information and keep it up to date.</li>
            <li>You will not attempt to disrupt or misuse the service.</li>
          </ul>

          <h2 className="mt-6 text-2xl font-semibold">Intellectual property</h2>
          <p className="mt-2">
            All content on the site, including art, logos, and text, is owned by {COMPANY} or our licensors and protected by law. You may not copy, distribute, or create derivative works without permission.
          </p>

          <h2 className="mt-6 text-2xl font-semibold">Third-party services</h2>
          <p className="mt-2">
            We use third-party services (e.g., Beehiiv for email, Google/META for analytics). Your use of those services may be subject to their own terms and policies.
          </p>

          <h2 className="mt-6 text-2xl font-semibold">Disclaimers</h2>
          <p className="mt-2">
            The site is provided “as is” without warranties of any kind. We do not guarantee uninterrupted or error-free operation.
          </p>

          <h2 className="mt-6 text-2xl font-semibold">Limitation of liability</h2>
          <p className="mt-2">
            To the fullest extent permitted by law, {COMPANY} will not be liable for indirect, incidental, special, or consequential damages arising out of or related to your use of the site.
          </p>

          <h2 className="mt-6 text-2xl font-semibold">Changes to these Terms</h2>
          <p className="mt-2">
            We may update these Terms from time to time. If we make material changes, we will post the new Terms on this page with a new “Last updated” date.
          </p>

          <h2 className="mt-6 text-2xl font-semibold">Contact</h2>
          <p className="mt-2">
            Questions about these Terms? Email <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </section>
      </main>
    </>
  );
}
