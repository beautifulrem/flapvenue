import { parseAbi, type Address } from "viem";

// FlapVenue deployment on X Layer testnet (chain 1952). See contracts/broadcast/DeployTestnet.s.sol.
export const XLAYER_TESTNET_CHAIN_ID = 1952;
export const XLAYER_TESTNET_RPC =
  process.env.NEXT_PUBLIC_XLAYER_TESTNET_RPC ?? "https://testrpc.xlayer.tech/terigon";

export const FLAPVENUE_ADDRESS = "0x5f07e9CA7c006528bB21d098230F25364b1c9088" as Address;
export const FLAP_TOKEN = "0x91Eb5b51715AB2958d3087992176616675bE1556" as Address;
export const QUOTE_TOKEN = "0xBEd71c18e2275F0A10c56c8f22EbFE774f05Ef3c" as Address;
export const POOL_MANAGER = "0xd44387034102491Af58292fF1c7405AED4e7Eb04" as Address;

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
]);
