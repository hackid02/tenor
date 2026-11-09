// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ITenorMarketHook {
    function onYTTransfer(address from, address to) external;
}

/// @title TenorToken
/// @notice PT (principal) or YT (yield) token for one Tenor market. Only the
///         market can mint and burn. YT notifies the market before every
///         balance change so yield is checkpointed for both sides.
contract TenorToken is ERC20 {
    address public immutable market;
    bool public immutable isYieldToken;

    error OnlyMarket();

    constructor(string memory name_, string memory symbol_, bool isYieldToken_) ERC20(name_, symbol_) {
        market = msg.sender;
        isYieldToken = isYieldToken_;
    }

    modifier onlyMarket() {
        if (msg.sender != market) revert OnlyMarket();
        _;
    }

    function mint(address to, uint256 amount) external onlyMarket {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyMarket {
        _burn(from, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (isYieldToken && from != to) {
            ITenorMarketHook(market).onYTTransfer(from, to);
        }
        super._update(from, to, value);
    }
}
