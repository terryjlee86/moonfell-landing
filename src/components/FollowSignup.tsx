// src/components/FollowSignup.tsx
import { useEffect, useState } from "react";

export default function FollowSignup() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      // appear after ~1 screen of scroll, hide near the signup section
      const y = window.scrollY;
      const signup = document.getElementById("signup");
      const nearSignup =
        signup &&
        y + window.innerHeight > signup.offsetTop - 200; // start hiding ~200px before

      setShow(y > 400 && !nearSignup);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  const jump = () => {
    const el = document.getElementById("signup");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="fixed z-40 right-4 bottom-4 md:right-6 md:bottom-6">
      {/* Mobile: full-width tiny dock on very small screens */}
      <div className="md:hidden">
        <button
          onClick={jump}
          className="w-[calc(100vw-2rem)] rounded-xl px-4 py-3 font-semibold shadow-lg bg-[var(--accent)] text-[#1a1714]"
        >
          Join the Frontier
        </button>
      </div>

      {/* Desktop/tablet: floating pill */}
      <div className="hidden md:block">
        <button
          onClick={jump}
          className="rounded-full px-5 py-3 font-semibold shadow-lg bg-[var(--accent)] text-[#1a1714] hover:brightness-95"
        >
          Join the Frontier
        </button>
      </div>
    </div>
  );
}
