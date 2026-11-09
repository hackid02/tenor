// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICLPool, ICLSwapCallback} from "./interfaces/ICLPool.sol";
import {TenorMarket} from "./TenorMarket.sol";

interface ICLFactory {
    function getPool(address tokenA, address tokenB, int24 tickSpacing) external view returns (address);
}

/// @title TenorRouter
/// @notice One-transaction actions on a TenorMarket and its PT/MUSD
///         concentrated-liquidity pool on Mezo Pools:
///         - buyPT:        MUSD -> PT            ("Fix my yield")
///         - sellPT:       PT -> MUSD            (exit a fixed position early)
///         - sellYT:       YT -> MUSD            (buy exact PT, redeem PT+YT, pay pool)
///         - buyYT:        MUSD -> YT            (sell PT for MUSD, mint PT+YT, pay pool in PT)
///         - cashOutYield: MUSD -> PT + MUSD now ("Sell my future yield")
/// @dev Only pools created by Mezo's CL factory for the market's PT/MUSD pair
///      are accepted, and the swap callback only accepts the pool this router
///      is currently swapping with. Holds no funds between transactions.
///      Quotes: simulate these functions with eth_call (staticCall).
contract TenorRouter is ICLSwapCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint160 private constant MIN_SQRT_RATIO = 4295128739;
    uint160 private constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    ICLFactory public immutable clFactory;

    enum Op {
        Pay,
        SellYT,
        BuyYT
    }

    struct CB {
        Op op;
        TenorMarket market;
        address payer;
        address recipient;
        uint256 amount;
        uint256 limit;
    }

    address private _activePool;

    error BadPool();
    error Slippage();
    error UnauthorizedCallback();
    error ZeroAmount();
    error PartialFill();

    constructor(address clFactory_) {
        clFactory = ICLFactory(clFactory_);
    }

    // ------------------------------------------------------------------
    // PT trades
    // ------------------------------------------------------------------

    function buyPT(TenorMarket market, ICLPool pool, uint256 musdIn, uint256 minPtOut, address to)
        external
        nonReentrant
        returns (uint256 ptOut)
    {
        if (musdIn == 0) revert ZeroAmount();
        bool musdIs0 = _check(market, pool);
        (int256 a0, int256 a1) = _swap(pool, to, musdIs0, int256(musdIn), CB(Op.Pay, market, msg.sender, to, 0, 0));
        ptOut = uint256(-(musdIs0 ? a1 : a0));
        if (uint256(musdIs0 ? a0 : a1) != musdIn) revert PartialFill();
        if (ptOut < minPtOut) revert Slippage();
    }

    function sellPT(TenorMarket market, ICLPool pool, uint256 ptIn, uint256 minMusdOut, address to)
        external
        nonReentrant
        returns (uint256 musdOut)
    {
        if (ptIn == 0) revert ZeroAmount();
        bool musdIs0 = _check(market, pool);
        (int256 a0, int256 a1) = _swap(pool, to, !musdIs0, int256(ptIn), CB(Op.Pay, market, msg.sender, to, 0, 0));
        musdOut = uint256(-(musdIs0 ? a0 : a1));
        if (uint256(musdIs0 ? a1 : a0) != ptIn) revert PartialFill();
        if (musdOut < minMusdOut) revert Slippage();
    }

    // ------------------------------------------------------------------
    // YT trades
    // ------------------------------------------------------------------

    /// @notice Sell `ytIn` YT for MUSD.
    function sellYT(TenorMarket market, ICLPool pool, uint256 ytIn, uint256 minMusdOut, address to)
        external
        nonReentrant
        returns (uint256 musdOut)
    {
        if (ytIn == 0) revert ZeroAmount();
        IERC20(address(market.yt())).safeTransferFrom(msg.sender, address(this), ytIn);
        musdOut = _sellYT(market, pool, ytIn, to);
        if (musdOut < minMusdOut) revert Slippage();
        IERC20(address(market.musd())).safeTransfer(to, musdOut);
    }

    /// @notice Buy `ytOut` YT, paying at most `maxMusdIn` MUSD.
    function buyYT(TenorMarket market, ICLPool pool, uint256 ytOut, uint256 maxMusdIn, address to)
        external
        nonReentrant
        returns (uint256 musdIn)
    {
        if (ytOut == 0) revert ZeroAmount();
        bool musdIs0 = _check(market, pool);
        // Sell exactly ytOut PT (minted in the callback) for MUSD.
        (int256 a0, int256 a1) =
            _swap(pool, address(this), !musdIs0, int256(ytOut), CB(Op.BuyYT, market, msg.sender, to, ytOut, maxMusdIn));
        musdIn = ytOut - uint256(-(musdIs0 ? a0 : a1));
        IERC20(address(market.yt())).safeTransfer(to, ytOut);
    }

    /// @notice "Sell my future yield": deposit MUSD, keep the PT (worth
    ///         `musdIn` MUSD at maturity) and receive the YT's value now.
    function cashOutYield(TenorMarket market, ICLPool pool, uint256 musdIn, uint256 minMusdOut, address to)
        external
        nonReentrant
        returns (uint256 musdOut)
    {
        if (musdIn == 0) revert ZeroAmount();
        IERC20 musd = IERC20(address(market.musd()));
        musd.safeTransferFrom(msg.sender, address(this), musdIn);
        musd.forceApprove(address(market), musdIn);
        market.deposit(musdIn, address(this));
        IERC20(address(market.pt())).safeTransfer(to, musdIn);
        musdOut = _sellYT(market, pool, musdIn, to);
        if (musdOut < minMusdOut) revert Slippage();
        musd.safeTransfer(to, musdOut);
    }

    // ------------------------------------------------------------------
    // Swap callback
    // ------------------------------------------------------------------

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external override {
        if (msg.sender != _activePool) revert UnauthorizedCallback();
        CB memory c = abi.decode(data, (CB));
        IERC20 musd = IERC20(address(c.market.musd()));
        IERC20 pt = IERC20(address(c.market.pt()));
        bool musdIs0 = ICLPool(msg.sender).token0() == address(musd);
        int256 musdDelta = musdIs0 ? amount0Delta : amount1Delta;
        int256 ptDelta = musdIs0 ? amount1Delta : amount0Delta;

        if (c.op == Op.Pay) {
            if (musdDelta > 0) musd.safeTransferFrom(c.payer, msg.sender, uint256(musdDelta));
            if (ptDelta > 0) pt.safeTransferFrom(c.payer, msg.sender, uint256(ptDelta));
        } else if (c.op == Op.SellYT) {
            // Router received exactly c.amount PT and holds c.amount YT.
            uint256 owed = uint256(musdDelta);
            // YT only has value while PT costs less than 1 MUSD.
            if (owed >= c.amount) revert Slippage();
            c.market.redeemPair(c.amount, address(this));
            // Forward any yield that accrued to the router's YT during redeem.
            c.market.claimYield(c.recipient);
            musd.safeTransfer(msg.sender, owed);
        } else {
            // BuyYT: router received MUSD and owes exactly c.amount PT.
            if (uint256(ptDelta) != c.amount) revert PartialFill();
            uint256 need = c.amount - uint256(-musdDelta);
            if (need > c.limit) revert Slippage();
            musd.safeTransferFrom(c.payer, address(this), need);
            musd.forceApprove(address(c.market), c.amount);
            c.market.deposit(c.amount, address(this));
            pt.safeTransfer(msg.sender, c.amount);
        }
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    function _sellYT(TenorMarket market, ICLPool pool, uint256 ytIn, address to) internal returns (uint256 musdOut) {
        bool musdIs0 = _check(market, pool);
        // Buy exactly ytIn PT with MUSD; pay for it in the callback.
        (int256 a0, int256 a1) =
            _swap(pool, address(this), musdIs0, -int256(ytIn), CB(Op.SellYT, market, address(this), to, ytIn, 0));
        if (uint256(-(musdIs0 ? a1 : a0)) != ytIn) revert PartialFill();
        // Redeeming ytIn PT+YT returned ytIn MUSD; the pool was paid from it.
        musdOut = ytIn - uint256(musdIs0 ? a0 : a1);
    }

    function _swap(ICLPool pool, address recipient, bool zeroForOne, int256 amountSpecified, CB memory c)
        internal
        returns (int256 a0, int256 a1)
    {
        _activePool = address(pool);
        (a0, a1) = pool.swap(
            recipient,
            zeroForOne,
            amountSpecified,
            zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1,
            abi.encode(c)
        );
        _activePool = address(0);
    }

    /// @dev Pool must be Mezo's CL pool for this market's PT/MUSD pair.
    function _check(TenorMarket market, ICLPool pool) internal view returns (bool musdIs0) {
        address musd = address(market.musd());
        address pt = address(market.pt());
        if (clFactory.getPool(musd, pt, pool.tickSpacing()) != address(pool)) revert BadPool();
        musdIs0 = pool.token0() == musd;
    }
}
