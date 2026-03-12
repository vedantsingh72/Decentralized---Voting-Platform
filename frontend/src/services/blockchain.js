/**
 * blockchain.js - Ethers.js service layer for the Voting DApp frontend
 * Handles all smart contract interactions via MetaMask provider
 */

import { ethers } from "ethers";
import contractData from "../contractABI.json";

let provider = null;
let signer = null;
let contract = null;

// Read-only provider works before wallet connection
const DEFAULT_RPC = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545";
const _rpcProvider = new ethers.JsonRpcProvider(DEFAULT_RPC);
_rpcProvider.pollingInterval = 4000; // Reduce eth_blockNumber polling to avoid RPC overload

let readOnlyContract = new ethers.Contract(
  contractData.address,
  contractData.abi,
  _rpcProvider
);

/**
 * Wait for a transaction with retry on RPC errors
 */
const waitForTx = async (tx, retries = 3) => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await tx.wait();
    } catch (err) {
      const isRpcError =
        err?.code === "UNKNOWN_ERROR" ||
        err?.error?.code === -32002 ||
        (err?.message || "").includes("too many errors") ||
        (err?.message || "").includes("could not coalesce");

      if (attempt < retries - 1 && isRpcError) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
};

// ─── Provider Initialisation ───────────────────────────────────────────────────

/**
 * Connect to MetaMask and return the user's address
 * @returns {Promise<string>} Connected wallet address
 */
export const connectWallet = async () => {
  if (!window.ethereum) {
    throw new Error("MetaMask is not installed. Please install MetaMask to use this DApp.");
  }

  await window.ethereum.request({ method: "eth_requestAccounts" });

  // Switch to Hardhat Local (chainId 31337 = 0x7a69) if not already on it
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId !== "0x7a69") {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x7a69" }],
      });
    } catch (switchErr) {
      // Chain not added yet — add it automatically
      if (switchErr.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x7a69",
            chainName: "Hardhat Local",
            rpcUrls: ["http://127.0.0.1:8545"],
            nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
          }],
        });
      } else {
        throw new Error("Please switch MetaMask to the Hardhat Local network (Chain ID 31337).");
      }
    }
  }

  provider = new ethers.BrowserProvider(window.ethereum);
  provider.pollingInterval = 4000;
  signer = await provider.getSigner();
  contract = new ethers.Contract(contractData.address, contractData.abi, signer);

  // Upgrade read-only instance to use MetaMask provider
  readOnlyContract = new ethers.Contract(contractData.address, contractData.abi, provider);

  const address = await signer.getAddress();
  return address;
};

/**
 * Silently reconnect if MetaMask already has permission (no popup).
 * Returns the address string or null if not already connected/authorised.
 */
export const tryAutoConnect = async () => {
  if (!window.ethereum) return null;
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (!accounts || accounts.length === 0) return null;

    const chainId = await window.ethereum.request({ method: "eth_chainId" });
    if (chainId !== "0x7a69") return null; // wrong network — don't auto-connect

    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    contract = new ethers.Contract(contractData.address, contractData.abi, signer);
    readOnlyContract = new ethers.Contract(contractData.address, contractData.abi, provider);

    return await signer.getAddress();
  } catch {
    return null;
  }
};

/**
 * Listen for MetaMask account or network changes
 */
export const listenForAccountChanges = (callback) => {
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", callback);
    window.ethereum.on("chainChanged", () => window.location.reload());
  }
};

// ─── Read Functions ─────────────────────────────────────────────────────────

export const getAllPolls = async () => {
  const ids = await readOnlyContract.getAllPolls();
  const polls = await Promise.all(ids.map((id) => getPoll(Number(id))));
  return polls;
};

export const getActivePolls = async () => {
  const ids = await readOnlyContract.getActivePolls();
  const polls = await Promise.all(ids.map((id) => getPoll(Number(id))));
  return polls;
};

export const getPoll = async (pollId) => {
  const [id, title, description, startTime, endTime, director, totalVotes] =
    await readOnlyContract.getPoll(pollId);
  const candidates = await readOnlyContract.getCandidates(pollId);

  return {
    id: Number(id),
    title,
    description,
    startTime: Number(startTime),
    endTime: Number(endTime),
    director,
    totalVotes: Number(totalVotes),
    candidates: candidates.map((c) => ({
      id: Number(c.id),
      name: c.name,
      imageUrl: c.imageUrl,
      voteCount: Number(c.voteCount),
    })),
  };
};

export const hasVoted = async (pollId, address) => {
  return await readOnlyContract.hasVoted(pollId, address);
};

export const getVoterChoice = async (pollId, address) => {
  return Number(await readOnlyContract.voterChoice(pollId, address));
};

export const getWinner = async (pollId) => {
  const [winnerName, winnerVotes] = await readOnlyContract.getWinner(pollId);
  return { winnerName, winnerVotes: Number(winnerVotes) };
};

// ─── Write Functions ────────────────────────────────────────────────────────

/**
 * Create a new poll on-chain
 */
export const createPoll = async ({
  title,
  description,
  startTime,
  endTime,
  candidateNames,
  candidateImages,
}) => {
  if (!contract) throw new Error("Wallet not connected");

  const tx = await contract.createPoll(
    title,
    description,
    startTime,
    endTime,
    candidateNames,
    candidateImages
  );

  return await waitForTx(tx);
};

/**
 * Cast a vote for a candidate in a poll
 */
export const castVote = async (pollId, candidateId) => {
  if (!contract) throw new Error("Wallet not connected");

  const tx = await contract.vote(pollId, candidateId);
  return await waitForTx(tx);
};

/**
 * Subscribe to PollCreated contract events. Returns an unsubscribe function.
 */
export const subscribePollCreated = (callback) => {
  const src = contract || readOnlyContract;
  src.on("PollCreated", callback);
  return () => src.off("PollCreated", callback);
};

/**
 * Delete a poll (only director or owner)
 */
export const deletePoll = async (pollId) => {
  if (!contract) throw new Error("Wallet not connected");

  const tx = await contract.deletePoll(pollId);
  return await waitForTx(tx);
};
