// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";
import {BaseTest} from "./utils/BaseTest.sol";

import {FlapVenue} from "../src/FlapVenue.sol";
import {IFlapPortal} from "../src/interfaces/IFlapPortal.sol";
import {MockFlapPortal} from "./mocks/MockFlapPortal.sol";
import {MockFlapTaxToken, TestERC20} from "./mocks/MockFlapTaxToken.sol";

interface IMintableERC20 {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}

contract FlapVenueTest is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    uint256 constant DECAY_WINDOW = 30 days;
    uint16 constant START_TAX_BPS = 1000; // 10%
    uint16 constant PROTOCOL_SHARE_BPS = 1000; // 10% of each skim to protocol

    MockFlapPortal portal;
    FlapVenue hook;

    address creator = makeAddr("creator");
    address protocol = makeAddr("protocol");

    MockFlapTaxToken flap;
    TestERC20 quote;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoolId poolId;

    function setUp() public {
        deployArtifactsAndLabel();

        portal = new MockFlapPortal();

        // Deploy hook to an address whose flags match getHookPermissions().
        uint160 flags =
            uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG);
        address hookAddr = address(flags ^ (0x4444 << 144));
        bytes memory args = abi.encode(poolManager, portal, protocol, PROTOCOL_SHARE_BPS);
        deployCodeTo("FlapVenue.sol:FlapVenue", args, hookAddr);
        hook = FlapVenue(hookAddr);

        // Flap tax token (no transfer tax) + a quote token.
        flap = new MockFlapTaxToken("FlapMeme", "FLAP", creator);
        quote = new TestERC20("Quote", "QUOTE");
        _seed(address(flap));
        _seed(address(quote));

        // Mark the flap token as graduated in the Portal with a 10% starting tax.
        portal.setGraduated(address(flap), START_TAX_BPS, address(0xCAFE));

        (currency0, currency1) = address(flap) < address(quote)
            ? (Currency.wrap(address(flap)), Currency.wrap(address(quote)))
            : (Currency.wrap(address(quote)), Currency.wrap(address(flap)));

        poolKey = PoolKey(currency0, currency1, 3000, 60, IHooks(hook));
        poolId = poolKey.toId();
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1); // triggers _afterInitialize gating

        _addFullRangeLiquidity(100e18);
    }

    // --- T3: gating ---

    function test_afterInitialize_configuresGraduatedPool() public view {
        FlapVenue.PoolConfig memory cfg = hook.poolConfig(poolId);
        assertEq(cfg.flapToken, address(flap), "flapToken");
        assertEq(cfg.commissionReceiver, creator, "creator");
        assertEq(cfg.migrationTs, uint64(block.timestamp), "migrationTs == now");
        assertEq(cfg.startTaxBps, START_TAX_BPS, "startTaxBps");
        assertEq(hook.currentTaxBps(poolId), START_TAX_BPS, "currentTaxBps at t0");
    }

    function test_afterInitialize_revertsForNonGraduatedPool() public {
        TestERC20 a = new TestERC20("A", "A");
        TestERC20 b = new TestERC20("B", "B");
        (Currency c0, Currency c1) = address(a) < address(b)
            ? (Currency.wrap(address(a)), Currency.wrap(address(b)))
            : (Currency.wrap(address(b)), Currency.wrap(address(a)));
        PoolKey memory badKey = PoolKey(c0, c1, 3000, 60, IHooks(hook));

        vm.expectRevert(); // hook reverts NotGraduated() (bubbled by PoolManager)
        poolManager.initialize(badKey, Constants.SQRT_PRICE_1_1);
    }

    // --- T4: decaying tax skim ---

    function test_beforeSwap_skimsTax() public {
        uint256 amountIn = 1e18;
        Currency inputCurrency = currency0; // zeroForOne => input is currency0
        uint256 expectedTax = (amountIn * START_TAX_BPS) / 10_000;

        _swapExactIn(amountIn, true);

        assertEq(hook.totalSkimmed(inputCurrency), expectedTax, "total skimmed");

        uint256 expectedProtocol = (expectedTax * PROTOCOL_SHARE_BPS) / 10_000;
        uint256 expectedCreator = expectedTax - expectedProtocol;
        assertEq(hook.accrued(creator, inputCurrency), expectedCreator, "creator accrued");
        assertEq(hook.accrued(protocol, inputCurrency), expectedProtocol, "protocol accrued");
    }

    function test_decay_halfwayAndExpired() public {
        // ~50% at 15 days
        vm.warp(block.timestamp + 15 days);
        uint256 bps = hook.currentTaxBps(poolId);
        assertApproxEqAbs(bps, START_TAX_BPS / 2, 1, "~50% at 15d");

        // 0% at >= 30 days
        vm.warp(block.timestamp + 15 days);
        assertEq(hook.currentTaxBps(poolId), 0, "0% at 30d");

        // a swap after full decay skims nothing
        _swapExactIn(1e18, true);
        assertEq(hook.totalSkimmed(currency0), 0, "no skim after decay");
        assertEq(hook.totalSkimmed(currency1), 0, "no skim after decay (c1)");
    }

    function test_exactOutput_isNotTaxed() public {
        // exact-output swap (amountSpecified > 0) is a no-op for tax in the MVP
        swapRouter.swapTokensForExactTokens({
            amountOut: 1e17,
            amountInMax: 1e18,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
        assertEq(hook.totalSkimmed(currency0), 0, "exact-output not taxed");
    }

    // --- T5: commission split + claim ---

    function test_claim_creatorAndProtocol() public {
        uint256 amountIn = 1e18;
        Currency inputCurrency = currency0;
        _swapExactIn(amountIn, true);

        uint256 expectedTax = (amountIn * START_TAX_BPS) / 10_000;
        uint256 expectedProtocol = (expectedTax * PROTOCOL_SHARE_BPS) / 10_000;
        uint256 expectedCreator = expectedTax - expectedProtocol;

        IERC20 token = IERC20(Currency.unwrap(inputCurrency));

        vm.prank(creator);
        hook.claim(inputCurrency);
        assertEq(token.balanceOf(creator), expectedCreator, "creator received ERC20");
        assertEq(hook.accrued(creator, inputCurrency), 0, "creator accrued reset");

        vm.prank(protocol);
        hook.claim(inputCurrency);
        assertEq(token.balanceOf(protocol), expectedProtocol, "protocol received ERC20");
    }

    function test_claim_revertsWhenNothing() public {
        vm.prank(creator);
        vm.expectRevert(FlapVenue.NothingToClaim.selector);
        hook.claim(currency0);
    }

    // --- helpers ---

    function _seed(address token) internal {
        IMintableERC20(token).mint(address(this), 10_000_000 ether);
        IMintableERC20(token).approve(address(permit2), type(uint256).max);
        IMintableERC20(token).approve(address(swapRouter), type(uint256).max);
        permit2.approve(token, address(positionManager), type(uint160).max, type(uint48).max);
        permit2.approve(token, address(poolManager), type(uint160).max, type(uint48).max);
    }

    function _addFullRangeLiquidity(uint128 liquidityAmount) internal {
        int24 tickLower = TickMath.minUsableTick(poolKey.tickSpacing);
        int24 tickUpper = TickMath.maxUsableTick(poolKey.tickSpacing);
        (uint256 amount0, uint256 amount1) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            liquidityAmount
        );
        positionManager.mint(
            poolKey,
            tickLower,
            tickUpper,
            liquidityAmount,
            amount0 + 1,
            amount1 + 1,
            address(this),
            block.timestamp,
            Constants.ZERO_BYTES
        );
    }

    function _swapExactIn(uint256 amountIn, bool zeroForOne) internal returns (BalanceDelta) {
        return swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: zeroForOne,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
    }
}
