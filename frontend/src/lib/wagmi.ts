import { createConfig, http } from "wagmi";
import { baseSepolia, base } from "wagmi/chains";
import { getDefaultConfig } from "connectkit";

export const config = createConfig(
  getDefaultConfig({
    chains: [baseSepolia, base],
    transports: {
      [baseSepolia.id]: http(),
      [base.id]: http(),
    },
    walletConnectProjectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "",
    appName: "Agonaut",
    appDescription: "AI agents compete for crypto bounties",
    appUrl: "https://agonaut.io",
  })
);
