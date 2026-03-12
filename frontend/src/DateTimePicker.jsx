import React, { useState, useRef, useEffect, useLayoutEffect } from "react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const pad = (n) => String(n).padStart(2, "0");

const toDatetimeLocal = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

const formatDisplay = (date) => {
  if (!date) return "";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${pad(date.getDate())} ${months[date.getMonth()]} ${date.getFullYear()}  ·  ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const TIME_SLOTS = (() => {
  const slots = [];
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) slots.push(`${pad(h)}:${pad(m)}`);
  return slots;
})();

const getDaysInMonth = (year, month) => {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);
  return days;
};

const s = {
  container: { position: "relative", width: "100%", fontFamily: "inherit" },
  trigger: (hasError, open) => ({
    width: "100%",
    padding: "0.625rem 0.875rem",
    background: "#0f0f1a",
    border: `1px solid ${hasError ? "#ef4444" : open ? "#f97316" : "rgba(255,255,255,0.1)"}`,
    borderRadius: "0.625rem",
    color: "#e2e8f0",
    fontSize: "0.88rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    transition: "all 0.15s",
    boxSizing: "border-box",
  }),
  dropdown: (pos) => ({
    position: "fixed",
    top: pos.top,
    left: pos.left,
    background: "#12121f",
    border: "1px solid rgba(249,115,22,0.3)",
    borderRadius: "1rem",
    boxShadow: "0 1.5rem 4rem rgba(0,0,0,0.7)",
    zIndex: 9999,
    display: "flex",
    overflow: "hidden",
    width: "312px", 
  }),
  calSide: { flex: 1, padding: "0" },
  calHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 12px", height: "3rem",
    background: "rgba(249,115,22,0.06)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  timeSide: {
    width: "4.8rem", borderLeft: "1px solid rgba(255,255,255,0.06)",
    display: "flex", flexDirection: "column",
  },
  timeHeader: {
    height: "3rem", display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(249,115,22,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)",
    fontSize: "0.65rem", fontWeight: 700, color: "rgba(255,255,255,0.35)",
    textTransform: "uppercase", letterSpacing: "0.08em"
  },
  timeList: {
    overflowY: "auto",
    padding: "4px 6px",
    maxHeight: "12rem",
    scrollBehavior: "auto"
  },
};

export default function DateTimePicker({ value, onChange, placeholder, hasError, minDate }) {
  const selected = value ? new Date(value) : null;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => selected ?? new Date());
  const [hovDay, setHovDay] = useState(null);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const timeListRef = useRef(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ONLY snap to center when the dropdown first OPENS
  useLayoutEffect(() => {
    if (open && timeListRef.current) {
      const list = timeListRef.current;
      const baseDate = selected || new Date();
      const idx = Math.floor((baseDate.getHours() * 60 + baseDate.getMinutes()) / 15);
      
      const itemH = list.scrollHeight / TIME_SLOTS.length;
      const scrollPos = idx * itemH;
      
      // Calculate offset to put item in the MIDDLE
      const centerOffset = list.clientHeight / 2 - itemH / 2;
      list.scrollTop = scrollPos - centerOffset;
    }
    // We only want this to trigger when 'open' changes to true
  }, [open]);

  const updatePosition = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const dropdownWidth = 312; 
      const screenWidth = window.innerWidth;
      
      let left = r.left;
      // Pull left if on the right side of the screen
      if (r.left + (dropdownWidth / 2) > screenWidth / 2) {
        left = r.right - dropdownWidth;
      }
      setDropPos({ top: r.bottom + 8, left: Math.max(10, left) });
    }
  };

  const dayStyle = (day) => {
    if (!day) return {};
    const d = new Date(month.getFullYear(), month.getMonth(), day);
    const min = minDate ? new Date(minDate) : new Date();
    const isDisabled = d < new Date(min.getFullYear(), min.getMonth(), min.getDate());
    const isSel = selected && day === selected.getDate() && month.getMonth() === selected.getMonth();
    
    return {
      display: "flex", alignItems: "center", justifyContent: "center",
      aspectRatio: "1", borderRadius: "8px", fontSize: "0.8rem",
      cursor: isDisabled ? "not-allowed" : "pointer",
      background: isSel ? "#f97316" : hovDay === day && !isDisabled ? "rgba(249,115,22,0.15)" : "transparent",
      color: isSel ? "#fff" : isDisabled ? "rgba(255,255,255,0.15)" : "#94a3b8",
      border: isSel ? "none" : (day === new Date().getDate() && month.getMonth() === new Date().getMonth() ? "1px solid #f97316" : "1px solid transparent"),
      fontWeight: isSel ? 700 : 400,
      transition: "all 0.12s",
    };
  };

  return (
    <div ref={containerRef} style={s.container}>
      <style>{`
        .dv-timelist::-webkit-scrollbar { width: 4px; }
        .dv-timelist::-webkit-scrollbar-thumb { background: rgba(249,115,22,0.3); border-radius: 4px; }
        
        .dv-time-item { 
          transition: all 0.2s ease; 
          padding: 6px 0; 
          text-align: center; 
          font-size: 0.75rem; 
          cursor: pointer; 
          margin: 2px 0; 
          color: #94a3b8;
          border-radius: 4px; 
        }
        
        .dv-time-item:hover { 
          background: rgba(249,115,22,0.15); 
          color: #f97316; 
          border-radius: 4px;
        }

        .dv-time-item.selected { 
          background: #f97316 !important; 
          color: #fff !important; 
          border-radius: 8px !important; 
          font-weight: 700;
        }

        @media (max-width: 480px) {
          .dv-calendar-grid { gap: 1px !important; padding: 4px !important; }
          .dv-day-cell { font-size: 0.7rem !important; }
        }
      `}</style>

      <div ref={triggerRef} style={s.trigger(hasError, open)} onClick={() => { updatePosition(); setOpen(!open); }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        <span style={{ flex: 1, color: selected ? '#e2e8f0' : 'rgba(255,255,255,0.3)' }}>
          {selected ? formatDisplay(selected) : (placeholder || "Select date")}
        </span>
      </div>

      {open && (
        <div style={s.dropdown(dropPos)}>
          <div style={s.calSide}>
            <div style={s.calHeader}>
              <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()-1))} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <span style={{ fontSize: "0.85rem", color: "#e2e8f0" }}>{MONTHS[month.getMonth()].slice(0,3)} <strong style={{ color: "#f97316" }}>{month.getFullYear()}</strong></span>
              <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()+1))} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '8px 8px 0', textAlign: 'center' }}>
              {WEEKDAYS.map(d => <div key={d} style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>{d}</div>)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '8px', gap: '2px' }} className="dv-calendar-grid">
              {getDaysInMonth(month.getFullYear(), month.getMonth()).map((day, i) => (
                <div key={i} className="dv-day-cell" style={dayStyle(day)}
                  onMouseEnter={() => day && setHovDay(day)} onMouseLeave={() => setHovDay(null)}
                  onClick={() => {
                    if (!day) return;
                    const d = new Date(month.getFullYear(), month.getMonth(), day);
                    const prev = selected || new Date();
                    d.setHours(prev.getHours(), prev.getMinutes(), 0);
                    onChange(toDatetimeLocal(d));
                  }}>{day}</div>
              ))}
            </div>
          </div>

          <div style={s.timeSide}>
            <div style={s.timeHeader}>Time</div>
            <div ref={timeListRef} className="dv-timelist" style={s.timeList}>
              {TIME_SLOTS.map(t => {
                const isSel = selected && t === `${pad(selected.getHours())}:${pad(selected.getMinutes())}`;
                return (
                  <div key={t} 
                    className={`dv-time-item ${isSel ? 'selected' : ''}`}
                    onClick={() => {
                      const [h, m] = t.split(":").map(Number);
                      const base = selected || new Date(month.getFullYear(), month.getMonth(), new Date().getDate());
                      const d = new Date(base);
                      d.setHours(h, m, 0);
                      onChange(toDatetimeLocal(d));
                    }}>{t}</div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}