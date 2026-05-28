import { parseAbi, type Address } from "viem";

// FlapVenue deployment on X Layer testnet (chain 1952). See contracts/broadcast/DeployTestnet.s.sol.
export const XLAYER_TESTNET_CHAIN_ID = 1952;
export const XLAYER_TESTNET_RPC =
  process.env.NEXT_PUBLIC_XLAYER_TESTNET_RPC ?? "https://testrpc.xlayer.tech/terigon";

export const FLAPVENUE_ADDRESS = "0x5f07e9CA7c006528bB21d098230F25364b1c9088" as Address;
export const FLAP_TOKEN = "0x91Eb5b51715AB2958d3087992176616675bE1556" as Address;
export const QUOTE_TOKEN = "0xBEd71c18e2275F0A10c56c8f22EbFE774f05Ef3c" as Address;
export const POOL_MANAGER = "0xd44387034102491Af58292fF1c7405AED4e7Eb04" as Address;
// PoolSwapTest router (v4-core test router, no Permit2). Used by the interactive swap panel.
export const SWAP_ROUTER = "0xB59271CD9158Bb50125c3F9AC5CA013eE2fa7AF6" as Address;

// FLAP/USDT0 pool key. FLAP_TOKEN < QUOTE_TOKEN, so FLAP is currency0.
export const CURRENCY0 = FLAP_TOKEN;
export const CURRENCY1 = QUOTE_TOKEN;
export const POOL_FEE = 3000;
export const TICK_SPACING = 60;

// v4 price-limit sentinels: TickMath.MIN_SQRT_PRICE + 1 and MAX_SQRT_PRICE - 1.
export const MIN_SQRT_PRICE_LIMIT = 4295128740n;
export const MAX_SQRT_PRICE_LIMIT = 1461446703485210103287273052203988822378723970341n;

// Deploy block (from contracts/broadcast/DeployTestnet.s.sol/1952/run-latest.json). All demo events live
// in a small window here. X Layer testnet caps eth_getLogs to a 100-block range, so we scan this fixed
// span from the deploy block in 100-block chunks instead of a wide range.
export const DEPLOY_BLOCK = 31_534_289n;
export const LOG_SCAN_SPAN = 500n;

export const flapVenueAbi = parseAbi([
  "event HookGraduation(bytes32 indexed poolId, address indexed flapToken, address creator, uint64 migrationTs, uint16 startTaxBps)",
  "event HookTaxSkim(bytes32 indexed poolId, address indexed swapper, uint256 taxBps, uint256 taxAmount, address currency)",
  "event CommissionAccrued(address indexed currency, address indexed creator, uint256 creatorAmount, uint256 protocolAmount)",
  "function totalSkimmed(address currency) view returns (uint256)",
  "function accrued(address recipient, address currency) view returns (uint256)",
  "function currentTaxBps(bytes32 poolId) view returns (uint256)",
  "function protocolTreasury() view returns (address)",
  "function poolConfig(bytes32 poolId) view returns (address flapToken, address commissionReceiver, uint64 migrationTs, uint16 startTaxBps)",
]);

export const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
]);

// PoolSwapTest.swap — the v4-core test-router entrypoint used for the interactive on-chain swap.
export const poolSwapTestAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct SwapParams { bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96; }",
  "struct TestSettings { bool takeClaims; bool settleUsingBurn; }",
  "function swap(PoolKey key, SwapParams params, TestSettings testSettings, bytes hookData) payable returns (int256 delta)",
]);
