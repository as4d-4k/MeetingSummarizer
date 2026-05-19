import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTeamMemberProfile } from '../api/client';
import './userProfile.css';

const RANKS = [
  { min: 0,  label: 'Bronze',   cls: 'gp-rank-bronze',   color: '#CD7F32', emoji: '🥉' },
  { min: 31, label: 'Silver',   cls: 'gp-rank-silver',   color: '#C0C0C0', emoji: '🥈' },
  { min: 51, label: 'Gold',     cls: 'gp-rank-gold',     color: '#FFD700', emoji: '🥇' },
  { min: 71, label: 'Platinum', cls: 'gp-rank-platinum', color: '#7EE8FA', emoji: '💎' },
  { min: 86, label: 'Diamond',  cls: 'gp-rank-diamond',  color: '#B388FF', emoji: '👑' },
];
function getRank(score) { return [...RANKS].reverse().find(r => score >= r.min) || RANKS[0]; }
function initials(n = '') { return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function fmtTime(s) { return `${Math.floor(s / 60)}m ${s % 60}s`; }
function fmtDate(iso) { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function fmtDateFull(iso) { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function scoreColor(s) { return s >= 70 ? '#00C896' : s >= 40 ? '#FFB800' : '#FF6B6B'; }

// ── Radial Gauge ──
function ScoreGauge({ score, size = 130 }) {
  const r = (size - 14) / 2, c = Math.PI * 2 * r;
  const offset = c - (Math.min(100, Math.max(0, score)) / 100) * c;
  const col = scoreColor(score);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="8" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth="8"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1.5s ease', filter: `drop-shadow(0 0 6px ${col})` }} />
      <text x={size/2} y={size/2-2} fill="#fff" fontSize="26" fontWeight="800" textAnchor="middle"
        dominantBaseline="central" style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>{Math.round(score)}</text>
      <text x={size/2} y={size/2+16} fill="var(--text-muted)" fontSize="10" textAnchor="middle"
        dominantBaseline="central" style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>/ 100</text>
    </svg>
  );
}

// ── Radar Chart (5 axes) ──
function RadarChart({ data }) {
  const axes = ['Participation', 'Clarity', 'Sentiment', 'Relevance', 'Engagement'];
  const cx = 120, cy = 120, R = 90;
  const vals = computeRadar(data);
  const angleStep = (Math.PI * 2) / 5;
  const pt = (i, r) => ({ x: cx + Math.sin(i * angleStep) * r, y: cy - Math.cos(i * angleStep) * r });
  const rings = [0.25, 0.5, 0.75, 1];
  const polyPts = vals.map((v, i) => pt(i, (v / 100) * R)).map(p => `${p.x},${p.y}`).join(' ');
  return (
    <svg viewBox="0 0 240 240" style={{ width: '100%', maxWidth: 280, margin: '0 auto', display: 'block' }}>
      {rings.map(r => <polygon key={r} points={Array.from({ length: 5 }, (_, i) => pt(i, r * R)).map(p => `${p.x},${p.y}`).join(' ')}
        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />)}
      {axes.map((a, i) => { const p = pt(i, R + 14); return (
        <g key={a}>
          <line x1={cx} y1={cy} x2={pt(i, R).x} y2={pt(i, R).y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <text x={p.x} y={p.y} fill="var(--text-muted)" fontSize="9" textAnchor="middle" dominantBaseline="central">{a}</text>
        </g>
      ); })}
      <polygon points={polyPts} fill="rgba(108,99,255,0.15)" stroke="#6C63FF" strokeWidth="2" />
      {vals.map((v, i) => { const p = pt(i, (v / 100) * R); return (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="#6C63FF" stroke="#1a1a2e" strokeWidth="2" />
      ); })}
    </svg>
  );
}

function computeRadar(history) {
  if (!history.length) return [0, 0, 0, 0, 0];
  const n = history.length;
  const avgScore = history.reduce((s, m) => s + m.performance_score, 0) / n;
  const avgWords = history.reduce((s, m) => s + m.word_count, 0) / n;
  const participation = Math.min(100, n * 10);
  const clarity = Math.min(100, (avgWords / 200) * 100);
  const totSent = history.reduce((s, m) => s + m.sentiment_positive + m.sentiment_neutral + m.sentiment_negative, 0);
  const posSent = history.reduce((s, m) => s + m.sentiment_positive, 0);
  const sentiment = totSent ? (posSent / totSent) * 100 : 50;
  return [participation, clarity, sentiment, avgScore, Math.min(100, avgScore * 1.1)];
}

// ── Sparkline ──
function Sparkline({ data }) {
  if (!data.length) return <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>No data</div>;
  const last = data.slice(-10);
  const W = 280, H = 60, px = 8;
  const max = 100, cW = W - px * 2;
  const pts = last.map((d, i) => ({ x: px + (last.length === 1 ? cW / 2 : (i / (last.length - 1)) * cW), y: 6 + (H - 12) - (d.performance_score / max) * (H - 12) }));
  const path = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }}>
      <path d={`${path} L ${pts[pts.length-1].x} ${H} L ${pts[0].x} ${H} Z`} fill="url(#spGrad)" opacity="0.3" />
      <path d={path} fill="none" stroke="#6C63FF" strokeWidth="2" strokeLinecap="round" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill="#6C63FF" stroke="#1a1a2e" strokeWidth="1.5" />)}
      <defs><linearGradient id="spGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6C63FF" stopOpacity="0.5" /><stop offset="100%" stopColor="#6C63FF" stopOpacity="0" /></linearGradient></defs>
    </svg>
  );
}

// ── Sentiment Area Chart ──
function SentimentArea({ data, onClickPoint }) {
  const [hover, setHover] = useState(null);
  if (!data.length) return <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 30 }}>No sentiment data</div>;
  const W = 560, H = 180, PX = 40, PY = 20, cW = W - PX * 2, cH = H - PY * 2;
  const maxT = Math.max(...data.map(d => d.sentiment_positive + d.sentiment_neutral + d.sentiment_negative), 1);
  const pts = data.map((d, i) => {
    const x = PX + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW);
    const total = d.sentiment_positive + d.sentiment_neutral + d.sentiment_negative;
    const ratio = total ? d.sentiment_positive / total : 0.5;
    const y = PY + cH - ratio * cH;
    return { x, y, ...d };
  });
  const line = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  const area = `${line} L ${pts[pts.length-1].x} ${PY + cH} L ${pts[0].x} ${PY + cH} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }}>
      <defs>
        <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00C896" stopOpacity="0.4" />
          <stop offset="50%" stopColor="#8B92B8" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#FF6B6B" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map(v => { const y = PY + cH - v * cH; return (
        <g key={v}><line x1={PX} x2={W-PX} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" />
        <text x={PX-6} y={y+4} fill="var(--text-muted)" fontSize="9" textAnchor="end">{v === 1 ? '😊' : v === 0 ? '😟' : '😐'}</text></g>
      ); })}
      <path d={area} fill="url(#sentGrad)" />
      <path d={line} fill="none" stroke="#00C896" strokeWidth="2" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
          onClick={() => onClickPoint && onClickPoint(p)} style={{ cursor: 'pointer' }}>
          <circle cx={p.x} cy={p.y} r={hover === i ? 6 : 4} fill={hover === i ? '#fff' : '#00C896'} stroke="#1a1a2e" strokeWidth="2" />
          <text x={p.x} y={H - 4} fill="var(--text-muted)" fontSize="8" textAnchor="middle">{fmtDate(p.meeting_date)}</text>
        </g>
      ))}
      {hover !== null && (
        <g>
          <rect x={pts[hover].x - 65} y={pts[hover].y - 44} width="130" height="34" rx="6" fill="rgba(10,10,30,0.95)" stroke="rgba(108,99,255,0.3)" />
          <text x={pts[hover].x} y={pts[hover].y - 30} fill="#fff" fontSize="10" fontWeight="600" textAnchor="middle">{pts[hover].meeting_title}</text>
          <text x={pts[hover].x} y={pts[hover].y - 17} fill="var(--text-muted)" fontSize="9" textAnchor="middle">
            +{pts[hover].sentiment_positive} ~{pts[hover].sentiment_neutral} −{pts[hover].sentiment_negative}
          </text>
        </g>
      )}
    </svg>
  );
}

// ── Achievements ──
function computeAchievements(history) {
  const badges = [
    { id: 'first_blood', name: 'First Blood', emoji: '🩸', desc: 'Attended first meeting',
      color: '#FF6B6B', unlocked: history.length >= 1 },
    { id: 'mvp', name: 'MVP', emoji: '⭐', desc: 'Scored 90+ in a meeting',
      color: '#FFD700', unlocked: history.some(m => m.performance_score >= 90) },
    { id: 'clutch', name: 'Clutch', emoji: '🔥', desc: 'Score > 60 despite negative sentiment',
      color: '#FF8C00', unlocked: history.some(m => m.sentiment_negative > m.sentiment_positive && m.performance_score > 60) },
    { id: 'team_player', name: 'Team Player', emoji: '🤝', desc: '3+ meetings with positive majority',
      color: '#00C896', unlocked: history.filter(m => m.sentiment_positive > m.sentiment_negative).length >= 3 },
    { id: 'legend', name: 'Legend', emoji: '👑', desc: '10+ meetings with 80+ avg score',
      color: '#B388FF', unlocked: history.length >= 10 && (history.reduce((s, m) => s + m.performance_score, 0) / history.length) >= 80 },
  ];
  return badges;
}

// ── Main ──
export default function UserProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [snippet, setSnippet] = useState(null);

  const fetchProfile = useCallback(async () => {
    try { const { data } = await getTeamMemberProfile(id); setProfile(data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  if (loading) return <div className="gp-root">{[80, 200, 100, 200].map((h, i) => <div key={i} className="skeleton" style={{ height: h, borderRadius: 16, marginBottom: 16 }} />)}</div>;
  if (!profile) return <div className="gp-root" style={{ textAlign: 'center', paddingTop: 80 }}><h2 style={{ color: 'var(--text-primary)' }}>Profile not found</h2><button onClick={() => navigate('/team')} style={{ marginTop: 16, color: '#6C63FF', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>← Back to Team</button></div>;

  const { member, overall_score, total_meetings, total_words, total_talk_time, best_score, worst_score, rank, leaderboard, meeting_history } = profile;
  const rnk = getRank(overall_score);
  const badges = computeAchievements(meeting_history);

  return (
    <div className="gp-root">
      <button className="gp-back" onClick={() => navigate('/team')}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back to Team
      </button>

      {/* ═══ BANNER ═══ */}
      <div className="gp-banner">
        <div className="gp-banner-inner">
          <div className="gp-avatar-wrap">
            <div className="gp-avatar">{initials(member.name)}</div>
            <div className={`gp-rank-badge ${rnk.cls}`}>{rnk.emoji}</div>
          </div>
          <div className="gp-banner-info">
            <div className="gp-name">{member.name}</div>
            <div className="gp-rank-title" style={{ color: rnk.color }}>{rnk.label} Rank</div>
            <div className="gp-kd-bar">
              <div className="gp-kd-item"><div className="gp-kd-val">{total_meetings}</div><div className="gp-kd-lbl">Matches</div></div>
              <div className="gp-kd-item"><div className="gp-kd-val" style={{ color: '#00C896' }}>{best_score}</div><div className="gp-kd-lbl">Best</div></div>
              <div className="gp-kd-item"><div className="gp-kd-val" style={{ color: '#FF6B6B' }}>{worst_score}</div><div className="gp-kd-lbl">Worst</div></div>
              <div className="gp-kd-item"><div className="gp-kd-val">#{rank}</div><div className="gp-kd-lbl">Team Rank</div></div>
              <div className="gp-kd-item"><div className="gp-kd-val">{total_words.toLocaleString()}</div><div className="gp-kd-lbl">Words</div></div>
              <div className="gp-kd-item"><div className="gp-kd-val">{fmtTime(total_talk_time)}</div><div className="gp-kd-lbl">Talk Time</div></div>
            </div>
          </div>
          <div className="gp-banner-score">
            <ScoreGauge score={overall_score} />
            <div className="gp-banner-score-lbl">Overall Rating</div>
          </div>
        </div>
      </div>

      {/* ═══ INFO CARDS ═══ */}
      <div className="gp-info-row">
        <div className="gp-info-item">
          <div className="gp-info-icon" style={{ background: 'rgba(108,99,255,0.12)', color: '#9B8FFF' }}>✉</div>
          <div><div className="gp-info-lbl">Email</div><div className="gp-info-val">{member.email || '—'}</div></div>
        </div>
        <div className="gp-info-item">
          <div className="gp-info-icon" style={{ background: 'rgba(0,200,150,0.12)', color: '#00C896' }}>💬</div>
          <div><div className="gp-info-lbl">Slack ID</div><div className="gp-info-val">{member.slack_id || '—'}</div></div>
        </div>
        <div className="gp-info-item">
          <div className="gp-info-icon" style={{ background: 'rgba(255,184,0,0.12)', color: '#FFB800' }}>🔑</div>
          <div><div className="gp-info-lbl">Employee Key</div><div className="gp-info-val">{member.key || '—'}</div></div>
        </div>
        <div className="gp-info-item">
          <div className="gp-info-icon" style={{ background: 'rgba(255,107,107,0.12)', color: '#FF6B6B' }}>📅</div>
          <div><div className="gp-info-lbl">Joined</div><div className="gp-info-val">{member.created_at ? fmtDateFull(member.created_at) : '—'}</div></div>
        </div>
      </div>

      {/* ═══ ACHIEVEMENTS ═══ */}
      <div className="gp-achieve-title">🏆 Achievements</div>
      <div className="gp-badges">
        {badges.map(b => (
          <div key={b.id} className={`gp-badge ${b.unlocked ? 'gp-badge-unlocked' : 'gp-badge-locked'}`}>
            <div className="gp-badge-shield" style={b.unlocked ? {
              background: `linear-gradient(135deg, ${b.color}22, ${b.color}11)`,
              borderColor: `${b.color}66`,
              boxShadow: `0 0 20px ${b.color}33`,
            } : {}}>
              <span style={{ fontSize: 28 }}>{b.emoji}</span>
              <div className="gp-badge-tooltip">
                <strong>{b.name}</strong>
                {b.desc}<br />
                {b.unlocked ? '✅ Unlocked' : '🔒 Locked'}
              </div>
            </div>
            <div className="gp-badge-name">{b.name}</div>
          </div>
        ))}
      </div>

      {/* ═══ CHARTS ═══ */}
      <div className="gp-charts">
        <div className="gp-chart-card">
          <div className="gp-chart-title">🎯 Performance Radar</div>
          <RadarChart data={meeting_history} />
        </div>
        <div className="gp-chart-card">
          <div className="gp-chart-title">📈 Last 10 Matches Trend</div>
          <Sparkline data={meeting_history} />
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
            {meeting_history.length > 0 ? `${Math.min(10, meeting_history.length)} most recent meetings` : 'Play some matches first!'}
          </div>
        </div>
      </div>

      {/* ═══ SENTIMENT TIMELINE ═══ */}
      <div className="gp-chart-card" style={{ marginBottom: 24 }}>
        <div className="gp-chart-title">💭 Sentiment Timeline</div>
        <SentimentArea data={meeting_history} onClickPoint={p => setSnippet(p.contribution_summary ? p : null)} />
        {snippet && (
          <div style={{ marginTop: 16, padding: 16, background: 'rgba(108,99,255,0.06)', borderRadius: 12, border: '1px solid rgba(108,99,255,0.15)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, position: 'relative' }}>
            <button onClick={() => setSnippet(null)} style={{ position: 'absolute', top: 8, right: 12, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
            <strong style={{ color: 'var(--text-primary)' }}>{snippet.meeting_title}</strong> — {fmtDateFull(snippet.meeting_date)}
            <p style={{ marginTop: 6 }}>{snippet.contribution_summary || 'No transcript snippet available.'}</p>
          </div>
        )}
      </div>

      {/* ═══ RECENT MATCHES ═══ */}
      {meeting_history.length > 0 && (
        <div className="gp-matches">
          <div className="gp-chart-title">🎮 Recent Matches</div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr>
                <th>Date</th><th>Match</th><th>Score</th><th>Words</th><th>Duration</th><th>Sentiment</th><th></th>
              </tr></thead>
              <tbody>
                {[...meeting_history].reverse().slice(0, 15).map(m => {
                  const sc = m.performance_score, sC = scoreColor(sc);
                  return (
                    <tr key={m.id} onClick={() => navigate(`/meetings/${m.meeting_id}`)}>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtDateFull(m.meeting_date)}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.meeting_title}</td>
                      <td><span className="gp-score-pill" style={{ color: sC, background: `${sC}18` }}>{Math.round(sc)}</span></td>
                      <td>{m.word_count.toLocaleString()}</td>
                      <td>{fmtTime(m.talk_time_seconds)}</td>
                      <td><div className="gp-sent-row">
                        <span style={{ color: '#00C896' }}>+{m.sentiment_positive}</span>
                        <span style={{ color: '#8B92B8' }}>~{m.sentiment_neutral}</span>
                        <span style={{ color: '#FF6B6B' }}>−{m.sentiment_negative}</span>
                      </div></td>
                      <td><span className="gp-replay" onClick={e => { e.stopPropagation(); navigate(`/meetings/${m.meeting_id}`); }}>Replay →</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ LEADERBOARD ═══ */}
      {leaderboard && leaderboard.length > 1 && (
        <div className="gp-leaderboard">
          <div className="gp-chart-title">🏅 Team Leaderboard</div>
          {leaderboard.map((lb, i) => {
            const isMe = lb.id === member.id;
            const lbRnk = getRank(lb.score);
            return (
              <div key={lb.id} className={`gp-lb-row ${isMe ? 'gp-lb-me' : ''}`}
                onClick={() => !isMe && navigate(`/team/${lb.id}`)} style={{ cursor: isMe ? 'default' : 'pointer' }}>
                <div className="gp-lb-rank" style={{
                  background: i === 0 ? 'rgba(255,215,0,0.15)' : i === 1 ? 'rgba(192,192,192,0.15)' : i === 2 ? 'rgba(205,127,50,0.15)' : 'rgba(255,255,255,0.04)',
                  color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--text-muted)',
                }}>#{i + 1}</div>
                <span style={{ fontSize: 14 }}>{lbRnk.emoji}</span>
                <span className="gp-lb-name" style={isMe ? { color: '#9B8FFF', fontWeight: 700 } : {}}>{lb.name}{isMe ? ' (You)' : ''}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lb.meetings} matches</span>
                <span className="gp-lb-score" style={{ color: scoreColor(lb.score) }}>{lb.score}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
