// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice The minimal, layout-independent view FlapVenue needs from a Flap graduation source.
/// @dev    FlapVenue deliberately depends on this tiny interface — NOT on Flap's closed-source
///         `getTokenV5`/`getTokenV7` struct — so the hook carries no fragile ABI-layout assumption.
///
///         Demo / X Layer testnet: `MockFlapPortal` implements this directly.
///
///         Real X Layer mainnet integration (Flap Portal `0xb30D8c4216E1f21F27444D2FfAee3ad577808678`):
///         write a thin adapter that implements this interface by calling the live Portal's
///         `getTokenV7(token)` and returning `status == TokenStatus.DEX (4)` for `isGraduated`, and the
///         token's creator-tax rate for `startTaxBps`. The real struct layout MUST be verified
///         field-for-field against the live contract (e.g. via a mainnet-fork test) inside that adapter —
///         it is intentionally kept out of the hook so a layout mistake can never reach pool accounting.
///         (FlapVenue also clamps `startTaxBps` to its 10% cap, bounding any adapter mis-read.)
interface IFlapPortal {
    /// @return True if `token` has graduated from Flap onto a DEX.
    function isGraduated(address token) external view returns (bool);

    /// @return The starting creator-tax rate for `token`, in basis points (hook clamps to its max).
    function startTaxBps(address token) external view returns (uint256);
}
