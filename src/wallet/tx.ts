import type { Contract, TransactionResponse } from "ethers";

/**
 * Gas estimation protection (ethers v6)
 * - Optional callStatic preflight (catches reverts cleanly)
 * - estimateGas + buffer
 * - fallback gasLimit if estimate fails
 * - returns ONLY safe error text (no scary raw RPC/provider messages)
 */

type TxOpts = {
  preflight?: boolean;
  gasBuffer?: number;         // e.g. 1.20 = +20%
  fallbackGasLimit?: bigint;  // used when estimateGas fails
};

const DEFAULTS: Required<TxOpts> = {
  preflight: true,
  gasBuffer: 1.2,
  fallbackGasLimit: 700_000n,
};

function safeMsg(e: any, fallback: string) {
  // common wallet errors
  if (e?.code === 4001) return "You rejected the transaction.";
  const m = String(e?.shortMessage || e?.reason || e?.message || "");
  const low = m.toLowerCase();

  // common scary ones → calm messages
  if (low.includes("cannot estimate gas")) return "Transaction may fail. Please check inputs and try again.";
  if (low.includes("missing revert data")) return "Transaction was rejected by the contract. Please try again.";
  if (low.includes("execution reverted")) return "Transaction was rejected by the contract. Please try again.";
  if (low.includes("insufficient funds")) return "Insufficient funds for gas.";
  if (low.includes("user rejected")) return "You rejected the transaction.";

  // never leak raw provider junk
  return fallback;
}

function bufferedGas(est: bigint, buffer: number): bigint {
  const bps = BigInt(Math.max(105, Math.floor(buffer * 100))); // minimum +5%
  return (est * bps) / 100n;
}

export async function sendTxProtected(
  contract: Contract,
  method: string,
  args: any[],
  overrides?: Record<string, any>,
  opts?: TxOpts
): Promise<TransactionResponse> {
  const o = { ...DEFAULTS, ...(opts || {}) };

  const fn: any = (contract as any)[method];
  if (typeof fn !== "function") throw new Error("Invalid contract method.");

  // 1) Preflight (callStatic) to catch reverts early
  if (o.preflight && (contract as any).callStatic?.[method]) {
    try {
      await (contract as any).callStatic[method](...args, overrides || {});
    } catch (e: any) {
      throw new Error(safeMsg(e, "This action cannot be completed right now. Please try again."));
    }
  }

  // 2) Estimate gas + buffer (fallback if estimate fails)
  let gasLimit: bigint | undefined = undefined;
  if ((contract as any).estimateGas?.[method]) {
    try {
      const est: bigint = await (contract as any).estimateGas[method](...args, overrides || {});
      gasLimit = bufferedGas(est, o.gasBuffer);
    } catch {
      gasLimit = o.fallbackGasLimit;
    }
  } else {
    gasLimit = o.fallbackGasLimit;
  }

  // 3) Send tx (safe error only)
  try {
    return await fn(...args, { ...(overrides || {}), gasLimit });
  } catch (e: any) {
    throw new Error(safeMsg(e, "Transaction failed. Please try again."));
  }
}
