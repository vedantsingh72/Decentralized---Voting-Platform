import React, { useState, useEffect, useCallback, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

const generateId = () =>
  `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// ─── Variant config ─────────────────────────────────────────────────────────

const VARIANTS = {
  success: {
    icon: CheckCircle2,
    border: "rgba(34,197,94,0.4)",
    iconColor: "#22c55e",
    barColor: "#22c55e",
  },
  error: {
    icon: XCircle,
    border: "rgba(239,68,68,0.4)",
    iconColor: "#ef4444",
    barColor: "#ef4444",
  },
  warning: {
    icon: AlertTriangle,
    border: "rgba(245,158,11,0.4)",
    iconColor: "#f59e0b",
    barColor: "#f59e0b",
  },
  info: {
    icon: Info,
    border: "rgba(249,115,22,0.4)",
    iconColor: "#f97316",
    barColor: "#f97316",
  },
};

// ─── ToastNotification ───────────────────────────────────────────────────────

function ToastNotification({ toast, onDismiss }) {
  const [progress, setProgress] = useState(100);
  const cfg = VARIANTS[toast.variant] || VARIANTS.info;
  const Icon = cfg.icon;

  useEffect(() => {
    const duration = 4000;
    const intervalMs = 50;
    const decrement = (intervalMs / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev - decrement;
        if (next <= 0) {
          clearInterval(timer);
          onDismiss(toast.id);
          return 0;
        }
        return next;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [toast.id, onDismiss]);

  return (
    <motion.div
      layout
      role="alert"
      aria-live="polite"
      initial={{ opacity: 0, x: 320, scale: 0.85 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 320, scale: 0.85 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "360px",
        overflow: "hidden",
        borderRadius: "12px",
        border: `1px solid ${cfg.border}`,
        background: "rgba(26, 26, 46, 0.95)",
        backdropFilter: "blur(16px)",
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${cfg.border}`,
        display: "flex",
        alignItems: "flex-start",
        padding: "1rem",
        gap: "0.75rem",
      }}
    >
      {/* Icon */}
      <div style={{ flexShrink: 0, marginTop: "2px" }}>
        <Icon size={18} color={cfg.iconColor} aria-hidden="true" />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#e2e8f0", margin: 0 }}>
          {toast.title}
        </p>
        {toast.message && (
          <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "2px" }}>
            {toast.message}
          </p>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Close notification"
        style={{
          flexShrink: 0,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "2px",
          borderRadius: "50%",
          color: "#64748b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#e2e8f0")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
      >
        <X size={14} />
      </button>

      {/* Progress bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "3px",
          background: "rgba(255,255,255,0.08)",
        }}
      >
        <motion.div
          style={{ height: "100%", background: cfg.barColor, borderRadius: "0 0 0 12px" }}
          initial={{ width: "100%" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.05, ease: "linear" }}
        />
      </div>
    </motion.div>
  );
}

// ─── Context & Provider ──────────────────────────────────────────────────────

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((variant, title, message = "") => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, variant, title, message }]);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: "fixed",
          top: "1rem",
          right: "1rem",
          zIndex: 99999,
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          pointerEvents: "none",
          alignItems: "flex-end",
        }}
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <div key={toast.id} style={{ pointerEvents: "auto" }}>
              <ToastNotification toast={toast} onDismiss={dismissToast} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");

  const { showToast } = ctx;
  return {
    showToast,
    success: (title, message) => showToast("success", title, message),
    error: (title, message) => showToast("error", title, message),
    warning: (title, message) => showToast("warning", title, message),
    info: (title, message) => showToast("info", title, message),
  };
}
