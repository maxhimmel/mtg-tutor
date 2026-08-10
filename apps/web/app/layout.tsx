import type { Metadata } from "next";
import { Archivo, Fraunces } from "next/font/google";
import { ConvexClientProvider } from "./providers";
// Imported here rather than @import-ed from globals.css so Next resolves the
// font files the stylesheet references relative to itself, in node_modules.
import "mana-font/css/mana.css";
import "./globals.css";

// Grades, headings, and card names. Beleren is what Magic actually sets card
// names in and is not licensable, so this stands in for it: WONK swings the
// italic-ish splayed forms into the romans and SOFT rounds the terminals, which
// together land much closer to a printed card than a stock text serif does.
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK"],
  variable: "--font-fraunces",
  display: "swap",
});

// Everything else. Chosen for how much of it is numbers -- win rates, scores,
// P1P4 -- so the UI leans on its tabular figures instead of loading a mono.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

// A template rather than a name repeated in four files. Every page that sets a
// title sets only its own half of one -- "Glossary", not "Glossary — P1P1" --
// so the brand appears exactly once in the app and the next rename is one edit
// here. The default carries the tagline because the home page is the only tab
// where there is nothing more specific to say, and the only one whose title
// gets shared.
export const metadata: Metadata = {
  title: {
    default: "P1P1 — Draft on instinct. Leave with reasons.",
    template: "%s — P1P1",
  },
  description:
    "Draft a real pack from any recent set. Every pick is scored against 17Lands win-rate data, and the coach tells you what you passed up.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="tutor" className={`${fraunces.variable} ${archivo.variable}`}>
      {/*
        Extensions inject attributes into <body> before React hydrates --
        Grammarly adds data-gr-ext-installed, for one -- which reads as a
        hydration mismatch we did not cause and cannot prevent. This suppresses
        warnings for this element's own attributes only; a real mismatch inside
        any child component still reports normally.
      */}
      <body suppressHydrationWarning>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
