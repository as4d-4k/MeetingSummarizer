import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ 
    fullName: '', 
    email: '', 
    password: '', 
    passwordConfirm: '',
    companyName: '',
    companySize: '1-10',
    industry: 'Technology',
    country: 'Pakistan',
    primaryLanguage: 'Urdu',
    secondaryLanguage: 'English',
    meetingPlatform: 'Google Meet',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleNext = (e) => {
    e.preventDefault();
    if (step === 1) {
      if (form.password !== form.passwordConfirm) {
        setError('Passwords do not match.');
        return;
      }
      if (!form.fullName || !form.email || !form.password) {
        setError('Please fill in all basic info fields.');
        return;
      }
    }
    if (step === 2) {
      if (!form.companyName) {
        setError('Please provide a company name.');
        return;
      }
    }
    setError('');
    setStep(step + 1);
  };

  const handleBack = () => {
    setError('');
    setStep(step - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    setLoading(true);
    try {
      // Backend expects username, so we format full name
      const username = form.fullName.replace(/\s+/g, '').toLowerCase() || 'user' + Math.floor(Math.random()*1000);
      await register(form.email, username, form.password, form.passwordConfirm);
      
      // Save extra info in localStorage so it can be shown on Admin page
      localStorage.setItem('user_extra_info', JSON.stringify({
        fullName: form.fullName,
        companyName: form.companyName,
        companySize: form.companySize,
        industry: form.industry,
        country: form.country,
        primaryLanguage: form.primaryLanguage,
        secondaryLanguage: form.secondaryLanguage,
        meetingPlatform: form.meetingPlatform,
      }));

      navigate('/login', { state: { registered: true } });
    } catch (err) {
      const data = err.response?.data;
      const msg =
        data?.email?.[0] || data?.username?.[0] || data?.password?.[0] || data?.detail || 'Registration failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-root">
      {/* Ambient orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="noise-overlay" />

      <div className="auth-container" style={{ maxWidth: '460px' }}>

        {/* Logo */}
        <div className="auth-logo-wrap">
          <div className="auth-logo-mark">
            <MicIcon />
          </div>
          <div className="auth-logo-text">
            <span className="auth-brand">MeetingIntel</span>
            <span className="auth-brand-sub">AI Intelligence Platform</span>
          </div>
        </div>

        {/* Card */}
        <div className="auth-card">
          <div className="auth-card-header" style={{ position: 'relative' }}>
            <h2 className="auth-title">
              {step === 1 && 'Create Account'}
              {step === 2 && 'Company Info'}
              {step === 3 && 'Preferences'}
            </h2>
            <p className="auth-subtitle">
              {step === 1 && 'Step 1 of 3: Basic Info'}
              {step === 2 && 'Step 2 of 3: Tell us about your company'}
              {step === 3 && 'Step 3 of 3: Language & Meeting Preferences'}
            </p>
            {/* Progress indicators */}
            <div className="step-indicators">
              <div className={`step-dot ${step >= 1 ? 'active' : ''}`} />
              <div className={`step-dot ${step >= 2 ? 'active' : ''}`} />
              <div className={`step-dot ${step >= 3 ? 'active' : ''}`} />
            </div>
          </div>

          <form onSubmit={step === 3 ? handleSubmit : handleNext} className="auth-form">
            
            {/* STEP 1: Basic Info */}
            {step === 1 && (
              <div className="step-content">
                <div className="auth-field">
                  <label className="auth-label">Full Name</label>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={update('fullName')}
                    placeholder="Muhammad Umer"
                    className="auth-input"
                    required
                  />
                </div>
                <div className="auth-field">
                  <label className="auth-label">Email address</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={update('email')}
                    placeholder="you@company.com"
                    className="auth-input"
                    required
                  />
                </div>
                <div className="auth-field">
                  <label className="auth-label">Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={update('password')}
                    placeholder="••••••••"
                    className="auth-input"
                    required
                  />
                </div>
                <div className="auth-field">
                  <label className="auth-label">Confirm Password</label>
                  <input
                    type="password"
                    value={form.passwordConfirm}
                    onChange={update('passwordConfirm')}
                    placeholder="••••••••"
                    className="auth-input"
                    required
                  />
                </div>
              </div>
            )}

            {/* STEP 2: Company Info */}
            {step === 2 && (
              <div className="step-content">
                <div className="auth-field">
                  <label className="auth-label">Company Name</label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={update('companyName')}
                    placeholder="TechCorp Pvt Ltd"
                    className="auth-input"
                    required
                  />
                </div>
                <div className="auth-field">
                  <label className="auth-label">Company Size</label>
                  <div className="auth-select-wrapper">
                    <select className="auth-input auth-select" value={form.companySize} onChange={update('companySize')}>
                      <option value="1-10">1-10</option>
                      <option value="11-50">11-50</option>
                      <option value="51-200">51-200</option>
                      <option value="200+">200+</option>
                    </select>
                    <ChevronIcon />
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label">Industry</label>
                  <div className="auth-select-wrapper">
                    <select className="auth-input auth-select" value={form.industry} onChange={update('industry')}>
                      <option value="Technology">Technology</option>
                      <option value="Finance">Finance</option>
                      <option value="Healthcare">Healthcare</option>
                      <option value="Education">Education</option>
                      <option value="Other">Other</option>
                    </select>
                    <ChevronIcon />
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label">Country</label>
                  <div className="auth-select-wrapper">
                    <select className="auth-input auth-select" value={form.country} onChange={update('country')}>
                      <option value="Pakistan">Pakistan</option>
                      <option value="United States">United States</option>
                      <option value="United Kingdom">United Kingdom</option>
                      <option value="India">India</option>
                      <option value="Other">Other</option>
                    </select>
                    <ChevronIcon />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Language & Preferences */}
            {step === 3 && (
              <div className="step-content">
                <div className="auth-field">
                  <label className="auth-label">Primary Language</label>
                  <div className="auth-select-wrapper">
                    <select className="auth-input auth-select" value={form.primaryLanguage} onChange={update('primaryLanguage')}>
                      <option value="Urdu">Urdu</option>
                      <option value="English">English</option>
                      <option value="Arabic">Arabic</option>
                      <option value="Spanish">Spanish</option>
                    </select>
                    <ChevronIcon />
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label">Secondary Language</label>
                  <div className="auth-select-wrapper">
                    <select className="auth-input auth-select" value={form.secondaryLanguage} onChange={update('secondaryLanguage')}>
                      <option value="English">English</option>
                      <option value="Urdu">Urdu</option>
                      <option value="Arabic">Arabic</option>
                      <option value="Spanish">Spanish</option>
                    </select>
                    <ChevronIcon />
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label">Meeting Platform</label>
                  <div className="auth-select-wrapper">
                    <select className="auth-input auth-select" value={form.meetingPlatform} onChange={update('meetingPlatform')}>
                      <option value="Google Meet">Google Meet</option>
                      <option value="Zoom">Zoom</option>
                      <option value="Microsoft Teams">Microsoft Teams</option>
                      <option value="All platforms">All platforms</option>
                    </select>
                    <ChevronIcon />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="auth-error">
                <ErrorIcon />
                {error}
              </div>
            )}

            <div className="auth-actions">
              {step > 1 && (
                <button type="button" onClick={handleBack} className="auth-btn-secondary">
                  Back
                </button>
              )}
              
              {step < 3 ? (
                <button type="submit" className="auth-submit" style={{ flex: 1 }}>
                  Next Step
                </button>
              ) : (
                <button type="submit" disabled={loading} className="auth-submit" style={{ flex: 1 }}>
                  {loading ? (
                    <>
                      <span className="auth-spinner" />
                      Creating account…
                    </>
                  ) : (
                    <>
                      <SignInIcon />
                      Complete Signup
                    </>
                  )}
                </button>
              )}
            </div>
          </form>

          <div className="auth-footer">
            <span>Already have an account?</span>
            <Link to="/login" className="auth-link">Sign in</Link>
          </div>
        </div>

        {/* Bottom tagline */}
        <p className="auth-tagline">
          Powered by Gemini AI · Real-time meeting intelligence
        </p>
      </div>

      <style>{`
        .auth-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-void);
          position: relative;
          overflow: hidden;
          padding: 24px;
          font-family: var(--font-body);
        }

        /* Orbs */
        .orb { position: fixed; border-radius: 50%; pointer-events: none; filter: blur(80px); z-index: 0; }
        .orb-1 { width: 500px; height: 500px; top: -150px; left: -150px; background: radial-gradient(circle, rgba(108,99,255,0.14) 0%, transparent 70%); }
        .orb-2 { width: 400px; height: 400px; bottom: -100px; right: -100px; background: radial-gradient(circle, rgba(0,200,150,0.08) 0%, transparent 70%); }
        .orb-3 { width: 300px; height: 300px; top: 50%; left: 55%; background: radial-gradient(circle, rgba(255,107,107,0.06) 0%, transparent 70%); }

        .noise-overlay {
          position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: 0.5;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.035'/%3E%3C/svg%3E");
        }

        /* Container */
        .auth-container {
          position: relative; z-index: 1;
          width: 100%;
          display: flex; flex-direction: column; align-items: center; gap: 28px;
          animation: fadeSlideUp 0.5s ease both;
        }

        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Logo */
        .auth-logo-wrap {
          display: flex; align-items: center; gap: 14px;
        }
        .auth-logo-mark {
          width: 48px; height: 48px; border-radius: 14px; flex-shrink: 0;
          background: linear-gradient(135deg, #6C63FF, #9B8FFF);
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          box-shadow: 0 0 0 1px rgba(108,99,255,0.4), 0 8px 28px rgba(108,99,255,0.3);
        }
        .auth-logo-text { display: flex; flex-direction: column; }
        .auth-brand {
          font-family: var(--font-display); font-size: 20px;
          font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; line-height: 1;
        }
        .auth-brand-sub {
          font-size: 11px; color: var(--text-muted);
          letter-spacing: 0.07em; text-transform: uppercase; margin-top: 3px;
        }

        /* Card */
        .auth-card {
          width: 100%;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 20px;
          padding: 32px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.4);
        }

        .auth-card-header { margin-bottom: 28px; }
        .auth-title {
          font-family: var(--font-display); font-size: 22px;
          font-weight: 700; color: var(--text-primary);
          letter-spacing: -0.02em; margin-bottom: 4px;
        }
        .auth-subtitle { font-size: 13px; color: var(--text-muted); }

        .step-indicators {
          position: absolute; right: 0; top: 0;
          display: flex; gap: 6px;
        }
        .step-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          transition: all 0.3s;
        }
        .step-dot.active {
          background: #6C63FF;
          border-color: #6C63FF;
          box-shadow: 0 0 8px rgba(108,99,255,0.5);
        }

        /* Form */
        .auth-form { display: flex; flex-direction: column; gap: 18px; }
        .step-content {
          display: flex; flex-direction: column; gap: 18px;
          animation: fade 0.3s ease;
        }
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }

        .auth-field { display: flex; flex-direction: column; gap: 7px; }

        .auth-label {
          font-size: 12px; font-weight: 500;
          color: var(--text-secondary); letter-spacing: 0.02em;
        }

        .auth-input {
          background: var(--bg-deep);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 11px 14px;
          color: var(--text-primary);
          font-size: 14px; font-family: var(--font-body);
          width: 100%; outline: none;
          transition: all 0.2s;
        }
        .auth-input::placeholder { color: var(--text-muted); }
        .auth-input:focus {
          border-color: rgba(108,99,255,0.5);
          box-shadow: 0 0 0 3px rgba(108,99,255,0.1);
          background: var(--bg-surface);
        }

        .auth-select-wrapper {
          position: relative;
        }
        .auth-select {
          appearance: none; cursor: pointer;
        }
        .auth-select-wrapper svg {
          position: absolute; right: 14px; top: 50%;
          transform: translateY(-50%);
          pointer-events: none; color: var(--text-muted);
        }

        /* Error */
        .auth-error {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; color: #FF6B6B;
          background: rgba(255,107,107,0.08);
          border: 1px solid rgba(255,107,107,0.2);
          border-radius: var(--radius-md); padding: 10px 14px;
        }

        /* Actions */
        .auth-actions {
          display: flex; gap: 12px; margin-top: 4px;
        }

        .auth-btn-secondary {
          padding: 12px 20px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md); color: var(--text-primary);
          font-family: var(--font-body); font-size: 14px; font-weight: 500;
          cursor: pointer; transition: all 0.2s;
        }
        .auth-btn-secondary:hover {
          background: rgba(255,255,255,0.05);
        }

        /* Submit */
        .auth-submit {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 12px;
          background: linear-gradient(135deg, #6C63FF, #9B8FFF);
          border: none; border-radius: var(--radius-md); color: #fff;
          font-family: var(--font-body); font-size: 14px; font-weight: 500;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(108,99,255,0.35);
          transition: all 0.2s;
        }
        .auth-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(108,99,255,0.45);
        }
        .auth-submit:disabled { opacity: 0.6; cursor: not-allowed; }

        /* Spinner */
        .auth-spinner {
          width: 14px; height: 14px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Footer */
        .auth-footer {
          display: flex; align-items: center; justify-content: center;
          gap: 6px; margin-top: 24px;
          font-size: 13px; color: var(--text-muted);
          padding-top: 20px;
          border-top: 1px solid var(--border-subtle);
        }
        .auth-link {
          color: #9B8FFF; font-weight: 500; text-decoration: none;
          transition: color 0.2s;
        }
        .auth-link:hover { color: #6C63FF; }

        /* Tagline */
        .auth-tagline {
          font-size: 11px; color: var(--text-muted);
          letter-spacing: 0.04em; text-align: center;
        }
      `}</style>
    </div>
  );
}

/* ── Icons ── */
function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M5 10a7 7 0 0014 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M12 17v4M8 21h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
function SignInIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4Zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10Z" fill="currentColor"/>
    </svg>
  );
}
function ErrorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{flexShrink:0}}>
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M8 5v3M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  );
}
