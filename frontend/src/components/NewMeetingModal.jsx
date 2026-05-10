import { useState, useEffect } from 'react';
import { createMeeting } from '../api/client';

export default function NewMeetingModal({ isOpen, onClose, onCreated }) {
  const [meetingUrl,        setMeetingUrl]        = useState('');
  const [title,             setTitle]             = useState('');
  const [targetTopics,      setTargetTopics]      = useState('');
  const [summaryLanguage,   setSummaryLanguage]   = useState('English');
  const [transcriptionMode, setTranscriptionMode] = useState('skip');
  const [loading,           setLoading]           = useState(false);
  const [error,             setError]             = useState('');
  const [userLang,          setUserLang]          = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user_extra_info');
      if (stored) {
        const info = JSON.parse(stored);
        setUserLang(info.primaryLanguage || '');
      }
    } catch {}
  }, [isOpen]);

  // Map Admin profile language name → Gladia live_language value
  const LANG_TO_LIVE = {
    'Urdu':    'Urdu',
    'English': 'English',
    'Hindi':   'Urdu-English Mix',
    'Arabic':  'English',
    'Spanish': 'English',
    'French':  'English',
    'German':  'English',
    'Turkish': 'English',
  };
  const derivedLiveLanguage = LANG_TO_LIVE[userLang] || 'Urdu-English Mix';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await createMeeting({
        meeting_url:        meetingUrl,
        title:              title || undefined,
        target_topics:      targetTopics
          ? targetTopics.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        live_language:      derivedLiveLanguage,
        summary_language:   summaryLanguage,
        transcription_mode: transcriptionMode,
      });
      onCreated(data);
      setMeetingUrl(''); setTitle(''); setTargetTopics('');
      setTranscriptionMode('skip');
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.meeting_url?.[0] ||
        err.response?.data?.detail ||
        'Failed to create meeting.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          opacity: isOpen ? 1 : 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      />

      {/* ── Slide-in panel ── */}
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
        width: 380,
        background: 'var(--bg-card)',
        borderLeft: '1px solid var(--border-subtle)',
        boxShadow: '-16px 0 48px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.35s cubic-bezier(0.4,0,0.2,1)',
        overflowY: 'auto',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          position: 'sticky', top: 0,
          background: 'var(--bg-card)', zIndex: 1,
        }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
              New Meeting
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Paste a meeting link to get started</p>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, lineHeight: 1,
          }}>×</button>
        </div>

        {/* Scrollable form body */}
        <form
          onSubmit={handleSubmit}
          style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}
        >

          {/* Meeting URL */}
          <Field label={<>Meeting Link <Req /></>}>
            <input
              type="url" value={meetingUrl}
              onChange={e => setMeetingUrl(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              style={inp} required
            />
          </Field>

          {/* Title */}
          <Field label={<>Title <Opt /></>}>
            <input
              type="text" value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Sprint Planning #42"
              style={inp}
            />
          </Field>

          {/* Topics */}
          <Field label={<>Target Topics <Opt text="comma separated" /></>}>
            <input
              type="text" value={targetTopics}
              onChange={e => setTargetTopics(e.target.value)}
              placeholder="Budget, Q3 roadmap, Hiring"
              style={inp}
            />
          </Field>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '2px 0' }} />

          {/* Transcription Mode */}
          <div>
            <p style={sectionLabel}>Transcription Mode</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

              <ModeCard
                selected={transcriptionMode === 'skip'}
                onClick={() => setTranscriptionMode('skip')}
                accent="#00C896"
                icon="🔍"
                title="Auto-detect language"
                desc="Skips first 8s warm-up so Azure calibrates to your language from real speech, then captures from second 9 onwards."
              />

              <ModeCard
                selected={transcriptionMode === 'hints'}
                onClick={() => setTranscriptionMode('hints')}
                accent="#6C63FF"
                icon="🤖"
                title="Use AI hint table"
                badge={userLang}
                desc={`Trains Azure from word one using AI-generated phrases for ${userLang || 'your language'} and your industry.`}
              />

            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '2px 0' }} />

          {/* Summary language */}
          <Field label="Summary Language">
            <div style={{ position: 'relative' }}>
              <select
                value={summaryLanguage}
                onChange={e => setSummaryLanguage(e.target.value)}
                style={{ ...inp, appearance: 'none', cursor: 'pointer', paddingRight: 36 }}
              >
                <option value="English">🇬🇧 English</option>
                <option value="Urdu">🇵🇰 Urdu (اردو)</option>
                <option value="Urdu-English Mix">🔀 Urdu–English Mix</option>
                <option value="Roman Urdu">🅰️ Roman Urdu</option>
              </select>
              <ChevronIcon />
            </div>
          </Field>

          {/* Error */}
          {error && (
            <div style={{
              fontSize: 12, color: '#FF6B6B',
              background: 'rgba(255,107,107,0.08)',
              border: '1px solid rgba(255,107,107,0.2)',
              borderRadius: 8, padding: '9px 12px',
            }}>
              {error}
            </div>
          )}

          {/* Spacer pushes buttons to bottom on short content */}
          <div style={{ flex: 1 }} />

          {/* Actions — sticky at bottom */}
          <div style={{
            display: 'flex', gap: 10,
            position: 'sticky', bottom: 0,
            background: 'var(--bg-card)',
            paddingTop: 12,
            borderTop: '1px solid var(--border-subtle)',
            marginTop: 4,
          }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: '10px 0',
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 9, color: 'var(--text-secondary)',
              fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !meetingUrl}
              style={{
                flex: 2, padding: '10px 0',
                background: loading || !meetingUrl
                  ? 'rgba(108,99,255,0.4)'
                  : 'linear-gradient(135deg,#6C63FF,#9B8FFF)',
                border: 'none', borderRadius: 9,
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: loading || !meetingUrl ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-body)',
                boxShadow: loading || !meetingUrl ? 'none' : '0 4px 16px rgba(108,99,255,0.35)',
                transition: 'all 0.2s',
              }}
            >
              {loading ? 'Creating…' : '+ Create Meeting'}
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Req() {
  return <span style={{ color: '#FF6B6B', marginLeft: 2 }}>*</span>;
}
function Opt({ text = 'optional' }) {
  return <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', fontSize: 10 }}> ({text})</span>;
}

function ModeCard({ selected, onClick, accent, icon, title, badge, desc, disabled }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', gap: 10, padding: '12px 14px',
        borderRadius: 10,
        border: `1px solid ${disabled ? 'var(--border-subtle)' : selected ? accent + '55' : 'var(--border-subtle)'}`,
        background: disabled ? 'var(--bg-deep)' : selected ? accent + '0d' : 'var(--bg-deep)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'all 0.2s',
      }}
    >
      {/* Radio dot */}
      <div style={{
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 2,
        border: selected && !disabled ? `5px solid ${accent}` : '2px solid var(--border-mid)',
        transition: 'all 0.2s',
      }} />
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: disabled ? 'var(--text-muted)' : 'var(--text-primary)' }}>
            {icon} {title}
          </span>
          {badge && (
            <span style={{
              padding: '1px 7px', borderRadius: 100, fontSize: 10, fontWeight: 600,
              background: accent + '18', color: accent,
              border: `1px solid ${accent}33`,
            }}>
              {badge}
            </span>
          )}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
          {desc}
        </p>
      </div>
    </div>
  );
}

const inp = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--bg-deep)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 8, padding: '9px 12px',
  color: 'var(--text-primary)', fontSize: 13,
  fontFamily: 'var(--font-body)', outline: 'none',
};

const sectionLabel = {
  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8,
};

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
