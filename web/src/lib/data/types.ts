// Shared shapes mirroring the FlapVenue hook's on-chain events/state. The UI reads these through a
// DataSource so it can run on deterministic `mock` fixtures today and switch to `live` viem reads
// against the deployed hook after testnet deploy (F5) via NEXT_PUBLIC_DATA_SOURCE.

export type Address = `0x${string}`;

/** Mirrors event HookTaxSkim(poolId, swapper, taxBps, taxAmount, currency). */
export interface TaxSkim {
  id: string;
  ts: number; // unix seconds
  swapper: Address;
  taxBps: number;
  taxAmount: number; // human units of `symbol`
  symbol: string;
  txHash: Address;
}

/** Mirrors event HookGraduation(poolId, flapToken, creator, migrationTs, startTaxBps). */
export interface Graduation {
  id: string;
  ts: number;
  token: Address;
  symbol: string;
  creator: Address;
  startTaxBps: number;
  pool: Address;
}

/** Aggregated CommissionAccrued / totalSkimmed per currency. */
export interface Commission {
  symbol: string;
  creatorAccrued: number;
  protocolAccrued: number;
  totalSkimmed: number;
}

export interface PoolStats {
  priceUsd: number;
  tvlUsd: number;
  volume24hUsd: number;
  swaps24h: number;
}

export interface PoolMeta {
  poolId: string;
  flapSymbol: string;
  quoteSymbol: string;
  creator: Address;
  migrationTs: number;
  startTaxBps: number;
  decayWindowSec: number;
  chainId: number;
}

export interface DataSource {
  getPoolMeta(): Promise<PoolMeta>;
  getCommissions(): Promise<Commission[]>;
  getSkims(limit?: number): Promise<TaxSkim[]>;
  getGraduations(): Promise<Graduation[]>;
  getPoolStats(): Promise<PoolStats>;
}
