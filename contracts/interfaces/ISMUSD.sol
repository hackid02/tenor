// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Subset of Mezo's MUSDSavingsRate (sMUSD) vault used by Tenor.
/// @dev sMUSD is minted 1:1 for MUSD. Yield is paid separately in MUSD via
///      claimYield(). withdraw() returns principal 1:1 AND pays out any
///      claimable yield to the caller in the same call.
interface ISMUSD is IERC20 {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function claimYield() external returns (uint256);
    function musdToken() external view returns (address);
    function yieldIndex() external view returns (uint256);
    function supplyYieldIndex(address user) external view returns (uint256);
    function claimableYield(address user) external view returns (uint256);
}
