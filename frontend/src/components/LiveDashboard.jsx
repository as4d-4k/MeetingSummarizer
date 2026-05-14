import React, { useState } from 'react';

// ── Colour palette per speaker index ─────────────────────────────────────────
const SPEAKER_COLORS = [
  { bg: "rgba(108,99,255,0.15)", text: "#9B8FFF", bar: "#6C63FF", border: "rgba(108,99,255,0.3)" },
  { bg: "rgba(0,200,150,0.15)",  text: "#33E2B5", bar: "#00C896", border: "rgba(0,200,150,0.3)" },
  { bg: "rgba(255,184,0,0.15)",  text: "#FFD166", bar: "#FFB800", border: "rgba(255,184,0,0.3)" },
  { bg: "rgba(255,107,107,0.15)",text: "#FF9999", bar: "#FF6B6B", border: "rgba(255,107,107,0.3)" },
  { bg: "rgba(55,138,221,0.15)", text: "#90BDE8", bar: "#378ADD", border: "rgba(55,138,221,0.3)" },
  { bg: "rgba(239,159,39,0.15)", text: "#F5CA7E", bar: "#EF9F27", border: "rgba(239,159,39,0.3)" },
];

const SENTIMENT = {
  positive: { bg: "rgba(0,200,150,0.1)", color: "#00C896", label: "Positive" },
  neutral:  { bg: "rgba(255,255,255,0.05)", color: "#8B92B8", label: "Neutral"  },
  negative: { bg: "rgba(255,107,107,0.1)", color: "#FF6B6B", label: "Concern"  },
};

function getColor(idx) {
  return SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
}

function initials(name = "") {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function SpeakerCard({ sp, c }) {
  const [expanded, setExpanded] = useState(false);
  const sent = SENTIMENT[sp.sentiment] ?? SENTIMENT.neutral;
  const score = sp.performance_score ?? 0;
  const summaryText = sp.latest_summary || sp.summary || "";
  const hasLongSummary = summaryText.length > 120;

  return (
    <div className="glass-card animate-fade-in" style={{
      padding: "20px",
      border: sp.is_speaking ? `1.5px solid ${c.bar}` : "1px solid var(--border-subtle)",
      boxShadow: sp.is_speaking ? `0 0 16px ${c.bar}40` : "none",
      transform: sp.is_speaking ? "translateY(-2px)" : "none",
      transition: "all 0.3s ease",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 42, height: 42, borderRadius: "10px",
          background: c.bg, color: c.text, border: `1px solid ${c.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, flexShrink: 0, fontFamily: "var(--font-display)"
        }}>
          {initials(sp.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {sp.name}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{sp.word_count?.toLocaleString()} words</div>
        </div>
        <div style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: sp.is_speaking ? "#00C896" : "rgba(255,255,255,0.1)",
          boxShadow: sp.is_speaking ? "0 0 8px #00C896" : "none",
          transition: "all 0.3s",
        }} />
      </div>

      {/* Stats */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>
        <span>Talk time <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{fmtTime(sp.talk_time_seconds || 0)}</strong></span>
        <span style={{
          background: sent.bg, color: sent.color,
          fontSize: 11, padding: "3px 10px", borderRadius: 100, fontWeight: 500
        }}>{sent.label}</span>
      </div>

      {/* Score bar */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
          <span>Performance</span>
          <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {sp.performance_score != null ? `${Math.round(sp.performance_score)}/100` : "—"}
          </strong>
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${score}%`, background: c.bar,
            borderRadius: 3, transition: "width 1.2s ease",
            boxShadow: `0 0 8px ${c.bar}`,
          }} />
        </div>
      </div>

      {/* Summary or Last quote — expandable */}
      {(summaryText || sp.last_quote) && (
        <div style={{
          marginTop: 16, fontSize: 13,
          borderTop: "1px solid var(--border-subtle)", paddingTop: 12,
          lineHeight: 1.6,
        }}>
          {summaryText ? (
            <>
              <div style={{
                color: "var(--text-secondary)",
                ...(expanded ? {} : {
                  display: "-webkit-box", WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical", overflow: "hidden",
                }),
              }}>
                <strong style={{ color: "var(--text-primary)" }}>Live Summary: </strong>
                {summaryText}
              </div>
              {hasLongSummary && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--accent-violet)", fontSize: 12, marginTop: 6,
                    padding: 0, fontWeight: 500,
                  }}
                >
                  {expanded ? "Show less ▴" : "Show more ▾"}
                </button>
              )}
            </>
          ) : (
            <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
              "{sp.last_quote}"
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function LiveDashboard({ speakers = [], feed = [] }) {
  // Compute topic coverage globally from speakers
  const topicCoverage = {};
  speakers.forEach(sp => {
    if (sp.topic_coverage) {
      Object.entries(sp.topic_coverage).forEach(([t, v]) => {
        topicCoverage[t] = Math.max(topicCoverage[t] || 0, v);
      });
    }
  });
  const topicEntries = Object.entries(topicCoverage);

  // Auto-assign stable colors to speakers
  const speakerIndex = {};
  speakers.forEach((sp, i) => {
    speakerIndex[sp.id] = i;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "10px 0" }}>
      {/* ── Topic coverage ── */}
      {topicEntries.length > 0 && (
        <div className="glass-card" style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16, fontWeight: 600, letterSpacing: "0.05em" }}>
            TOPIC COVERAGE
          </div>
          {topicEntries.map(([topic, score]) => {
            const pct = Math.round(score * 100);
            return (
              <div key={topic} style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500, width: 160, flexShrink: 0, color: "var(--text-primary)" }}>{topic}</span>
                <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${pct}%`,
                    background: pct > 60 ? "#00C896" : pct > 30 ? "#FFB800" : "#FF6B6B",
                    borderRadius: 4, transition: "width 1s ease",
                    boxShadow: `0 0 10px ${pct > 60 ? "#00C896" : pct > 30 ? "#FFB800" : "#FF6B6B"}`,
                  }} />
                </div>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", width: 40, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24, alignItems: "start", ...(window.innerWidth > 900 ? { gridTemplateColumns: "1.5fr 1fr" } : {}) }}>
        
        {/* ── Left Column: Speaker Cards ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8, letterSpacing: "0.02em" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#6C63FF", boxShadow: "0 0 8px #6C63FF", animation: "pulse-dot 2s infinite" }} />
            LIVE SPEAKER PERFORMANCE
          </div>

          {speakers.length === 0 ? (
            <div className="glass-card" style={{ padding: "40px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
              Waiting for speakers to join the meeting...
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {speakers.map((sp) => {
                const ci = speakerIndex[sp.id] ?? 0;
                const c = getColor(ci);
                return <SpeakerCard key={sp.id} sp={sp} c={c} />;
              })}
            </div>
          )}
        </div>

        {/* ── Right Column: Live Feed ── */}
        <div className="glass-card" style={{ overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "80vh" }}>
          <div style={{
            padding: "16px 24px", borderBottom: "1px solid var(--border-subtle)",
            fontSize: 13, fontWeight: 600, color: "var(--text-secondary)",
            display: "flex", alignItems: "center", gap: 8, letterSpacing: "0.02em"
          }}>
            LIVE TRANSCRIPT
            <span style={{ marginLeft: "auto", fontWeight: 400, color: "var(--text-muted)", fontSize: 12 }}>Real-time updates</span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
            {feed.length === 0 ? (
              <div style={{ padding: "40px 24px", textAlign: "center", fontSize: 14, color: "var(--text-muted)" }}>
                Waiting for speech…
              </div>
            ) : (
              feed.map((item, idx) => {
                const ci = speakerIndex[item.speaker_id] ?? (idx % SPEAKER_COLORS.length);
                const c = getColor(ci);
                return (
                  <div key={item._id || idx} style={{
                    padding: "10px 24px", display: "flex", gap: 14, alignItems: "flex-start",
                    fontSize: 14, animation: item._new ? "fadeInDown 0.4s ease" : "none",
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "8px",
                      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 2,
                    }}>
                      {initials(item.speaker_name)}
                    </div>
                    <div style={{ flex: 1, lineHeight: 1.6 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, color: c.text }}>
                          {item.speaker_name}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                          {fmtTime(item.start_time ?? 0)}
                        </span>
                      </div>
                      <span style={{ color: "var(--text-primary)", fontSize: 13 }}>{item.text}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      <style>{`
        @keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.8); } }
        @keyframes fadeInDown { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:none} }
      `}</style>
    </div>
  );
}
