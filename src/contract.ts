import { Contract, BrowserProvider, JsonRpcProvider } from "ethers";

export const BSC_RPC = "https://bsc-dataseed.binance.org/";
export const APP_CONTRACT = "0xd986F215D0cdfC68930a100bb2b0d140425330a6" as const;

export const APP_ABI = [
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"p","type":"address"}],"name":"OwnershipRenounced","type":"event"},
  {"inputs":[],"name":"ADMIN","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"ADMIN_FEE_BP","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"DAILY_BP","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"LOCKED","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"MAX_DEPTH","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"MAX_PAYOUT_BP","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"MAX_POS","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"MIN_DEPOSIT","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"REF_BP","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"ROOT","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"USDT","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"claimDaily","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"claimNetwork","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"compoundDaily","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"compoundNetwork","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"contractBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"a","type":"uint256"}],"name":"deposit","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"u","type":"address"}],"name":"getUserPositions","outputs":[{"components":[{"internalType":"uint128","name":"principal","type":"uint128"},{"internalType":"uint128","name":"withdrawn","type":"uint128"},{"internalType":"uint128","name":"maxPayout","type":"uint128"},{"internalType":"uint64","name":"checkpoint","type":"uint64"},{"internalType":"bool","name":"closed","type":"bool"}],"internalType":"tuple[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"u","type":"address"}],"name":"getUserTotals","outputs":[{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"r","type":"address"}],"name":"register","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"totalDeposited","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"totalUsers","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"totalWithdrawn","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"users","outputs":[{"internalType":"bool","name":"registered","type":"bool"},{"internalType":"address","name":"ref","type":"address"},{"internalType":"uint256","name":"dep","type":"uint256"},{"internalType":"uint256","name":"wd","type":"uint256"},{"internalType":"uint256","name":"refEarn","type":"uint256"}],"stateMutability":"view","type":"function"}
] as const;

export const ERC20_ABI = [
  { "type":"function", "name":"decimals", "stateMutability":"view", "inputs":[], "outputs":[{ "type":"uint8" }] },
  { "type":"function", "name":"symbol", "stateMutability":"view", "inputs":[], "outputs":[{ "type":"string" }] },
  { "type":"function", "name":"allowance", "stateMutability":"view", "inputs":[{ "name":"o","type":"address" },{ "name":"s","type":"address" }], "outputs":[{ "type":"uint256" }] },
  { "type":"function", "name":"approve", "stateMutability":"nonpayable", "inputs":[{ "name":"s","type":"address" },{ "name":"a","type":"uint256" }], "outputs":[{ "type":"bool" }] },
] as const;

export const readProvider = new JsonRpcProvider(BSC_RPC);

export function getReadApp() {
  return new Contract(APP_CONTRACT, APP_ABI, readProvider);
}

export function getReadErc20(token: string) {
  return new Contract(token, ERC20_ABI, readProvider);
}

export async function getBrowserProvider() {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet found (install MetaMask)");
  return new BrowserProvider(eth);
}

export async function getWriteApp() {
  const bp = await getBrowserProvider();
  const signer = await bp.getSigner();
  return new Contract(APP_CONTRACT, APP_ABI, signer);
}

export async function getWriteErc20(token: string) {
  const bp = await getBrowserProvider();
  const signer = await bp.getSigner();
  return new Contract(token, ERC20_ABI, signer);
}
