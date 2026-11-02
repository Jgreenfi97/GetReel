import type { Metadata, Viewport } from "next";
import { Cinzel, Cormorant_Garamond, Jost } from "next/font/google";

import { DemoBanner } from "@/components/DemoBanner";
import { GoldDefs } from "@/components/ornaments";
import { SiteFooter } from "@/components/SiteFooter";
import { getFeatures } from "@/lib/config";

import "./globals.css";

const cinzel = Cinzel({ subsets: ["latin"], variable: "--font-cinzel", display: "swap" });
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});
const jost = Jost({ subsets: ["latin"], variable: "--font-jost", display: "swap" });

function siteUrl(): URL {
  if (process.env.SITE_URL) return new URL(process.env.SITE_URL);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return new URL("http://localhost:3000");
}

const description =
  "Describe a movie you can’t quite remember — a scene, a line, a face, a feeling — and GetReel finds the film and rolls the clip.";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: "GetReel — Find the film on the tip of your tongue",
    template: "%s · GetReel",
  },
  description,
  applicationName: "GetReel",
  openGraph: {
    type: "website",
    siteName: "GetReel",
    title: "GetReel — Find the film on the tip of your tongue",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "GetReel",
    description,
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f4ee",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const demo = !getFeatures().claude;
  return (
    <html lang="en" className={`${cinzel.variable} ${cormorant.variable} ${jost.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <GoldDefs />
        {demo && <DemoBanner />}
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
