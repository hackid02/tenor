// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISMUSD} from "./interfaces/ISMUSD.sol";
import {TenorToken} from "./TenorToken.sol";

/// @title TenorMarket
/// @notice Splits MUSD deposited into Mezo's sMUSD savings vault into two
///         tokens for one fixed maturity date:
///         - PT (principal): redeemable 1:1 for MUSD at maturity.
///         - YT (yield): receives all sMUSD yield (in MUSD) until maturity.
///         Buying PT below 1 MUSD locks in a fixed rate. Selling YT turns
///         future yield into MUSD today.
/// @dev Invariants:
///      1. sMUSD.balanceOf(this) == PT.totalSupply() (fully backed, 1:1).
///      2. MUSD held >= sum of unclaimed YT yield + treasuryAccrued.
///      Yield harvested at or after maturity goes to the treasury, so PT
///      holders always redeem exactly 1 MUSD per PT.
contract TenorMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant ACC = 1e27;
    uint256 public constant MAX_FEE_BPS = 1000; // 10% hard cap

    IERC20 public immutable musd;
    ISMUSD public immutable smusd;
    TenorToken public immutable pt;
    TenorToken public immutable yt;
    uint256 public immutable maturity;
    address public immutable treasury;
    uint256 public immutable feeBps;

    /// @notice Accumulated MUSD yield per YT, scaled by 1e27.
    uint256 public accYieldPerYT;
    mapping(address => uint256) public userAcc;
    mapping(address => uint256) public accrued;
    uint256 public treasuryAccrued;
    uint256 public totalYieldHarvested;

    event Deposited(address indexed sender, address indexed receiver, uint256 amount);
    event PairRedeemed(address indexed sender, address indexed receiver, uint256 amount);
    event PTRedeemed(address indexed sender, address indexed receiver, uint256 amount);
    event YieldHarvested(uint256 amount, uint256 toYT, uint256 toTreasury);
    event YieldClaimed(address indexed user, address indexed receiver, uint256 amount);
    event TreasuryClaimed(uint256 amount);

    error ZeroAmount();
    error Matured();
    error NotMatured();
    error OnlyYT();
    error BadConfig();

    constructor(
        address smusd_,
        uint256 maturity_,
        address treasury_,
        uint256 feeBps_,
        string memory label_
    ) {
        if (smusd_ == address(0) || treasury_ == address(0)) revert BadConfig();
        if (maturity_ <= block.timestamp || feeBps_ > MAX_FEE_BPS) revert BadConfig();
        smusd = ISMUSD(smusd_);
        musd = IERC20(ISMUSD(smusd_).musdToken());
        maturity = maturity_;
        treasury = treasury_;
        feeBps = feeBps_;
        pt = new TenorToken(string.concat("Tenor PT-sMUSD ", label_), string.concat("PT-sMUSD-", label_), false);
        yt = new TenorToken(string.concat("Tenor YT-sMUSD ", label_), string.concat("YT-sMUSD-", label_), true);
        musd.forceApprove(smusd_, type(uint256).max);
    }

    // ------------------------------------------------------------------
    // User actions
    // ------------------------------------------------------------------

    /// @notice Deposit MUSD, receive `amount` PT and `amount` YT.
    function deposit(uint256 amount, address receiver) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (isMatured()) revert Matured();
        musd.safeTransferFrom(msg.sender, address(this), amount);
        // sMUSD.deposit may trigger a protocol fee distribution; that yield is
        // owed to existing YT holders, so harvest BEFORE minting new YT.
        smusd.deposit(amount);
        _harvest();
        pt.mint(receiver, amount);
        yt.mint(receiver, amount);
        emit Deposited(msg.sender, receiver, amount);
    }

    /// @notice Burn equal PT + YT at any time to get MUSD back 1:1.
    ///         Unclaimed yield on the burned YT stays claimable.
    function redeemPair(uint256 amount, address receiver) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _harvest();
        _withdrawPrincipal(amount);
        pt.burn(msg.sender, amount);
        yt.burn(msg.sender, amount);
        musd.safeTransfer(receiver, amount);
        emit PairRedeemed(msg.sender, receiver, amount);
    }

    /// @notice After maturity, redeem PT 1:1 for MUSD.
    function redeemPT(uint256 amount, address receiver) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!isMatured()) revert NotMatured();
        _harvest();
        _withdrawPrincipal(amount);
        pt.burn(msg.sender, amount);
        musd.safeTransfer(receiver, amount);
        emit PTRedeemed(msg.sender, receiver, amount);
    }

    /// @notice Claim the caller's accrued YT yield in MUSD.
    function claimYield(address receiver) external nonReentrant returns (uint256 amount) {
        _harvest();
        _checkpoint(msg.sender);
        amount = accrued[msg.sender];
        if (amount > 0) {
            accrued[msg.sender] = 0;
            musd.safeTransfer(receiver, amount);
        }
        emit YieldClaimed(msg.sender, receiver, amount);
    }

    /// @notice Pull yield from sMUSD and distribute it. Callable by anyone
    ///         (a keeper calls it right before maturity).
    function harvest() external nonReentrant returns (uint256) {
        return _harvest();
    }

    /// @notice Send protocol fees to the treasury. Callable by anyone.
    function claimTreasury() external nonReentrant {
        uint256 amount = treasuryAccrued;
        if (amount == 0) revert ZeroAmount();
        treasuryAccrued = 0;
        musd.safeTransfer(treasury, amount);
        emit TreasuryClaimed(amount);
    }

    /// @notice Called by YT before any balance change.
    function onYTTransfer(address from, address to) external {
        if (msg.sender != address(yt)) revert OnlyYT();
        // On a plain transfer, pull yield still sitting in sMUSD first so it
        // is credited to the sender, not the receiver. Mint/burn happen
        // inside market functions that have already harvested.
        if (from != address(0) && to != address(0)) _harvest();
        _checkpoint(from);
        _checkpoint(to);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function isMatured() public view returns (bool) {
        return block.timestamp >= maturity;
    }

    /// @notice Yield a YT holder could claim now, including sMUSD yield
    ///         not yet harvested into this market.
    function previewYield(address user) external view returns (uint256) {
        uint256 acc = accYieldPerYT;
        uint256 supply = yt.totalSupply();
        if (!isMatured() && supply > 0) {
            uint256 pending = _pendingSmusdYield();
            uint256 net = pending - (pending * feeBps) / 10_000;
            acc += (net * ACC) / supply;
        }
        return accrued[user] + (yt.balanceOf(user) * (acc - userAcc[user])) / ACC;
    }

    /// @notice MUSD yield sitting in sMUSD for this market, not yet harvested.
    function pendingSmusdYield() external view returns (uint256) {
        return _pendingSmusdYield();
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    function _pendingSmusdYield() internal view returns (uint256) {
        uint256 bal = smusd.balanceOf(address(this));
        uint256 delta = smusd.yieldIndex() - smusd.supplyYieldIndex(address(this));
        return smusd.claimableYield(address(this)) + (bal * delta) / 1e18;
    }

    function _harvest() internal returns (uint256 got) {
        uint256 before = musd.balanceOf(address(this));
        smusd.claimYield();
        got = musd.balanceOf(address(this)) - before;
        _distribute(got);
    }

    /// @dev Withdraws principal from sMUSD. sMUSD.withdraw also pays any
    ///      claimable yield, which is distributed like harvested yield.
    function _withdrawPrincipal(uint256 amount) internal {
        uint256 before = musd.balanceOf(address(this));
        smusd.withdraw(amount);
        uint256 got = musd.balanceOf(address(this)) - before;
        _distribute(got - amount);
    }

    function _distribute(uint256 amount) internal {
        if (amount == 0) return;
        totalYieldHarvested += amount;
        uint256 supply = yt.totalSupply();
        if (isMatured() || supply == 0) {
            treasuryAccrued += amount;
            emit YieldHarvested(amount, 0, amount);
            return;
        }
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 net = amount - fee;
        uint256 inc = (net * ACC) / supply;
        accYieldPerYT += inc;
        // Rounding dust (< 1 wei per YT-holder) stays in the contract as a
        // solvency buffer; it is never assigned to anyone.
        treasuryAccrued += fee;
        emit YieldHarvested(amount, net, fee);
    }

    function _checkpoint(address user) internal {
        if (user == address(0)) return;
        uint256 acc = accYieldPerYT;
        uint256 bal = yt.balanceOf(user);
        if (bal > 0) {
            accrued[user] += (bal * (acc - userAcc[user])) / ACC;
        }
        userAcc[user] = acc;
    }
}
