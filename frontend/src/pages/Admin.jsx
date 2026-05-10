import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient, { getLanguagePreferences, saveLanguagePreferences } from '../api/client';
import './admin.css';

const LANGUAGE_CODES = {
  'Urdu':    'ur-PK',
  'English': 'en-US',
  'Arabic':  'ar-SA',
  'Spanish': 'es-ES',
  'Hindi':   'hi-IN',
  'French':  'fr-FR',
  'German':  'de-DE',
  'Turkish': 'tr-TR',
};

const INDUSTRY_MAP = {
  'Technology':  'technology',
  'Finance':     'finance',
  'Healthcare':  'medical',
  'Education':   'education',
  'Legal':       'legal',
  'Other':       'general',
};

export default function Admin() {
  const { user } = useAuth();

  const defaultInfo = {
    fullName:          '',
    companyName:       '',
    companySize:       '1-10',
    industry:          'Technology',
    country:           'Pakistan',
    primaryLanguage:   'Urdu',
    secondaryLanguage: 'English',
    meetingPlatform:   'Google Meet',
  };

  const [extraInfo, setExtraInfo]   = useState(defaultInfo);
  const [isEditing, setIsEditing]   = useState(false);
  const [savedStatus, setSavedStatus] = useState(false);
  const [activeTab, setActiveTab]   = useState('personal');

  // Hint generation state
  const [hintsState, setHintsState] = useState('idle');
  // 'idle' | 'generating' | 'done' | 'error'
  const [hintsCount, setHintsCount] = useState(0);
  const [hintsGeneratedAt, setHintsGeneratedAt] = useState(null);

  // Track what language/industry was before editing
  const prevLangRef = useRef({ lang: '', industry: '' });

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user_extra_info');
      if (stored) {
        const parsed = { ...defaultInfo, ...JSON.parse(stored) };
        setExtraInfo(parsed);
        prevLangRef.current = {
          lang:     parsed.primaryLanguage,
          industry: parsed.industry,
        };
      }
    } catch (e) {
      console.error('Failed to parse user extra info');
    }

    // Load hint status from backend
    fetchHintsStatus();
  }, []);

  const fetchHintsStatus = async () => {
    try {
      const { data } = await getLanguagePreferences();
      setHintsCount(data.hints_count || 0);
      setHintsGeneratedAt(data.hints_generated_at || null);
      if (data.hints_count > 0) setHintsState('done');
    } catch {}
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setExtraInfo((prev) => ({ ...prev, [name]: value }));
  };

  const handleEdit = () => {
    // Remember current lang/industry before editing
    prevLangRef.current = {
      lang:     extraInfo.primaryLanguage,
      industry: extraInfo.industry,
    };
    setIsEditing(true);
  };

  const handleCancel = () => {
    // Restore from localStorage
    try {
      const stored = localStorage.getItem('user_extra_info');
      if (stored) setExtraInfo({ ...defaultInfo, ...JSON.parse(stored) });
    } catch {}
    setIsEditing(false);
  };

  const handleSave = async () => {
    // Save to localStorage
    localStorage.setItem('user_extra_info', JSON.stringify(extraInfo));
    setIsEditing(false);
    setSavedStatus(true);
    setTimeout(() => setSavedStatus(false), 3000);

    // Check if language or industry changed
    const langChanged     = extraInfo.primaryLanguage !== prevLangRef.current.lang;
    const industryChanged = extraInfo.industry        !== prevLangRef.current.industry;

    if (langChanged || industryChanged) {
      // Regenerate hints
      await regenerateHints();
    }
  };

  const regenerateHints = async () => {
    setHintsState('generating');
    try {
      const { data } = await saveLanguagePreferences({
        primary_language:   LANGUAGE_CODES[extraInfo.primaryLanguage]   || 'en-US',
        secondary_language: LANGUAGE_CODES[extraInfo.secondaryLanguage] || 'en-US',
        industry:           INDUSTRY_MAP[extraInfo.industry]             || 'general',
      });
      setHintsState('generating'); // still generating in background

      // Poll until hints are ready
      pollHintsReady();
    } catch (err) {
      console.error('Failed to trigger hint generation:', err);
      setHintsState('error');
    }
  };

  const pollHintsReady = () => {
    // Poll every 3 seconds for up to 60 seconds
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const { data } = await getLanguagePreferences();
        if (data.hints_count > 0) {
          setHintsCount(data.hints_count);
          setHintsGeneratedAt(data.hints_generated_at);
          setHintsState('done');
          clearInterval(interval);
        }
      } catch {}
      if (attempts >= 20) {
        clearInterval(interval);
        setHintsState('error');
      }
    }, 3000);
  };

  const tabs = [
    { id: 'personal',    label: 'Personal',    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { id: 'company',     label: 'Company',     icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { id: 'preferences', label: 'Preferences', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  ];

  const getInitials = (name) => {
    if (!name) return 'A';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const completionPercentage = Math.round(
    (Object.values(extraInfo).filter(v => v && v !== 'Not specified').length
      / Object.keys(extraInfo).length) * 100
  );

  const HintsStatusBadge = () => {
    if (hintsState === 'generating') return (
      <div className="hints-badge hints-generating">
        <span className="hints-spinner" />
        Generating AI hints…
      </div>
    );
    if (hintsState === 'done') return (
      <div className="hints-badge hints-done">
        ✅ {hintsCount} AI hints ready
        {hintsGeneratedAt && (
          <span style={{ opacity: 0.7, marginLeft: 6 }}>
            · {new Date(hintsGeneratedAt).toLocaleDateString()}
          </span>
        )}
      </div>
    );
    if (hintsState === 'error') return (
      <div className="hints-badge hints-error">
        ⚠️ Hint generation failed — will retry on next save
      </div>
    );
    return null;
  };

  return (
    <div className="admin-root animation-fade-in">

      {/* ── Header ── */}
      <header className="admin-header">
        <div className="admin-header-left">
          <div className="admin-avatar">
            {getInitials(extraInfo.fullName || user?.username)}
            <div className="admin-avatar-status">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <div className="admin-header-info">
            <h1>{extraInfo.fullName || user?.username || 'Admin User'}</h1>
            <p>{user?.email || 'admin@example.com'}</p>
            <div className="admin-header-badges">
              <span className="admin-badge admin-badge-active">
                <span className="dot" /> Active
              </span>
              <span className="admin-badge admin-badge-company">
                {extraInfo.companyName || 'No Company'}
              </span>
            </div>
          </div>
        </div>

        <div className="admin-actions">
          {savedStatus && (
            <div className="admin-save-toast">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Saved!
            </div>
          )}
          {!isEditing ? (
            <button className="admin-btn admin-btn-primary" onClick={handleEdit}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit Profile
            </button>
          ) : (
            <>
              <button className="admin-btn admin-btn-secondary" onClick={handleCancel}>Cancel</button>
              <button className="admin-btn admin-btn-success" onClick={handleSave}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Save Changes
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Tabs ── */}
      <div className="admin-tabs">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}>
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Main Grid ── */}
      <div className="admin-grid">
        <div className="admin-main">

          {/* ── Personal Tab ── */}
          {activeTab === 'personal' && (
            <div className="admin-card">
              <div className="admin-card-glow indigo" />
              <div className="admin-card-header">
                <div className="admin-card-title">
                  <div className="admin-card-icon indigo">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  Personal Information
                </div>
                <span className="admin-card-tag">Required</span>
              </div>
              <div className="admin-fields">
                <div className="admin-field">
                  <label className="admin-field-label">Full Name</label>
                  {isEditing ? (
                    <input type="text" name="fullName" value={extraInfo.fullName}
                      onChange={handleChange} className="admin-field-input" placeholder="Enter full name" />
                  ) : (
                    <div className="admin-field-display">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      <span>{extraInfo.fullName || 'Not specified'}</span>
                    </div>
                  )}
                </div>
                <div className="admin-field">
                  <label className="admin-field-label">System Username</label>
                  <div className="admin-field-display">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3 3 0 01-3-3" /></svg>
                    <span>{user?.username || 'N/A'}</span>
                    <span className="readonly-tag">Read-only</span>
                  </div>
                </div>
                <div className="admin-field full-width">
                  <label className="admin-field-label">Email Address</label>
                  <div className="admin-field-display">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    <span>{user?.email || 'N/A'}</span>
                    <span className="readonly-tag">Read-only</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Company Tab ── */}
          {activeTab === 'company' && (
            <div className="admin-card">
              <div className="admin-card-glow purple" />
              <div className="admin-card-header">
                <div className="admin-card-title">
                  <div className="admin-card-icon purple">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  Company Details
                </div>
              </div>
              <div className="admin-fields">
                <div className="admin-field full-width">
                  <label className="admin-field-label">Company Name</label>
                  {isEditing ? (
                    <input type="text" name="companyName" value={extraInfo.companyName}
                      onChange={handleChange} className="admin-field-input" placeholder="TechCorp Pvt Ltd" />
                  ) : (
                    <div className="admin-field-display">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" /></svg>
                      <span>{extraInfo.companyName || 'Not specified'}</span>
                    </div>
                  )}
                </div>
                <div className="admin-field">
                  <label className="admin-field-label">Company Size</label>
                  {isEditing ? (
                    <select name="companySize" value={extraInfo.companySize} onChange={handleChange} className="admin-field-input">
                      <option value="1-10">1-10</option>
                      <option value="11-50">11-50</option>
                      <option value="51-200">51-200</option>
                      <option value="200+">200+</option>
                    </select>
                  ) : (
                    <div className="admin-field-display">
                      <span>{extraInfo.companySize || 'Not specified'}</span>
                    </div>
                  )}
                </div>
                <div className="admin-field">
                  <label className="admin-field-label">Industry</label>
                  {isEditing ? (
                    <select name="industry" value={extraInfo.industry} onChange={handleChange} className="admin-field-input">
                      <option value="Technology">Technology</option>
                      <option value="Finance">Finance</option>
                      <option value="Healthcare">Healthcare</option>
                      <option value="Education">Education</option>
                      <option value="Legal">Legal</option>
                      <option value="Other">Other</option>
                    </select>
                  ) : (
                    <div className="admin-field-display">
                      <span>{extraInfo.industry || 'Not specified'}</span>
                    </div>
                  )}
                </div>
                <div className="admin-field full-width">
                  <label className="admin-field-label">Country</label>
                  {isEditing ? (
                    <select name="country" value={extraInfo.country} onChange={handleChange} className="admin-field-input">
                      <option value="Pakistan">🇵🇰 Pakistan</option>
                      <option value="United States">🇺🇸 United States</option>
                      <option value="United Kingdom">🇬🇧 United Kingdom</option>
                      <option value="India">🇮🇳 India</option>
                      <option value="Saudi Arabia">🇸🇦 Saudi Arabia</option>
                      <option value="UAE">🇦🇪 UAE</option>
                      <option value="Other">Other</option>
                    </select>
                  ) : (
                    <div className="admin-field-display">
                      <span>{extraInfo.country || 'Not specified'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Preferences Tab ── */}
          {activeTab === 'preferences' && (
            <div className="admin-card">
              <div className="admin-card-glow cyan" />
              <div className="admin-card-header">
                <div className="admin-card-title">
                  <div className="admin-card-icon cyan">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  Language & Meeting Preferences
                </div>
              </div>

              {/* AI Hints Status */}
              <div style={{ marginBottom: 20 }}>
                <HintsStatusBadge />
                {isEditing && (
                  <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(108,99,255,0.07)', border: '1px solid rgba(108,99,255,0.18)', borderRadius: 10, fontSize: 12, color: '#9B8FFF', lineHeight: 1.6 }}>
                    🤖 Changing language or industry will automatically regenerate AI speech hints when you save.
                    This improves transcription accuracy for your team's meetings.
                  </div>
                )}
              </div>

              <div className="admin-fields">
                <div className="admin-field full-width">
                  <label className="admin-field-label">Meeting Platform</label>
                  {isEditing ? (
                    <select name="meetingPlatform" value={extraInfo.meetingPlatform} onChange={handleChange} className="admin-field-input">
                      <option value="Google Meet">Google Meet</option>
                      <option value="Zoom">Zoom</option>
                      <option value="Microsoft Teams">Microsoft Teams</option>
                      <option value="All platforms">All platforms</option>
                    </select>
                  ) : (
                    <div className="admin-field-display">
                      <span className="platform-tag">{extraInfo.meetingPlatform || 'Not specified'}</span>
                    </div>
                  )}
                </div>

                <div className="admin-field">
                  <label className="admin-field-label">
                    Primary Language
                    {isEditing && <span style={{ color: '#FF6B6B', marginLeft: 4 }}>*</span>}
                  </label>
                  {isEditing ? (
                    <select name="primaryLanguage" value={extraInfo.primaryLanguage} onChange={handleChange} className="admin-field-input">
                      <option value="Urdu">🇵🇰 Urdu</option>
                      <option value="English">🇺🇸 English</option>
                      <option value="Arabic">🇸🇦 Arabic</option>
                      <option value="Hindi">🇮🇳 Hindi</option>
                      <option value="Spanish">🇪🇸 Spanish</option>
                      <option value="French">🇫🇷 French</option>
                      <option value="German">🇩🇪 German</option>
                      <option value="Turkish">🇹🇷 Turkish</option>
                    </select>
                  ) : (
                    <div className="admin-field-display">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>
                      <span>{extraInfo.primaryLanguage || 'Not specified'}</span>
                    </div>
                  )}
                </div>

                <div className="admin-field">
                  <label className="admin-field-label">Secondary Language</label>
                  {isEditing ? (
                    <select name="secondaryLanguage" value={extraInfo.secondaryLanguage} onChange={handleChange} className="admin-field-input">
                      <option value="English">🇺🇸 English</option>
                      <option value="Urdu">🇵🇰 Urdu</option>
                      <option value="Arabic">🇸🇦 Arabic</option>
                      <option value="Hindi">🇮🇳 Hindi</option>
                      <option value="Spanish">🇪🇸 Spanish</option>
                      <option value="None">None</option>
                    </select>
                  ) : (
                    <div className="admin-field-display">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" /></svg>
                      <span>{extraInfo.secondaryLanguage || 'Not specified'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Manual regenerate button */}
              {!isEditing && (
                <button
                  onClick={regenerateHints}
                  disabled={hintsState === 'generating'}
                  style={{
                    marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 7,
                    padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                    background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.25)',
                    color: '#9B8FFF', cursor: hintsState === 'generating' ? 'not-allowed' : 'pointer',
                    opacity: hintsState === 'generating' ? 0.6 : 1,
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {hintsState === 'generating' ? (
                    <><span style={{ width:10, height:10, borderRadius:'50%', border:'2px solid rgba(108,99,255,0.3)', borderTopColor:'#6C63FF', animation:'spin 0.7s linear infinite', display:'inline-block' }} /> Generating…</>
                  ) : (
                    '🔄 Regenerate AI Hints'
                  )}
                </button>
              )}
            </div>
          )}

        </div>

        {/* ── Sidebar ── */}
        <div className="admin-sidebar">
          <div className="admin-sidebar-card">
            <h4 className="admin-sidebar-title">Profile Completion</h4>
            <div className="admin-progress-track">
              <div className="admin-progress-fill" style={{ width: `${completionPercentage}%` }} />
            </div>
            <div className="admin-progress-text">{completionPercentage}% Complete</div>
          </div>

          <div className="admin-sidebar-card">
            <h4 className="admin-sidebar-title">AI Speech Hints</h4>
            <div className="admin-sidebar-row">
              <span className="admin-sidebar-label">Status</span>
              <span className="admin-sidebar-value" style={{
                color: hintsState === 'done' ? '#00C896' : hintsState === 'error' ? '#FF6B6B' : '#FFB800'
              }}>
                {hintsState === 'done'       ? '✅ Ready'
                 : hintsState === 'generating' ? '⏳ Generating'
                 : hintsState === 'error'      ? '❌ Failed'
                 : '—'}
              </span>
            </div>
            {hintsCount > 0 && (
              <div className="admin-sidebar-row">
                <span className="admin-sidebar-label">Phrases</span>
                <span className="admin-sidebar-value">{hintsCount}</span>
              </div>
            )}
            <div className="admin-sidebar-row">
              <span className="admin-sidebar-label">Language</span>
              <span className="admin-sidebar-value">{extraInfo.primaryLanguage}</span>
            </div>
            <div className="admin-sidebar-row">
              <span className="admin-sidebar-label">Industry</span>
              <span className="admin-sidebar-value">{extraInfo.industry}</span>
            </div>
          </div>

          <div className="admin-sidebar-card">
            <h4 className="admin-sidebar-title">Account Info</h4>
            <div className="admin-sidebar-row">
              <span className="admin-sidebar-label">Status</span>
              <span className="admin-sidebar-value status">
                <span className="dot" /> Active
              </span>
            </div>
            <div className="admin-sidebar-row">
              <span className="admin-sidebar-label">Plan</span>
              <span className="admin-sidebar-value plan">Free</span>
            </div>
          </div>

          <div className="admin-security-card">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <div>
              <h4>AI Hints</h4>
              <p>Hints are generated by Gemini AI based on your language and industry. They improve speech recognition accuracy for your team's meetings.</p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .hints-badge { display:inline-flex; align-items:center; gap:8px; padding:8px 14px; border-radius:8px; font-size:12px; font-weight:500; }
        .hints-generating { background:rgba(255,184,0,0.1); border:1px solid rgba(255,184,0,0.2); color:#FFB800; }
        .hints-done { background:rgba(0,200,150,0.1); border:1px solid rgba(0,200,150,0.2); color:#00C896; }
        .hints-error { background:rgba(255,107,107,0.1); border:1px solid rgba(255,107,107,0.2); color:#FF6B6B; }
        .hints-spinner { width:12px; height:12px; border-radius:50%; border:2px solid rgba(255,184,0,0.3); border-top-color:#FFB800; animation:spin 0.7s linear infinite; }
      `}</style>
    </div>
  );
}