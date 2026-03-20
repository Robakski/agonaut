import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

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
  return children;
}
