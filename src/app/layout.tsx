import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-serif/600.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { UI_BOOT_SCRIPT } from "@/components/uiPrefs";

export const metadata: Metadata = {
  title: { default: "MONDAIX SOURCE", template: "%s · MONDAIX SOURCE" },
  description: "Centre de sourcing Amazon FBA — Amazon.ca, CAD",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0b1f3a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA" data-sidebar="full" data-density="comfort" suppressHydrationWarning>
      <body className="min-h-screen bg-page text-ink">
        {/* Préférences d'affichage appliquées avant le premier rendu */}
        <script dangerouslySetInnerHTML={{ __html: UI_BOOT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
