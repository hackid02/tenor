// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ICLPool, ICLSwapCallback} from "./interfaces/ICLPool.sol";

/// @title TenorQuoter
/// @notice Exact quotes for Tenor trades against a Mezo CL pool, whatever
///         liquidity the pool holds. Each quote runs the real pool swap and
///         reverts inside the swap callback with the amounts, so nothing is
///         ever transferred. Call these functions with eth_call only.
/// @dev Uniswap V3 QuoterV2 pattern. Partial fills (the pool ran out of
///      liquidity in range) are reported, never hidden. `limit` is the
///      sqrtPriceX96 where the simulated swap stops (0 = no limit). Pass a
///      realistic bound: without one, a quote far larger than the pool walks
///      the whole tick range and runs out of gas.
contract TenorQuoter is ICLSwapCallback {
    uint160 private constant MIN_SQRT_RATIO = 4295128739;
    uint160 private constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    error Quote(int256 amount0, int256 amount1, uint160 sqrtPriceAfterX96);
    error UnexpectedRevert(bytes data);

    struct Result {
        uint256 amountIn; // what the pool would take
        uint256 amountOut; // what the pool would give
        bool filled; // false if the pool could not fill the full amount
        uint160 sqrtPriceAfterX96;
    }

    /// @notice MUSD -> PT for exactly `musdIn` MUSD ("Fix my yield").
    function quoteBuyPT(ICLPool pool, address pt, uint256 musdIn, uint160 limit) external returns (Result memory r) {
        bool ptIs0 = pool.token0() == pt;
        r = _quote(pool, !ptIs0, int256(musdIn), ptIs0, limit);
        r.filled = r.amountIn == musdIn;
    }

    /// @notice PT -> MUSD for exactly `ptIn` PT ("Exit early", and "Buy YT" funding).
    function quoteSellPT(ICLPool pool, address pt, uint256 ptIn, uint160 limit) external returns (Result memory r) {
        bool ptIs0 = pool.token0() == pt;
        r = _quote(pool, ptIs0, int256(ptIn), !ptIs0, limit);
        r.filled = r.amountIn == ptIn;
    }

    /// @notice MUSD needed to receive exactly `ptOut` PT ("Sell YT" and "Sell future yield").
    function quoteExactPT(ICLPool pool, address pt, uint256 ptOut, uint160 limit) external returns (Result memory r) {
        bool ptIs0 = pool.token0() == pt;
        r = _quote(pool, !ptIs0, -int256(ptOut), ptIs0, limit);
        r.filled = r.amountOut == ptOut;
    }

    /// @dev Called mid-swap: slot0 already holds the post-swap price here.
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata) external view override {
        (uint160 sqrtPriceX96,,,,,) = ICLPool(msg.sender).slot0();
        revert Quote(amount0Delta, amount1Delta, sqrtPriceX96);
    }

    /// @param outIs0 whether the output token is token0
    function _quote(ICLPool pool, bool zeroForOne, int256 amountSpecified, bool outIs0, uint160 limit)
        internal
        returns (Result memory r)
    {
        if (limit == 0) limit = zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1;
        try pool.swap(address(this), zeroForOne, amountSpecified, limit, "") {
            revert UnexpectedRevert("");
        } catch (bytes memory reason) {
            if (reason.length != 100 || bytes4(reason) != Quote.selector) revert UnexpectedRevert(reason);
            int256 a0;
            int256 a1;
            uint160 p;
            assembly {
                a0 := mload(add(reason, 36))
                a1 := mload(add(reason, 68))
                p := mload(add(reason, 100))
            }
            (int256 inDelta, int256 outDelta) = outIs0 ? (a1, a0) : (a0, a1);
            r.amountIn = uint256(inDelta);
            r.amountOut = uint256(-outDelta);
            r.sqrtPriceAfterX96 = p;
        }
    }
}
