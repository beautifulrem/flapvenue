// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";

import {FlapVenue} from "../src/FlapVenue.sol";
import {IFlapPortal} from "../src/interfaces/IFlapPortal.sol";
import {MockFlapPortal} from "../test/mocks/MockFlapPortal.sol";
import {MockFlapTaxToken, TestERC20} from "../test/mocks/MockFlapTaxToken.sol";

/// @notice Full FlapVenue deploy for X Layer testnet (which has no canonical Uniswap V4): deploys our own
///         PoolManager + v4-core test routers (no Permit2 dependency), a mock Flap Portal + graduated tax
///         token + quote token, mines+deploys the hook, initializes the pool, seeds liquidity, and runs a
///         few swaps to emit the HookTaxSkim/CommissionAccrued event stream. Reads PRIVATE_KEY from the
///         environment (forge auto-loads contracts/.env) — never on the command line. State vars keep
///         each function's stack small.
contract DeployTestnet is Script {
    using PoolIdLibrary for PoolKey;

    uint16 internal constant START_TAX_BPS = 1000; // 10%
    uint16 internal constant PROTOCOL_SHARE_BPS = 1000; // 10% of each skim
    uint256 internal constant SWAPS = 8;
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    PoolManager internal manager;
    PoolSwapTest internal swapRouter;
    PoolModifyLiquidityTest internal lpRouter;
    MockFlapPortal internal portal;
    MockFlapTaxToken internal flap;
    TestERC20 internal quote;
    FlapVenue internal hook;
    PoolKey internal poolKey;

    function run() public {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        console2.log("deployer       :", deployer);
        console2.log("balance (wei)  :", deployer.balance);

        vm.startBroadcast(pk);
        _deployInfra(deployer);
        _deployHookAndPool(deployer);
        _seedAndSwap();
        vm.stopBroadcast();

        _report();
    }

    function _deployInfra(address deployer) internal {
        manager = new PoolManager(deployer);
        swapRouter = new PoolSwapTest(IPoolManager(address(manager)));
        lpRouter = new PoolModifyLiquidityTest(IPoolManager(address(manager)));

        portal = new MockFlapPortal();
        flap = new MockFlapTaxToken("Flap Meme", "FLAP", deployer);
        quote = new TestERC20("USDT0 (mock)", "USDT0");
        flap.mint(deployer, 1_000_000 ether);
        quote.mint(deployer, 1_000_000 ether);
        portal.setGraduated(address(flap), START_TAX_BPS, address(0xDE));

        flap.approve(address(swapRouter), type(uint256).max);
        quote.approve(address(swapRouter), type(uint256).max);
        flap.approve(address(lpRouter), type(uint256).max);
        quote.approve(address(lpRouter), type(uint256).max);
    }

    function _deployHookAndPool(address deployer) internal {
        uint160 flags =
            uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG);
        bytes memory args =
            abi.encode(IPoolManager(address(manager)), IFlapPortal(address(portal)), deployer, PROTOCOL_SHARE_BPS);
        (address hookAddr, bytes32 salt) = HookMiner.find(CREATE2_DEPLOYER, flags, type(FlapVenue).creationCode, args);
        hook = new FlapVenue{salt: salt}(
            IPoolManager(address(manager)), IFlapPortal(address(portal)), deployer, PROTOCOL_SHARE_BPS
        );
        require(address(hook) == hookAddr, "DeployTestnet: hook address mismatch");

        (Currency c0, Currency c1) = address(flap) < address(quote)
            ? (Currency.wrap(address(flap)), Currency.wrap(address(quote)))
            : (Currency.wrap(address(quote)), Currency.wrap(address(flap)));
        poolKey = PoolKey(c0, c1, 3000, 60, IHooks(address(hook)));
        manager.initialize(poolKey, Constants.SQRT_PRICE_1_1);
    }

    function _seedAndSwap() internal {
        int24 tl = TickMath.minUsableTick(poolKey.tickSpacing);
        int24 tu = TickMath.maxUsableTick(poolKey.tickSpacing);
        lpRouter.modifyLiquidity(
            poolKey, ModifyLiquidityParams({tickLower: tl, tickUpper: tu, liquidityDelta: 1e20, salt: bytes32(0)}), ""
        );

        PoolSwapTest.TestSettings memory settings =
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false});
        for (uint256 i = 0; i < SWAPS; i++) {
            bool zeroForOne = i % 2 == 0;
            swapRouter.swap(
                poolKey,
                SwapParams({
                    zeroForOne: zeroForOne,
                    amountSpecified: -5e17,
                    sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
                }),
                settings,
                ""
            );
        }
    }

    function _report() internal view {
        console2.log("--- FlapVenue deployed on X Layer testnet ---");
        console2.log("PoolManager  :", address(manager));
        console2.log("FlapVenue    :", address(hook));
        console2.log("Flap token   :", address(flap));
        console2.log("Quote token  :", address(quote));
        console2.log("PoolSwapTest :", address(swapRouter));
        console2.log("LP router    :", address(lpRouter));
        console2.log("tax bps now  :", hook.currentTaxBps(poolKey.toId()));
    }
}
