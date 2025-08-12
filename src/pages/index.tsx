import { FormEvent, useEffect, useState } from 'react';

function useUTM() {
  const [utm, set] = useState<Record<string, string>>({});
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
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
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [err, setErr] = useState<string>('');
  const utm = useUTM();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('loading');
    setErr('');
    const f = e.currentTarget as any;
    const data = {
      name: f.name.value.trim(),
      email: f.email.value.trim(),
      consent: f.consent.checked,
      utm,
      hp: f.website.value, // honeypot
    };
    if (data.hp) {
      // Bot: pretend success
      setStatus('ok');
      return;
    }
    const r = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setStatus(r.ok ? 'ok' : 'err');
    if (!r.ok) {
      try {
        const j = await r.json();
        setErr(j.error || 'Something went wrong');
      } catch {
        setErr('Something went wrong');
      }
    }
  }

  return (
    <main>
      <section className="hero">
        <div className="kicker">Moonfell</div>
        <h1>No menus. No limits. Just imagination.</h1>
        <p className="sub">
          A <strong>text‑based</strong> fantasy framework where you can try anything you can imagine — and the world will respond within the Rules of Moonfell.
        </p>
        <blockquote>
          <p>
            The rope bridge sways over the gorge. Bandits close in behind you.
            <br />
            Most games give you three buttons: attack, defend, flee.
            <br />
            In Moonfell, you can cut the bridge, stake it down, and swing across.
            <br />
            If you’ve got the strength and timing, you escape. If you don’t, you’re the one who falls.
          </p>
        </blockquote>
      </section>

      <h2>Not a menu of options. A world that reacts to you.</h2>
      <p>
        In Moonfell, your actions are whatever you can describe— in your own words. The framework checks your skills, the terrain, the timing, the weather, the distance, and the instincts of every
        creature and character in the world. The outcome is always grounded in the Rules of Moonfell.
      </p>

      <h2>The Rules of Moonfell</h2>
      <ul>
        <li>
          <strong>Consistent</strong> — The same rules apply to you, your allies, and your enemies.
        </li>
        <li>
          <strong>Responsive</strong> — Every action is tested against stats, skills, and the environment.
        </li>
        <li>
          <strong>Unscripted</strong> — No two solutions are the same.
        </li>
      </ul>

      <div className="grid">
        <div>
          <h3>Combat Freedom</h3>
          <p>
            <em>
              Most games give you “attack” or “defend.” In Moonfell, you can grab a stump, brace, and rip a spider from its web. If you’re strong, close, and quick enough, it works. If not, it pulls you
              closer.
            </em>
          </p>
        </div>
        <div>
          <h3>Environment Interaction</h3>
          <p>
            <em>
              Most games give you “cross” or “don’t cross.” In Moonfell, you can cut the bridge to drop your pursuers, stake the rope, and haul yourself over. If you’ve got the timing and grip, you make
              it. If not, the gorge wins.
            </em>
          </p>
        </div>
        <div>
          <h3>Dynamic Conversation</h3>
          <p>
            <em>
              Most games give you a “Talk” option with a set list of responses. In Moonfell, you can say anything you want. Ask a guard about their family. Ask a merchant what they did last Tuesday. Ask a
              sailor their favourite colour. Maybe they’ll know the answer. Maybe they won’t. Maybe they’ll tell you something you never expected.
            </em>
          </p>
        </div>
        <div>
          <h3>Live Any Life</h3>
          <p>
            You could be the Tavern Champion, rule the wilds, become a pirate, or map the frontier. If you can imagine it — and the Rules of Moonfell allow it — you can live it.
          </p>
        </div>
      </div>

      <h2>Can I…?</h2>
      <ul>
        <li>
          <strong>Be a pirate?</strong> Yes. Steal a ship, find a crew, take over a port.
        </li>
        <li>
          <strong>Run a thieves’ guild?</strong> Yes. Recruit, plot, and carve out a territory.
        </li>
        <li>
          <strong>Build a floating city?</strong> If you can gather the resources, yes.
        </li>
        <li>
          <strong>Charm my way onto a noble’s council?</strong> Yes. If you have the wit, charm, and timing.
        </li>
      </ul>

      <h2>One life. Endless adventures.</h2>
      <p>
        When you die in Moonfell, your story ends. One life makes every adventure real — fragile with peril, but every achievement becomes an accomplishment worth remembering. Start fresh, try something
        different, and see where the Rules of Moonfell take you next.
      </p>

      <section id="signup">
        <h2>The frontier opens soon.</h2>
        {status === 'ok' ? (
          <p>Thanks! Check your inbox to confirm your email.</p>
        ) : (
          <form className="form" onSubmit={onSubmit}>
            <input type="text" name="name" placeholder="Name (optional)" autoComplete="name" />
            <input type="email" name="email" placeholder="Email" autoComplete="email" required />
            {/* honeypot */}
            <input type="text" name="website" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
            <label>
              <input type="checkbox" name="consent" required /> I agree to receive updates about Moonfell and accept the{' '}
              <a href="/privacy">Privacy Policy</a>.
            </label>
            <button disabled={status === 'loading'}>{status === 'loading' ? 'Joining…' : 'Join the Frontier'}</button>
            {status === 'err' && <small>{err}</small>}
          </form>
        )}
        <small>
          <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
        </small>
      </section>
    </main>
  );
}
