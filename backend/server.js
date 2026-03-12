/**
 * CN6035 DApp Voting - Backend API Gateway
 * Node.js + Express server providing a RESTful API layer over the
 * Ethereum smart contract. Acts as the API Gateway taught in Week 4.
 *
 * Endpoints:
 *  GET  /api/polls            - List all polls
 *  GET  /api/polls/active     - List active polls
 *  GET  /api/polls/:id        - Get poll details + candidates
 *  GET  /api/polls/:id/winner - Get poll winner (ended polls only)
 *  GET  /api/health           - Health check
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { ethers } = require("ethers");
const contractData = require("./contractABI.json");

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Blockchain Provider Setup ─────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const provider = new ethers.JsonRpcProvider(RPC_URL);

const contract = new ethers.Contract(
  contractData.address,
  contractData.abi,
  provider
);

// ─── Helper ────────────────────────────────────────────────────────────────────
const formatPoll = (id, meta, candidates) => ({
  id: Number(id),
  title: meta.title,
  description: meta.description,
  startTime: Number(meta.startTime),
  endTime: Number(meta.endTime),
  director: meta.director,
  totalVotes: Number(meta.totalVotes),
  candidates: candidates
    ? candidates.map((c) => ({
        id: Number(c.id),
        name: c.name,
        imageUrl: c.imageUrl,
        voteCount: Number(c.voteCount),
      }))
    : undefined,
});

// ─── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    contractAddress: contractData.address,
    network: RPC_URL,
    timestamp: new Date().toISOString(),
  });
});

// GET all polls
app.get("/api/polls", async (_req, res) => {
  try {
    const pollIds = await contract.getAllPolls();
    const polls = await Promise.all(
      pollIds.map(async (id) => {
        const [pollId, title, description, startTime, endTime, director, totalVotes] =
          await contract.getPoll(id);
        const candidates = await contract.getCandidates(id);
        return formatPoll(id, { title, description, startTime, endTime, director, totalVotes }, candidates);
      })
    );
    res.json({ success: true, data: polls });
  } catch (err) {
    console.error("GET /api/polls error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET active polls
app.get("/api/polls/active", async (_req, res) => {
  try {
    const activeIds = await contract.getActivePolls();
    const polls = await Promise.all(
      activeIds.map(async (id) => {
        const [pollId, title, description, startTime, endTime, director, totalVotes] =
          await contract.getPoll(id);
        const candidates = await contract.getCandidates(id);
        return formatPoll(id, { title, description, startTime, endTime, director, totalVotes }, candidates);
      })
    );
    res.json({ success: true, data: polls });
  } catch (err) {
    console.error("GET /api/polls/active error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single poll
app.get("/api/polls/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: "Invalid poll ID" });
    }

    const [pollId, title, description, startTime, endTime, director, totalVotes] =
      await contract.getPoll(id);
    const candidates = await contract.getCandidates(id);

    res.json({
      success: true,
      data: formatPoll(id, { title, description, startTime, endTime, director, totalVotes }, candidates),
    });
  } catch (err) {
    const msg = err.message || "";
    const status = msg.includes("does not exist") || msg.includes("deleted") ? 404 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// GET winner of ended poll
app.get("/api/polls/:id/winner", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ success: false, error: "Invalid poll ID" });
    }

    const [winnerName, winnerVotes] = await contract.getWinner(id);
    res.json({
      success: true,
      data: { pollId: id, winnerName, winnerVotes: Number(winnerVotes) },
    });
  } catch (err) {
    const msg = err.message || "";
    const status = msg.includes("not ended") ? 400 : 500;
    res.status(status).json({ success: false, error: err.message });
  }
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 API Gateway running on http://localhost:${PORT}`);
  console.log(`📡 Connected to blockchain at: ${RPC_URL}`);
  console.log(`📋 Contract address: ${contractData.address}\n`);
});

module.exports = app;
