import { createPublicClient, defineChain, http, formatUnits, type Address as ViemAddress } from "viem";
import type { Address, Commission, DataSource, Graduation, PoolMeta, PoolStats, TaxSkim } from "./types";
import {
  DEPLOY_BLOCK,
  LOG_SCAN_SPAN,
  FLAPVENUE_ADDRESS,
  FLAP_TOKEN,
  QUOTE_TOKEN,
  XLAYER_TESTNET_CHAIN_ID,
  XLAYER_TESTNET_RPC,
  flapVenueAbi,
  erc20Abi,
} from "../contracts";

const DECAY_WINDOW = 30 * 24 * 3600;

const chain = defineChain({
  id: XLAYER_TESTNET_CHAIN_ID,
  name: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: [XLAYER_TESTNET_RPC] } },
});

const client = createPublicClient({ chain, transport: http(XLAYER_TESTNET_RPC) });

// X Layer testnet caps eth_getLogs to a 100-block window, so scan a fixed span from the deploy block
// (where all the demo events live) in 100-block chunks, in parallel.
async function scanLogs<TName extends "HookGraduation" | "HookTaxSkim">(eventName: TName) {
  const end = DEPLOY_BLOCK + LOG_SCAN_SPAN;
  const ranges: Array<[bigint, bigint]> = [];
  for (let b = DEPLOY_BLOCK; b <= end; b += 100n) {
    ranges.push([b, b + 99n > end ? end : b + 99n]);
  }
  const chunks = await Promise.all(
    ranges.map(([fromBlock, toBlock]) =>
      client
        .getContractEvents({ address: FLAPVENUE_ADDRESS, abi: flapVenueAbi, eventName, fromBlock, toBlock })
        .catch(() => []),
    ),
  );
  return chunks.flat();
}

// --- promise-level caches so the dashboard's parallel fetches share in-flight RPC calls ---
let _syms: Promise<Record<string, string>> | null = null;
let _grads: ReturnType<typeof scanLogs<"HookGraduation">> | null = null;
let _skims: ReturnType<typeof scanLogs<"HookTaxSkim">> | null = null;
let _protocol: Promise<ViemAddress> | null = null;

function symsP() {
  return (_syms ??= (async () => {
    const [flap, quote] = await Promise.all([
      client.readContract({ address: FLAP_TOKEN, abi: erc20Abi, functionName: "symbol" }).catch(() => "FLAP"),
      client.readContract({ address: QUOTE_TOKEN, abi: erc20Abi, functionName: "symbol" }).catch(() => "QUOTE"),
    ]);
    return { [FLAP_TOKEN.toLowerCase()]: flap as string, [QUOTE_TOKEN.toLowerCase()]: quote as string };
  })());
}
const symOf = (m: Record<string, string>, addr: string) => m[addr.toLowerCase()] ?? "TOKEN";

function gradsP() {
  return (_grads ??= scanLogs("HookGraduation"));
}
function skimsP() {
  return (_skims ??= scanLogs("HookTaxSkim"));
}
function protocolP() {
  return (_protocol ??= client.readContract({
    address: FLAPVENUE_ADDRESS,
    abi: flapVenueAbi,
    functionName: "protocolTreasury",
  }) as Promise<ViemAddress>);
}

async function blockTimes(blockNumbers: (bigint | null)[]): Promise<Map<string, number>> {
  const uniq = [...new Set(blockNumbers.filter((b): b is bigint => b !== null).map(String))];
  const entries = await Promise.all(
    uniq.map(async (s) => {
      const blk = await client.getBlock({ blockNumber: BigInt(s) });
      return [s, Number(blk.timestamp)] as const;
    }),
  );
  return new Map(entries);
}

export const liveSource: DataSource = {
  async getPoolMeta(): Promise<PoolMeta> {
    const [m, grads] = await Promise.all([symsP(), gradsP()]);
    const g = grads[0];
    return {
      poolId: (g?.args.poolId ?? "0x") as string,
      flapSymbol: symOf(m, FLAP_TOKEN),
      quoteSymbol: symOf(m, QUOTE_TOKEN),
      creator: (g?.args.creator ?? "0x0000000000000000000000000000000000000000") as Address,
      migrationTs: g ? Number(g.args.migrationTs) : 0,
      startTaxBps: g ? Number(g.args.startTaxBps) : 1000,
      decayWindowSec: DECAY_WINDOW,
      chainId: XLAYER_TESTNET_CHAIN_ID,
    };
  },

  async getCommissions(): Promise<Commission[]> {
    const [m, grads, protocol] = await Promise.all([symsP(), gradsP(), protocolP()]);
    const creator = (grads[0]?.args.creator ?? protocol) as ViemAddress;
    const sameAddr = creator.toLowerCase() === protocol.toLowerCase();

    return Promise.all(
      [FLAP_TOKEN, QUOTE_TOKEN].map(async (t) => {
        const [total, cr, pr] = await Promise.all([
          client.readContract({ address: FLAPVENUE_ADDRESS, abi: flapVenueAbi, functionName: "totalSkimmed", args: [t] }),
          client.readContract({ address: FLAPVENUE_ADDRESS, abi: flapVenueAbi, functionName: "accrued", args: [creator, t] }),
          client.readContract({ address: FLAPVENUE_ADDRESS, abi: flapVenueAbi, functionName: "accrued", args: [protocol, t] }),
        ]);
        return {
          symbol: symOf(m, t),
          creatorAccrued: Number(formatUnits(cr as bigint, 18)),
          protocolAccrued: sameAddr ? 0 : Number(formatUnits(pr as bigint, 18)),
          totalSkimmed: Number(formatUnits(total as bigint, 18)),
        };
      }),
    );
  },

  async getSkims(limit = 25): Promise<TaxSkim[]> {
    const [m, logs] = await Promise.all([symsP(), skimsP()]);
    const times = await blockTimes(logs.map((l) => l.blockNumber));
    const skims = logs.map((l) => ({
      id: `${l.transactionHash}-${l.logIndex}`,
      ts: times.get(String(l.blockNumber)) ?? 0,
      swapper: l.args.swapper as Address,
      taxBps: Number(l.args.taxBps),
      taxAmount: Number(formatUnits(l.args.taxAmount as bigint, 18)),
      symbol: symOf(m, l.args.currency as string),
      txHash: l.transactionHash as Address,
    }));
    return skims.reverse().slice(0, limit);
  },

  async getGraduations(): Promise<Graduation[]> {
    const [m, grads] = await Promise.all([symsP(), gradsP()]);
    const times = await blockTimes(grads.map((l) => l.blockNumber));
    return grads.map((g) => ({
      id: `${g.transactionHash}-${g.logIndex}`,
      ts: times.get(String(g.blockNumber)) ?? 0,
      token: g.args.flapToken as Address,
      symbol: symOf(m, g.args.flapToken as string),
      creator: g.args.creator as Address,
      startTaxBps: Number(g.args.startTaxBps),
      pool: FLAPVENUE_ADDRESS as Address,
    }));
  },

  async getPoolStats(): Promise<PoolStats> {
    const logs = await skimsP();
    let volume = 0;
    for (const l of logs) {
      const bps = Number(l.args.taxBps);
      if (bps > 0) volume += Number(formatUnits(l.args.taxAmount as bigint, 18)) / (bps / 10_000);
    }
    return { priceUsd: 1, tvlUsd: 0, volume24hUsd: volume, swaps24h: logs.length };
  },
};
