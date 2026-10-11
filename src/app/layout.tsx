import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Cormorant_Garamond, Inter, Pinyon_Script } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({ subsets: ["latin", "latin-ext"], weight: ["300", "400", "500", "600"], style: ["normal", "italic"], variable: "--font-cormorant", display: "swap" });
const inter = Inter({ subsets: ["latin", "latin-ext", "greek"], variable: "--font-inter", display: "swap" });
const pinyon = Pinyon_Script({ subsets: ["latin"], weight: "400", variable: "--font-pinyon", display: "swap" });
const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-barlow", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Re·Form Pilates Studio · Limassol", template: "%s · Re·Form Pilates" },
  description: "Book Reformer and Mat Pilates classes at Re·Form Pilates Studio in Limassol, Cyprus.",
  applicationName: "Re·Form",
  appleWebApp: { capable: true, title: "Re·Form", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#E9DDF5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${inter.variable} ${pinyon.variable} ${barlow.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
