import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RANKS, getRank, getNextRank, ptsToNext, BadgeImage, initials, fmtTime, fmtDateFull, scoreColor, ScoreGauge, RadarChart, Sparkline, SentimentArea, computeAchievements, hasStreak } from './profileCharts';
import { teamUpdateSlackId } from '../api/client';
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
  const [activeTab, setActiveTab] = useState('profile');
  const [showBadgesModal, setShowBadgesModal] = useState(false);
  const [slackId, setSlackId] = useState('');
  const [slackError, setSlackError] = useState('');
  const [slackSaved, setSlackSaved] = useState(false);
  const [slackSaving, setSlackSaving] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('team_profile');
    if (!stored) { navigate('/login'); return; }
    const parsed = JSON.parse(stored);
    setProfile(parsed);
    setSlackId(parsed.member?.slack_id || '');
  }, [navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem('team_profile');
    sessionStorage.removeItem('team_key');
    navigate('/login');
  };

  if (!profile) return null;

  const { member, overall_score, total_score: rawTotalScore, total_meetings, total_words, total_talk_time, best_score, worst_score, meeting_history, leaderboard } = profile;
  const totalScore = rawTotalScore || meeting_history.reduce((s, m) => s + m.performance_score, 0);
  const rnk = getRank(totalScore);
  const badges = computeAchievements(meeting_history);
  const streak = hasStreak(meeting_history);
  const nextRnk = getNextRank(totalScore);
  const xpPct = !nextRnk ? 100 : Math.round(((totalScore - rnk.min) / (nextRnk.min - rnk.min)) * 100);
  const remaining = ptsToNext(totalScore);

  return (
    <div className="tp-page">
      {/* Top bar */}
      <div className="tp-topbar">
        <div className="tp-topbar-left">
          <div className="tp-topbar-logo">🎯</div>
          <span className="tp-topbar-brand">MeetingIntel</span>
        </div>
        <div className="tp-topbar-right">
          <div style={{ display: 'flex', alignItems: 'center', position: 'relative', marginRight: 12, background: 'rgba(0,0,0,0.2)', padding: 4, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', margin: '0 8px 0 6px' }}>Slack ID</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <input
                type="text" value={slackId}
                onChange={e => { setSlackId(e.target.value); setSlackError(''); setSlackSaved(false); }}
                placeholder="U0123ABCDEF"
                style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.0)',
                  borderRadius: '6px 0 0 6px', padding: '6px 10px', color: 'var(--text-primary)',
                  fontSize: 12, fontFamily: 'var(--font-mono, monospace)', width: 110, outline: 'none',
                  transition: 'background 0.2s',
                }}
                onFocus={e => e.target.style.background = 'rgba(255,255,255,0.08)'}
                onBlur={e => e.target.style.background = 'rgba(255,255,255,0.04)'}
              />
              <button
                disabled={slackSaving}
                title="Save Slack ID"
                onClick={async () => {
                  if (slackId && (!slackId.startsWith('U') || !/^U[a-zA-Z0-9]+$/.test(slackId))) {
                    setSlackError('Invalid format'); return;
                  }
                  setSlackSaving(true);
                  try {
                    const key = sessionStorage.getItem('team_key');
                    await teamUpdateSlackId(key, slackId);
                    setSlackSaved(true); setSlackError('');
                    const stored = JSON.parse(sessionStorage.getItem('team_profile'));
                    stored.member.slack_id = slackId;
                    sessionStorage.setItem('team_profile', JSON.stringify(stored));
                    setTimeout(() => setSlackSaved(false), 3000);
                  } catch (err) {
                    setSlackError('Failed');
                  } finally { setSlackSaving(false); }
                }}
                style={{
                  padding: '6px 10px', borderRadius: '0 6px 6px 0', border: 'none',
                  cursor: slackSaving ? 'not-allowed' : 'pointer',
                  background: slackSaved ? 'rgba(0,200,150,0.2)' : 'rgba(108,99,255,0.15)',
                  color: slackSaved ? '#00C896' : '#9B8FFF', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {slackSaving ? (
                  <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6C63FF', animation: 'spin 0.6s linear infinite', display: 'block' }} />
                ) : (
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            </div>
            {slackError && <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, color: '#FF6B6B', fontSize: 10, background: 'rgba(0,0,0,0.8)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>{slackError}</div>}
            {slackSaved && <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, color: '#00C896', fontSize: 10, background: 'rgba(0,0,0,0.8)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>✅ Saved</div>}
          </div>
          <span className="tp-topbar-name">{member.name}</span>
          <button className="tp-logout" onClick={handleLogout}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 13H3a1 1 0 01-1-1V4a1 1 0 011-1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Logout
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tp-tabs-wrapper">
        <div className="td-tabs">
          <button
            className={`td-tab ${activeTab === 'profile' ? 'td-tab-active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Your Profile
          </button>
          <button
            className={`td-tab ${activeTab === 'ranking' ? 'td-tab-active' : ''}`}
            onClick={() => setActiveTab('ranking')}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Ranking
          </button>
        </div>
      </div>

      {/* ═══ TAB: Your Profile ═══ */}
      {activeTab === 'profile' && (
        <div className="gp-root">
          {/* BANNER */}
          <div className="gp-banner"><div className="gp-banner-inner">
            <div className="gp-avatar-wrap" style={{ '--hex-glow': rnk.color }}>
              <BadgeImage rank={rnk} size={80} />
            </div>
            <div className="gp-banner-info">
              <div className="gp-name">{member.name}</div>
              <div className="gp-rank-title" style={{ color: rnk.color }}>{rnk.label} Rank</div>
              <div className="gp-kd-bar">
                <div className="gp-kd-item"><div className="gp-kd-val"><AnimVal value={total_meetings} /></div><div className="gp-kd-lbl">Meetings</div></div>
                <div className="gp-kd-item"><div className="gp-kd-val"><AnimVal value={best_score || 0} color="#00C896" /></div><div className="gp-kd-lbl">Best</div></div>
                <div className="gp-kd-item"><div className="gp-kd-val"><AnimVal value={worst_score || 0} color="#FF6B6B" /></div><div className="gp-kd-lbl">Worst</div></div>
                <div className="gp-kd-item"><div className="gp-kd-val"><AnimVal value={total_words} /></div><div className="gp-kd-lbl">Words</div></div>
                <div className="gp-kd-item"><div className="gp-kd-val">{fmtTime(total_talk_time)}</div><div className="gp-kd-lbl">Talk Time</div></div>
              </div>
              <div className="gp-xp-bar">
                <div className="gp-xp-labels"><span className="gp-xp-from" style={{ color: rnk.color }}>Lv{rnk.level} {rnk.label}</span>{nextRnk && <span className="gp-xp-to" style={{ color: nextRnk.color }}>Lv{nextRnk.level} {nextRnk.label}</span>}</div>
                <div className="gp-xp-track"><div className="gp-xp-fill" style={{ '--xp-pct': `${xpPct}%`, background: `linear-gradient(90deg,${rnk.color},${nextRnk ? nextRnk.color : rnk.color})` }}><span className="gp-xp-pts">{Math.round(totalScore).toLocaleString()} XP</span></div></div>
                {remaining > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>{remaining.toLocaleString()} pts to {nextRnk.label}</div>}
                <button onClick={() => setShowBadgesModal(true)} style={{
                  marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, margin: '8px auto 0',
                  padding: '6px 16px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.25)',
                  color: '#9B8FFF', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.2s',
                }}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                  Show All Badges
                </button>
              </div>
            </div>
            <div className="gp-banner-score" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 130, height: 130, borderRadius: '50%', background: 'rgba(0,0,0,0.2)', border: `4px solid #6C63FF`, animation: 'gpScorePulse 2s infinite ease-in-out' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)', textShadow: `0 0 10px rgba(108,99,255,0.6)` }}>{Math.round(totalScore).toLocaleString()}</div>
              <div className="gp-banner-score-lbl" style={{ marginTop: 4, fontSize: 11, color: '#6C63FF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Score</div>
            </div>
          </div></div>

          {streak && <div className="gp-streak"><span className="gp-streak-emoji">🔥</span>On a 3-meeting winning streak!</div>}

          {/* INFO */}
          {/* INFO CHIPS */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 100, border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ color: '#9B8FFF' }}>✉</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Email:</span>
              <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{member.email || '—'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 100, border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ color: '#FFB800' }}>📅</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Joined:</span>
              <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{member.created_at ? fmtDateFull(member.created_at) : '—'}</span>
            </div>
          </div>

          {/* ACHIEVEMENTS */}
          <div className="gp-section-title">🏆 Achievements</div>
          <div className="gp-badges">{badges.map(b => (
            <div key={b.id} className={`gp-badge ${b.unlocked ? 'gp-badge-unlocked' : 'gp-badge-locked'}`}>
              <div className="gp-badge-flipper">
                <div className="gp-badge-front" style={b.unlocked ? { background: `linear-gradient(135deg,${b.color}22,${b.color}11)`, borderColor: `${b.color}66`, boxShadow: `0 0 20px ${b.color}33` } : { borderColor: 'rgba(255,255,255,.1)', background: 'rgba(255,255,255,.03)' }}><img src={b.image} alt={b.name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', filter: b.unlocked ? `drop-shadow(0 0 8px ${b.color}88)` : 'grayscale(100%) opacity(0.4)' }} /></div>
                <div className="gp-badge-back" style={{ borderColor: b.unlocked ? `${b.color}44` : 'rgba(255,255,255,.1)' }}><strong style={{ color: b.unlocked ? b.color : 'var(--text-muted)', fontSize: 10 }}>{b.name}</strong><br />{b.desc}<br /><span style={{ color: b.unlocked ? '#00C896' : '#FF6B6B' }}>{b.unlocked ? '✅ Unlocked' : '🔒 Locked'}</span></div>
              </div>
              <div className="gp-badge-name">{b.name}</div>
            </div>
          ))}</div>

          {/* CHARTS */}
          <div className="gp-charts">
            <div className="gp-chart-card"><div className="gp-section-title">🎯 Performance Radar</div><RadarChart data={meeting_history} /></div>
            <div className="gp-chart-card"><div className="gp-section-title">📈 Last 10 Meetings</div><Sparkline data={meeting_history} /></div>
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

          {/* MEETINGS */}
          {meeting_history.length > 0 && (
            <div className="gp-matches"><div className="gp-section-title">🎮 Recent Meetings</div><div style={{ overflowX: 'auto' }}><table><thead><tr><th>Date</th><th>Meeting</th><th>Score</th><th>Words</th><th>Sentiment</th></tr></thead><tbody>
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
      )}

      {/* ═══ TAB: Ranking (Read-only, no profile links) ═══ */}
      {activeTab === 'ranking' && (
        <div className="gp-root">
          <div className="td-ranking-section">
            {(!leaderboard || leaderboard.length === 0) ? (
              <div className="td-empty">
                <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <h3>No rankings yet</h3>
                <p>Rankings will appear after meetings have been completed</p>
              </div>
            ) : (
              <div className="td-ranking-list">
                {leaderboard.map((lb, index) => {
                  const lr = getRank(lb.total_score || 0);
                  const isMe = lb.id === member.id;
                  const medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
                  const isTop3 = index < 3;
                  return (
                    <div
                      key={lb.id}
                      className={`td-ranking-row ${isTop3 ? 'td-ranking-top' : ''} ${isMe ? 'td-ranking-me' : ''}`}
                    >
                      <div
                        className="td-ranking-position"
                        style={{
                          background: isTop3 ? `${medalColors[index]}18` : 'rgba(255,255,255,0.04)',
                          color: isTop3 ? medalColors[index] : '#64748b',
                          borderColor: isTop3 ? `${medalColors[index]}44` : 'rgba(255,255,255,0.06)',
                        }}
                      >
                        {isTop3 ? (index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉') : `#${index + 1}`}
                      </div>
                      <div className="td-ranking-avatar" style={{ background: `linear-gradient(135deg, ${lr.color}44, ${lr.color}22)`, borderColor: `${lr.color}44` }}>
                        {lb.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div className="td-ranking-info">
                        <div className="td-ranking-name">
                          {lb.name}
                          {isMe && <span className="td-ranking-you-badge">You</span>}
                        </div>
                        <div className="td-ranking-meta">
                          <span style={{ color: lr.color }}>Lv{lr.level} {lr.label}</span>
                          <span>·</span>
                          <span>{lb.meetings} meetings</span>
                        </div>
                      </div>
                      <div className="td-ranking-score">
                        <span className="td-ranking-score-value" style={{ color: scoreColor(lb.score) }}>
                          {lb.score}
                        </span>
                        <span className="td-ranking-score-label">Score</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ALL BADGES MODAL */}
      {showBadgesModal && (
        <div onClick={() => setShowBadgesModal(false)} style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'rgba(18,18,35,0.97)', border: '1px solid rgba(108,99,255,0.2)',
            borderRadius: 20, padding: '28px 32px', maxWidth: 520, width: '90%',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18, fontWeight: 700 }}>🏅 All Badge Levels</h3>
              <button onClick={() => setShowBadgesModal(false)} style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
              }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {RANKS.map(r => {
                const unlocked = totalScore >= r.min;
                return (
                  <div key={r.level} style={{
                    background: unlocked ? `linear-gradient(135deg, ${r.color}15, ${r.color}08)` : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${unlocked ? r.color + '44' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 14, padding: 16, textAlign: 'center',
                    opacity: unlocked ? 1 : 0.5, transition: 'all 0.3s',
                    boxShadow: unlocked ? `0 0 20px ${r.color}22` : 'none',
                  }}>
                    <img src={r.badge} alt={r.label} width={48} height={48} style={{
                      objectFit: 'contain', filter: `drop-shadow(0 0 8px ${r.color}${unlocked ? '66' : '22'})`,
                    }} />
                    <div style={{ fontSize: 12, fontWeight: 700, color: unlocked ? r.color : 'var(--text-muted)', marginTop: 8 }}>
                      Lv{r.level} {r.label}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                      {r.min === 0 ? 'Starting rank' : `${r.min.toLocaleString()} pts`}
                    </div>
                    <div style={{
                      fontSize: 9, fontWeight: 600, marginTop: 6, padding: '2px 8px', borderRadius: 10,
                      display: 'inline-block',
                      background: unlocked ? 'rgba(0,200,150,0.15)' : 'rgba(255,107,107,0.1)',
                      color: unlocked ? '#00C896' : '#FF6B6B',
                    }}>
                      {unlocked ? '✅ Unlocked' : '🔒 Locked'}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
              Your score: <strong style={{ color: rnk.color }}>{Math.round(totalScore).toLocaleString()} XP</strong>
              {remaining > 0 && <> · <span style={{ color: nextRnk.color }}>{remaining.toLocaleString()} pts to {nextRnk.label}</span></>}
            </div>
          </div>
        </div>
      )}

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
        .tp-tabs-wrapper { max-width: 900px; margin: 0 auto; padding: 20px 0 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
