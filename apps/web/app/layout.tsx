import type { Metadata } from "next";
import { ConvexClientProvider } from "./providers";
// Imported here rather than @import-ed from globals.css so Next resolves the
// font files the stylesheet references relative to itself, in node_modules.
import "mana-font/css/mana.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "mtg-tutor",
  description: "Practice MTG draft with 17Lands-based scoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
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
