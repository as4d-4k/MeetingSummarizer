import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMeetings } from '../api/client';
import NewMeetingModal from '../components/NewMeetingModal';

export default function Dashboard() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const navigate = useNavigate();

  const fetchMeetings = async () => {
    try {
      const { data } = await getMeetings();
      setMeetings(data.results || data);
    } catch (err) {
      console.error('Failed to fetch meetings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMeetings(); }, []);

  const handleMeetingCreated = () => { setShowModal(false); fetchMeetings(); };

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const totalMeetings = meetings.length;
  const meetingsThisWeek = meetings.filter(m => new Date(m.created_at || m.date) > oneWeekAgo).length;
  const totalTasks = meetings.reduce((sum, m) => sum + (m.action_item_count || 0), 0);
  const completedMeetings = meetings.filter(m => m.status === 'completed').length;

  function formatTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays}d ago`;
  }

  function getPlatformIcon(url = '') {
    if (url.includes('zoom')) return 'Z';
    if (url.includes('teams')) return 'T';
    return 'G';
  }

  function getPlatformColor(url = '') {
    if (url.includes('zoom')) return '#2D8CFF';
    if (url.includes('teams')) return '#6264A7';
    return '#1A73E8';
  }

  const stats = [
    { label: 'Total Sessions', value: totalMeetings, sub: 'All time', icon: VideoIcon, accent: '#6C63FF' },
    { label: 'This Week', value: meetingsThisWeek, sub: 'Last 7 days', icon: TrendIcon, accent: '#00C896' },
    { label: 'Completed', value: completedMeetings, sub: 'Analysed', icon: CheckIcon, accent: '#FF6B6B' },
    { label: 'Action Items', value: totalTasks, sub: 'Extracted by AI', icon: TaskIcon, accent: '#FFB800' },
  ];

  return (
    <div className="dashboard-root">
      {/* Noise texture overlay */}
      <div className="noise-overlay" />

      {/* Ambient orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="dashboard-content">

        {/* ── Header ── */}
        <header className="dashboard-header">
          <div className="header-left">
            <div className="logo-lockup">
              <div className="logo-mark">
                <span className="logo-inner">MI</span>
              </div>
              <div>
                <h1 className="brand-name">MeetingIntel</h1>
                <p className="brand-sub">AI Intelligence Platform</p>
              </div>
            </div>
          </div>

          <div className="header-right">
            <div className="status-pill">
              <span className="status-dot" />
              System Online
            </div>
            <button className="new-meeting-btn" onClick={() => setShowModal(true)}>
              <PlusIcon />
              New Meeting
            </button>
          </div>
        </header>

        {/* ── Welcome strip ── */}
        <div className="welcome-strip">
          <div className="welcome-text">
            <span className="welcome-greeting">Good {getTimeOfDay()},</span>
            <span className="welcome-desc"> here's your intelligence overview.</span>
          </div>
          <div className="date-display">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        </div>

        {/* ── Stats grid ── */}
        <div className="stats-grid">
          {stats.map((s, i) => (
            <div className="stat-card" key={s.label} style={{ animationDelay: `${i * 80}ms` }}>
              <div className="stat-card-top">
                <div className="stat-icon-wrap" style={{ background: s.accent + '18', color: s.accent }}>
                  <s.icon />
                </div>
                <div className="stat-trend">↑</div>
              </div>
              <div className="stat-value" style={{ color: s.accent }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
              <div className="stat-sub">{s.sub}</div>
              <div className="stat-card-bar" style={{ background: s.accent }} />
            </div>
          ))}
        </div>

        {/* ── Meetings section ── */}
        <div className="meetings-section">
          <div className="section-header">
            <div className="section-title-wrap">
              <h2 className="section-title">Recent Sessions</h2>
              <span className="section-count">{meetings.length}</span>
            </div>
            <div className="section-filters">
              <button className="filter-btn active">All</button>
              <button className="filter-btn">Live</button>
              <button className="filter-btn">Completed</button>
            </div>
          </div>

          {loading ? (
            <div className="skeleton-list">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton-row" style={{ animationDelay: `${i * 100}ms` }} />
              ))}
            </div>
          ) : meetings.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <MicIcon />
              </div>
              <h3 className="empty-title">No sessions yet</h3>
              <p className="empty-desc">Start your first meeting to unlock AI-powered insights, live transcripts, and performance analytics.</p>
              <button className="empty-cta" onClick={() => setShowModal(true)}>
                <PlusIcon /> Start First Session
              </button>
            </div>
          ) : (
            <div className="meetings-list">
              {meetings.map((m, i) => {
                const isLive = ['in_progress', 'bot_joining'].includes(m.status);
                const isProcessing = m.status === 'processing';
                const platColor = getPlatformColor(m.meeting_url);
                const platLetter = getPlatformIcon(m.meeting_url);

                return (
                  <div
                    key={m.id}
                    className={`meeting-row ${isLive ? 'live' : ''} ${hoveredId === m.id ? 'hovered' : ''}`}
                    style={{ animationDelay: `${i * 60}ms` }}
                    onClick={() => navigate(`/meetings/${m.id}`)}
                    onMouseEnter={() => setHoveredId(m.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {/* Left: platform badge + info */}
                    <div className="row-left">
                      <div className="platform-badge" style={{ background: platColor + '18', color: platColor, borderColor: platColor + '30' }}>
                        {platLetter}
                      </div>
                      <div className="row-info">
                        <div className="row-title">{m.title || 'Untitled Session'}</div>
                        <div className="row-meta">
                          <span className="row-id">#{m.id}</span>
                          {m.action_item_count > 0 && (
                            <span className="row-tasks">{m.action_item_count} tasks</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: status + time + arrow */}
                    <div className="row-right">
                      <div className={`status-badge status-${m.status}`}>
                        {isLive && <span className="live-pulse" />}
                        {getStatusLabel(m.status)}
                      </div>
                      <span className="row-time">{isLive ? 'Active now' : formatTime(m.created_at || m.date)}</span>
                      <div className="row-arrow">
                        <ArrowIcon />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      <NewMeetingModal isOpen={showModal} onClose={() => setShowModal(false)} onCreated={handleMeetingCreated} />
    </div>
  );
}

// ── Helpers ──
function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function getStatusLabel(status) {
  const map = {
    pending: 'Pending',
    bot_joining: 'Joining',
    in_progress: 'Live',
    processing: 'Processing',
    completed: 'Complete',
    failed: 'Failed',
  };
  return map[status] || status;
}

// ── Icons ──
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function VideoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="6" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M16 10l6-3v10l-6-3V10z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
function TrendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="16 7 22 7 22 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TaskIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M8 12h8M8 8h8M8 16h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 10a7 7 0 0014 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 17v4M8 21h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
