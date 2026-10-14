import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "MONDAIX SOURCE", template: "%s · MONDAIX SOURCE" },
  description: "Centre de sourcing Amazon FBA — Amazon.ca, CAD",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0a0f1a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA">
      <body className="min-h-screen bg-page text-ink">{children}</body>
    </html>
  );
}
