import { toggleActionItem } from '../api/client';
import { useState } from 'react';

export default function ActionItemList({ items, onUpdate, meetingId, onSendNotifications }) {
  return (
    <div>
      {/* Send Notifications Button */}
      {items.length > 0 && onSendNotifications && (
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <SendNotificationsButton meetingId={meetingId} onDone={onUpdate} />
        </div>
      )}

      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-[var(--color-surface-500)] text-sm italic py-4 text-center">
            No action items extracted yet.
          </p>
        ) : (
          items.map((item) => (
            <ActionItemRow key={item.id} item={item} onUpdate={onUpdate} />
          ))
        )}
      </div>
    </div>
  );
}

function SendNotificationsButton({ meetingId, onDone }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      const { sendNotifications } = await import('../api/client');
      await sendNotifications(meetingId);
      setSent(true);
      onDone?.();
    } catch (err) {
      console.error('Failed to send notifications:', err);
      alert('Failed to send notifications. Check console for details.');
    } finally {
      setSending(false);
    }
  };

  return (
    <button
      onClick={handleSend}
      disabled={sending || sent}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 20px',
        borderRadius: 8,
        border: 'none',
        cursor: sending || sent ? 'default' : 'pointer',
        fontSize: 13,
        fontWeight: 600,
        background: sent
          ? 'rgba(52, 211, 153, 0.15)'
          : 'linear-gradient(135deg, #6C63FF 0%, #a855f7 100%)',
        color: sent ? '#34d399' : 'white',
        transition: 'all 0.3s ease',
        opacity: sending ? 0.6 : 1,
      }}
    >
      {sent ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Notifications Sent
        </>
      ) : sending ? (
        'Sending...'
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Send Notifications
        </>
      )}
    </button>
  );
}

function ActionItemRow({ item, onUpdate }) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    try {
      await toggleActionItem(item.id);
      onUpdate?.();
    } catch (err) {
      console.error('Failed to toggle:', err);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
        item.is_completed
          ? 'bg-[rgba(52,211,153,0.05)] border border-[rgba(52,211,153,0.1)]'
          : 'bg-[rgba(26,34,54,0.4)] border border-[rgba(99,102,241,0.08)]'
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={handleToggle}
        disabled={toggling}
        className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
          item.is_completed
            ? 'bg-[var(--color-success)] border-[var(--color-success)]'
            : 'border-[var(--color-surface-500)] hover:border-[var(--color-accent-start)]'
        }`}
      >
        {item.is_completed && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-relaxed ${item.is_completed ? 'text-[var(--color-surface-500)] line-through' : 'text-[#e2e8f0]'}`}>
          {item.task_description}
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-xs text-[var(--color-accent-start)] font-medium flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {item.assigned_speaker}
          </span>
          {item.deadline && (
            <span className="text-xs text-[var(--color-warning)] flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {item.deadline}
            </span>
          )}
          {/* Notification status indicator */}
          {item.notification_sent && (
            <span
              style={{
                fontSize: 11,
                color: '#34d399',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: 'rgba(52, 211, 153, 0.1)',
                padding: '2px 8px',
                borderRadius: 100,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Notified
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
