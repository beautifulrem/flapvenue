// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {IFlapTaxTokenV3, ITaxProcessor} from "../../src/interfaces/IFlapTaxTokenV3.sol";

/// @notice Plain mintable ERC-20 for tests (e.g. the quote token). No transfer tax.
contract TestERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol, 18) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice The creator commission receiver holder, as exposed by a Flap V3 tax token.
contract MockTaxProcessor is ITaxProcessor {
    address public commissionReceiver;

    constructor(address _commissionReceiver) {
        commissionReceiver = _commissionReceiver;
    }
}

/// @notice A "graduated" Flap tax token living in a V4 pool. Crucially it has NO ERC-20 transfer tax —
///         the creator tax is applied by the FlapVenue hook instead. This is the whole point: a Flap
///         tax token gets concentrated liquidity for the first time (Flap docs forbid tax tokens from
///         CL/V3/V4 migration today).
contract MockFlapTaxToken is ERC20, IFlapTaxTokenV3 {
    ITaxProcessor public taxProcessor;

    constructor(string memory name, string memory symbol, address commissionReceiver) ERC20(name, symbol, 18) {
        taxProcessor = new MockTaxProcessor(commissionReceiver);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
