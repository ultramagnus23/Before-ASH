import { Bricolage_Grotesque, Public_Sans, Courier_Prime } from "next/font/google";

/*
 * next/font computes size-adjust/ascent/descent overrides against the
 * closest local fallback automatically (adjustFontFallback, on by default),
 * which is what "fonts with matched fallback metrics" means in practice —
 * no manual @font-face fallback tuning needed.
 */
export const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const body = Public_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const mono = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});
