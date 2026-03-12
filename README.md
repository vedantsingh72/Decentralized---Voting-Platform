# DecentraVote — CN6035 Decentralised Voting DApp

A full-stack blockchain voting application built with Solidity, Hardhat, Node.js/Express, and React.

---

## What's New

### Major UX Overhaul (Mar 10, 2026)
- **Custom DateTimePicker** — replaced `react-datepicker` with a fully custom inline picker (15-min intervals, orange scrollbar, mobile-aware placement)
- **Toast notification system** — real-time feedback for all actions
- **Smart duration formatter** — shows human-readable poll duration (e.g. "15m", "2h", "1yr") based on picked start/end times
- **MetaMask wallet session** — 24h cookie with silent auto-reconnect on page load, eliminating connect-button flicker
- **Optimistic account state** — account loaded from cookie before MetaMask responds, no loading flash
- **Poll cache** — polls stored in `sessionStorage` so stats render instantly on reload
- **Poll list auto-refresh** — subscribes to `PollCreated` contract events for live updates
- **Improved modal** — stepper centered, single-column date/time layout, better mobile sizing

### RPC Reliability Fix
- Retry logic with backoff on `eth_call` overload errors during poll creation

---

## Prerequisites

- [Node.js](https://nodejs.org) v18+
- [MetaMask](https://metamask.io) browser extension

---

## First-Time Setup

### 1. Install dependencies

```bash
# Root (Hardhat / contract tooling)
cd C:\Projects\DecentraVote
npm install

# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

---

### 2. Start the local blockchain (Terminal 1)

```bash
cd C:\Projects\DecentraVote
npm run node
```

Leave this running. It prints 20 test accounts — copy **Account #0**'s private key for later.

---

### 3. Deploy the smart contract (Terminal 2)

```bash
cd C:\Projects\DecentraVote
npm run deploy:local
```

This compiles `contracts/Voting.sol`, deploys it to the local chain, and automatically writes `contractABI.json` to both `backend/` and `frontend/src/`.

---

### 4. Start the backend (Terminal 3)

```bash
cd C:\Projects\DecentraVote\backend
npm run dev
```

API available at `http://localhost:5000/api/health`.

---

### 5. Start the frontend (Terminal 4)

```bash
cd C:\Projects\DecentraVote\frontend
npm run dev
```

App available at `http://localhost:3000`.

---

### 6. Configure MetaMask

**Add Hardhat Local network:**

| Field | Value |
|---|---|
| Network name | `Hardhat Local` |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | `ETH` |
| Block explorer | *(leave empty)* |

**Import a test account:**

- MetaMask → account icon → Import account
- Paste Account #0's private key:
  `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- This account has 10,000 test ETH

---

### 7. Connect and use the app

1. Go to `http://localhost:3000`
2. Click **Connect MetaMask** — the app automatically switches to Hardhat Local
3. Click **+ New Poll** to create a poll
4. Set start time at least 1–2 minutes in the future (contract requirement)
5. Once the start time passes, vote on the poll

---

## Restarting After a Reboot

The Hardhat node does **not** persist state between restarts. Each time you restart:

1. Start the node: `npm run node` (Terminal 1)
2. Redeploy the contract: `npm run deploy:local` (Terminal 2)
   - This overwrites `contractABI.json` with the new contract address
3. nodemon will auto-reload the backend when the ABI file changes
4. Refresh the frontend in the browser

> If you don't redeploy, the contract address in `contractABI.json` will point to nothing and all calls will fail.

---

## Troubleshooting

### `Cannot find module './contractABI.json'` (backend crash)
The contract hasn't been deployed yet. Run `npm run deploy:local` from the project root.

### Frontend blank / `Failed to resolve import "../contractABI.json"`
Same cause — run `npm run deploy:local`. Both files are written by the deploy script.

### MetaMask shows "This is a deceptive request" / wrong network
- Click **Reject**
- The app auto-switches to Hardhat Local on connect — just click **Connect MetaMask** again
- If it persists, manually switch MetaMask to **Hardhat Local** before connecting

### MetaMask shows Ethereum mainnet / real gas fee
You're on the wrong network. The app's `connectWallet` will call `wallet_switchEthereumChain` automatically. If that fails, add the Hardhat Local network manually (see step 6).

### Account has 0 ETH
You're using a fresh MetaMask account, not the imported Hardhat test account. Import Account #0 using the private key in step 6.

### `Error creating poll: start time must be in future`
The contract requires `startTime >= block.timestamp`. Set the start time at least 1–2 minutes from now.

### Poll shows as "upcoming" and Vote button is missing
The poll's start time hasn't been reached yet. Wait for the clock to pass the start time, then refresh.

### `Vote failed: already voted in this poll`
Each address can only vote once per poll. Switch to a different MetaMask account (import Account #1, etc.) to cast another vote.

### Backend API errors after redeploying
nodemon watches for file changes and auto-restarts when `contractABI.json` is updated. If it doesn't restart, run `npm run dev` again in the backend terminal.

---

## Project Structure

```
DecentraVote/
├── contracts/
│   └── Voting.sol              # Solidity smart contract
├── scripts/
│   └── deploy.js               # Deploys contract + writes ABI to backend & frontend
├── test/
│   └── Voting.test.js          # Hardhat/Chai tests
├── backend/
│   ├── server.js               # Express API gateway
│   └── contractABI.json        # Auto-generated by deploy script
├── frontend/
│   └── src/
│       ├── App.jsx             # Main React UI
│       ├── DateTimePicker.jsx  # Custom date/time picker component
│       ├── Toast.jsx           # Toast notification system
│       ├── index.css           # Global styles
│       ├── services/
│       │   └── blockchain.js   # ethers.js contract interactions
│       └── contractABI.json    # Auto-generated by deploy script
└── hardhat.config.js
```

---

## Available Scripts

| Location | Command | Description |
|---|---|---|
| root | `npm run node` | Start local Hardhat blockchain |
| root | `npm run deploy:local` | Compile + deploy to local chain |
| root | `npm run deploy:sepolia` | Deploy to Sepolia testnet |
| root | `npm test` | Run contract unit tests |
| backend | `npm run dev` | Start API server with nodemon |
| frontend | `npm run dev` | Start Vite dev server |
