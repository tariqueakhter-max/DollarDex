export type UserSafeError = {
  code: string;
  message: string;
};

export function toUserSafeError(err: any, fallback = "Something went wrong. Please try again."): UserSafeError {
  const msg = String(err?.shortMessage || err?.message || err || "").toLowerCase();
  const code = String(err?.code || err?.error?.code || "");

  // User rejected signature / request
  if (code === "4001" || msg.includes("user rejected") || msg.includes("rejected the request")) {
    return { code: "USER_REJECTED", message: "Request cancelled." };
  }

  // No wallet / provider not found
  if (msg.includes("ethereum is not defined") || msg.includes("no ethereum provider") || msg.includes("provider not found")) {
    return { code: "NO_WALLET", message: "Wallet not found. Please install or open your wallet app." };
  }

  // Wrong network / chain
  if (msg.includes("chain") && (msg.includes("wrong") || msg.includes("unsupported"))) {
    return { code: "WRONG_NETWORK", message: "Wrong network. Please switch to BSC Mainnet." };
  }

  // RPC / network flakiness
  if (
    msg.includes("network error") ||
    msg.includes("failed to fetch") ||
    msg.includes("timeout") ||
    msg.includes("rate limit") ||
    msg.includes("429") ||
    msg.includes("rpc")
  ) {
    return { code: "RPC_ERROR", message: "Network is busy. Please retry in a moment." };
  }

  // Contract call revert / estimate fail (don’t show raw reason)
  if (
    msg.includes("revert") ||
    msg.includes("missing revert data") ||
    msg.includes("execution reverted") ||
    msg.includes("cannot estimate gas") ||
    msg.includes("insufficient funds")
  ) {
    return { code: "TX_FAILED", message: "Transaction failed. Please check amount and try again." };
  }

  return { code: "UNKNOWN", message: fallback };
}
