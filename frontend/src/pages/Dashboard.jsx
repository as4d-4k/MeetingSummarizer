import { useState, useEffect } from 'react';
import { getMeetings } from '../api/client';
import MeetingCard from '../components/MeetingCard';
import NewMeetingModal from '../components/NewMeetingModal';

export default function Dashboard() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

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

  useEffect(() => {
    fetchMeetings();
  }, []);

  const handleMeetingCreated = () => {
    fetchMeetings();
  };

  // Stats
  const totalMeetings = meetings.length;
  const completed = meetings.filter((m) => m.status === 'completed').length;
  const inProgress = meetings.filter((m) => ['in_progress', 'bot_joining', 'processing'].includes(m.status)).length;
  const totalTasks = meetings.reduce((sum, m) => sum + (m.action_item_count || 0), 0);

  const stats = [
    { label: 'Total Meetings', value: totalMeetings, color: 'from-indigo-500 to-violet-500', icon: '📹' },
    { label: 'Completed', value: completed, color: 'from-emerald-500 to-teal-500', icon: '✅' },
    { label: 'In Progress', value: inProgress, color: 'from-cyan-500 to-blue-500', icon: '🔄' },
    { label: 'Action Items', value: totalTasks, color: 'from-amber-500 to-orange-500', icon: '📋' },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-[var(--color-surface-500)] text-sm mt-1">
            Monitor your meetings and track action items
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-accent flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Meeting
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className="glass-card p-5 animate-fade-in"
            style={{ animationDelay: `${i * 0.08}s`, animationFillMode: 'backwards' }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{stat.icon}</span>
              <div className={`w-8 h-1 rounded-full bg-gradient-to-r ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-[var(--color-surface-500)] mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Recent Meetings */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-[var(--color-accent-start)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Recent Meetings
        </h2>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton h-40" />
          ))}
        </div>
      ) : meetings.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="text-5xl mb-4">🎤</div>
          <h3 className="text-lg font-semibold text-white mb-2">No meetings yet</h3>
          <p className="text-[var(--color-surface-500)] text-sm mb-6">
            Create your first meeting to start generating summaries and action items.
          </p>
          <button onClick={() => setShowModal(true)} className="btn-accent">
            Create First Meeting
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {meetings.map((meeting, i) => (
            <MeetingCard key={meeting.id} meeting={meeting} index={i} />
          ))}
        </div>
      )}

      <NewMeetingModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={handleMeetingCreated}
      />
    </div>
  );
}
