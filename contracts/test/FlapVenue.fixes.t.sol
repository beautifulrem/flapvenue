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

/// @notice Edge-case coverage:
///  - a graduated NON-tax token (no taxProcessor) must initialize, falling back to the protocol as receiver.
///  - two pools of the SAME token share one decay clock (anchored to first graduation) — no "tax refresh".
///  - a per-pool skim counter exists alongside the global one.
contract FlapVenueFixesTest is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;

    uint16 constant START_TAX_BPS = 1000;
    uint16 constant PROTOCOL_SHARE_BPS = 1000;

    MockFlapPortal portal;
    FlapVenue hook;
    TestERC20 quote;

    address creator = makeAddr("creator");
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

    // --- non-tax graduated token initializes with the protocol as fallback receiver ---

    function test_f2_nonTaxToken_initsWithProtocolFallback() public {
        TestERC20 plain = new TestERC20("PlainGraduate", "PLN"); // graduated, but has NO taxProcessor()
        _seed(address(plain));
        portal.setGraduated(address(plain), START_TAX_BPS, address(0xCAFE));

        PoolKey memory key = _initPool(address(plain), 3000, 60);

        FlapVenue.PoolConfig memory cfg = hook.poolConfig(key.toId());
        assertEq(cfg.commissionReceiver, protocol, "non-tax token falls back to protocol receiver");
        assertEq(cfg.startTaxBps, START_TAX_BPS, "tax still configured");
    }

    // --- same token, two pools, one shared decay clock (no reset) ---

    function test_f3_sameToken_twoPools_shareDecayClock() public {
        MockFlapTaxToken flap = new MockFlapTaxToken("Flap", "FLAP", creator);
        _seed(address(flap));
        portal.setGraduated(address(flap), START_TAX_BPS, address(0xCAFE));

        PoolKey memory key1 = _initPool(address(flap), 3000, 60);

        // 15 days later, someone opens a SECOND pool for the same token.
        vm.warp(block.timestamp + 15 days);
        PoolKey memory key2 = _initPool(address(flap), 10000, 200);

        uint256 bps1 = hook.currentTaxBps(key1.toId());
        uint256 bps2 = hook.currentTaxBps(key2.toId());
        assertApproxEqAbs(bps1, 500, 1, "pool1 ~50% decayed");
        assertEq(bps2, bps1, "pool2 shares the same decay clock (no refresh to 10%)");
    }

    // --- per-pool skim counter ---

    function test_f4_poolSkimmed_tracksPerPool() public {
        MockFlapTaxToken flap = new MockFlapTaxToken("Flap", "FLAP", creator);
        _seed(address(flap));
        portal.setGraduated(address(flap), START_TAX_BPS, address(0xCAFE));
        PoolKey memory key = _initPool(address(flap), 3000, 60);

        uint256 amountIn = 1e18;
        _swap(key, amountIn, true);

        uint256 expectedTax = (amountIn * START_TAX_BPS) / 10_000;
        assertEq(hook.poolSkimmed(key.toId(), key.currency0), expectedTax, "per-pool skim recorded");
    }

    // --- helpers ---

    function _initPool(address flapToken, uint24 fee, int24 spacing) internal returns (PoolKey memory key) {
        (Currency c0, Currency c1) = flapToken < address(quote)
            ? (Currency.wrap(flapToken), Currency.wrap(address(quote)))
            : (Currency.wrap(address(quote)), Currency.wrap(flapToken));
        key = PoolKey(c0, c1, fee, spacing, IHooks(hook));
        poolManager.initialize(key, Constants.SQRT_PRICE_1_1);

        int24 tl = TickMath.minUsableTick(spacing);
        int24 tu = TickMath.maxUsableTick(spacing);
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
