// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IFlapPortal} from "../../src/interfaces/IFlapPortal.sol";

/// @notice Test/dev implementation of the graduation source FlapVenue reads. Lets us mark a token as
///         graduated with a starting tax rate, standing in for the real Flap Portal (which only exists on
///         X Layer mainnet). Mirrors the hook's minimal `IFlapPortal` view so tests and the testnet demo
///         exercise the exact code path a real adapter would feed.
contract MockFlapPortal is IFlapPortal {
    struct State {
        bool graduated;
        uint256 taxRate;
    }

    mapping(address => State) internal _state;

    /// @dev `pool` is accepted for call-site parity with real Flap data but is not used by the hook.
    function setGraduated(address token, uint256 taxRate, address) external {
        _state[token] = State({graduated: true, taxRate: taxRate});
    }

    function setGraduated(address token, bool graduated) external {
        _state[token].graduated = graduated;
    }

    function isGraduated(address token) external view returns (bool) {
        return _state[token].graduated;
    }

    function startTaxBps(address token) external view returns (uint256) {
        return _state[token].taxRate;
    }
}
