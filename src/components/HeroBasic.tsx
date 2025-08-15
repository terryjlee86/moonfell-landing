// components/HeroBasic.tsx
import Image from "next/image";
import { ReactNode } from "react";
import styles from "../styles/hero.module.css";

type Props = {
  title: string;
  subtitle?: string;
  desktopSrc: string;
  mobileSrc: string;
  children?: ReactNode; // put your existing Beehiiv form JSX here
};

export default function HeroBasic({
  title,
  subtitle,
  desktopSrc,
  mobileSrc,
  children,
}: Props) {
  return (
    <section className={styles.heroSection}>
      {/* Desktop background */}
      <div className={`${styles.bg} ${styles.bgDesktop}`}>
        <Image
          src={desktopSrc}
          alt="Moonfell frontier at night"
          fill
          sizes="100vw"
          priority
          className={styles.bgImage}
        />
        <div className={styles.overlay} />
      </div>

      {/* Mobile background */}
      <div className={`${styles.bg} ${styles.bgMobile}`}>
        <Image
          src={mobileSrc}
          alt="Moonfell frontier at night (mobile)"
          fill
          sizes="100vw"
          priority
          className={styles.bgImage}
        />
        <div className={styles.overlay} />
      </div>

      <div className={styles.inner}>
        <div className={styles.copy}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          <div className={styles.formWrap}>
            {children /* your existing Beehiiv form goes right here */}
          </div>
          <p className={styles.trust}>Text‑first. Rules‑driven. The frontier remembers.</p>
        </div>
      </div>
    </section>
  );
}
