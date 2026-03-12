import React, { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";
import {
  connectWallet,
  tryAutoConnect,
  listenForAccountChanges,
  getAllPolls,
  castVote,
  hasVoted,
  createPoll,
  deletePoll,
} from "./services/blockchain";

// ─── Cookie session helpers (7-day expiry) ─────────────────────────────────
const SESSION_KEY = "dv_wallet";
const setWalletCookie = (addr) => {
  const exp = new Date(Date.now() + 24 * 60 * 60 * 1000).toUTCString(); // 24h
  document.cookie = `${SESSION_KEY}=${addr};expires=${exp};path=/;SameSite=Strict`;
};
const getWalletCookie = () => {
  const m = document.cookie.match(new RegExp(`(?:^|; )${SESSION_KEY}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
};
const clearWalletCookie = () => {
  document.cookie = `${SESSION_KEY}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
};

// ─── Poll cache (sessionStorage) ───────────────────────────────────────────
const POLLS_CACHE_KEY = "dv_polls";
const getCachedPolls = () => {
  try { return JSON.parse(sessionStorage.getItem(POLLS_CACHE_KEY)) || []; }
  catch { return []; }
};
const setCachedPolls = (polls) => {
  try { sessionStorage.setItem(POLLS_CACHE_KEY, JSON.stringify(polls)); } catch {}
};
import { ToastProvider, useToast } from "./Toast";
import DateTimePicker from "./DateTimePicker";

// ─── Duration formatter ────────────────────────────────────────────────────
const formatDuration = (ms) => {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), rm = m % 60;
  if (h < 24) return rm ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24), rh = h % 24;
  if (d < 7) return rh ? `${d}d ${rh}h` : `${d}d`;
  const w = Math.floor(d / 7), rd = d % 7;
  if (d < 30) return rd ? `${w}w ${rd}d` : `${w}w`;
  const mo = Math.floor(d / 30), rmd = d % 30;
  if (d < 365) return rmd ? `${mo}mo ${rmd}d` : `${mo}mo`;
  const yr = Math.floor(d / 365), rmo = Math.floor((d % 365) / 30);
  return rmo ? `${yr}yr ${rmo}mo` : `${yr}yr`;
};

// ─── Shared animation variants ─────────────────────────────────────────────
const fadeUp = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } } };
const stagger = { show: { transition: { staggerChildren: 0.1 } } };

// ─── 3D Tilt Card ──────────────────────────────────────────────────────────────

const TiltCard = ({ children, className, onClick, variants, style = {} }) => {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotX = useSpring(useTransform(my, [-0.5, 0.5], [7, -7]), { stiffness: 280, damping: 28 });
  const rotY = useSpring(useTransform(mx, [-0.5, 0.5], [-7, 7]), { stiffness: 280, damping: 28 });
  const gx = useTransform(mx, [-0.5, 0.5], ["15%", "85%"]);
  const gy = useTransform(my, [-0.5, 0.5], ["15%", "85%"]);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onLeave = () => { mx.set(0); my.set(0); };

  return (
    <motion.div variants={variants} style={{ perspective: 900, height: "100%" }} onMouseMove={onMove} onMouseLeave={onLeave}>
      <motion.div
        className={className}
        onClick={onClick}
        style={{
          rotateX: rotX,
          rotateY: rotY,
          transformStyle: "preserve-3d",
          height: "100%",
          backgroundImage: useTransform([gx, gy], ([x, y]) =>
            `radial-gradient(circle at ${x} ${y}, rgba(249,115,22,0.06) 0%, transparent 70%)`),
          ...style,
        }}
        whileHover={{ scale: 1.025, boxShadow: "0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(249,115,22,0.25)" }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
};

// ─── Helper Components ─────────────────────────────────────────────────────────


const SkeletonCard = () => (
  <div className="skeleton-card">
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
      <div className="skeleton-line" style={{ width: "60%", height: "18px" }} />
      <div className="skeleton-line" style={{ width: "20%", height: "18px", borderRadius: "999px" }} />
    </div>
    <div className="skeleton-line" style={{ width: "100%", height: "13px", marginBottom: "6px" }} />
    <div className="skeleton-line" style={{ width: "80%", height: "13px", marginBottom: "1rem" }} />
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
      <div className="skeleton-line" style={{ width: "30%", height: "12px" }} />
      <div className="skeleton-line" style={{ width: "40%", height: "12px" }} />
    </div>
    <div style={{ display: "flex", gap: "0.4rem" }}>
      {[45, 38, 30].map((w, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${w}%`, height: "24px", borderRadius: "999px" }} />
      ))}
    </div>
  </div>
);

const Badge = ({ status }) => {
  const classes = {
    active: "badge badge-active",
    ended: "badge badge-ended",
    upcoming: "badge badge-upcoming",
  };
  return <span className={classes[status] || "badge"}>{status}</span>;
};

const getPollStatus = (poll) => {
  const now = Math.floor(Date.now() / 1000);
  if (now < poll.startTime) return "upcoming";
  if (now > poll.endTime) return "ended";
  return "active";
};

const formatDate = (unix) =>
  new Date(unix * 1000).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// ─── Header ────────────────────────────────────────────────────────────────────

const Header = ({ account, onConnect, onCreatePoll }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="header-top">
        <div className="navbar-brand">
          <div className="brand-text">
            <span className="brand-name">DecentraVote</span>
            <span className="brand-sub">Powered by Ethereum</span>
          </div>
        </div>
        <nav className="header-nav">
          <a href="#polls" className="nav-link">Polls</a>
          <a href="#how-it-works" className="nav-link">How It Works</a>
          <a href="#stats" className="nav-link">Stats</a>
        </nav>
        <div className="navbar-right">
          {account ? (
            <>
              <div className="account-badge">
                <span className="account-dot" />
                <span className="address-pill">
                  {account.slice(0, 6)}…{account.slice(-4)}
                </span>
              </div>
              <button className="btn btn-primary" onClick={onCreatePoll}>
                + New Poll
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={onConnect}>
              Connect MetaMask
            </button>
          )}
          <button
            className="hamburger"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((o) => !o)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileOpen
                ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>
              }
            </svg>
          </button>
        </div>
      </div>
      <nav className={`mobile-nav ${mobileOpen ? "open" : ""}`} aria-hidden={!mobileOpen}>
        {account
          ? <button className="btn btn-primary btn-sm" style={{ margin: "0.5rem 1.5rem 0" }} onClick={() => { onCreatePoll(); setMobileOpen(false); }}>+ New Poll</button>
          : <button className="btn btn-primary btn-sm" style={{ margin: "0.5rem 1.5rem 0" }} onClick={() => { onConnect(); setMobileOpen(false); }}>Connect MetaMask</button>
        }
        <a href="#polls" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>Polls</a>
        <a href="#how-it-works" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>How It Works</a>
        <a href="#stats" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>Stats</a>
      </nav>
    </header>
  );
};

// ─── Hero ───────────────────────────────────────────────────────────────────────

const Hero = ({ account, onConnect, onCreatePoll, polls }) => {
  const activeCount = polls.filter(p => getPollStatus(p) === "active").length;
  const totalVotes = polls.reduce((s, p) => s + p.totalVotes, 0);

  return (
    <section className="hero">
      <div className="hero-content">
        <div className="hero-badge">On-Chain · Trustless · Transparent</div>
        <h1 className="hero-title">
          Decentralised Voting<br />
          <span className="hero-gradient">for Everyone</span>
        </h1>
        <p className="hero-desc">
          Create and participate in tamper-proof polls secured by the Ethereum blockchain.
          Every vote is recorded on-chain — no central authority, no manipulation.
        </p>
        <div className="hero-actions">
          {account ? (
            <button className="btn btn-primary btn-lg" onClick={onCreatePoll}>
              + Create a Poll
            </button>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={onConnect}>
              Connect Wallet to Start
            </button>
          )}
          <a href="#polls" className="btn btn-secondary btn-lg">Browse Polls</a>
        </div>
      </div>
      <div className="hero-stats">
        <div className="hero-stat">
          <span className="hero-stat-value">{polls.length}</span>
          <span className="hero-stat-label">Total Polls</span>
        </div>
        <div className="hero-stat-divider" />
        <div className="hero-stat">
          <span className="hero-stat-value">{activeCount}</span>
          <span className="hero-stat-label">Active Now</span>
        </div>
        <div className="hero-stat-divider" />
        <div className="hero-stat">
          <span className="hero-stat-value">{totalVotes}</span>
          <span className="hero-stat-label">Votes Cast</span>
        </div>
      </div>
    </section>
  );
};

// ─── How It Works ───────────────────────────────────────────────────────────────

const STEP_ICONS = [
  // Wallet
  <svg key="w" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 12h2"/><path d="M2 9h20"/></svg>,
  // Poll/doc
  <svg key="p" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>,
  // Vote tick
  <svg key="v" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  // Chart bars
  <svg key="c" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
];

const HowItWorks = () => (
  <section className="how-it-works" id="how-it-works">
    <div className="section-header">
      <span className="section-eyebrow">Simple Process</span>
      <h2 className="section-title">How It Works</h2>
    </div>
    <motion.div className="steps-grid" variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }}>
      {[
        { icon: STEP_ICONS[0], num: "01", title: "Connect Wallet", desc: "Link your MetaMask wallet to authenticate on the Ethereum network." },
        { icon: STEP_ICONS[1], num: "02", title: "Create a Poll", desc: "Set a title, candidates, and voting window. The poll is deployed on-chain." },
        { icon: STEP_ICONS[2], num: "03", title: "Cast Your Vote", desc: "Select a candidate and sign the transaction. One vote per address, forever recorded." },
        { icon: STEP_ICONS[3], num: "04", title: "See Results", desc: "Live vote counts and the winner are publicly visible to anyone." },
      ].map(({ icon, num, title, desc }) => (
        <TiltCard className="step-card" key={num} variants={fadeUp}>
          <div className="step-icon-wrap">{icon}</div>
          <div className="step-num">{num}</div>
          <h3 className="step-title">{title}</h3>
          <p className="step-desc">{desc}</p>
        </TiltCard>
      ))}
    </motion.div>
  </section>
);

// ─── Stats Bar ──────────────────────────────────────────────────────────────────

const StatsBar = ({ polls }) => {
  const active = polls.filter(p => getPollStatus(p) === "active").length;
  const ended = polls.filter(p => getPollStatus(p) === "ended").length;
  const upcoming = polls.filter(p => getPollStatus(p) === "upcoming").length;
  const totalVotes = polls.reduce((s, p) => s + p.totalVotes, 0);
  const directors = new Set(polls.map(p => p.director)).size;

  return (
    <section className="stats-bar" id="stats">
      {[
        { label: "Total Polls", value: polls.length },
        { label: "Active", value: active },
        { label: "Upcoming", value: upcoming },
        { label: "Ended", value: ended },
        { label: "Total Votes", value: totalVotes },
        { label: "Creators", value: directors },
      ].map(({ label, value }) => (
        <div className="stat-item" key={label}>
          <span className="stat-value">{value}</span>
          <span className="stat-label">{label}</span>
        </div>
      ))}
    </section>
  );
};

// ─── Footer ─────────────────────────────────────────────────────────────────────

const Footer = () => (
  <footer className="site-footer">
    <div className="footer-inner">
      <div className="footer-brand">
        <span className="brand-name">DecentraVote</span>
      </div>
      <p className="footer-desc">
        A decentralised voting platform built on Ethereum. Transparent, tamper-proof, and open to all.
      </p>
      <div className="footer-meta">
        <span>CN6035 — Mobile &amp; Distributed Systems</span>
        <span className="footer-dot">·</span>
        <span>Solidity · Hardhat · React · Ethers.js</span>
      </div>
    </div>
  </footer>
);

// ─── PollCard ──────────────────────────────────────────────────────────────────

const PollCard = ({ poll, account, onDelete, onSelect }) => {
  const status = getPollStatus(poll);
  const isDirector = account && account.toLowerCase() === poll.director.toLowerCase();
  const topCandidate = poll.candidates.length > 0
    ? poll.candidates.reduce((a, b) => a.voteCount > b.voteCount ? a : b)
    : null;

  return (
    <TiltCard className="poll-card" onClick={() => onSelect(poll)} variants={fadeUp}>
      <div className="poll-card-header">
        <h3>{poll.title}</h3>
        <Badge status={status} />
      </div>
      <p className="poll-description">{poll.description}</p>
      <div className="poll-meta">
        <span className="poll-meta-votes">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 4, verticalAlign: "middle" }}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          {poll.totalVotes} vote{poll.totalVotes !== 1 ? "s" : ""}
        </span>
        <span>Ends {formatDate(poll.endTime)}</span>
      </div>
      {topCandidate && poll.totalVotes > 0 && (
        <div className="poll-leading">
          <span className="poll-leading-label">Leading:</span>
          <span className="poll-leading-name">{topCandidate.name}</span>
        </div>
      )}
      <div className="poll-candidates-preview">
        {poll.candidates.slice(0, 3).map(c => (
          <span key={c.id} className="candidate-chip">{c.name}</span>
        ))}
        {poll.candidates.length > 3 && (
          <span className="candidate-chip candidate-chip-more">+{poll.candidates.length - 3}</span>
        )}
      </div>
      {isDirector && (
        <button
          className="btn btn-danger btn-sm"
          style={{ marginTop: "0.75rem" }}
          onClick={(e) => { e.stopPropagation(); onDelete(poll.id); }}
        >
          Delete Poll
        </button>
      )}
    </TiltCard>
  );
};

// ─── PollDetail ────────────────────────────────────────────────────────────────

const PollDetail = ({ poll, account, onVote, onBack }) => {
  const [voted, setVoted] = useState(false);
  const [choice, setChoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const { success, error, warning } = useToast();
  const status = getPollStatus(poll);
  const total = poll.candidates.reduce((s, c) => s + c.voteCount, 0);
  const winnerId = status === "ended" && total > 0
    ? poll.candidates.reduce((a, b) => a.voteCount > b.voteCount ? a : b).id
    : null;

  useEffect(() => {
    const checkVoted = async () => {
      if (!account) return;
      try {
        const v = await hasVoted(poll.id, account);
        setVoted(v);
      } catch {}
    };
    checkVoted();
  }, [poll.id, account]);

  const handleVote = async (candidateId) => {
    if (!account) return warning("Wallet required", "Connect your MetaMask wallet first.");
    setLoading(true);
    try {
      await onVote(poll.id, candidateId);
      setVoted(true);
      setChoice(candidateId);
      success("Vote recorded", "Your vote has been saved on the blockchain.");
    } catch (err) {
      error("Vote failed", err.reason || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div className="poll-detail" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <button className="btn btn-secondary btn-back" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 6, verticalAlign: "middle" }}><polyline points="15 18 9 12 15 6"/></svg>
        Back to Polls
      </button>

      <div className="poll-detail-header">
        <h2>{poll.title}</h2>
        <Badge status={status} />
      </div>

      <p className="poll-detail-desc">{poll.description}</p>

      <div className="poll-times">
        <div className="poll-time-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 5, verticalAlign: "middle" }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>Start: {formatDate(poll.startTime)}</span>
        </div>
        <div className="poll-time-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 5, verticalAlign: "middle" }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>End: {formatDate(poll.endTime)}</span>
        </div>
      </div>

      {winnerId && (
        <motion.div className="winner-banner" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <span>Winner: <strong>{poll.candidates.find(c => c.id === winnerId)?.name}</strong></span>
        </motion.div>
      )}

      <h3 className="candidates-heading">Candidates</h3>
      <div className="candidates-grid">
        {poll.candidates.map((c) => {
          const pct = total > 0 ? ((c.voteCount / total) * 100).toFixed(1) : 0;
          const isChosen = choice === c.id;
          const isWinner = c.id === winnerId;

          return (
            <motion.div
              key={c.id}
              className={`candidate-card ${isChosen ? "candidate-chosen" : ""} ${isWinner ? "candidate-winner" : ""}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="candidate-info">
                <span className="candidate-name">
                  {isWinner && <svg width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1" style={{ marginRight: 5, verticalAlign: "middle" }}><polyline points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>}
                  {c.name}
                </span>
                <span className="candidate-votes">
                  {c.voteCount} vote{c.voteCount !== 1 ? "s" : ""} · {pct}%
                </span>
              </div>

              <div className="vote-bar-bg">
                <motion.div
                  className="vote-bar-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
                />
              </div>

              {status === "active" && !voted && account && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleVote(c.id)}
                  disabled={loading}
                >
                  {loading ? "Submitting…" : "Vote"}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      {status === "active" && !account && (
        <div className="alert alert-info" style={{ marginTop: "1.5rem" }}>
          Connect your wallet to cast a vote.
        </div>
      )}

      {voted && (
        <motion.div className="alert alert-success" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          Your vote has been recorded on the blockchain.
        </motion.div>
      )}
    </motion.div>
  );
};

// ─── Security helpers ─────────────────────────────────────────────────────────

/** Strip HTML tags to prevent XSS when rendering user input as text */
const sanitize = (str) => str.replace(/<[^>]*>/g, "").trim();

const LIMITS = { title: 100, description: 500, candidate: 60, maxCandidates: 10 };

// ─── CreatePollModal (multi-step wizard) ───────────────────────────────────────

const WIZARD_STEPS = [
  { label: "Details", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
  { label: "Schedule", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
  { label: "Candidates", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
];

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.28, ease: "easeOut" } },
  exit: (dir) => ({ x: dir > 0 ? -48 : 48, opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }),
};

const CreatePollModal = ({ onClose, onCreate }) => {
  const [step, setStep] = useState(0);
  const dir = React.useRef(1);
  const [form, setForm] = useState({ title: "", description: "", startTime: "", endTime: "", candidates: ["", ""] });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { success, error } = useToast();

  const fieldErr = (key) => errors[key]
    ? <span className="field-error" role="alert">{errors[key]}</span>
    : null;

  const validateStep = (s) => {
    const e = {};
    const now = Date.now();
    if (s === 0) {
      const title = sanitize(form.title);
      if (!title) e.title = "Title is required.";
      else if (title.length > LIMITS.title) e.title = `Max ${LIMITS.title} characters.`;
      if (form.description && sanitize(form.description).length > LIMITS.description)
        e.description = `Max ${LIMITS.description} characters.`;
    }
    if (s === 1) {
      if (!form.startTime) e.startTime = "Start time is required.";
      else if (new Date(form.startTime).getTime() <= now) e.startTime = "Start time must be in the future.";
      if (!form.endTime) e.endTime = "End time is required.";
      else if (form.startTime && new Date(form.endTime) <= new Date(form.startTime)) e.endTime = "End time must be after start time.";
    }
    if (s === 2) {
      const names = form.candidates.map((c) => sanitize(c)).filter(Boolean);
      if (names.length < 2) e.candidates = "At least 2 candidates are required.";
      else if (names.some((n) => n.length > LIMITS.candidate)) e.candidates = `Each name must be under ${LIMITS.candidate} chars.`;
      else if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) e.candidates = "Candidate names must be unique.";
    }
    return e;
  };

  const goNext = () => {
    const errs = validateStep(step);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    dir.current = 1;
    setErrors({});
    setStep((s) => s + 1);
  };

  const goBack = () => {
    dir.current = -1;
    setErrors({});
    setStep((s) => s - 1);
  };

  const handleSubmit = async () => {
    const errs = validateStep(2);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      const names = form.candidates.map(sanitize).filter(Boolean);
      await onCreate({
        title: sanitize(form.title),
        description: sanitize(form.description),
        startTime: Math.floor(new Date(form.startTime).getTime() / 1000),
        endTime: Math.floor(new Date(form.endTime).getTime() / 1000),
        candidateNames: names,
        candidateImages: names.map(() => ""),
      });
      success("Poll created", "Your poll is now live on the blockchain.");
      onClose();
    } catch (err) {
      const isRpcOverload =
        err?.error?.code === -32002 ||
        (err?.error?.message || "").includes("too many errors") ||
        (err?.message || "").includes("too many errors") ||
        (err?.message || "").includes("could not coalesce");
      const msg = isRpcOverload
        ? "RPC node is overloaded — make sure Hardhat is running and try again."
        : (err.reason || err.shortMessage || err.message);
      error("Creation failed", msg);
    } finally {
      setLoading(false);
    }
  };

  const updateCandidate = (i, val) => {
    const updated = [...form.candidates];
    updated[i] = val;
    setForm({ ...form, candidates: updated });
    if (errors.candidates) setErrors({ ...errors, candidates: undefined });
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <motion.div
        className="modal modal-wizard"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 24 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 id="modal-title" style={{ margin: 0 }}>Create New Poll</h2>
            <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>Step {step + 1} of {WIZARD_STEPS.length}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close modal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Progress stepper */}
        <div className="wizard-stepper">
          {WIZARD_STEPS.map((s, i) => (
            <div key={i} className={`wizard-step-item ${i < step ? "done" : i === step ? "active" : ""}`}>
              <div className="wizard-step-dot">
                {i < step
                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  : <span>{i + 1}</span>
                }
              </div>
              <span className="wizard-step-label">{s.label}</span>
              {i < WIZARD_STEPS.length - 1 && <div className={`wizard-connector ${i < step ? "done" : ""}`} />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="wizard-body" style={{ overflow: "hidden", minHeight: 260 }}>
          <AnimatePresence mode="wait" custom={dir.current}>
            <motion.div
              key={step}
              custom={dir.current}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              {step === 0 && (
                <div className="wizard-step-content">
                  <label htmlFor="poll-title">
                    Poll Title <span className="char-count">{form.title.length}/{LIMITS.title}</span>
                  </label>
                  <input
                    id="poll-title"
                    value={form.title}
                    onChange={(e) => { setForm({ ...form, title: e.target.value }); setErrors({ ...errors, title: undefined }); }}
                    placeholder="e.g. Best Blockchain Platform 2025"
                    maxLength={LIMITS.title}
                    aria-invalid={!!errors.title}
                    className={errors.title ? "input-error" : ""}
                    autoFocus
                  />
                  {fieldErr("title")}

                  <label htmlFor="poll-desc" style={{ marginTop: "1rem" }}>
                    Description <span className="char-count">{form.description.length}/{LIMITS.description}</span>
                    <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 4 }}>(optional)</span>
                  </label>
                  <textarea
                    id="poll-desc"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Describe what this poll is about…"
                    maxLength={LIMITS.description}
                    rows={3}
                    className={errors.description ? "input-error" : ""}
                  />
                  {fieldErr("description")}
                </div>
              )}

              {step === 1 && (
                <div className="wizard-step-content">
                  <div className="wizard-time-grid">
                    <div>
                      <label>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 5, verticalAlign: "middle" }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        Start Time
                      </label>
                      <DateTimePicker
                        value={form.startTime}
                        onChange={(v) => { setForm({ ...form, startTime: v }); setErrors({ ...errors, startTime: undefined }); }}
                        placeholder="Start date & time"
                        hasError={!!errors.startTime}
                      />
                      {fieldErr("startTime")}
                    </div>
                    <div>
                      <label>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 5, verticalAlign: "middle" }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        End Time
                      </label>
                      <DateTimePicker
                        value={form.endTime}
                        onChange={(v) => { setForm({ ...form, endTime: v }); setErrors({ ...errors, endTime: undefined }); }}
                        placeholder="End date & time"
                        hasError={!!errors.endTime}
                        minDate={form.startTime ? new Date(form.startTime) : new Date()}
                      />
                      {fieldErr("endTime")}
                    </div>
                  </div>
                  {form.startTime && form.endTime && new Date(form.endTime) > new Date(form.startTime) && (
                    <motion.div className="wizard-duration-badge" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginRight: 5 }}><polyline points="20 6 9 17 4 12"/></svg>
                      Duration: {formatDuration(new Date(form.endTime) - new Date(form.startTime))}
                    </motion.div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="wizard-step-content">
                  <label>
                    Candidates
                    <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6, fontSize: "0.8rem" }}>
                      {form.candidates.filter(c => sanitize(c)).length} / {LIMITS.maxCandidates} added
                    </span>
                  </label>
                  <AnimatePresence>
                    {form.candidates.map((c, i) => (
                      <motion.div
                        key={i}
                        className="candidate-input-row"
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 16, height: 0, marginBottom: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="candidate-input-num">{i + 1}</div>
                        <input
                          value={c}
                          onChange={(e) => updateCandidate(i, e.target.value)}
                          placeholder={`Candidate ${i + 1} name`}
                          maxLength={LIMITS.candidate}
                          aria-label={`Candidate ${i + 1} name`}
                          className={errors.candidates ? "input-error" : ""}
                        />
                        {form.candidates.length > 2 && (
                          <button
                            type="button"
                            className="btn btn-danger btn-xs"
                            onClick={() => setForm({ ...form, candidates: form.candidates.filter((_, idx) => idx !== i) })}
                            aria-label={`Remove candidate ${i + 1}`}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {fieldErr("candidates")}
                  {form.candidates.length < LIMITS.maxCandidates && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setForm({ ...form, candidates: [...form.candidates, ""] })}
                      style={{ marginTop: "0.5rem" }}
                    >
                      + Add Candidate
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer actions */}
        <div className="modal-actions wizard-actions">
          <button type="button" className="btn btn-secondary" onClick={step === 0 ? onClose : goBack}>
            {step === 0 ? "Cancel" : "← Back"}
          </button>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {WIZARD_STEPS.map((_, i) => (
              <div key={i} style={{
                width: i === step ? 20 : 6, height: 6, borderRadius: 99,
                background: i === step ? "var(--primary)" : i < step ? "rgba(249,115,22,0.4)" : "rgba(255,255,255,0.15)",
                transition: "all 0.3s ease",
              }} />
            ))}
          </div>
          {step < WIZARD_STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={goNext}>
              Next →
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading
                ? <><span className="btn-spinner" /> Creating…</>
                : "Create Poll"
              }
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ─── Main App ──────────────────────────────────────────────────────────────────

function AppInner() {
  const [account, setAccount] = useState(getWalletCookie); // optimistic: show stored address immediately
  const [polls, setPolls] = useState(getCachedPolls);
  const [loading, setLoading] = useState(true);
  const [selectedPoll, setSelectedPoll] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState(null); // pollId to delete
  const { success, error } = useToast();

  const fetchPolls = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllPolls();
      setPolls(data);
      setCachedPolls(data);
      return data;
    } catch (err) {
      console.error("Failed to load polls:", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Confirm MetaMask still has permission; if not, clear the optimistic account
    if (getWalletCookie()) {
      tryAutoConnect().then((addr) => {
        if (addr) setAccount(addr);
        else { clearWalletCookie(); setAccount(null); }
      });
    }
    fetchPolls();
    listenForAccountChanges((accounts) => {
      const addr = accounts[0] || null;
      setAccount(addr);
      if (!addr) clearWalletCookie();
    });
  }, [fetchPolls]);

  // Lock body scroll whenever any overlay is open
  useEffect(() => {
    const anyOpen = !!(showCreate || selectedPoll || confirmDelete !== null);
    document.body.style.overflow = anyOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [showCreate, selectedPoll, confirmDelete]);

  const handleConnect = async () => {
    try {
      const addr = await connectWallet();
      setAccount(addr);
      setWalletCookie(addr);
      success("Wallet connected", `${addr.slice(0, 6)}…${addr.slice(-4)}`);
      await fetchPolls();
    } catch (err) {
      error("Connection failed", err.message);
    }
  };

  const handleVote = async (pollId, candidateId) => {
    await castVote(pollId, candidateId);
    const fresh = await fetchPolls();
    if (selectedPoll && selectedPoll.id === pollId) {
      const updated = fresh.find((p) => p.id === pollId);
      if (updated) setSelectedPoll(updated);
    }
  };

  const handleDelete = (pollId) => {
    setConfirmDelete(pollId);
  };

  const confirmDeletePoll = async () => {
    const pollId = confirmDelete;
    setConfirmDelete(null);
    try {
      await deletePoll(pollId);
      await fetchPolls();
      setSelectedPoll(null);
      success("Poll deleted", "The poll has been removed from the blockchain.");
    } catch (err) {
      error("Delete failed", err.reason || err.message);
    }
  };

  const handleCreate = async (formData) => {
    await createPoll(formData);
    // Event listener will fire fetchPolls; also fetch immediately as fallback
    await fetchPolls();
  };

  const filteredPolls = polls.filter((p) => {
    if (filter === "all") return true;
    return getPollStatus(p) === filter;
  });

  return (
    <div className="app">
      <Header
        account={account}
        onConnect={handleConnect}
        onCreatePoll={() => setShowCreate(true)}
      />

      <Hero
        account={account}
        onConnect={handleConnect}
        onCreatePoll={() => setShowCreate(true)}
        polls={polls}
      />
      <HowItWorks />
      <StatsBar polls={polls} />

      <main className="main" id="polls">
        <div className="polls-section-header">
          <h2 className="section-title" style={{ textAlign: "left", marginBottom: 0 }}>
            All Polls
          </h2>
          <div className="filter-tabs">
            {["all", "active", "upcoming", "ended"].map((f) => (
              <button
                key={f}
                className={`filter-tab ${filter === f ? "active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="polls-grid">
            {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : filteredPolls.length === 0 ? (
          <motion.div className="empty-state" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div className="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
                <line x1="12" y1="12" x2="12" y2="16"/>
                <line x1="10" y1="14" x2="14" y2="14"/>
              </svg>
            </div>
            <h3>No polls found</h3>
            <p>{filter !== "all" ? `No ${filter} polls at the moment.` : account ? "Be the first to create a poll!" : "Connect your wallet to create a poll."}</p>
            {account && filter === "all" && (
              <button className="btn btn-primary" style={{ marginTop: "1.25rem" }} onClick={() => setShowCreate(true)}>
                + Create First Poll
              </button>
            )}
            {!account && (
              <button className="btn btn-primary" style={{ marginTop: "1.25rem" }} onClick={handleConnect}>
                Connect MetaMask
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div className="polls-grid" variants={stagger} initial="hidden" animate="show">
            <AnimatePresence>
              {filteredPolls.map((poll) => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  account={account}
                  onDelete={handleDelete}
                  onSelect={setSelectedPoll}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      <Footer />

      {/* Poll detail — plain div overlay so position:fixed is never broken by motion transforms */}
      {selectedPoll && ReactDOM.createPortal(
        <div className="poll-detail-overlay" onClick={() => setSelectedPoll(null)}>
          <motion.div
            className="poll-detail-sheet"
            initial={{ y: 60, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <PollDetail
              poll={selectedPoll}
              account={account}
              onVote={handleVote}
              onBack={() => setSelectedPoll(null)}
            />
          </motion.div>
        </div>,
        document.body
      )}

      {showCreate && ReactDOM.createPortal(
        <CreatePollModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />,
        document.body
      )}

      {/* Confirm delete modal */}
      {confirmDelete !== null && ReactDOM.createPortal(
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
              </svg>
            </div>
            <h2>Delete Poll</h2>
            <p>This will permanently remove the poll from the blockchain. This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDeletePoll}>
                Delete Poll
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
