// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice The tax processor attached to a Flap V3 tax token, which holds the creator commission receiver.
/// @dev    On the real Flap, `commissionReceiver` is the protocol-calculated permanent integrator share
///         address read via `IFlapTaxTokenV3(token).taxProcessor().commissionReceiver()`.
interface ITaxProcessor {
    function commissionReceiver() external view returns (address);
}

/// @notice A Flap V3 tax token exposes its tax processor.
interface IFlapTaxTokenV3 {
    function taxProcessor() external view returns (ITaxProcessor);
}
