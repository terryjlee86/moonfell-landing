// src/components/Hero.tsx
import Image from "next/image";

const HERO_DESKTOP = "/images/hero/Desktop/Hero1D.webp";
const HERO_MOBILE = "/images/hero/Mobile/Hero1M.webp";

export default function Hero() {
  return (
    <>
      <div className="relative z-0 w-full h-[70vh] md:h-[82vh]">
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
          <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/55 via-black/35 to-black/70" />
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
          <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/60 via-black/40 to-black/75" />
        </div>

        {/* Foreground copy */}
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 pt-10 md:pt-14 z-0">
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

        {/* Soft fade into page */}
        <div className="absolute inset-x-0 bottom-0 h-24 z-0 bg-gradient-to-b from-transparent to-[var(--bg)] pointer-events-none" />
      </div>
    </>
  );
}