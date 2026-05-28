// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {CurrencySettler} from "@openzeppelin/uniswap-hooks/src/utils/CurrencySettler.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary,
    toBeforeSwapDelta
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";

import {IFlapPortal} from "./interfaces/IFlapPortal.sol";
import {IFlapTaxTokenV3, ITaxProcessor} from "./interfaces/IFlapTaxTokenV3.sol";

/**
 * @title FlapVenue
 * @notice The Uniswap V4 landing zone for Flap graduations on X Layer — the destination Flap's own
 *         `MigratorType.V4_UNI_MIGRATOR` enum (commented "Base, XLayer") points to but never built.
 *
 *         FlapVenue reproduces Flap's creator tax as a `beforeSwap` delta (NOT an ERC-20 transfer tax),
 *         linearly decaying to zero over 30 days from pool initialization, routed to the creator and the
 *         protocol. Because the tax is a hook delta rather than a token transfer tax, a Flap *tax token*
 *         can live in a concentrated-liquidity pool for the first time (Flap docs: tax tokens "can only
 *         be migrated to Uniswap V2 or its forks").
 *
 *         Accrual is gated to tokens the Flap Portal reports as graduated (`status == DEX`), so the hook
 *         is a non-forkable co-build of Flap rather than a generic fee skimmer.
 *
 * @dev    MVP scope: taxes exact-input swaps only; exact-output is a no-op (no tax) and is left as a
 *         documented stretch. Skimmed tax is held as PoolManager ERC-6909 claims and redeemed to ERC-20
 *         by recipients via `claim`.
 */
contract FlapVenue is BaseHook, IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using CurrencySettler for Currency;

    uint256 internal constant BPS = 10_000;
    uint256 internal constant MAX_TAX_BPS = 1_000; // 10% cap (Flap rule)
    uint256 internal constant DECAY_WINDOW = 30 days;

    IFlapPortal public immutable portal;
    address public immutable protocolTreasury;
    uint16 public immutable protocolShareBps; // share of each skim routed to protocol; remainder to creator

    struct PoolConfig {
        address flapToken;
        address commissionReceiver;
        uint64 migrationTs;
        uint16 startTaxBps;
    }

    mapping(PoolId => PoolConfig) internal _config;
    /// @notice First time each Flap token was seen graduated. Decay anchors here (per TOKEN, not per pool)
    ///         so spinning up a second pool for the same token cannot "refresh" the creator tax.
    mapping(address => uint64) public tokenMigrationTs;
    /// @notice recipient => currency => claimable amount, backed by PoolManager ERC-6909 claims held here.
    mapping(address => mapping(Currency => uint256)) public accrued;
    /// @notice total tax skimmed per currency (lifetime), for legibility / invariants.
    mapping(Currency => uint256) public totalSkimmed;
    /// @notice tax skimmed per (pool, currency) — per-pool analytics alongside the global `totalSkimmed`.
    mapping(PoolId => mapping(Currency => uint256)) public poolSkimmed;

    error NotGraduated();
    error NothingToClaim();
    error ShareTooHigh();
    error ZeroAddress();

    event HookGraduation(
        PoolId indexed poolId, address indexed flapToken, address creator, uint64 migrationTs, uint16 startTaxBps
    );
    event HookTaxSkim(
        PoolId indexed poolId, address indexed swapper, uint256 taxBps, uint256 taxAmount, Currency currency
    );
    event CommissionAccrued(
        Currency indexed currency, address indexed creator, uint256 creatorAmount, uint256 protocolAmount
    );
    event Claimed(Currency indexed currency, address indexed recipient, uint256 amount);

    constructor(IPoolManager _poolManager, IFlapPortal _portal, address _protocolTreasury, uint16 _protocolShareBps)
        BaseHook(_poolManager)
    {
        if (_protocolShareBps > BPS) revert ShareTooHigh();
        // A zero portal makes the hook inert; a zero treasury would strand the protocol/fallback skim as
        // unclaimable ERC-6909 claims (no key for address(0)). Reject both at construction.
        if (address(_portal) == address(0) || _protocolTreasury == address(0)) revert ZeroAddress();
        portal = _portal;
        protocolTreasury = _protocolTreasury;
        protocolShareBps = _protocolShareBps;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // --- Views ---

    function poolConfig(PoolId id) external view returns (PoolConfig memory) {
        return _config[id];
    }

    /// @notice The tax rate (bps) currently applied to this pool, after linear decay.
    function currentTaxBps(PoolId id) external view returns (uint256) {
        return _currentTaxBps(_config[id]);
    }

    // --- Hook callbacks ---

    /// @dev Gate: only pools whose Flap-side token is reported graduated are configured for accrual. The
    ///      decay clock anchors to the token's FIRST graduation (per-token), so a second pool for the same
    ///      token reuses the same clock instead of resetting the tax.
    function _afterInitialize(address, PoolKey calldata key, uint160, int24) internal override returns (bytes4) {
        (address flapToken, uint256 taxRate) = _resolveFlapToken(key);

        uint64 ts = tokenMigrationTs[flapToken];
        if (ts == 0) {
            ts = uint64(block.timestamp);
            tokenMigrationTs[flapToken] = ts;
        }

        address creator = _resolveCreator(flapToken);
        uint16 startBps = uint16(taxRate > MAX_TAX_BPS ? MAX_TAX_BPS : taxRate);

        _config[key.toId()] =
            PoolConfig({flapToken: flapToken, commissionReceiver: creator, migrationTs: ts, startTaxBps: startBps});

        emit HookGraduation(key.toId(), flapToken, creator, ts, startBps);
        return BaseHook.afterInitialize.selector;
    }

    /// @dev Flap TAX tokens expose `taxProcessor().commissionReceiver()`. A graduated NON-tax token has no
    ///      tax processor, so its skim falls back to the protocol treasury rather than reverting init.
    function _resolveCreator(address flapToken) internal view returns (address) {
        try IFlapTaxTokenV3(flapToken).taxProcessor() returns (ITaxProcessor tp) {
            try tp.commissionReceiver() returns (address r) {
                if (r != address(0)) return r;
            } catch {}
        } catch {}
        return protocolTreasury;
    }

    /// @dev Skim the decaying creator tax from the input currency of an exact-input swap, as ERC-6909
    ///      claims, before the concentrated-liquidity swap runs on the remainder.
    function _beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolConfig storage cfg = _config[key.toId()];

        // MVP: only exact-input swaps are taxed (amountSpecified < 0). Exact-output is a no-op (stretch).
        if (params.amountSpecified >= 0) {
            return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        uint256 taxBps = _currentTaxBps(cfg);
        if (taxBps == 0) {
            return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        uint256 inputAmount = uint256(-params.amountSpecified);
        uint256 taxAmount = (inputAmount * taxBps) / BPS;
        if (taxAmount == 0) {
            return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        Currency inputCurrency = params.zeroForOne ? key.currency0 : key.currency1;

        // Take the tax out of the swap as PoolManager ERC-6909 claims held by this hook.
        inputCurrency.take(poolManager, address(this), taxAmount, true);
        _accrueAndEmit(key, sender, taxBps, taxAmount, inputCurrency, cfg.commissionReceiver);

        // Positive specified-delta => hook captures `taxAmount` of the input currency; the CL swap then
        // runs on (inputAmount - taxAmount).
        return (BaseHook.beforeSwap.selector, toBeforeSwapDelta(int128(int256(taxAmount)), 0), 0);
    }

    /// @dev Split the skim creator/protocol, book it (global + per-pool), and emit. Kept in its own
    ///      frame so `_beforeSwap` stays under the stack limit.
    function _accrueAndEmit(
        PoolKey calldata key,
        address swapper,
        uint256 taxBps,
        uint256 taxAmount,
        Currency cur,
        address creator
    ) internal {
        uint256 protocolAmt = (taxAmount * protocolShareBps) / BPS;
        uint256 creatorAmt = taxAmount - protocolAmt;
        accrued[creator][cur] += creatorAmt;
        accrued[protocolTreasury][cur] += protocolAmt;
        totalSkimmed[cur] += taxAmount;
        poolSkimmed[key.toId()][cur] += taxAmount;

        emit HookTaxSkim(key.toId(), swapper, taxBps, taxAmount, cur);
        emit CommissionAccrued(cur, creator, creatorAmt, protocolAmt);
    }

    // --- Claiming ---

    /// @notice Redeem accrued tax (creator or protocol) for a currency, converting ERC-6909 claims to ERC-20.
    function claim(Currency currency) external returns (uint256 amount) {
        amount = accrued[msg.sender][currency];
        if (amount == 0) revert NothingToClaim();
        accrued[msg.sender][currency] = 0;
        poolManager.unlock(abi.encode(currency, msg.sender, amount));
        emit Claimed(currency, msg.sender, amount);
    }

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (Currency currency, address to, uint256 amount) = abi.decode(data, (Currency, address, uint256));
        currency.settle(poolManager, address(this), amount, true); // burn the hook's ERC-6909 claims
        currency.take(poolManager, to, amount, false); // pay out the underlying ERC-20
        return "";
    }

    // --- Internal ---

    function _currentTaxBps(PoolConfig storage cfg) internal view returns (uint256) {
        if (cfg.migrationTs == 0) return 0; // unconfigured pool
        uint256 elapsed = block.timestamp - cfg.migrationTs;
        if (elapsed >= DECAY_WINDOW) return 0;
        return (uint256(cfg.startTaxBps) * (DECAY_WINDOW - elapsed)) / DECAY_WINDOW;
    }

    function _resolveFlapToken(PoolKey calldata key) internal view returns (address token, uint256 taxRate) {
        (bool ok0, uint256 t0) = _checkGraduated(Currency.unwrap(key.currency0));
        if (ok0) return (Currency.unwrap(key.currency0), t0);
        (bool ok1, uint256 t1) = _checkGraduated(Currency.unwrap(key.currency1));
        if (ok1) return (Currency.unwrap(key.currency1), t1);
        revert NotGraduated();
    }

    function _checkGraduated(address token) internal view returns (bool graduated, uint256 taxRate) {
        if (token == address(0)) return (false, 0);
        try portal.isGraduated(token) returns (bool g) {
            graduated = g;
        } catch {
            return (false, 0);
        }
        if (!graduated) return (false, 0);
        try portal.startTaxBps(token) returns (uint256 r) {
            taxRate = r;
        } catch {
            taxRate = 0;
        }
    }
}
