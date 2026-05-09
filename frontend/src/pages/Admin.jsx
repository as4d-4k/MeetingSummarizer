import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import './admin.css';

export default function Admin() {
  const { user } = useAuth();

  const defaultInfo = {
    fullName: '',
    companyName: '',
    companySize: '1-10',
    industry: 'Technology',
    country: 'Pakistan',
    primaryLanguage: 'Urdu',
    secondaryLanguage: 'English',
    meetingPlatform: 'Google Meet',
  };

  const [extraInfo, setExtraInfo] = useState(defaultInfo);
  const [isEditing, setIsEditing] = useState(false);
  const [savedStatus, setSavedStatus] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('user_extra_info');
      if (stored) {
        setExtraInfo({ ...defaultInfo, ...JSON.parse(stored) });
      }
    } catch (e) {
      console.error('Failed to parse user extra info');
    }
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setExtraInfo((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    localStorage.setItem('user_extra_info', JSON.stringify(extraInfo));
    setIsEditing(false);
    setSavedStatus(true);
    setTimeout(() => setSavedStatus(false), 3000);
  };

  const tabs = [
    { id: 'personal', label: 'Personal', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { id: 'company', label: 'Company', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { id: 'preferences', label: 'Preferences', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  ];

  const getInitials = (name) => {
    if (!name) return 'A';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const completionPercentage = Math.round(
    (Object.values(extraInfo).filter(v => v && v !== 'Not specified').length / Object.keys(extraInfo).length) * 100
  );

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
                <span className="dot"></span> Active
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
            <button className="admin-btn admin-btn-primary" onClick={() => setIsEditing(true)}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit Profile
            </button>
          ) : (
            <>
              <button className="admin-btn admin-btn-secondary" onClick={() => setIsEditing(false)}>
                Cancel
              </button>
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
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
          >
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
          
          {/* Personal Card */}
          {(activeTab === 'personal' || activeTab === 'company' || activeTab === 'preferences') && (
            <div className="admin-card" style={{ display: activeTab === 'personal' ? 'block' : 'none' }}>
              <div className="admin-card-glow indigo"></div>
              
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
                    <input
                      type="text"
                      name="fullName"
                      value={extraInfo.fullName}
                      onChange={handleChange}
                      className="admin-field-input"
                      placeholder="Enter full name"
                    />
                  ) : (
                    <div className="admin-field-display">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span>{extraInfo.fullName || 'Not specified'}</span>
                    </div>
                  )}
                </div>

                <div className="admin-field">
                  <label className="admin-field-label">System Username</label>
                  <div className="admin-field-display">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3 3 0 01-3-3" />
                    </svg>
                    <span>{user?.username || 'N/A'}</span>
                    <span className="readonly-tag">Read-only</span>
                  </div>
                </div>

                <div className="admin-field full-width">
                  <label className="admin-field-label">Email Address</label>
                  <div className="admin-field-display">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>{user?.email || 'N/A'}</span>
                    <span className="readonly-tag">Read-only</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Company Card */}
          {(activeTab === 'company' || activeTab === 'personal') && (
            <div className="admin-card" style={{ display: activeTab === 'company' ? 'block' : 'none' }}>
              <div className="admin-card-glow purple"></div>
              
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
                    <input
                      type="text"
                      name="companyName"
                      value={extraInfo.companyName}
                      onChange={handleChange}
                      className="admin-field-input"
                      placeholder="Enter company name"
                    />
                  ) : (
                    <div className="admin-field-display">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span>{extraInfo.companyName || 'Not specified'}</span>
                    </div>
                  )}
                </div>

                <div className="admin-field">
                  <label className="admin-field-label">Company Size</label>
                  {isEditing ? (
                    <select name="companySize" value={extraInfo.companySize} onChange={handleChange} className="admin-field-input">
                      <option value="1-10">1-10 employees</option>
                      <option value="11-50">11-50 employees</option>
                      <option value="51-200">51-200 employees</option>
                      <option value="200+">200+ employees</option>
                    </select>
                  ) : (
                    <div className="admin-field-display">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
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
                      <option value="Other">Other</option>
                    </select>
                  ) : (
                    <div className="admin-field-display">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                      <span>{extraInfo.industry || 'Not specified'}</span>
                    </div>
                  )}
                </div>

                <div className="admin-field full-width">
                  <label className="admin-field-label">Country</label>
                  {isEditing ? (
                    <select name="country" value={extraInfo.country} onChange={handleChange} className="admin-field-input">
                      <option value="Pakistan">Pakistan</option>
                      <option value="United States">United States</option>
                      <option value="United Kingdom">United Kingdom</option>
                      <option value="India">India</option>
                      <option value="Other">Other</option>
                    </select>
                  ) : (
                    <div className="admin-field-display">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{extraInfo.country || 'Not specified'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Preferences Card */}
          {(activeTab === 'preferences' || activeTab === 'personal') && (
            <div className="admin-card" style={{ display: activeTab === 'preferences' ? 'block' : 'none' }}>
              <div className="admin-card-glow cyan"></div>
              
              <div className="admin-card-header">
                <div className="admin-card-title">
                  <div className="admin-card-icon cyan">
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  Preferences
                </div>
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
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span className="platform-tag">{extraInfo.meetingPlatform || 'Not specified'}</span>
                    </div>
                  )}
                </div>

                <div className="admin-field">
                  <label className="admin-field-label">Primary Language</label>
                  {isEditing ? (
                    <select name="primaryLanguage" value={extraInfo.primaryLanguage} onChange={handleChange} className="admin-field-input">
                      <option value="Urdu">Urdu</option>
                      <option value="English">English</option>
                      <option value="Arabic">Arabic</option>
                      <option value="Spanish">Spanish</option>
                    </select>
                  ) : (
                    <div className="admin-field-display">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                      </svg>
                      <span>{extraInfo.primaryLanguage || 'Not specified'}</span>
                    </div>
                  )}
                </div>

                <div className="admin-field">
                  <label className="admin-field-label">Secondary Language</label>
                  {isEditing ? (
                    <select name="secondaryLanguage" value={extraInfo.secondaryLanguage} onChange={handleChange} className="admin-field-input">
                      <option value="English">English</option>
                      <option value="Urdu">Urdu</option>
                      <option value="Arabic">Arabic</option>
                      <option value="Spanish">Spanish</option>
                    </select>
                  ) : (
                    <div className="admin-field-display">
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                      </svg>
                      <span>{extraInfo.secondaryLanguage || 'Not specified'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ── Sidebar ── */}
        <div className="admin-sidebar">
          
          <div className="admin-sidebar-card">
            <h4 className="admin-sidebar-title">Profile Completion</h4>
            <div className="admin-progress-track">
              <div className="admin-progress-fill" style={{ width: `${completionPercentage}%` }}></div>
            </div>
            <div className="admin-progress-text">{completionPercentage}% Complete</div>
          </div>

          <div className="admin-sidebar-card">
            <h4 className="admin-sidebar-title">Account Info</h4>
            <div className="admin-sidebar-row">
              <span className="admin-sidebar-label">Member Since</span>
              <span className="admin-sidebar-value">Today</span>
            </div>
            <div className="admin-sidebar-row">
              <span className="admin-sidebar-label">Status</span>
              <span className="admin-sidebar-value status">
                <span className="dot"></span> Active
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
              <h4>Security</h4>
              <p>Your profile information is stored locally. Enable cloud sync for backup.</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}