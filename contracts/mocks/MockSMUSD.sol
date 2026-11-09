// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Test-only copy of the yield logic in Mezo's MUSDSavingsRate
///      (yield index, auto-claim on withdraw, transfer checkpoints).
///      The strategy/PCV parts are replaced by an optional "pending fee"
///      that is distributed on deposit/withdraw, like pcv.distributeMUSD().
contract MockSMUSD is ERC20 {
    using SafeERC20 for IERC20;

    IERC20 public immutable musdToken;
    uint256 public yieldIndex;
    mapping(address => uint256) public supplyYieldIndex;
    mapping(address => uint256) public claimableYield;
    uint256 public pendingYield;
    uint256 public queuedFee; // distributed on next deposit/withdraw

    constructor(address musd_) ERC20("MUSD Savings Rate", "sMUSD") {
        musdToken = IERC20(musd_);
    }

    function queueFee(uint256 amount) external {
        musdToken.safeTransferFrom(msg.sender, address(this), amount);
        queuedFee += amount;
    }

    function _flushQueued() internal {
        uint256 q = queuedFee;
        if (q > 0) {
            queuedFee = 0;
            _receiveYield(q);
        }
    }

    function deposit(uint256 amount) external {
        require(amount > 0, "zero");
        _flushQueued();
        musdToken.safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        require(amount > 0 && balanceOf(msg.sender) >= amount, "bal");
        _flushQueued();
        _claimYield(msg.sender);
        _burn(msg.sender, amount);
        musdToken.safeTransfer(msg.sender, amount);
    }

    function claimYield() external returns (uint256) {
        return _claimYield(msg.sender);
    }

    function receiveProtocolYield(uint256 amount) external {
        musdToken.safeTransferFrom(msg.sender, address(this), amount);
        _receiveYield(amount);
    }

    function _claimYield(address d) internal returns (uint256 c) {
        _updateYieldFor(d);
        c = claimableYield[d];
        if (c > 0) {
            claimableYield[d] = 0;
            musdToken.safeTransfer(d, c);
        }
    }

    function _receiveYield(uint256 amount) internal {
        uint256 s = totalSupply();
        if (s > 0) {
            uint256 total = amount + pendingYield;
            pendingYield = 0;
            uint256 r = (total * 1e18) / s;
            require(r > 0, "AmountTooSmall");
            yieldIndex += r;
        } else {
            pendingYield += amount;
        }
    }

    function _updateYieldFor(address u) internal {
        uint256 b = balanceOf(u);
        if (b > 0) {
            uint256 delta = yieldIndex - supplyYieldIndex[u];
            supplyYieldIndex[u] = yieldIndex;
            if (delta > 0) claimableYield[u] += (b * delta) / 1e18;
        } else {
            supplyYieldIndex[u] = yieldIndex;
        }
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != to) {
            if (from != address(0)) _updateYieldFor(from);
            if (to != address(0)) _updateYieldFor(to);
        }
        super._update(from, to, value);
    }
}
