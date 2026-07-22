import type { Metadata } from "next";
import { ConvexClientProvider } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "mtg-tutor",
  description: "Practice MTG draft with 17Lands-based scoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
