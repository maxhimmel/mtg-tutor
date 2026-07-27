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

export const metadata: Metadata = {
  title: "mtg-tutor",
  description: "Practice MTG draft with 17Lands-based scoring",
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
