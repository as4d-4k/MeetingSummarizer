import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RANKS, getRank, initials, fmtTime, fmtDateFull, scoreColor, ScoreGauge, RadarChart, Sparkline, SentimentArea, computeAchievements, hasStreak } from './profileCharts';
import './userProfile.css';

function useCountUp(target, dur = 1200) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let start = null;
    const step = ts => { if (!start) start = ts; const p = Math.min((ts - start) / dur, 1); setV(Math.round(p * target)); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }, [target, dur]);
  return v;
}
function AnimVal({ value, color }) { const v = useCountUp(value); return <span style={{ color }}>{typeof value === 'string' ? value : v}</span>; }

function HexAvatar({ name, glowColor }) {
  return <div className="gp-hex-frame" style={{ '--hex-glow': glowColor }}>
    <svg className="gp-hex-bg" viewBox="0 0 120 120"><polygon points="60,5 110,30 110,90 60,115 10,90 10,30" fill="none" stroke={glowColor} strokeWidth="2.5" opacity=".6" /><polygon points="60,12 104,34 104,86 60,108 16,86 16,34" fill="rgba(108,99,255,0.08)" stroke="none" /></svg>
    <div className="gp-hex-inner">{initials(name)}</div>
  </div>;
}

export default function TeamProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [snippet, setSnippet] = useState(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('team_profile');
    if (!stored) { navigate('/login'); return; }
    setProfile(JSON.parse(stored));
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem('team_profile');
    sessionStorage.removeItem('team_key');
    navigate('/login');
  };

  if (!profile) return null;

  const { member, overall_score, total_meetings, total_words, total_talk_time, best_score, worst_score, meeting_history } = profile;
  const rnk = getRank(overall_score);
  const badges = computeAchievements(meeting_history);
  const streak = hasStreak(meeting_history);
  const nextRnk = RANKS.find(r => r.min > rnk.min) || rnk;
  const xpPct = rnk === nextRnk ? 100 : Math.round(((overall_score - rnk.min) / (nextRnk.min - rnk.min)) * 100);

  return (
    <div className="tp-page">
      {/* Top bar */}
      <div className="tp-topbar">
        <div className="tp-topbar-left">
          <div className="tp-topbar-logo">🎯</div>
          <span className="tp-topbar-brand">MeetingIntel</span>
        </div>
        <div className="tp-topbar-right">
          <span className="tp-topbar-name">{member.name}</span>
          <button className="tp-logout" onClick={handleLogout}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 13H3a1 1 0 01-1-1V4a1 1 0 011-1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Logout
          </button>
        </div>
      </div>

      <div className="gp-root">
        {/* BANNER */}
        <div className="gp-banner"><div className="gp-banner-inner">
          <div className="gp-avatar-wrap" style={{ '--hex-glow': rnk.color }}>
            <HexAvatar name={member.name} glowColor={rnk.color} />
            <div className={`gp-rank-badge ${rnk.cls}`}>{rnk.emoji}</div>
          </div>
          <div className="gp-banner-info">
            <div className="gp-name">{member.name}</div>
            <div className="gp-rank-title" style={{ color: rnk.color }}>{rnk.label} Rank</div>
            <div className="gp-kd-bar">
              <div className="gp-kd-item"><div className="gp-kd-val"><AnimVal value={total_meetings} /></div><div className="gp-kd-lbl">Matches</div></div>
              <div className="gp-kd-item"><div className="gp-kd-val"><AnimVal value={best_score || 0} color="#00C896" /></div><div className="gp-kd-lbl">Best</div></div>
              <div className="gp-kd-item"><div className="gp-kd-val"><AnimVal value={worst_score || 0} color="#FF6B6B" /></div><div className="gp-kd-lbl">Worst</div></div>
              <div className="gp-kd-item"><div className="gp-kd-val"><AnimVal value={total_words} /></div><div className="gp-kd-lbl">Words</div></div>
              <div className="gp-kd-item"><div className="gp-kd-val">{fmtTime(total_talk_time)}</div><div className="gp-kd-lbl">Talk Time</div></div>
            </div>
            <div className="gp-xp-bar">
              <div className="gp-xp-labels"><span className="gp-xp-from" style={{ color: rnk.color }}>{rnk.emoji} {rnk.label}</span><span className="gp-xp-to" style={{ color: nextRnk.color }}>{nextRnk.emoji} {nextRnk.label}</span></div>
              <div className="gp-xp-track"><div className="gp-xp-fill" style={{ '--xp-pct': `${xpPct}%`, background: `linear-gradient(90deg,${rnk.color},${nextRnk.color})` }}><span className="gp-xp-pts">{overall_score} XP</span></div></div>
            </div>
          </div>
          <div className="gp-banner-score"><ScoreGauge score={overall_score} /><div className="gp-banner-score-lbl">Overall Rating</div></div>
        </div></div>

        {streak && <div className="gp-streak"><span className="gp-streak-emoji">🔥</span>On a 3-match winning streak!</div>}

        {/* INFO */}
        <div className="gp-info-row">
          <div className="gp-info-item"><div className="gp-info-icon" style={{ background: 'rgba(108,99,255,.12)', color: '#9B8FFF' }}>✉</div><div><div className="gp-info-lbl">Email</div><div className="gp-info-val">{member.email || '—'}</div></div></div>
          <div className="gp-info-item"><div className="gp-info-icon" style={{ background: 'rgba(0,200,150,.12)', color: '#00C896' }}>💬</div><div><div className="gp-info-lbl">Slack ID</div><div className="gp-info-val">{member.slack_id || '—'}</div></div></div>
          <div className="gp-info-item"><div className="gp-info-icon" style={{ background: 'rgba(255,184,0,.12)', color: '#FFB800' }}>📅</div><div><div className="gp-info-lbl">Joined</div><div className="gp-info-val">{member.created_at ? fmtDateFull(member.created_at) : '—'}</div></div></div>
        </div>

        {/* ACHIEVEMENTS */}
        <div className="gp-section-title">🏆 Achievements</div>
        <div className="gp-badges">{badges.map(b => (
          <div key={b.id} className={`gp-badge ${b.unlocked ? 'gp-badge-unlocked' : 'gp-badge-locked'}`}>
            <div className="gp-badge-flipper">
              <div className="gp-badge-front" style={b.unlocked ? { background: `linear-gradient(135deg,${b.color}22,${b.color}11)`, borderColor: `${b.color}66`, boxShadow: `0 0 20px ${b.color}33` } : { borderColor: 'rgba(255,255,255,.1)', background: 'rgba(255,255,255,.03)' }}><span style={{ fontSize: 28 }}>{b.emoji}</span></div>
              <div className="gp-badge-back" style={{ borderColor: b.unlocked ? `${b.color}44` : 'rgba(255,255,255,.1)' }}><strong style={{ color: b.unlocked ? b.color : 'var(--text-muted)', fontSize: 10 }}>{b.name}</strong><br />{b.desc}<br /><span style={{ color: b.unlocked ? '#00C896' : '#FF6B6B' }}>{b.unlocked ? '✅ Unlocked' : '🔒 Locked'}</span></div>
            </div>
            <div className="gp-badge-name">{b.name}</div>
          </div>
        ))}</div>

        {/* CHARTS */}
        <div className="gp-charts">
          <div className="gp-chart-card"><div className="gp-section-title">🎯 Performance Radar</div><RadarChart data={meeting_history} /></div>
          <div className="gp-chart-card"><div className="gp-section-title">📈 Last 10 Matches</div><Sparkline data={meeting_history} /></div>
        </div>

        {/* SENTIMENT */}
        <div className="gp-chart-card" style={{ marginBottom: 24 }}>
          <div className="gp-section-title">💭 Sentiment Timeline</div>
          <SentimentArea data={meeting_history} onClickPoint={p => setSnippet(p.contribution_summary ? p : null)} />
          {snippet && (
            <div style={{ marginTop: 16, padding: 16, background: 'rgba(108,99,255,.06)', borderRadius: 12, border: '1px solid rgba(108,99,255,.15)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, position: 'relative' }}>
              <button onClick={() => setSnippet(null)} style={{ position: 'absolute', top: 8, right: 12, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
              <strong style={{ color: 'var(--text-primary)' }}>{snippet.meeting_title}</strong> — {fmtDateFull(snippet.meeting_date)}
              <p style={{ marginTop: 6 }}>{snippet.contribution_summary || 'No snippet available.'}</p>
            </div>
          )}
        </div>

        {/* MATCHES */}
        {meeting_history.length > 0 && (
          <div className="gp-matches"><div className="gp-section-title">🎮 Recent Matches</div><div style={{ overflowX: 'auto' }}><table><thead><tr><th>Date</th><th>Match</th><th>Score</th><th>Words</th><th>Sentiment</th></tr></thead><tbody>
            {[...meeting_history].reverse().slice(0, 15).map(m => {
              const sc = m.performance_score, sC = scoreColor(sc), cls = sc >= 70 ? 'gp-match-green' : sc >= 40 ? 'gp-match-amber' : 'gp-match-red';
              return (
                <tr key={m.id} className={cls}>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtDateFull(m.meeting_date)}</td>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.meeting_title}</td>
                  <td><span className="gp-score-pill" style={{ color: sC, background: `${sC}18` }}>{Math.round(sc)}</span></td>
                  <td>{m.word_count.toLocaleString()}</td>
                  <td><div className="gp-sent-row"><span style={{ color: '#00C896' }}>+{m.sentiment_positive}</span><span style={{ color: '#8B92B8' }}>~{m.sentiment_neutral}</span><span style={{ color: '#FF6B6B' }}>−{m.sentiment_negative}</span></div></td>
                </tr>
              );
            })}
          </tbody></table></div></div>
        )}
      </div>

      <style>{`
        .tp-page { min-height: 100vh; background: var(--bg-void); font-family: var(--font-body); }
        .tp-topbar {
          position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between;
          padding: 14px 32px; background: rgba(10,10,25,0.85); backdrop-filter: blur(16px);
          border-bottom: 1px solid var(--border-subtle);
        }
        .tp-topbar-left { display: flex; align-items: center; gap: 10px; }
        .tp-topbar-logo { font-size: 20px; }
        .tp-topbar-brand { font-family: var(--font-display); font-size: 16px; font-weight: 700; color: var(--text-primary); }
        .tp-topbar-right { display: flex; align-items: center; gap: 16px; }
        .tp-topbar-name { font-size: 13px; color: var(--text-secondary); font-weight: 500; }
        .tp-logout {
          display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 10px;
          background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.2);
          color: #FF6B6B; font-size: 13px; font-weight: 600; cursor: pointer;
          font-family: var(--font-body); transition: all 0.2s;
        }
        .tp-logout:hover { background: rgba(255,107,107,0.18); transform: translateY(-1px); }
        .tp-page .gp-root { max-width: 900px; margin: 0 auto; }
      `}</style>
    </div>
  );
}
