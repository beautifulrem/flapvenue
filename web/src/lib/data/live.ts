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

// X Layer testnet caps eth_getLogs to a 100-block window, so scan in 100-block chunks in parallel.
// The seeded demo events sit just after the deploy block; a fresh user swap lands near the chain head,
// so for skims we also scan a trailing window of the most recent blocks and merge the two.
const RECENT_SPAN = 2500n;

function chunk100(from: bigint, to: bigint): Array<[bigint, bigint]> {
  const ranges: Array<[bigint, bigint]> = [];
  for (let b = from; b <= to; b += 100n) ranges.push([b, b + 99n > to ? to : b + 99n]);
  return ranges;
}

async function scanLogs<TName extends "HookGraduation" | "HookTaxSkim">(eventName: TName) {
  const deployEnd = DEPLOY_BLOCK + LOG_SCAN_SPAN;
  const ranges = chunk100(DEPLOY_BLOCK, deployEnd);
  if (eventName === "HookTaxSkim") {
    try {
      const head = await client.getBlockNumber();
      const recentFrom = head > RECENT_SPAN ? head - RECENT_SPAN : 0n;
      if (recentFrom > deployEnd) ranges.push(...chunk100(recentFrom, head));
    } catch {
      // if the head can't be read, fall back to the deploy window alone
    }
  }
  const chunks = await Promise.all(
    ranges.map(([fromBlock, toBlock]) =>
      client
        .getContractEvents({ address: FLAPVENUE_ADDRESS, abi: flapVenueAbi, eventName, fromBlock, toBlock })
        .catch(() => []),
    ),
  );
  const seen = new Set<string>();
  return chunks.flat().filter((l) => {
    const k = `${l.transactionHash}-${l.logIndex}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Short-TTL promise caches: parallel fetches within one render share a single scan, but a newly
// submitted on-chain swap shows up on the next refresh once the TTL lapses, instead of being frozen
// for the whole process lifetime.
const CACHE_TTL_MS = 15_000;
function cached<T>(fn: () => Promise<T>): () => Promise<T> {
  let value: Promise<T> | null = null;
  let stamp = 0;
  return () => {
    const now = Date.now();
    if (!value || now - stamp > CACHE_TTL_MS) {
      stamp = now;
      value = fn().catch((err) => {
        value = null; // never cache a failed scan
        throw err;
      });
    }
    return value;
  };
}

const symsP = cached(async () => {
  const [flap, quote] = await Promise.all([
    client.readContract({ address: FLAP_TOKEN, abi: erc20Abi, functionName: "symbol" }).catch(() => "FLAP"),
    client.readContract({ address: QUOTE_TOKEN, abi: erc20Abi, functionName: "symbol" }).catch(() => "QUOTE"),
  ]);
  return { [FLAP_TOKEN.toLowerCase()]: flap as string, [QUOTE_TOKEN.toLowerCase()]: quote as string };
});
const symOf = (m: Record<string, string>, addr: string) => m[addr.toLowerCase()] ?? "TOKEN";

const gradsP = cached(() => scanLogs("HookGraduation"));
const skimsP = cached(() => scanLogs("HookTaxSkim"));
const protocolP = cached(
  () =>
    client.readContract({
      address: FLAPVENUE_ADDRESS,
      abi: flapVenueAbi,
      functionName: "protocolTreasury",
    }) as Promise<ViemAddress>,
);

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
    return skims.sort((a, b) => b.ts - a.ts).slice(0, limit);
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
    // Only swaps24h (the skim count) is surfaced in the dashboard; the other fields are unused
    // placeholders kept for the PoolStats shape. Don't fabricate a cross-currency "volume" here.
    const logs = await skimsP();
    return { priceUsd: 0, tvlUsd: 0, volume24hUsd: 0, swaps24h: logs.length };
  },
};
