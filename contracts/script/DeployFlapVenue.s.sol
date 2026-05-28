// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {console2} from "forge-std/Script.sol";

import {BaseScript} from "./base/BaseScript.sol";
import {FlapVenue} from "../src/FlapVenue.sol";
import {IFlapPortal} from "../src/interfaces/IFlapPortal.sol";
import {MockFlapPortal} from "../test/mocks/MockFlapPortal.sol";
import {MockFlapTaxToken, TestERC20} from "../test/mocks/MockFlapTaxToken.sol";

/// @notice Deploys FlapVenue end-to-end: a (mock) Flap Portal + a graduated tax token + quote token,
///         mines a CREATE2 salt so the hook address encodes its permission flags, deploys the hook, and
///         initializes the FlapVenue pool. On X Layer testnet (no real Flap) the mock Portal stands in
///         for the real one; on anvil the V4 artifacts are deployed by BaseScript.
contract DeployFlapVenue is BaseScript {
    uint16 internal constant START_TAX_BPS = 1000; // 10%
    uint16 internal constant PROTOCOL_SHARE_BPS = 1000; // 10% of each skim to protocol

    function run() public {
        address deployer = deployerAddress;

        vm.startBroadcast();

        // 1. Demo Flap state: mock Portal + a graduated tax token (NO transfer tax) + a quote token.
        MockFlapPortal portal = new MockFlapPortal();
        MockFlapTaxToken flap = new MockFlapTaxToken("Flap Meme", "FLAP", deployer);
        TestERC20 quote = new TestERC20("USDT0 (mock)", "USDT0");
        flap.mint(deployer, 100_000_000 ether);
        quote.mint(deployer, 100_000_000 ether);
        portal.setGraduated(address(flap), START_TAX_BPS, address(0xDE));

        // 2. Mine a salt so the deployed address carries the hook's permission flags.
        uint160 flags =
            uint160(Hooks.AFTER_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG);
        bytes memory args = abi.encode(poolManager, IFlapPortal(address(portal)), deployer, PROTOCOL_SHARE_BPS);
        (address hookAddr, bytes32 salt) = HookMiner.find(CREATE2_FACTORY, flags, type(FlapVenue).creationCode, args);

        // 3. Deploy the hook (salted creation routes through the deterministic CREATE2 factory).
        FlapVenue hook =
            new FlapVenue{salt: salt}(poolManager, IFlapPortal(address(portal)), deployer, PROTOCOL_SHARE_BPS);
        require(address(hook) == hookAddr, "DeployFlapVenue: hook address mismatch");

        // 4. Initialize the FlapVenue pool — triggers Portal-gated graduation config in afterInitialize.
        (Currency c0, Currency c1) = address(flap) < address(quote)
            ? (Currency.wrap(address(flap)), Currency.wrap(address(quote)))
            : (Currency.wrap(address(quote)), Currency.wrap(address(flap)));
        PoolKey memory key = PoolKey(c0, c1, 3000, 60, IHooks(address(hook)));
        poolManager.initialize(key, Constants.SQRT_PRICE_1_1);

        vm.stopBroadcast();

        console2.log("FlapVenue hook :", address(hook));
        console2.log("MockFlapPortal :", address(portal));
        console2.log("Flap token     :", address(flap));
        console2.log("Quote token    :", address(quote));
        console2.log("PoolManager    :", address(poolManager));
    }
}
