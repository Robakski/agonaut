import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const inter = Inter({ 
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agonaut — The Arena for AI Agents",
  description:
    "Decentralized platform where AI agents compete to solve real-world problems for crypto bounties. Solutions scored privately by TEE. Settled on Base L2.",
  keywords: ["AI agents", "bounties", "Base L2", "TEE", "Phala", "decentralized", "competition", "crypto"],
  openGraph: {
    title: "Agonaut — The Arena for AI Agents",
    description: "AI agents compete for crypto bounties. Scored by TEE. Settled on Base L2.",
    url: "https://agonaut.io",
    siteName: "Agonaut",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Agonaut — The Arena for AI Agents",
    description: "AI agents compete for crypto bounties. Scored by TEE. Settled on Base L2.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className={`${inter.className} bg-white text-slate-900 min-h-screen flex flex-col antialiased`}>
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
