import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTeamMemberProfile } from '../api/client';

// ── Helpers ──────────────────────────────────────────
function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
function fmtTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtDateFull(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Radial Gauge ─────────────────────────────────────
function ScoreGauge({ score, size = 160 }) {
  const r = (size - 16) / 2;
  const c = Math.PI * 2 * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = c - (pct / 100) * c;
  const color = pct >= 70 ? '#00C896' : pct >= 40 ? '#FFB800' : '#FF6B6B';

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1.5s ease' }} />
      <text x={size/2} y={size/2} fill="var(--text-primary)" fontSize="28" fontWeight="700"
        textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>
        {Math.round(score)}
      </text>
      <text x={size/2} y={size/2 + 18} fill="var(--text-muted)" fontSize="11"
        textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>
        / 100
      </text>
    </svg>
  );
}

// ── Score Line Chart ─────────────────────────────────
function ScoreChart({ data }) {
  const [hover, setHover] = useState(null);
  if (!data.length) return <EmptyChart label="No meeting data yet" />;

  const W = 600, H = 200, PX = 50, PY = 30;
  const chartW = W - PX * 2, chartH = H - PY * 2;

  const maxScore = 100;
  const points = data.map((d, i) => ({
    x: PX + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW),
    y: PY + chartH - (d.performance_score / maxScore) * chartH,
    ...d,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length-1].x} ${PY + chartH} L ${points[0].x} ${PY + chartH} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map(v => {
        const y = PY + chartH - (v / maxScore) * chartH;
        return <g key={v}>
          <line x1={PX} x2={W-PX} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" />
          <text x={PX - 8} y={y + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end">{v}</text>
        </g>;
      })}

      {/* Area + line */}
      <path d={areaD} fill="url(#scoreGrad)" opacity="0.3" />
      <path d={pathD} fill="none" stroke="#6C63FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Dots */}
      {points.map((p, i) => (
        <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
          <circle cx={p.x} cy={p.y} r={hover === i ? 6 : 4} fill={hover === i ? '#9B8FFF' : '#6C63FF'}
            stroke="#1a1a2e" strokeWidth="2" style={{ transition: 'r 0.2s' }} />
          {/* X-axis labels */}
          <text x={p.x} y={H - 6} fill="var(--text-muted)" fontSize="9" textAnchor="middle">
            {fmtDate(p.meeting_date)}
          </text>
        </g>
      ))}

      {/* Tooltip */}
      {hover !== null && (
        <g>
          <rect x={points[hover].x - 60} y={points[hover].y - 46} width="120" height="36" rx="6"
            fill="rgba(20,20,40,0.95)" stroke="rgba(108,99,255,0.3)" />
          <text x={points[hover].x} y={points[hover].y - 32} fill="#fff" fontSize="11" fontWeight="600" textAnchor="middle">
            Score: {points[hover].performance_score}
          </text>
          <text x={points[hover].x} y={points[hover].y - 18} fill="var(--text-muted)" fontSize="9" textAnchor="middle">
            {fmtDateFull(points[hover].meeting_date)}
          </text>
        </g>
      )}

      <defs>
        <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6C63FF" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#6C63FF" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ── Stacked Sentiment Chart ──────────────────────────
function SentimentChart({ data }) {
  const [hover, setHover] = useState(null);
  if (!data.length) return <EmptyChart label="No sentiment data yet" />;

  const W = 600, H = 200, PX = 50, PY = 30;
  const chartW = W - PX * 2, chartH = H - PY * 2;
  const barW = Math.min(32, chartW / data.length - 4);

  const maxTotal = Math.max(...data.map(d => d.sentiment_positive + d.sentiment_neutral + d.sentiment_negative), 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map(pct => {
        const y = PY + chartH - pct * chartH;
        const val = Math.round(pct * maxTotal);
        return <g key={pct}>
          <line x1={PX} x2={W-PX} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" />
          <text x={PX - 8} y={y + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end">{val}</text>
        </g>;
      })}

      {data.map((d, i) => {
        const x = PX + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW) - barW / 2;
        const total = d.sentiment_positive + d.sentiment_neutral + d.sentiment_negative;
        const scale = (total / maxTotal) * chartH;

        const negH = total ? (d.sentiment_negative / total) * scale : 0;
        const neuH = total ? (d.sentiment_neutral / total) * scale : 0;
        const posH = total ? (d.sentiment_positive / total) * scale : 0;

        const baseY = PY + chartH;

        return (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
            {/* Negative (bottom) */}
            <rect x={x} y={baseY - negH} width={barW} height={negH} fill="#FF6B6B" rx="2"
              opacity={hover === i ? 1 : 0.8} style={{ transition: 'opacity 0.2s' }} />
            {/* Neutral (middle) */}
            <rect x={x} y={baseY - negH - neuH} width={barW} height={neuH} fill="#8B92B8" rx="2"
              opacity={hover === i ? 1 : 0.8} />
            {/* Positive (top) */}
            <rect x={x} y={baseY - negH - neuH - posH} width={barW} height={posH} fill="#00C896" rx="2"
              opacity={hover === i ? 1 : 0.8} />
            {/* X-axis */}
            <text x={x + barW/2} y={H - 6} fill="var(--text-muted)" fontSize="9" textAnchor="middle">
              {fmtDate(d.meeting_date)}
            </text>
          </g>
        );
      })}

      {/* Tooltip */}
      {hover !== null && (() => {
        const d = data[hover];
        const x = PX + (data.length === 1 ? (W - PX * 2) / 2 : (hover / (data.length - 1)) * (W - PX * 2));
        return (
          <g>
            <rect x={x - 70} y={4} width="140" height="48" rx="6"
              fill="rgba(20,20,40,0.95)" stroke="rgba(108,99,255,0.3)" />
            <text x={x} y={18} fill="#fff" fontSize="10" fontWeight="600" textAnchor="middle">
              {fmtDateFull(d.meeting_date)}
            </text>
            <text x={x - 40} y={34} fill="#00C896" fontSize="9">+{d.sentiment_positive}</text>
            <text x={x} y={34} fill="#8B92B8" fontSize="9" textAnchor="middle">~{d.sentiment_neutral}</text>
            <text x={x + 40} y={34} fill="#FF6B6B" fontSize="9" textAnchor="end">−{d.sentiment_negative}</text>
            <text x={x} y={46} fill="var(--text-muted)" fontSize="9" textAnchor="middle">{d.meeting_title}</text>
          </g>
        );
      })()}

      {/* Legend */}
      <circle cx={PX} cy={10} r="4" fill="#00C896" />
      <text x={PX + 8} y={14} fill="var(--text-muted)" fontSize="9">Positive</text>
      <circle cx={PX + 70} cy={10} r="4" fill="#8B92B8" />
      <text x={PX + 78} y={14} fill="var(--text-muted)" fontSize="9">Neutral</text>
      <circle cx={PX + 140} cy={10} r="4" fill="#FF6B6B" />
      <text x={PX + 148} y={14} fill="var(--text-muted)" fontSize="9">Concern</text>
    </svg>
  );
}

function EmptyChart({ label }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: 14 }}>
      {label}
    </div>
  );
}

// ── Main Profile Page ────────────────────────────────
export default function UserProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await getTeamMemberProfile(id);
      setProfile(data);
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  if (loading) return (
    <div style={{ padding: 40 }}>
      {[80, 160, 200, 200].map((h, i) => (
        <div key={i} className="skeleton" style={{ height: h, borderRadius: 12, marginBottom: 16 }} />
      ))}
    </div>
  );

  if (!profile) return (
    <div style={{ padding: '80px 40px', textAlign: 'center' }}>
      <h2 style={{ color: 'var(--text-primary)', marginBottom: 16 }}>Profile not found</h2>
      <button onClick={() => navigate('/team')} className="btn-accent">Back to Team Directory</button>
    </div>
  );

  const { member, overall_score, total_meetings, total_words, total_talk_time, meeting_history } = profile;
  const scoreColor = overall_score >= 70 ? '#00C896' : overall_score >= 40 ? '#FFB800' : '#FF6B6B';

  return (
    <div className="up-root">
      {/* Back */}
      <button className="up-back" onClick={() => navigate('/team')}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back to Team
      </button>

      {/* ── Profile Header Card ── */}
      <div className="up-header-card glass-card">
        <div className="up-avatar" style={{ background: 'rgba(108,99,255,0.15)', color: '#9B8FFF', border: '2px solid rgba(108,99,255,0.3)' }}>
          {initials(member.name)}
        </div>
        <div className="up-header-info">
          <h1 className="up-name">{member.name}</h1>
          <div className="up-tags">
            {member.email && <span className="up-tag up-tag-email">✉ {member.email}</span>}
            {member.slack_id && <span className="up-tag up-tag-slack">💬 {member.slack_id}</span>}
          </div>
        </div>
        <div className="up-score-gauge">
          <ScoreGauge score={overall_score} size={140} />
          <div className="up-score-label" style={{ color: scoreColor }}>Overall Score</div>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="up-stats">
        <div className="up-stat glass-card">
          <div className="up-stat-value">{total_meetings}</div>
          <div className="up-stat-label">Meetings</div>
        </div>
        <div className="up-stat glass-card">
          <div className="up-stat-value">{total_words.toLocaleString()}</div>
          <div className="up-stat-label">Words Spoken</div>
        </div>
        <div className="up-stat glass-card">
          <div className="up-stat-value">{fmtTime(total_talk_time)}</div>
          <div className="up-stat-label">Talk Time</div>
        </div>
        <div className="up-stat glass-card">
          <div className="up-stat-value" style={{ color: scoreColor }}>{overall_score}</div>
          <div className="up-stat-label">Avg Score</div>
        </div>
      </div>

      {/* ── Performance Chart ── */}
      <div className="glass-card up-chart-card">
        <div className="up-chart-title">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 14l4-5 3 3 5-7" stroke="#6C63FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Performance Score Trend
        </div>
        <ScoreChart data={meeting_history} />
      </div>

      {/* ── Sentiment Chart ── */}
      <div className="glass-card up-chart-card">
        <div className="up-chart-title">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="6" width="4" height="8" rx="1" fill="#00C896"/><rect x="6" y="3" width="4" height="11" rx="1" fill="#8B92B8"/><rect x="11" y="8" width="4" height="6" rx="1" fill="#FF6B6B"/></svg>
          Sentiment Breakdown by Meeting
        </div>
        <SentimentChart data={meeting_history} />
      </div>

      {/* ── Meeting History Table ── */}
      {meeting_history.length > 0 && (
        <div className="glass-card up-chart-card">
          <div className="up-chart-title">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M5 6h6M5 8h4M5 10h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            Meeting History
          </div>
          <div className="up-table-wrap">
            <table className="up-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Meeting</th>
                  <th>Score</th>
                  <th>Words</th>
                  <th>Sentiment</th>
                </tr>
              </thead>
              <tbody>
                {[...meeting_history].reverse().map((m, i) => {
                  const sc = m.performance_score;
                  const scC = sc >= 70 ? '#00C896' : sc >= 40 ? '#FFB800' : '#FF6B6B';
                  return (
                    <tr key={m.id} onClick={() => navigate(`/meetings/${m.meeting_id}`)} style={{ cursor: 'pointer' }}>
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDateFull(m.meeting_date)}</td>
                      <td style={{ fontWeight: 500 }}>{m.meeting_title}</td>
                      <td><span className="up-score-pill" style={{ color: scC, background: `${scC}18` }}>{Math.round(sc)}</span></td>
                      <td>{m.word_count.toLocaleString()}</td>
                      <td>
                        <div className="up-sent-row">
                          <span style={{ color: '#00C896' }}>+{m.sentiment_positive}</span>
                          <span style={{ color: '#8B92B8' }}>~{m.sentiment_neutral}</span>
                          <span style={{ color: '#FF6B6B' }}>−{m.sentiment_negative}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        .up-root { padding: 40px; max-width: 900px; font-family: var(--font-body); }

        .up-back {
          display: inline-flex; align-items: center; gap: 6px;
          color: var(--text-muted); font-size: 13px; background: none; border: none;
          cursor: pointer; margin-bottom: 20px; padding: 0; font-family: var(--font-body);
          transition: color 0.2s;
        }
        .up-back:hover { color: var(--text-primary); }

        .up-header-card {
          display: flex; align-items: center; gap: 24px; padding: 28px 32px; margin-bottom: 20px;
        }
        .up-avatar {
          width: 72px; height: 72px; border-radius: 16px; display: flex; align-items: center;
          justify-content: center; font-size: 24px; font-weight: 700; flex-shrink: 0;
          font-family: var(--font-display);
        }
        .up-header-info { flex: 1; min-width: 0; }
        .up-name {
          font-family: var(--font-display); font-size: 24px; font-weight: 700;
          color: var(--text-primary); letter-spacing: -0.02em; margin-bottom: 8px;
        }
        .up-tags { display: flex; gap: 8px; flex-wrap: wrap; }
        .up-tag {
          font-size: 12px; padding: 4px 12px; border-radius: 100px; font-weight: 500;
        }
        .up-tag-email { background: rgba(108,99,255,0.1); color: #9B8FFF; border: 1px solid rgba(108,99,255,0.2); }
        .up-tag-slack { background: rgba(0,200,150,0.1); color: #33E2B5; border: 1px solid rgba(0,200,150,0.2); }
        .up-score-gauge { text-align: center; flex-shrink: 0; }
        .up-score-label {
          font-size: 12px; font-weight: 600; letter-spacing: 0.04em; margin-top: 6px;
        }

        .up-stats {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;
        }
        .up-stat {
          padding: 20px; text-align: center;
        }
        .up-stat-value {
          font-size: 22px; font-weight: 700; color: var(--text-primary);
          font-family: var(--font-display); margin-bottom: 4px;
        }
        .up-stat-label { font-size: 12px; color: var(--text-muted); }

        .up-chart-card { padding: 24px; margin-bottom: 20px; }
        .up-chart-title {
          display: flex; align-items: center; gap: 10px;
          font-size: 14px; font-weight: 600; color: var(--text-secondary);
          margin-bottom: 20px; letter-spacing: 0.01em;
        }

        .up-table-wrap { overflow-x: auto; }
        .up-table { width: 100%; border-collapse: collapse; }
        .up-table th {
          text-align: left; padding: 10px 14px; font-size: 11px; font-weight: 600;
          color: var(--text-muted); border-bottom: 1px solid var(--border-subtle);
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        .up-table td {
          padding: 12px 14px; font-size: 13px; color: var(--text-secondary);
          border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .up-table tr:hover td { background: rgba(108,99,255,0.04); }

        .up-score-pill {
          font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 100px;
          font-variant-numeric: tabular-nums;
        }
        .up-sent-row { display: flex; gap: 10px; font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; }

        @media (max-width: 700px) {
          .up-header-card { flex-direction: column; text-align: center; }
          .up-stats { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  );
}
