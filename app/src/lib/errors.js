import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

// Contract errors from TenorMarket / TenorRouter / OpenZeppelin, in plain words.
const MESSAGES = {
  Slippage: "The price moved past your limit. Refresh the quote and try again.",
  PartialFill: "The pool doesn’t have enough liquidity for this size. Try a smaller amount.",
  Matured: "This market has matured. New positions are closed.",
  NotMatured: "PT can be redeemed 1:1 only after maturity.",
  ZeroAmount: "Enter an amount above zero.",
  BadPool: "That pool isn’t Tenor's Mezo pool for this market.",
  ERC20InsufficientBalance: "Your balance is too low for this amount.",
  ERC20InsufficientAllowance: "Approve the token first.",
};

export function explain(e) {
  if (e instanceof BaseError) {
    if (e.walk((x) => x instanceof UserRejectedRequestError) || /rejected|denied/i.test(e.shortMessage || "")) {
      return "You rejected the request in your wallet.";
    }
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    const name = revert?.data?.errorName;
    if (name && MESSAGES[name]) return MESSAGES[name];
    if (name) return `The contract rejected this (${name}).`;
    if (/insufficient funds/i.test(e.message)) return "Not enough BTC for gas. Get test BTC from the Mezo faucet.";
    return e.shortMessage || "Something went wrong. Try again.";
  }
  return "Something went wrong. Try again.";
}
