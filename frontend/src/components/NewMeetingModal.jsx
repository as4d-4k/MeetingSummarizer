import { useState } from 'react';
import { createMeeting } from '../api/client';

export default function NewMeetingModal({ isOpen, onClose, onCreated }) {
  const [meetingUrl, setMeetingUrl] = useState('');
  const [title, setTitle] = useState('');
  const [targetTopics, setTargetTopics] = useState('');
  const [liveLanguage, setLiveLanguage] = useState('English');
  const [summaryLanguage, setSummaryLanguage] = useState('English');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await createMeeting({
        meeting_url: meetingUrl,
        title: title || undefined,
        target_topics: targetTopics ? targetTopics.split(',').map(s => s.trim()).filter(Boolean) : [],
        live_language: liveLanguage,
        summary_language: summaryLanguage,
      });
      onCreated(data);
      setMeetingUrl('');
      setTitle('');
      setTargetTopics('');
      setLiveLanguage('English');
      setSummaryLanguage('English');
      onClose();
    } catch (err) {
      setError(err.response?.data?.meeting_url?.[0] || err.response?.data?.detail || 'Failed to create meeting.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative glass-card p-8 w-full max-w-md animate-fade-in" style={{ background: 'rgba(17,24,39,0.95)' }}>
        <h2 className="text-xl font-bold text-white mb-1">New Meeting</h2>
        <p className="text-[var(--color-surface-500)] text-sm mb-6">
          Paste a Google Meet or Zoom link to get started.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
              Meeting Link <span className="text-[var(--color-danger)]">*</span>
            </label>
            <input
              type="url"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
              Title <span className="text-[var(--color-surface-500)]">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sprint Planning #42"
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
              Target Topics <span className="text-[var(--color-surface-500)]">(comma separated)</span>
            </label>
            <input
              type="text"
              value={targetTopics}
              onChange={(e) => setTargetTopics(e.target.value)}
              placeholder="e.g. Budget, Q3 roadmap, Hiring"
              className="input-field"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                Live Chat Language
              </label>
              <select 
                value={liveLanguage} 
                onChange={e => setLiveLanguage(e.target.value)}
                className="input-field cursor-pointer"
              >
                <option value="English">🇬🇧 English</option>
                <option value="Urdu">🇵🇰 Urdu (اردو)</option>
                <option value="Urdu-English Mix">🔀 Urdu–English Mix</option>
                <option value="Roman Urdu">🅰️ Roman Urdu</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">
                Summary Language
              </label>
              <select 
                value={summaryLanguage} 
                onChange={e => setSummaryLanguage(e.target.value)}
                className="input-field cursor-pointer"
              >
                <option value="English">🇬🇧 English</option>
                <option value="Urdu">🇵🇰 Urdu (اردو)</option>
                <option value="Urdu-English Mix">🔀 Urdu–English Mix</option>
                <option value="Roman Urdu">🅰️ Roman Urdu</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="text-[var(--color-danger)] text-sm bg-[rgba(248,113,113,0.1)] px-4 py-2.5 rounded-xl border border-[rgba(248,113,113,0.2)]">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={loading || !meetingUrl} className="btn-accent flex-1">
              {loading ? 'Creating...' : 'Create Meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
