// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPool, IPoolCallee} from "./interfaces/IPool.sol";
import {TenorMarket} from "./TenorMarket.sol";

/// @title TenorRouter
/// @notice One-transaction actions on top of a TenorMarket and its PT/MUSD
///         pool on Mezo Pools:
///         - buyPT:     MUSD -> PT  ("Fix my yield")
///         - sellPT:    PT -> MUSD  (exit a fixed position early)
///         - sellYT:    YT -> MUSD  (flash-swap PT, redeem pair)
///         - buyYT:     MUSD -> YT  (flash-swap MUSD, mint pair, repay in PT)
///         - cashOutYield: MUSD -> PT + upfront MUSD ("Sell my future yield")
/// @dev Holds no funds between transactions. The flash callback only accepts
///      calls from the pool this router is currently swapping with.
contract TenorRouter is IPoolCallee, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Op {
        SellYT,
        BuyYT
    }

    struct FlashData {
        Op op;
        TenorMarket market;
        uint256 amount; // YT amount being sold or bought
        uint256 musdToPool; // SellYT: MUSD owed to the pool
        address recipient; // receives YT yield accrued during the flash
    }

    address private _activePool;

    error BadPool();
    error Slippage();
    error UnauthorizedCallback();
    error ZeroAmount();

    // ------------------------------------------------------------------
    // PT trades
    // ------------------------------------------------------------------

    function buyPT(TenorMarket market, IPool pool, uint256 musdIn, uint256 minPtOut, address to)
        external
        nonReentrant
        returns (uint256 ptOut)
    {
        if (musdIn == 0) revert ZeroAmount();
        (IERC20 musd, IERC20 pt) = _tokens(market, pool);
        ptOut = pool.getAmountOut(musdIn, address(musd));
        if (ptOut < minPtOut) revert Slippage();
        musd.safeTransferFrom(msg.sender, address(pool), musdIn);
        _swapOut(pool, address(pt), ptOut, to, "");
    }

    function sellPT(TenorMarket market, IPool pool, uint256 ptIn, uint256 minMusdOut, address to)
        external
        nonReentrant
        returns (uint256 musdOut)
    {
        if (ptIn == 0) revert ZeroAmount();
        (IERC20 musd, IERC20 pt) = _tokens(market, pool);
        musdOut = pool.getAmountOut(ptIn, address(pt));
        if (musdOut < minMusdOut) revert Slippage();
        pt.safeTransferFrom(msg.sender, address(pool), ptIn);
        _swapOut(pool, address(musd), musdOut, to, "");
    }

    // ------------------------------------------------------------------
    // YT trades (flash swaps through the PT pool)
    // ------------------------------------------------------------------

    /// @notice Sell `ytIn` YT for MUSD.
    /// @param musdToPool MUSD paid to the pool for `ytIn` PT. Quote it off-chain
    ///        as the smallest x with pool.getAmountOut(x, MUSD) >= ytIn.
    function sellYT(
        TenorMarket market,
        IPool pool,
        uint256 ytIn,
        uint256 musdToPool,
        uint256 minMusdOut,
        address to
    ) external nonReentrant returns (uint256 musdOut) {
        if (ytIn == 0) revert ZeroAmount();
        IERC20(address(market.yt())).safeTransferFrom(msg.sender, address(this), ytIn);
        musdOut = _sellYT(market, pool, ytIn, musdToPool, to);
        if (musdOut < minMusdOut) revert Slippage();
        IERC20(address(market.musd())).safeTransfer(to, musdOut);
    }

    /// @notice Buy `ytOut` YT, paying at most `maxMusdIn` MUSD.
    function buyYT(TenorMarket market, IPool pool, uint256 ytOut, uint256 maxMusdIn, address to)
        external
        nonReentrant
        returns (uint256 musdIn)
    {
        if (ytOut == 0) revert ZeroAmount();
        (IERC20 musd, IERC20 pt) = _tokens(market, pool);
        // Selling ytOut PT into the pool funds part of the ytOut MUSD deposit.
        uint256 musdFromPool = pool.getAmountOut(ytOut, address(pt));
        musdIn = ytOut - musdFromPool;
        if (musdIn > maxMusdIn) revert Slippage();
        musd.safeTransferFrom(msg.sender, address(this), musdIn);

        _flash(pool, address(musd), musdFromPool, FlashData(Op.BuyYT, market, ytOut, 0, to));
        IERC20(address(market.yt())).safeTransfer(to, ytOut);
    }

    /// @notice "Sell my future yield": deposit MUSD, keep the PT (worth
    ///         `musdIn` MUSD at maturity) and receive the YT's value now.
    function cashOutYield(
        TenorMarket market,
        IPool pool,
        uint256 musdIn,
        uint256 musdToPool,
        uint256 minMusdOut,
        address to
    ) external nonReentrant returns (uint256 musdOut) {
        if (musdIn == 0) revert ZeroAmount();
        IERC20 musd = IERC20(address(market.musd()));
        musd.safeTransferFrom(msg.sender, address(this), musdIn);
        musd.forceApprove(address(market), musdIn);
        market.deposit(musdIn, address(this));
        IERC20(address(market.pt())).safeTransfer(to, musdIn);
        musdOut = _sellYT(market, pool, musdIn, musdToPool, to);
        if (musdOut < minMusdOut) revert Slippage();
        musd.safeTransfer(to, musdOut);
    }

    // ------------------------------------------------------------------
    // Flash callback
    // ------------------------------------------------------------------

    function hook(address sender, uint256, uint256, bytes calldata data) external override {
        if (msg.sender != _activePool || sender != address(this)) revert UnauthorizedCallback();
        FlashData memory d = abi.decode(data, (FlashData));
        IERC20 musd = IERC20(address(d.market.musd()));

        if (d.op == Op.SellYT) {
            // Router now holds d.amount PT (from the pool) and d.amount YT.
            d.market.redeemPair(d.amount, address(this));
            // Forward any yield that accrued to the router's YT during redeem.
            d.market.claimYield(d.recipient);
            musd.safeTransfer(msg.sender, d.musdToPool);
        } else {
            // Router holds the user's MUSD plus the MUSD flashed from the pool.
            musd.forceApprove(address(d.market), d.amount);
            d.market.deposit(d.amount, address(this));
            IERC20(address(d.market.pt())).safeTransfer(msg.sender, d.amount);
        }
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    function _sellYT(TenorMarket market, IPool pool, uint256 ytIn, uint256 musdToPool, address to)
        internal
        returns (uint256 musdOut)
    {
        (, IERC20 pt) = _tokens(market, pool);
        // YT only has value while PT trades below 1 MUSD.
        if (musdToPool >= ytIn) revert Slippage();
        _flash(pool, address(pt), ytIn, FlashData(Op.SellYT, market, ytIn, musdToPool, to));
        // Redeeming ytIn pairs returned ytIn MUSD; musdToPool went to the pool.
        musdOut = ytIn - musdToPool;
    }

    function _flash(IPool pool, address tokenOut, uint256 amountOut, FlashData memory d) internal {
        _activePool = address(pool);
        _swapOut(pool, tokenOut, amountOut, address(this), abi.encode(d));
        _activePool = address(0);
    }

    function _swapOut(IPool pool, address tokenOut, uint256 amountOut, address to, bytes memory data) internal {
        if (pool.token0() == tokenOut) pool.swap(amountOut, 0, to, data);
        else pool.swap(0, amountOut, to, data);
    }

    function _tokens(TenorMarket market, IPool pool) internal view returns (IERC20 musd, IERC20 pt) {
        musd = IERC20(address(market.musd()));
        pt = IERC20(address(market.pt()));
        address t0 = pool.token0();
        address t1 = pool.token1();
        bool ok = (t0 == address(musd) && t1 == address(pt)) || (t0 == address(pt) && t1 == address(musd));
        if (!ok) revert BadPool();
    }
}
