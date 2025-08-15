import type { AppProps } from "next/app";
import "../styles/globals.css"; // ✅ correct relative path from src/pages to src/styles

export default function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

