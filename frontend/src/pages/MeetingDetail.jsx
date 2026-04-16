import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMeeting, startBot, reprocessMeeting, deleteMeeting } from '../api/client';
import ActionItemList from '../components/ActionItemList';

const statusLabels = {
  pending: 'Pending',
  bot_joining: 'Bot Joining',
  in_progress: 'In Progress',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
};

const statusBadgeClass = {
  pending: 'badge-pending',
  bot_joining: 'badge-bot-joining',
  in_progress: 'badge-in-progress',
  processing: 'badge-processing',
  completed: 'badge-completed',
  failed: 'badge-failed',
};

export default function MeetingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [activeTab, setActiveTab] = useState('summary');

  const fetchMeeting = async () => {
    try {
      const { data } = await getMeeting(id);
      setMeeting(data);
    } catch (err) {
      console.error('Failed to fetch meeting:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeeting();
    // Auto-refresh for active meetings
    const isActive = meeting?.status && ['bot_joining', 'in_progress', 'processing'].includes(meeting.status);
    if (isActive) {
      const interval = setInterval(fetchMeeting, 10000);
      return () => clearInterval(interval);
    }
  }, [id, meeting?.status]);

  const handleStartBot = async () => {
    setActionLoading('start-bot');
    try {
      await startBot(id);
      fetchMeeting();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start bot.');
    } finally {
      setActionLoading('');
    }
  };

  const handleReprocess = async () => {
    setActionLoading('reprocess');
    try {
      await reprocessMeeting(id);
      fetchMeeting();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reprocess.');
    } finally {
      setActionLoading('');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this meeting?')) return;
    try {
      await deleteMeeting(id);
      navigate('/dashboard');
    } catch (err) {
      alert('Failed to delete meeting.');
    }
  };

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="skeleton h-10 w-64" />
        <div className="skeleton h-6 w-96" />
        <div className="grid grid-cols-2 gap-4">
          <div className="skeleton h-48" />
          <div className="skeleton h-48" />
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-white">Meeting not found</h2>
        <button onClick={() => navigate('/dashboard')} className="btn-accent mt-4">
          Back to Dashboard
        </button>
      </div>
    );
  }

  const tabs = [
    { key: 'summary', label: 'Summary', icon: '📝' },
    { key: 'transcript', label: 'Transcript', icon: '📜' },
    { key: 'actions', label: `Action Items (${meeting.action_items?.length || 0})`, icon: '✅' },
    { key: 'chunks', label: `Chunks (${meeting.transcript_chunks?.length || 0})`, icon: '🧩' },
  ];

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 animate-fade-in">
        <div>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-[var(--color-surface-500)] hover:text-white text-sm flex items-center gap-1 mb-3 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-bold text-white">{meeting.title || 'Untitled Meeting'}</h1>
          <div className="flex items-center gap-4 mt-2">
            <span className={`badge ${statusBadgeClass[meeting.status] || 'badge-pending'}`}>
              {statusLabels[meeting.status] || meeting.status}
            </span>
            <span className="text-[var(--color-surface-500)] text-sm">
              {new Date(meeting.date).toLocaleString()}
            </span>
          </div>
          <p className="text-[var(--color-surface-500)] text-xs mt-2 truncate max-w-lg">
            {meeting.meeting_url}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 shrink-0">
          {meeting.status === 'pending' && (
            <button
              onClick={handleStartBot}
              disabled={actionLoading === 'start-bot'}
              className="btn-accent flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {actionLoading === 'start-bot' ? 'Starting...' : 'Start Bot'}
            </button>
          )}
          {meeting.full_transcript && (
            <button
              onClick={handleReprocess}
              disabled={actionLoading === 'reprocess'}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              🔄 {actionLoading === 'reprocess' ? 'Processing...' : 'Reprocess'}
            </button>
          )}
          <button onClick={handleDelete} className="btn-secondary text-sm text-[var(--color-danger)] border-[rgba(248,113,113,0.2)] hover:bg-[rgba(248,113,113,0.1)]">
            🗑
          </button>
        </div>
      </div>

      {/* Processing indicator */}
      {['bot_joining', 'in_progress', 'processing'].includes(meeting.status) && (
        <div className="glass-card p-4 mb-6 flex items-center gap-3 border-[rgba(34,211,238,0.2)] animate-fade-in">
          <div className="w-3 h-3 rounded-full bg-[var(--color-cyan-glow)] animate-pulse-glow" />
          <span className="text-[var(--color-cyan-glow)] text-sm font-medium">
            {meeting.status === 'bot_joining' && 'Bot is joining the meeting...'}
            {meeting.status === 'in_progress' && 'Recording in progress...'}
            {meeting.status === 'processing' && 'Processing transcript with AI...'}
          </span>
          <span className="text-[var(--color-surface-500)] text-xs ml-auto">Auto-refreshing...</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl bg-[var(--color-surface-800)] border border-[rgba(99,102,241,0.08)]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === tab.key
                ? 'bg-gradient-to-r from-[rgba(99,102,241,0.2)] to-[rgba(139,92,246,0.1)] text-white shadow-sm'
                : 'text-[var(--color-surface-500)] hover:text-white'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="animate-fade-in">
        {activeTab === 'summary' && (
          <div className="glass-card p-6">
            {meeting.final_summary ? (
              <div className="prose prose-invert prose-sm max-w-none">
                {meeting.final_summary.split('\n').map((line, i) => {
                  if (line.startsWith('## ')) {
                    return <h2 key={i} className="text-lg font-bold text-white mt-6 mb-3 first:mt-0">{line.replace('## ', '')}</h2>;
                  }
                  if (line.startsWith('- **')) {
                    return <p key={i} className="text-[#e2e8f0] text-sm leading-relaxed pl-4 border-l-2 border-[var(--color-accent-start)] mb-2" dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-[var(--color-accent-start)]">$1</strong>') }} />;
                  }
                  if (line.startsWith('- ')) {
                    return <p key={i} className="text-[#e2e8f0] text-sm leading-relaxed ml-4 mb-1">• {line.slice(2)}</p>;
                  }
                  if (line.trim() === '') return <br key={i} />;
                  return <p key={i} className="text-[#cbd5e1] text-sm leading-relaxed mb-2">{line}</p>;
                })}
              </div>
            ) : (
              <p className="text-[var(--color-surface-500)] text-sm italic text-center py-8">
                No summary available yet. Start the bot or reprocess the transcript.
              </p>
            )}
          </div>
        )}

        {activeTab === 'transcript' && (
          <div className="glass-card p-6">
            {meeting.full_transcript ? (
              <pre className="text-[#cbd5e1] text-sm leading-relaxed whitespace-pre-wrap font-[var(--font-family-base)]">
                {meeting.full_transcript}
              </pre>
            ) : (
              <p className="text-[var(--color-surface-500)] text-sm italic text-center py-8">
                No transcript available yet.
              </p>
            )}
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="glass-card p-6">
            <ActionItemList items={meeting.action_items || []} onUpdate={fetchMeeting} />
          </div>
        )}

        {activeTab === 'chunks' && (
          <div className="space-y-3">
            {(meeting.transcript_chunks || []).length === 0 ? (
              <div className="glass-card p-6">
                <p className="text-[var(--color-surface-500)] text-sm italic text-center py-4">
                  No transcript chunks processed yet.
                </p>
              </div>
            ) : (
              meeting.transcript_chunks.map((chunk) => (
                <div key={chunk.id} className="glass-card p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="badge badge-processing">Chunk #{chunk.chunk_index + 1}</span>
                    <span className="text-[var(--color-surface-500)] text-xs">
                      {chunk.timestamp_start}s — {chunk.timestamp_end}s
                    </span>
                  </div>
                  {chunk.processed_json?.summary && (
                    <p className="text-[#e2e8f0] text-sm mb-3">{chunk.processed_json.summary}</p>
                  )}
                  {chunk.processed_json?.key_decisions?.length > 0 && (
                    <div className="mb-2">
                      <span className="text-xs text-[var(--color-warning)] font-semibold uppercase tracking-wider">Decisions:</span>
                      <ul className="mt-1 space-y-1">
                        {chunk.processed_json.key_decisions.map((d, i) => (
                          <li key={i} className="text-sm text-[#cbd5e1] pl-3 border-l border-[var(--color-warning)]">{d}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <details className="mt-3">
                    <summary className="text-xs text-[var(--color-surface-500)] cursor-pointer hover:text-white transition-colors">
                      Show raw text
                    </summary>
                    <pre className="mt-2 text-xs text-[#94a3b8] whitespace-pre-wrap font-[var(--font-family-base)] bg-[var(--color-surface-900)] p-3 rounded-lg">
                      {chunk.raw_text}
                    </pre>
                  </details>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
