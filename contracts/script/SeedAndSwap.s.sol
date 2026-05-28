// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {console2} from "forge-std/Script.sol";

import {BaseScript} from "./base/BaseScript.sol";
import {EasyPosm} from "../test/utils/libraries/EasyPosm.sol";
import {FlapVenue} from "../src/FlapVenue.sol";
import {IFlapPortal} from "../src/interfaces/IFlapPortal.sol";
import {MockFlapPortal} from "../test/mocks/MockFlapPortal.sol";
import {MockFlapTaxToken, TestERC20} from "../test/mocks/MockFlapTaxToken.sol";

interface IMintableERC20 {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice Self-contained FlapVenue demo: deploys the venue, seeds concentrated liquidity, runs a loop
///         of exact-input swaps (both directions) to generate the on-chain HookTaxSkim / CommissionAccrued
///         event stream, then performs a creator claim. Self-contained because BaseScript provisions fresh
///         V4 artifacts per run, so the whole demo lives in one EVM context. (run() is split into helpers
///         to keep each frame's locals under the stack limit.)
contract SeedAndSwap is BaseScript {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;

    uint16 internal constant START_TAX_BPS = 1000;
    uint16 internal constant PROTOCOL_SHARE_BPS = 1000;
    uint256 internal constant SWAPS = 12;

    function run() public {
        address deployer = deployerAddress;

        vm.startBroadcast();
        (FlapVenue hook, PoolKey memory key) = _deployVenue(deployer);
        _seedLiquidity(key, deployer);
        _runSwaps(key, deployer);
        hook.claim(key.currency0);
        hook.claim(key.currency1);
        vm.stopBroadcast();

        console2.log("FlapVenue hook :", address(hook));
        console2.log("pool tax bps   :", hook.currentTaxBps(key.toId()));
        console2.log("skimmed c0     :", hook.totalSkimmed(key.currency0));
        console2.log("skimmed c1     :", hook.totalSkimmed(key.currency1));
    }

    function _deployVenue(address deployer) internal returns (FlapVenue hook, PoolKey memory key) {
        MockFlapPortal portal = new MockFlapPortal();
        MockFlapTaxToken flap = new MockFlapTaxToken("Flap Meme", "FLAP", deployer);
        TestERC20 quote = new TestERC20("USDT0 (mock)", "USDT0");
        portal.setGraduated(address(flap), START_TAX_BPS, address(0xDE));
        _seed(address(flap), deployer);
        _seed(address(quote), deployer);

        uint160 flags =
            uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG);
        bytes memory args = abi.encode(poolManager, IFlapPortal(address(portal)), deployer, PROTOCOL_SHARE_BPS);
        (address hookAddr, bytes32 salt) = HookMiner.find(CREATE2_FACTORY, flags, type(FlapVenue).creationCode, args);
        hook = new FlapVenue{salt: salt}(poolManager, IFlapPortal(address(portal)), deployer, PROTOCOL_SHARE_BPS);
        require(address(hook) == hookAddr, "SeedAndSwap: hook address mismatch");

        (Currency c0, Currency c1) = address(flap) < address(quote)
            ? (Currency.wrap(address(flap)), Currency.wrap(address(quote)))
            : (Currency.wrap(address(quote)), Currency.wrap(address(flap)));
        key = PoolKey(c0, c1, 3000, 60, IHooks(address(hook)));
        poolManager.initialize(key, Constants.SQRT_PRICE_1_1);
    }

    function _seedLiquidity(PoolKey memory key, address to) internal {
        int24 tickLower = TickMath.minUsableTick(key.tickSpacing);
        int24 tickUpper = TickMath.maxUsableTick(key.tickSpacing);
        (uint256 a0, uint256 a1) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            1000e18
        );
        positionManager.mint(
            key, tickLower, tickUpper, 1000e18, a0 + 1, a1 + 1, to, block.timestamp, Constants.ZERO_BYTES
        );
    }

    function _runSwaps(PoolKey memory key, address to) internal {
        for (uint256 i = 0; i < SWAPS; i++) {
            swapRouter.swapExactTokensForTokens({
                amountIn: 1e18,
                amountOutMin: 0,
                zeroForOne: i % 2 == 0,
                poolKey: key,
                hookData: Constants.ZERO_BYTES,
                receiver: to,
                deadline: block.timestamp + 1
            });
        }
    }

    function _seed(address token, address to) internal {
        IMintableERC20(token).mint(to, 100_000_000 ether);
        IMintableERC20(token).approve(address(permit2), type(uint256).max);
        IMintableERC20(token).approve(address(swapRouter), type(uint256).max);
        permit2.approve(token, address(positionManager), type(uint160).max, type(uint48).max);
        permit2.approve(token, address(poolManager), type(uint160).max, type(uint48).max);
    }
}
