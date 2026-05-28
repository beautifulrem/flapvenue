// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IERC6909Claims} from "@uniswap/v4-core/src/interfaces/external/IERC6909Claims.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";
import {BaseTest} from "./utils/BaseTest.sol";

import {FlapVenue} from "../src/FlapVenue.sol";
import {MockFlapPortal} from "./mocks/MockFlapPortal.sol";
import {MockFlapTaxToken, TestERC20} from "./mocks/MockFlapTaxToken.sol";

interface IMintableERC20 {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @dev Drives random bounded exact-input swaps and time warps against the pool.
contract Handler is Test {
    IUniswapV4Router04 internal router;
    PoolKey internal key;

    constructor(IUniswapV4Router04 _router, PoolKey memory _key) {
        router = _router;
        key = _key;
    }

    function swap(uint256 amountSeed, bool zeroForOne) external {
        uint256 amountIn = bound(amountSeed, 1e15, 500e18);
        try router.swapExactTokensForTokens(amountIn, 0, zeroForOne, key, "", address(this), block.timestamp + 1) {}
            catch {}
    }

    function warp(uint256 dtSeed) external {
        uint256 dt = bound(dtSeed, 1 hours, 5 days);
        vm.warp(block.timestamp + dt);
    }
}

contract FlapVenueInvariants is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    uint16 constant START_TAX_BPS = 1000;
    uint16 constant PROTOCOL_SHARE_BPS = 1000;

    MockFlapPortal portal;
    FlapVenue hook;
    Handler handler;

    address creator = makeAddr("creator");
    address protocol = makeAddr("protocol");

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoolId poolId;

    function setUp() public {
        deployArtifactsAndLabel();
        portal = new MockFlapPortal();

        uint160 flags =
            uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG);
        address hookAddr = address(flags ^ (0x4444 << 144));
        deployCodeTo("FlapVenue.sol:FlapVenue", abi.encode(poolManager, portal, protocol, PROTOCOL_SHARE_BPS), hookAddr);
        hook = FlapVenue(hookAddr);

        MockFlapTaxToken flap = new MockFlapTaxToken("FlapMeme", "FLAP", creator);
        TestERC20 quote = new TestERC20("Quote", "QUOTE");
        _seed(address(flap), address(this));
        _seed(address(quote), address(this));

        portal.setGraduated(address(flap), START_TAX_BPS, address(0xCAFE));

        (currency0, currency1) = address(flap) < address(quote)
            ? (Currency.wrap(address(flap)), Currency.wrap(address(quote)))
            : (Currency.wrap(address(quote)), Currency.wrap(address(flap)));

        poolKey = PoolKey(currency0, currency1, 3000, 60, IHooks(hook));
        poolId = poolKey.toId();
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);
        _addFullRangeLiquidity(1000e18);

        handler = new Handler(swapRouter, poolKey);
        _seed(address(flap), address(handler));
        _seed(address(quote), address(handler));

        targetContract(address(handler));
    }

    /// @notice No tax value is created or lost: everything skimmed is still owed to creator + protocol.
    function invariant_accrualConservation() public view {
        assertEq(
            hook.accrued(creator, currency0) + hook.accrued(protocol, currency0),
            hook.totalSkimmed(currency0),
            "conservation c0"
        );
        assertEq(
            hook.accrued(creator, currency1) + hook.accrued(protocol, currency1),
            hook.totalSkimmed(currency1),
            "conservation c1"
        );
    }

    /// @notice Every unit of accrued tax is backed 1:1 by ERC-6909 claims the hook actually holds.
    function invariant_claimsBacked() public view {
        IERC6909Claims claims = IERC6909Claims(address(poolManager));
        assertEq(claims.balanceOf(address(hook), currency0.toId()), hook.totalSkimmed(currency0), "backing c0");
        assertEq(claims.balanceOf(address(hook), currency1.toId()), hook.totalSkimmed(currency1), "backing c1");
    }

    /// @notice The decaying tax never exceeds its starting rate.
    function invariant_taxNeverExceedsStart() public view {
        assertLe(hook.currentTaxBps(poolId), START_TAX_BPS, "tax <= start");
    }

    function _seed(address token, address to) internal {
        IMintableERC20(token).mint(to, 10_000_000 ether);
        vm.startPrank(to);
        IMintableERC20(token).approve(address(permit2), type(uint256).max);
        IMintableERC20(token).approve(address(swapRouter), type(uint256).max);
        permit2.approve(token, address(positionManager), type(uint160).max, type(uint48).max);
        permit2.approve(token, address(poolManager), type(uint160).max, type(uint48).max);
        vm.stopPrank();
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
}
