import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { injected } from "wagmi/connectors";

// X Layer testnet (OKX zkEVM L2). chainId 1952 per OKX network-information docs (195 is the legacy id).
export const xLayerTestnet = defineChain({
  id: 1952,
  name: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_XLAYER_TESTNET_RPC ?? "https://testrpc.xlayer.tech/terigon"],
    },
  },
  blockExplorers: {
    default: { name: "OKLink", url: "https://www.oklink.com/x-layer-testnet" },
  },
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [xLayerTestnet],
  connectors: [injected()],
  transports: {
    [xLayerTestnet.id]: http(),
  },
  ssr: true,
});
