import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMeeting, startBot, endBot, reprocessMeeting, deleteMeeting, getLiveStatus } from '../api/client';
import ActionItemList from '../components/ActionItemList';
import LiveDashboard from '../components/LiveDashboard';
import useWebSocket from '../hooks/useWebSocket';

const STATUS_META = {
  pending:     { label: 'Pending',     color: '#FFB800', bg: 'rgba(255,184,0,0.1)'    },
  bot_joining: { label: 'Bot Joining', color: '#6C63FF', bg: 'rgba(108,99,255,0.1)'  },
  in_progress: { label: 'Live',        color: '#FF6B6B', bg: 'rgba(255,107,107,0.1)' },
  processing:  { label: 'Processing',  color: '#6C63FF', bg: 'rgba(108,99,255,0.1)'  },
  completed:   { label: 'Completed',   color: '#00C896', bg: 'rgba(0,200,150,0.1)'   },
  failed:      { label: 'Failed',      color: '#FF6B6B', bg: 'rgba(255,107,107,0.1)' },
};

export default function MeetingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [activeTab, setActiveTab]     = useState('summary');
  const [liveSpeakers, setLiveSpeakers] = useState([]);
  const [liveFeed, setLiveFeed]       = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Stable fetch — wrapped in useCallback so WS handler can depend on it correctly
  const fetchMeeting = useCallback(async () => {
    try {
      const { data } = await getMeeting(id);
      setMeeting(data);
    } catch (err) {
      console.error('Failed to fetch meeting:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchLiveStatus = useCallback(async () => {
    try {
      const { data } = await getLiveStatus(id);
      // Merge with existing state — WS events update word_count and latest_summary
      // in real-time; fetchLiveStatus only initialises the speaker list.
      setLiveSpeakers(prev => {
        if (prev.length === 0) {
          // First load — use DB data directly
          return data.speakers || [];
        }
        // Already have live data — only add NEW speakers from DB, don't overwrite existing
        const existingIds = new Set(prev.map(s => s.id));
        const newSpeakers = (data.speakers || []).filter(s => !existingIds.has(s.id));
        return [...prev, ...newSpeakers];
      });
      setLiveFeed(prev => prev.length === 0 ? (data.recent_feed || []) : prev);
    } catch {}
  }, [id]);

  useEffect(() => { fetchMeeting(); fetchLiveStatus(); }, [fetchMeeting, fetchLiveStatus]);

  // Safety polling — updates status every 3s while meeting is active
  useEffect(() => {
    if (!meeting) return;
    const isTransitional = ['pending', 'bot_joining', 'in_progress', 'processing'].includes(meeting.status);
    if (!isTransitional) return;
    const poll = setInterval(fetchMeeting, 3000);
    return () => clearInterval(poll);
  }, [meeting?.status, fetchMeeting]);

  // Auto-switch to Live tab when the meeting goes live
  useEffect(() => {
    if (meeting?.status === 'in_progress' || meeting?.status === 'bot_joining') {
      setActiveTab(prev => prev === 'summary' ? 'live' : prev);
    }
  }, [meeting?.status]);

  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'snapshot') {
      // WebSocket sends a full snapshot on connect — hydrate speakers + feed
      const snap = msg.data;
      if (snap.speakers && snap.speakers.length > 0) {
        setLiveSpeakers(prev => {
          if (prev.length === 0) {
            // Map 'summary' from snapshot to 'latest_summary' for LiveDashboard
            return snap.speakers.map(sp => ({
              ...sp,
              latest_summary: sp.summary || sp.latest_summary || '',
            }));
          }
          // Merge: update existing speakers with DB data, add new ones
          const existingIds = new Set(prev.map(s => s.id));
          const merged = prev.map(s => {
            const dbSp = snap.speakers.find(d => d.id === s.id);
            if (!dbSp) return s;
            return {
              ...s,
              // Only update summary-related fields if we don't already have live ones
              latest_summary: s.latest_summary || dbSp.summary || dbSp.latest_summary || '',
              performance_score: s.performance_score ?? dbSp.performance_score,
              sentiment: s.sentiment || dbSp.sentiment,
              key_points: s.key_points?.length ? s.key_points : (dbSp.key_points || []),
              topic_coverage: Object.keys(s.topic_coverage || {}).length ? s.topic_coverage : (dbSp.topic_coverage || {}),
            };
          });
          const newSpeakers = snap.speakers.filter(d => !existingIds.has(d.id)).map(sp => ({
            ...sp, latest_summary: sp.summary || sp.latest_summary || '',
          }));
          return [...merged, ...newSpeakers];
        });
      }
      if (snap.recent_feed && snap.recent_feed.length > 0) {
        setLiveFeed(prev => prev.length === 0 ? snap.recent_feed : prev);
      }

    } else if (msg.type === 'status_change') {
      const newStatus = msg.data.status;
      setMeeting(p => p ? { ...p, status: newStatus } : p);
      // On completion fetch everything (transcript, summary, chunks all come in)
      if (newStatus === 'completed') fetchMeeting();

    } else if (msg.type === 'summary_update') {
      // Directly apply — no reload needed
      setMeeting(p => p ? { ...p, final_summary: msg.data.summary } : p);

    } else if (msg.type === 'transcript_update') {
      // Full transcript + title are now available — update directly
      setMeeting(p => p ? {
        ...p,
        full_transcript: msg.data.transcript,
        ...(msg.data.title ? { title: msg.data.title } : {}),
      } : p);

    } else if (msg.type === 'transcript_chunk') {
      // Directly append the new chunk to the meeting state
      const d = msg.data;
      setMeeting(p => {
        if (!p) return p;
        const existing = p.transcript_chunks || [];
        const alreadyExists = existing.some(c => c.chunk_index === d.chunk_index);
        if (alreadyExists) return p;
        return {
          ...p,
          transcript_chunks: [...existing, {
            id: Date.now(),
            chunk_index: d.chunk_index,
            raw_text: d.raw_text || '',
            processed_json: { summary: d.summary, key_decisions: d.key_decisions || [] },
            timestamp_start: d.timestamp_start || 0,
            timestamp_end: d.timestamp_end || 0,
          }],
        };
      });

    } else if (msg.type === 'action_item') {
      // Directly append the new action item
      const d = msg.data;
      setMeeting(p => {
        if (!p) return p;
        const existing = p.action_items || [];
        if (existing.some(a => a.id === d.id)) return p;
        return { ...p, action_items: [...existing, d] };
      });

    } else if (msg.type === 'speaker_joined') {
      setLiveSpeakers(p => [...p, { id: msg.data.speaker_id, name: msg.data.speaker_name, word_count: 0, talk_time_seconds: 0 }]);

    } else if (msg.type === 'transcript_segment') {
      const { speaker_id, speaker_name, text, start_time, end_time, word_count, talk_time_seconds } = msg.data;
      setLiveFeed(p => [{ speaker_name, text, start_time, end_time, _new: true }, ...p]);
      setLiveSpeakers(p => {
        const idx = p.findIndex(s => s.id === speaker_id);
        const updated = idx === -1
          ? [...p, { id: speaker_id, name: speaker_name, word_count, talk_time_seconds, is_speaking: true }]
          : p.map((s, i) => i === idx ? { ...s, word_count, talk_time_seconds, is_speaking: true, last_quote: text } : s);
        return updated.map(s => s.id === speaker_id ? s : { ...s, is_speaking: false });
      });

    } else if (msg.type === 'analysis_update') {
      const d = msg.data;
      setLiveSpeakers(p => p.map(s => s.id === d.speaker_id ? {
        ...s,
        performance_score: d.performance_score,
        sentiment: d.sentiment,
        latest_summary: d.summary,
        key_points: d.key_points,
        topic_coverage: d.topic_coverage,
        last_quote: d.one_line_quote || s.last_quote,
      } : s));

    } else if (msg.type === 'participant_scores_batch') {
      // ── Atomic batch update: all participant scores arrive together ──
      const { participants } = msg.data;
      if (participants && participants.length > 0) {
        setLiveSpeakers(prev => {
          const scoreMap = {};
          participants.forEach(p => { scoreMap[p.speaker_id] = p; });
          return prev.map(s => {
            const ps = scoreMap[s.id];
            if (!ps) return s;
            return {
              ...s,
              performance_score: ps.performance_score,
              sentiment: ps.dominant_sentiment,
              sentiment_positive: ps.sentiment_positive,
              sentiment_neutral: ps.sentiment_neutral,
              sentiment_negative: ps.sentiment_negative,
              contribution_summary: ps.contribution_summary,
              _scored: true,  // flag: this card has final scores
            };
          });
        });
      }
    }
  }, [fetchMeeting]);

  const { connected: wsConnected } = useWebSocket(id, handleWsMessage);

  const handleStartBot = async () => {
    setActionLoading('start-bot');
    // ── Optimistic update: instantly show "Bot Joining" ──
    setMeeting(p => p ? { ...p, status: 'bot_joining' } : p);
    try {
      await startBot(id);
      // API confirmed — status is already 'bot_joining' in DB + local state
    } catch (err) {
      // Revert to pending on failure
      setMeeting(p => p ? { ...p, status: 'pending' } : p);
      alert(err.response?.data?.error || 'Failed to start bot.');
    } finally {
      setActionLoading('');
    }
  };

  const handleEndBot = async () => {
    setActionLoading('end-bot');
    try {
      await endBot(id);
      // Immediately lock status to 'processing' locally — don't re-fetch
      // from DB (which could briefly show 'in_progress' during the race window).
      setMeeting(p => p ? { ...p, status: 'processing' } : p);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to end bot.');
    } finally {
      setActionLoading('');
    }
  };

  const handleReprocess = async () => {
    setActionLoading('reprocess');
    try { await reprocessMeeting(id); fetchMeeting(); }
    catch (err) { alert(err.response?.data?.error || 'Failed to reprocess.'); }
    finally { setActionLoading(''); }
  };

  const handleDelete = async () => {
    try { await deleteMeeting(id); navigate('/dashboard'); }
    catch { alert('Failed to delete meeting.'); }
  };

  if (loading) return (
    <div className="detail-loading">
      {[80, 48, 200, 200].map((h, i) => (
        <div key={i} className="skeleton" style={{ height: h, borderRadius: 12, marginBottom: 16 }} />
      ))}
    </div>
  );

  if (!meeting) return (
    <div className="detail-not-found">
      <h2>Meeting not found</h2>
      <button onClick={() => navigate('/dashboard')} className="btn-accent">Back to Dashboard</button>
    </div>
  );

  const meta    = STATUS_META[meeting.status] || STATUS_META.pending;
  const isLive  = ['in_progress','bot_joining'].includes(meeting.status);
  const isBusy  = ['bot_joining','in_progress','processing'].includes(meeting.status);

  const tabs = [
    { key: 'summary',    label: 'Summary',                                  icon: <SummaryIcon /> },
    { key: 'live',       label: 'Live Dashboard',                           icon: <LiveIcon />,   pulse: isLive },
    { key: 'transcript', label: 'Transcript',                               icon: <TranscriptIcon /> },
    { key: 'actions',    label: `Actions (${meeting.action_items?.length || 0})`, icon: <TaskIcon /> },
    { key: 'chunks',     label: `Chunks (${meeting.transcript_chunks?.length || 0})`, icon: <ChunkIcon /> },
  ];

  return (
    <div className="detail-root">

      {/* ── Back + Header ── */}
      <div className="detail-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')}>
          <BackIcon /> Back
        </button>

        <div className="detail-title-row">
          <div className="detail-title-left">
            <h1 className="detail-title">{meeting.title || 'Untitled Session'}</h1>
            <div className="detail-meta-row">
              <span className="detail-status-pill" style={{ color: meta.color, background: meta.bg }}>
                {isLive && <span className="live-dot" style={{ background: meta.color }} />}
                {meta.label}
              </span>
              <span className="detail-date">
                <CalIcon /> {new Date(meeting.date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="detail-url">
                <LinkIcon /> {meeting.meeting_url?.replace('https://', '')}
              </span>
            </div>
          </div>

          <div className="detail-actions">
            {meeting.status === 'pending' && (
              <button className="action-btn action-primary" onClick={handleStartBot} disabled={!!actionLoading}>
                <PlayIcon />
                {actionLoading === 'start-bot' ? 'Starting…' : 'Start Bot'}
              </button>
            )}
            {isLive && (
              <button className="action-btn action-danger" onClick={handleEndBot} disabled={!!actionLoading}>
                <TrashIcon />
                {actionLoading === 'end-bot' ? 'Ending…' : 'End Bot'}
              </button>
            )}
            {meeting.full_transcript && (
              <button className="action-btn action-secondary" onClick={handleReprocess} disabled={!!actionLoading}>
                <RefreshIcon />
                {actionLoading === 'reprocess' ? 'Processing…' : 'Reprocess'}
              </button>
            )}
            {!deleteConfirm ? (
              <button className="action-btn action-danger" onClick={() => setDeleteConfirm(true)}>
                <TrashIcon />
              </button>
            ) : (
              <div className="delete-confirm">
                <span>Delete?</span>
                <button className="confirm-yes" onClick={handleDelete}>Yes</button>
                <button className="confirm-no" onClick={() => setDeleteConfirm(false)}>No</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Live indicator bar ── */}
      {isBusy && (
        <div className="live-bar">
          <div className="live-bar-inner">
            <span className="live-bar-dot" />
            <span className="live-bar-text">
              {meeting.status === 'bot_joining'  && 'Bot is joining the meeting…'}
              {meeting.status === 'in_progress'  && 'Recording in progress — AI analysis running every 1 minute'}
              {meeting.status === 'processing'   && 'Processing transcript with AI…'}
            </span>
            <span className="live-bar-ws">
              <span className="ws-dot" style={{ background: wsConnected ? '#00C896' : '#FF6B6B' }} />
              {wsConnected ? 'Live' : 'Reconnecting…'}
            </span>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="detail-tabs">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`detail-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
            {tab.pulse && <span className="tab-pulse" />}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="detail-body">

        {/* SUMMARY */}
        {activeTab === 'summary' && (
          <div className="content-card">
            {meeting.final_summary ? (
              <div className="summary-content">
                {meeting.final_summary.split('\n').map((line, i) => {
                  if (line.startsWith('## '))
                    return <h2 key={i} className="summary-h2">{line.replace('## ', '')}</h2>;
                  if (line.startsWith('- **'))
                    return <p key={i} className="summary-accent-line"
                      dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />;
                  if (line.startsWith('- '))
                    return <p key={i} className="summary-bullet">· {line.slice(2)}</p>;
                  if (!line.trim()) return <div key={i} style={{ height: 10 }} />;
                  return <p key={i} className="summary-para">{line}</p>;
                })}
              </div>
            ) : (
              <div className="empty-tab">
                <SummaryIcon />
                <p>No summary available yet.</p>
                <span>Start the bot or reprocess the transcript to generate AI analysis.</span>
              </div>
            )}
          </div>
        )}

        {/* LIVE DASHBOARD */}
        {activeTab === 'live' && (
          <LiveDashboard speakers={liveSpeakers} feed={liveFeed} />
        )}

        {/* TRANSCRIPT */}
        {activeTab === 'transcript' && (
          <div className="content-card">
            {meeting.full_transcript ? (
              <pre className="transcript-pre">{meeting.full_transcript}</pre>
            ) : (
              <div className="empty-tab">
                <TranscriptIcon />
                <p>No transcript yet.</p>
              </div>
            )}
          </div>
        )}

        {/* ACTION ITEMS */}
        {activeTab === 'actions' && (
          <div className="content-card">
            <ActionItemList
              items={meeting.action_items || []}
              onUpdate={fetchMeeting}
              meetingId={meeting.id}
              onSendNotifications={true}
            />
          </div>
        )}

        {/* CHUNKS */}
        {activeTab === 'chunks' && (
          <div className="chunks-list">
            {(meeting.transcript_chunks || []).length === 0 ? (
              <div className="content-card">
                <div className="empty-tab"><ChunkIcon /><p>No chunks processed yet.</p></div>
              </div>
            ) : meeting.transcript_chunks.map(chunk => (
              <div key={chunk.id} className="chunk-card">
                <div className="chunk-header">
                  <span className="chunk-badge">Chunk #{chunk.chunk_index + 1}</span>
                  <span className="chunk-time">{chunk.timestamp_start}s — {chunk.timestamp_end}s</span>
                </div>
                {chunk.processed_json?.summary && (
                  <p className="chunk-summary">{chunk.processed_json.summary}</p>
                )}
                {chunk.processed_json?.key_decisions?.length > 0 && (
                  <div className="chunk-decisions">
                    <span className="chunk-decisions-label">Key Decisions</span>
                    {chunk.processed_json.key_decisions.map((d, i) => (
                      <div key={i} className="chunk-decision-item">{d}</div>
                    ))}
                  </div>
                )}
                <details className="chunk-details">
                  <summary>Show raw text</summary>
                  <pre className="chunk-raw">{chunk.raw_text}</pre>
                </details>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* ── Inline styles ── */}
      <style>{`
        .detail-root {
          padding: 40px;
          max-width: 1000px;
          font-family: var(--font-body);
        }

        /* Back */
        .back-btn {
          display: inline-flex; align-items: center; gap: 6px;
          color: var(--text-muted); font-size: 13px; font-weight: 400;
          background: none; border: none; cursor: pointer;
          margin-bottom: 20px; transition: color 0.2s; padding: 0;
          font-family: var(--font-body);
        }
        .back-btn:hover { color: var(--text-primary); }

        /* Header */
        .detail-header { margin-bottom: 24px; }
        .detail-title-row {
          display: flex; align-items: flex-start;
          justify-content: space-between; gap: 24px;
        }
        .detail-title {
          font-family: var(--font-display); font-size: 26px;
          font-weight: 700; color: var(--text-primary);
          letter-spacing: -0.02em; margin-bottom: 10px; line-height: 1.2;
        }
        .detail-meta-row {
          display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
        }
        .detail-status-pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 12px; border-radius: 100px;
          font-size: 11px; font-weight: 600;
          letter-spacing: 0.04em; text-transform: uppercase;
        }
        .live-dot {
          width: 6px; height: 6px; border-radius: 50%;
          animation: pulse-dot 1.2s ease-in-out infinite;
          flex-shrink: 0;
        }
        .detail-date, .detail-url {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 12px; color: var(--text-muted);
        }
        .detail-url {
          max-width: 260px; overflow: hidden;
          text-overflow: ellipsis; white-space: nowrap;
        }

        /* Action buttons */
        .detail-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .action-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 16px; border-radius: var(--radius-md);
          font-size: 13px; font-weight: 500; cursor: pointer;
          font-family: var(--font-body); border: 1px solid;
          transition: all 0.2s; white-space: nowrap;
        }
        .action-primary {
          background: linear-gradient(135deg,#6C63FF,#9B8FFF);
          border-color: transparent; color: #fff;
          box-shadow: 0 4px 16px rgba(108,99,255,0.3);
        }
        .action-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(108,99,255,0.4); }
        .action-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .action-secondary {
          background: var(--bg-raised); border-color: var(--border-subtle);
          color: var(--text-secondary);
        }
        .action-secondary:hover { background: var(--bg-hover); border-color: var(--border-mid); color: var(--text-primary); }
        .action-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
        .action-danger {
          background: rgba(255,107,107,0.08); border-color: rgba(255,107,107,0.2);
          color: #FF6B6B; padding: 9px 12px;
        }
        .action-danger:hover { background: rgba(255,107,107,0.15); }
        .delete-confirm {
          display: flex; align-items: center; gap: 6px;
          background: var(--bg-raised); border: 1px solid rgba(255,107,107,0.3);
          border-radius: var(--radius-md); padding: 6px 12px; font-size: 12px;
          color: var(--text-secondary);
        }
        .confirm-yes, .confirm-no {
          padding: 3px 10px; border-radius: 6px; border: none;
          font-size: 12px; font-weight: 500; cursor: pointer;
          font-family: var(--font-body);
        }
        .confirm-yes { background: rgba(255,107,107,0.2); color: #FF6B6B; }
        .confirm-no  { background: var(--bg-hover); color: var(--text-muted); }

        /* Live bar */
        .live-bar {
          margin-bottom: 24px; border-radius: var(--radius-md);
          background: rgba(108,99,255,0.06);
          border: 1px solid rgba(108,99,255,0.15);
          overflow: hidden;
        }
        .live-bar-inner {
          display: flex; align-items: center; gap: 10px; padding: 12px 18px;
        }
        .live-bar-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #6C63FF; flex-shrink: 0;
          box-shadow: 0 0 8px #6C63FF;
          animation: pulse-dot 1.4s ease-in-out infinite;
        }
        .live-bar-text { font-size: 13px; color: #9B8FFF; font-weight: 400; flex: 1; }
        .live-bar-ws {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; color: var(--text-muted);
        }
        .ws-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

        /* Tabs */
        .detail-tabs {
          display: flex; gap: 2px; margin-bottom: 24px;
          padding: 4px; background: var(--bg-card);
          border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
        }
        .detail-tab {
          flex: 1; display: flex; align-items: center; justify-content: center;
          gap: 7px; padding: 10px 14px; border-radius: 10px;
          border: none; background: transparent; cursor: pointer;
          font-family: var(--font-body); font-size: 13px; font-weight: 400;
          color: var(--text-muted); transition: all 0.2s; position: relative;
          white-space: nowrap;
        }
        .detail-tab:hover { color: var(--text-secondary); background: var(--bg-raised); }
        .detail-tab.active {
          background: var(--bg-raised); color: var(--text-primary);
          border: 1px solid var(--border-mid); font-weight: 500;
        }
        .tab-icon { display: flex; align-items: center; opacity: 0.7; }
        .detail-tab.active .tab-icon { opacity: 1; }
        .tab-pulse {
          position: absolute; top: 8px; right: 8px;
          width: 6px; height: 6px; border-radius: 50%; background: #FF6B6B;
          box-shadow: 0 0 8px #FF6B6B;
          animation: pulse-dot 1.2s ease-in-out infinite;
        }

        /* Content card */
        .content-card {
          background: var(--bg-card); border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg); padding: 28px;
        }

        /* Summary */
        .summary-content {}
        .summary-h2 {
          font-family: var(--font-display); font-size: 15px; font-weight: 600;
          color: var(--text-primary); margin: 24px 0 10px;
          padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle);
        }
        .summary-h2:first-child { margin-top: 0; }
        .summary-accent-line {
          font-size: 13px; color: var(--text-secondary); line-height: 1.7;
          padding: 6px 14px; border-left: 2px solid #6C63FF;
          margin-bottom: 6px; background: rgba(108,99,255,0.04);
          border-radius: 0 6px 6px 0;
        }
        .summary-accent-line strong { color: #9B8FFF; font-weight: 500; }
        .summary-bullet {
          font-size: 13px; color: var(--text-secondary); line-height: 1.7;
          padding-left: 16px; margin-bottom: 4px;
        }
        .summary-para {
          font-size: 13px; color: var(--text-secondary); line-height: 1.8;
          margin-bottom: 6px;
        }

        /* Transcript */
        .transcript-pre {
          font-family: var(--font-body); font-size: 13px;
          color: var(--text-secondary); line-height: 1.8;
          white-space: pre-wrap; word-break: break-word;
        }

        /* Chunks */
        .chunks-list { display: flex; flex-direction: column; gap: 10px; }
        .chunk-card {
          background: var(--bg-card); border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg); padding: 20px 22px;
        }
        .chunk-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .chunk-badge {
          font-size: 11px; font-weight: 600; color: #6C63FF;
          background: rgba(108,99,255,0.1); border: 1px solid rgba(108,99,255,0.2);
          padding: 3px 10px; border-radius: 100px; letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .chunk-time { font-size: 11px; color: var(--text-muted); }
        .chunk-summary { font-size: 13px; color: var(--text-secondary); line-height: 1.7; margin-bottom: 12px; }
        .chunk-decisions { margin-bottom: 12px; }
        .chunk-decisions-label {
          font-size: 10px; font-weight: 600; color: #FFB800;
          letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px; display: block;
        }
        .chunk-decision-item {
          font-size: 12px; color: var(--text-secondary);
          padding: 5px 12px; border-left: 2px solid #FFB800;
          margin-bottom: 4px; background: rgba(255,184,0,0.04);
          border-radius: 0 6px 6px 0;
        }
        .chunk-details summary {
          font-size: 11px; color: var(--text-muted); cursor: pointer;
          list-style: none; display: inline-flex; align-items: center; gap: 4px;
          transition: color 0.2s;
        }
        .chunk-details summary:hover { color: var(--text-secondary); }
        .chunk-raw {
          margin-top: 10px; font-family: var(--font-body); font-size: 11px;
          color: var(--text-muted); white-space: pre-wrap; word-break: break-word;
          background: var(--bg-deep); padding: 14px; border-radius: var(--radius-sm);
          line-height: 1.7;
        }

        /* Empty tab */
        .empty-tab {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; padding: 56px 24px; text-align: center;
          color: var(--text-muted);
        }
        .empty-tab svg { margin-bottom: 14px; opacity: 0.4; }
        .empty-tab p { font-size: 14px; font-weight: 500; color: var(--text-secondary); margin-bottom: 6px; }
        .empty-tab span { font-size: 12px; color: var(--text-muted); max-width: 300px; line-height: 1.6; }

        /* Loading */
        .detail-loading { padding: 40px; }
        .detail-not-found { padding: 80px 40px; text-align: center; }
        .detail-not-found h2 { font-family: var(--font-display); font-size: 20px; color: var(--text-primary); margin-bottom: 20px; }

        @keyframes pulse-dot {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.5; transform:scale(0.8); }
        }
      `}</style>
    </div>
  );
}

/* ── Icons ── */
function BackIcon()       { return <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function CalIcon()        { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M5 1v4M11 1v4M2 7h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>; }
function LinkIcon()       { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M7 9a3 3 0 004.243 0l2-2a3 3 0 00-4.243-4.243L8 3.757" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M9 7a3 3 0 00-4.243 0l-2 2A3 3 0 006.999 13.24L8 12.243" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>; }
function PlayIcon()       { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M5 3l9 5-9 5V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>; }
function RefreshIcon()    { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 8a6 6 0 016-6 6 6 0 014.243 1.757L14 5M14 2v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function TrashIcon()      { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5l.5-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function SummaryIcon()    { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M5 6h6M5 8h4M5 10h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>; }
function LiveIcon()       { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3"/><path d="M3 8a5 5 0 005 5M8 3a5 5 0 015 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>; }
function TranscriptIcon() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M5 5.5h6M5 8h6M5 10.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>; }
function TaskIcon()       { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 8l2.5 2.5L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.3"/></svg>; }
function ChunkIcon()      { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3"/></svg>; }
