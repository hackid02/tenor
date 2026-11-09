// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Subset of a Mezo Pools concentrated-liquidity pool (Slipstream,
///         Uniswap V3 style). amount0/amount1 deltas are positive when the
///         pool receives tokens and negative when it sends them.
interface ICLPool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function tickSpacing() external view returns (int24);
    function liquidity() external view returns (uint128);
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            bool unlocked
        );
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
}

/// @notice Swap callback Mezo CL pools call on the swapper.
interface ICLSwapCallback {
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external;
}
