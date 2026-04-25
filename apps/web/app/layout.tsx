import type { Metadata, Viewport } from "next";
import { Figtree, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-display"
});

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body"
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "BharatDoc",
  description: "AI-assisted clinical documentation for small Indian hospitals.",
  applicationName: "BharatDoc",
  icons: {
    icon: "/favicon.svg",
    apple: "/icon.svg"
  },
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#C24A2A"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${figtree.variable} ${jetBrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
