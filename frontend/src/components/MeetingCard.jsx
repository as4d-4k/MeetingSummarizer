import { useNavigate } from 'react-router-dom';

const statusMap = {
  pending: 'badge-pending',
  bot_joining: 'badge-bot-joining',
  in_progress: 'badge-in-progress',
  processing: 'badge-processing',
  completed: 'badge-completed',
  failed: 'badge-failed',
};

const statusLabels = {
  pending: 'Pending',
  bot_joining: 'Bot Joining',
  in_progress: 'In Progress',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
};

export default function MeetingCard({ meeting, index }) {
  const navigate = useNavigate();

  const formattedDate = new Date(meeting.date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      onClick={() => navigate(`/meetings/${meeting.id}`)}
      className="glass-card p-5 cursor-pointer animate-fade-in"
      style={{ animationDelay: `${index * 0.06}s`, animationFillMode: 'backwards' }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-white font-semibold text-[15px] leading-snug line-clamp-2">
          {meeting.title || 'Untitled Meeting'}
        </h3>
        <span className={`badge ${statusMap[meeting.status] || 'badge-pending'} shrink-0`}>
          {statusLabels[meeting.status] || meeting.status}
        </span>
      </div>

      <p className="text-[var(--color-surface-500)] text-xs mb-4 truncate">
        {meeting.meeting_url}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-[var(--color-surface-500)] text-xs flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {formattedDate}
        </span>
        <span className="text-[var(--color-surface-500)] text-xs flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          {meeting.action_item_count || 0} tasks
        </span>
      </div>
    </div>
  );
}
