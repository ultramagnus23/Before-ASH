import type { Metadata, Viewport } from "next";
import { display, body, mono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Before ASH",
  description: "A shared bucket list for Ashoka University. Do the thing. Stamp it.",
  manifest: "/manifest.webmanifest",
  // SVG works for Android/desktop PWA installs and most modern browser tab
  // icons. iOS home-screen add (apple-touch-icon) and some older Android
  // launchers need an actual PNG, which no text-based tool can generate —
  // export a 180x180 and a 512x512 PNG from public/icons/icon.svg before
  // launch and add them here as `apple: "/icons/icon-180.png"` and an
  // additional sizes="512x512" type="image/png" entry.
  icons: {
    icon: "/icons/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#1c2540",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <div className="buckram-emboss" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
