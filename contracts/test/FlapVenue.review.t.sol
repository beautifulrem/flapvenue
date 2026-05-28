// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";
import {BaseTest} from "./utils/BaseTest.sol";

import {FlapVenue} from "../src/FlapVenue.sol";
import {MockFlapPortal} from "./mocks/MockFlapPortal.sol";
import {MockFlapTaxToken, TestERC20} from "./mocks/MockFlapTaxToken.sol";

interface IMintableERC20 {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice Extended coverage: exercises fund-moving branches and economic edges — the sell direction
///         (input == currency1), the MAX_TAX_BPS clamp, that decay actually shrinks the skimmed amount,
///         multi-pool isolation, and the constructor share guard.
contract FlapVenueReviewTest is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;

    uint16 constant START_TAX_BPS = 1000; // 10%
    uint16 constant PROTOCOL_SHARE_BPS = 1000; // 10% of each skim

    MockFlapPortal portal;
    FlapVenue hook;
    TestERC20 quote;

    address creatorA = makeAddr("creatorA");
    address creatorB = makeAddr("creatorB");
    address protocol = makeAddr("protocol");

    function setUp() public {
        deployArtifactsAndLabel();
        portal = new MockFlapPortal();

        uint160 flags =
            uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG);
        address hookAddr = address(flags ^ (0x4444 << 144));
        deployCodeTo("FlapVenue.sol:FlapVenue", abi.encode(poolManager, portal, protocol, PROTOCOL_SHARE_BPS), hookAddr);
        hook = FlapVenue(hookAddr);

        quote = new TestERC20("Quote", "QUOTE");
        _seed(address(quote));
    }

    // --- Correctness: the sell direction (zeroForOne == false → input is currency1) ---

    function test_skim_sellDirection_taxesCurrency1() public {
        MockFlapTaxToken flap = _graduatedFlap(creatorA, START_TAX_BPS);
        PoolKey memory key = _initPoolWithLiquidity(address(flap));

        // zeroForOne = false → the specified (input) currency is currency1.
        uint256 amountIn = 1e18;
        _swap(key, amountIn, false);

        uint256 expectedTax = (amountIn * START_TAX_BPS) / 10_000;
        assertEq(hook.totalSkimmed(key.currency1), expectedTax, "currency1 skimmed on sell");
        assertEq(hook.totalSkimmed(key.currency0), 0, "currency0 untouched on sell");

        uint256 expectedProtocol = (expectedTax * PROTOCOL_SHARE_BPS) / 10_000;
        assertEq(hook.accrued(creatorA, key.currency1), expectedTax - expectedProtocol, "creator accrued currency1");
        assertEq(hook.accrued(protocol, key.currency1), expectedProtocol, "protocol accrued currency1");
    }

    // --- Correctness: portal taxRate above the cap is clamped to MAX_TAX_BPS (10%) ---

    function test_startTax_clampedToMax() public {
        MockFlapTaxToken flap = _graduatedFlap(creatorA, 5000); // portal reports 50%
        PoolKey memory key = _initPoolWithLiquidity(address(flap));

        FlapVenue.PoolConfig memory cfg = hook.poolConfig(key.toId());
        assertEq(cfg.startTaxBps, 1000, "startTaxBps clamped to MAX_TAX_BPS");
        assertEq(hook.currentTaxBps(key.toId()), 1000, "currentTaxBps clamped at t0");
    }

    // --- Correctness: decay actually reduces the skimmed amount mid-window ---

    function test_skim_amountHalvesAtMidWindow() public {
        MockFlapTaxToken flap = _graduatedFlap(creatorA, START_TAX_BPS);
        PoolKey memory key = _initPoolWithLiquidity(address(flap));

        vm.warp(block.timestamp + 15 days); // ~50% decay
        uint256 amountIn = 1e18;
        _swap(key, amountIn, true);

        // ~5% (half of 10%) of the input, allowing 1 wei of rounding on the bps.
        uint256 bps = hook.currentTaxBps(key.toId());
        assertEq(hook.totalSkimmed(key.currency0), (amountIn * bps) / 10_000, "skim uses decayed bps");
        assertApproxEqAbs(hook.totalSkimmed(key.currency0), amountIn / 20, amountIn / 2000, "~5% at mid-window");
    }

    // --- Security / multi-pool: a second pool has an independent decay clock and isolated accrual ---

    function test_multiPool_independentClocksAndAccrual() public {
        MockFlapTaxToken flapA = _graduatedFlap(creatorA, START_TAX_BPS);
        PoolKey memory keyA = _initPoolWithLiquidity(address(flapA));

        // Pool B graduates 15 days later → its decay clock starts fresh at full tax.
        vm.warp(block.timestamp + 15 days);
        MockFlapTaxToken flapB = _graduatedFlap(creatorB, START_TAX_BPS);
        PoolKey memory keyB = _initPoolWithLiquidity(address(flapB));

        assertApproxEqAbs(hook.currentTaxBps(keyA.toId()), 500, 1, "pool A ~50% decayed");
        assertEq(hook.currentTaxBps(keyB.toId()), 1000, "pool B fresh at full tax");

        // A swap on pool A must not touch pool B's config or creatorB's accrual.
        _swap(keyA, 1e18, true);
        FlapVenue.PoolConfig memory cfgB = hook.poolConfig(keyB.toId());
        assertEq(cfgB.commissionReceiver, creatorB, "pool B creator unchanged");
        assertEq(cfgB.startTaxBps, START_TAX_BPS, "pool B startTax unchanged");

        // creatorB earned nothing from a pool-A swap (assert on the flapB token, unique to pool B).
        Currency flapBCurrency = Currency.wrap(address(flapB));
        assertEq(hook.accrued(creatorB, flapBCurrency), 0, "creatorB no accrual from pool A swap");
    }

    // --- Security: constructor rejects a protocol share above 100% ---

    function test_constructor_revertsShareTooHigh() public {
        uint160 flags =
            uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG);
        address hookAddr2 = address(flags ^ (0x5555 << 144));
        vm.expectRevert(FlapVenue.ShareTooHigh.selector);
        deployCodeTo("FlapVenue.sol:FlapVenue", abi.encode(poolManager, portal, protocol, uint16(10_001)), hookAddr2);
    }

    // --- Security: a zero protocol treasury would make fallback/protocol skim unclaimable ---

    function test_constructor_revertsZeroTreasury() public {
        uint160 flags =
            uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG);
        address hookAddr3 = address(flags ^ (0x6666 << 144));
        vm.expectRevert(FlapVenue.ZeroAddress.selector);
        deployCodeTo(
            "FlapVenue.sol:FlapVenue", abi.encode(poolManager, portal, address(0), PROTOCOL_SHARE_BPS), hookAddr3
        );
    }

    function test_constructor_revertsZeroPortal() public {
        uint160 flags =
            uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG);
        address hookAddr4 = address(flags ^ (0x7777 << 144));
        vm.expectRevert(FlapVenue.ZeroAddress.selector);
        deployCodeTo(
            "FlapVenue.sol:FlapVenue", abi.encode(poolManager, address(0), protocol, PROTOCOL_SHARE_BPS), hookAddr4
        );
    }

    // --- helpers ---

    function _graduatedFlap(address creator, uint256 taxRate) internal returns (MockFlapTaxToken flap) {
        flap = new MockFlapTaxToken("Flap", "FLAP", creator);
        _seed(address(flap));
        portal.setGraduated(address(flap), taxRate, address(0xCAFE));
    }

    function _initPoolWithLiquidity(address flapToken) internal returns (PoolKey memory key) {
        (Currency c0, Currency c1) = flapToken < address(quote)
            ? (Currency.wrap(flapToken), Currency.wrap(address(quote)))
            : (Currency.wrap(address(quote)), Currency.wrap(flapToken));
        key = PoolKey(c0, c1, 3000, 60, IHooks(hook));
        poolManager.initialize(key, Constants.SQRT_PRICE_1_1);

        int24 tl = TickMath.minUsableTick(key.tickSpacing);
        int24 tu = TickMath.maxUsableTick(key.tickSpacing);
        (uint256 a0, uint256 a1) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1, TickMath.getSqrtPriceAtTick(tl), TickMath.getSqrtPriceAtTick(tu), 100e18
        );
        positionManager.mint(key, tl, tu, 100e18, a0 + 1, a1 + 1, address(this), block.timestamp, Constants.ZERO_BYTES);
    }

    function _swap(PoolKey memory key, uint256 amountIn, bool zeroForOne) internal {
        swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: zeroForOne,
            poolKey: key,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
    }

    function _seed(address token) internal {
        IMintableERC20(token).mint(address(this), 10_000_000 ether);
        IMintableERC20(token).approve(address(permit2), type(uint256).max);
        IMintableERC20(token).approve(address(swapRouter), type(uint256).max);
        permit2.approve(token, address(positionManager), type(uint160).max, type(uint48).max);
        permit2.approve(token, address(poolManager), type(uint160).max, type(uint48).max);
    }
}
