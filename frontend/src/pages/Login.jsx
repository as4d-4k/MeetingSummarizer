import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { teamLogin, teamForgotKey } from '../api/client';

export default function Login() {
  const [mode, setMode] = useState('admin'); // 'admin' | 'team' | 'forgot'
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [teamKey, setTeamKey]   = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [loading, setLoading]   = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid credentials.');
    } finally { setLoading(false); }
  };

  const handleTeamSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { data } = await teamLogin(teamKey);
      // Store profile in sessionStorage and navigate
      sessionStorage.setItem('team_profile', JSON.stringify(data));
      sessionStorage.setItem('team_key', teamKey);
      navigate('/team-profile');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid key.');
    } finally { setLoading(false); }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(''); setLoading(true);
    try {
      const { data } = await teamForgotKey(forgotEmail);
      setSuccess(data.message);
      setTimeout(() => { setMode('team'); setSuccess(''); }, 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Email not found.');
    } finally { setLoading(false); }
  };

  const switchMode = (m) => { setMode(m); setError(''); setSuccess(''); };

  return (
    <div className="auth-root">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="noise-overlay" />

      <div className="auth-container">
        {/* Logo */}
        <div className="auth-logo-wrap">
          <div className="auth-logo-mark"><MicIcon /></div>
          <div className="auth-logo-text">
            <span className="auth-brand">MeetingIntel</span>
            <span className="auth-brand-sub">AI Intelligence Platform</span>
          </div>
        </div>

        {/* Card */}
        <div className="auth-card">
          {/* Mode Toggle */}
          <div className="auth-toggle">
            <button className={`auth-toggle-btn ${mode === 'admin' ? 'active' : ''}`} onClick={() => switchMode('admin')}>
              <AdminIcon /> Admin
            </button>
            <button className={`auth-toggle-btn ${mode === 'team' || mode === 'forgot' ? 'active' : ''}`} onClick={() => switchMode('team')}>
              <TeamIcon /> Team
            </button>
          </div>

          {/* ── ADMIN LOGIN ── */}
          {mode === 'admin' && (
            <>
              <div className="auth-card-header">
                <h2 className="auth-title">Admin Login</h2>
                <p className="auth-subtitle">Sign in to your workspace</p>
              </div>
              <form onSubmit={handleAdminSubmit} className="auth-form">
                <div className="auth-field">
                  <label className="auth-label">Email address</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com" className="auth-input" required />
                </div>
                <div className="auth-field">
                  <label className="auth-label">Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" className="auth-input" required />
                </div>
                {error && <div className="auth-error"><ErrorIcon />{error}</div>}
                <button type="submit" disabled={loading} className="auth-submit">
                  {loading ? <><span className="auth-spinner" />Signing in…</> : <><SignInIcon />Sign In</>}
                </button>
              </form>
              <div className="auth-footer">
                <span>Don't have an account?</span>
                <Link to="/register" className="auth-link">Create one</Link>
              </div>
            </>
          )}

          {/* ── TEAM LOGIN ── */}
          {mode === 'team' && (
            <>
              <div className="auth-card-header">
                <h2 className="auth-title">Team Login</h2>
                <p className="auth-subtitle">Enter your unique key to view your profile</p>
              </div>
              <form onSubmit={handleTeamSubmit} className="auth-form">
                <div className="auth-field">
                  <label className="auth-label">Your Key</label>
                  <input type="text" value={teamKey} onChange={e => setTeamKey(e.target.value)}
                    placeholder="Enter your 14-character key" className="auth-input auth-input-key"
                    maxLength={14} required autoFocus autoComplete="off" spellCheck="false" />
                  <span className="auth-hint">Your key was provided by the admin or sent to your email</span>
                </div>
                {error && <div className="auth-error"><ErrorIcon />{error}</div>}
                <button type="submit" disabled={loading || teamKey.length < 1} className="auth-submit auth-submit-team">
                  {loading ? <><span className="auth-spinner" />Verifying…</> : <><KeyIcon />View My Profile</>}
                </button>
              </form>
              <div className="auth-footer">
                <span>Forgot your key?</span>
                <button className="auth-link" style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                  onClick={() => switchMode('forgot')}>Reset via Email</button>
              </div>
            </>
          )}

          {/* ── FORGOT KEY ── */}
          {mode === 'forgot' && (
            <>
              <div className="auth-card-header">
                <h2 className="auth-title">Reset Your Key</h2>
                <p className="auth-subtitle">Enter your email to receive a new login key</p>
              </div>
              <form onSubmit={handleForgotSubmit} className="auth-form">
                <div className="auth-field">
                  <label className="auth-label">Email Address</label>
                  <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                    placeholder="john@company.com" className="auth-input" required autoFocus />
                  <span className="auth-hint">The email registered in the team directory</span>
                </div>
                {error && <div className="auth-error"><ErrorIcon />{error}</div>}
                {success && <div className="auth-success"><SuccessIcon />{success}</div>}
                <button type="submit" disabled={loading} className="auth-submit" style={{ background: 'linear-gradient(135deg, #00C896, #33E2B5)' }}>
                  {loading ? <><span className="auth-spinner" />Sending…</> : <><MailIcon />Send New Key</>}
                </button>
              </form>
              <div className="auth-footer">
                <button className="auth-link" style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                  onClick={() => switchMode('team')}>← Back to Team Login</button>
              </div>
            </>
          )}
        </div>

        <p className="auth-tagline">Powered by Gemini AI · Real-time meeting intelligence</p>
      </div>

      <style>{`
        .auth-root {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          background: var(--bg-void); position: relative; overflow: hidden;
          padding: 24px; font-family: var(--font-body);
        }
        .orb { position: fixed; border-radius: 50%; pointer-events: none; filter: blur(80px); z-index: 0; }
        .orb-1 { width: 500px; height: 500px; top: -150px; left: -150px; background: radial-gradient(circle, rgba(108,99,255,0.14) 0%, transparent 70%); }
        .orb-2 { width: 400px; height: 400px; bottom: -100px; right: -100px; background: radial-gradient(circle, rgba(0,200,150,0.08) 0%, transparent 70%); }
        .orb-3 { width: 300px; height: 300px; top: 50%; left: 55%; background: radial-gradient(circle, rgba(255,107,107,0.06) 0%, transparent 70%); }
        .noise-overlay {
          position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: 0.5;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.035'/%3E%3C/svg%3E");
        }
        .auth-container {
          position: relative; z-index: 1; width: 100%; max-width: 420px;
          display: flex; flex-direction: column; align-items: center; gap: 28px;
          animation: fadeSlideUp 0.5s ease both;
        }
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

        .auth-logo-wrap { display: flex; align-items: center; gap: 14px; }
        .auth-logo-mark {
          width: 48px; height: 48px; border-radius: 14px; flex-shrink: 0;
          background: linear-gradient(135deg, #6C63FF, #9B8FFF);
          display: flex; align-items: center; justify-content: center; color: #fff;
          box-shadow: 0 0 0 1px rgba(108,99,255,0.4), 0 8px 28px rgba(108,99,255,0.3);
        }
        .auth-logo-text { display: flex; flex-direction: column; }
        .auth-brand { font-family: var(--font-display); font-size: 20px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; line-height: 1; }
        .auth-brand-sub { font-size: 11px; color: var(--text-muted); letter-spacing: 0.07em; text-transform: uppercase; margin-top: 3px; }

        .auth-card {
          width: 100%; background: var(--bg-card); border: 1px solid var(--border-subtle);
          border-radius: 20px; padding: 32px; box-shadow: 0 24px 64px rgba(0,0,0,0.4);
        }

        /* ── Mode Toggle ── */
        .auth-toggle {
          display: flex; gap: 0; margin-bottom: 24px; border-radius: 12px; overflow: hidden;
          border: 1px solid var(--border-subtle); background: var(--bg-deep);
        }
        .auth-toggle-btn {
          flex: 1; padding: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;
          font-size: 13px; font-weight: 600; font-family: var(--font-body);
          color: var(--text-muted); background: transparent; border: none; cursor: pointer;
          transition: all 0.3s;
        }
        .auth-toggle-btn.active {
          color: #fff; background: linear-gradient(135deg, #6C63FF, #9B8FFF);
          box-shadow: 0 4px 16px rgba(108,99,255,0.3);
        }
        .auth-toggle-btn:not(.active):hover { color: var(--text-secondary); background: rgba(108,99,255,0.06); }

        .auth-card-header { margin-bottom: 24px; }
        .auth-title { font-family: var(--font-display); font-size: 22px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.02em; margin-bottom: 4px; }
        .auth-subtitle { font-size: 13px; color: var(--text-muted); }

        .auth-form { display: flex; flex-direction: column; gap: 18px; }
        .auth-field { display: flex; flex-direction: column; gap: 7px; }
        .auth-label { font-size: 12px; font-weight: 500; color: var(--text-secondary); letter-spacing: 0.02em; }
        .auth-input {
          background: var(--bg-deep); border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md); padding: 11px 14px;
          color: var(--text-primary); font-size: 14px; font-family: var(--font-body);
          width: 100%; outline: none; transition: all 0.2s;
        }
        .auth-input::placeholder { color: var(--text-muted); }
        .auth-input:focus { border-color: rgba(108,99,255,0.5); box-shadow: 0 0 0 3px rgba(108,99,255,0.1); background: var(--bg-surface); }

        .auth-input-key {
          font-size: 18px; font-weight: 700; letter-spacing: 0.15em; text-align: center;
          font-family: var(--font-display); text-transform: none;
        }

        .auth-hint { font-size: 11px; color: var(--text-muted); }

        .auth-error {
          display: flex; align-items: center; gap: 8px; font-size: 13px; color: #FF6B6B;
          background: rgba(255,107,107,0.08); border: 1px solid rgba(255,107,107,0.2);
          border-radius: var(--radius-md); padding: 10px 14px;
        }
        .auth-success {
          display: flex; align-items: center; gap: 8px; font-size: 13px; color: #00C896;
          background: rgba(0,200,150,0.08); border: 1px solid rgba(0,200,150,0.2);
          border-radius: var(--radius-md); padding: 10px 14px;
        }

        .auth-submit {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; padding: 12px;
          background: linear-gradient(135deg, #6C63FF, #9B8FFF);
          border: none; border-radius: var(--radius-md); color: #fff;
          font-family: var(--font-body); font-size: 14px; font-weight: 500;
          cursor: pointer; margin-top: 4px;
          box-shadow: 0 4px 20px rgba(108,99,255,0.35); transition: all 0.2s;
        }
        .auth-submit-team { background: linear-gradient(135deg, #00C896, #33E2B5); box-shadow: 0 4px 20px rgba(0,200,150,0.35); }
        .auth-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 28px rgba(108,99,255,0.45); }
        .auth-submit:disabled { opacity: 0.6; cursor: not-allowed; }

        .auth-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .auth-footer {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          margin-top: 24px; font-size: 13px; color: var(--text-muted);
          padding-top: 20px; border-top: 1px solid var(--border-subtle);
        }
        .auth-link { color: #9B8FFF; font-weight: 500; text-decoration: none; transition: color 0.2s; font-size: 13px; }
        .auth-link:hover { color: #6C63FF; }

        .auth-tagline { font-size: 11px; color: var(--text-muted); letter-spacing: 0.04em; text-align: center; }
      `}</style>
    </div>
  );
}

/* ── Icons ── */
function MicIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8"/><path d="M5 10a7 7 0 0014 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M12 17v4M8 21h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function SignInIcon() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M6 3H3a1 1 0 00-1 1v8a1 1 0 001 1h3M10 5l3 3-3 3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function ErrorIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{flexShrink:0}}><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3"/><path d="M8 5v3M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>; }
function SuccessIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{flexShrink:0}}><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3"/><path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function AdminIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2a3 3 0 100 6 3 3 0 000-6zM3 14a5 5 0 0110 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>; }
function TeamIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 7a2 2 0 100-4 2 2 0 000 4zM2 14a4 4 0 018 0M10 3a2 2 0 110 4M14 14a4 4 0 00-4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>; }
function KeyIcon() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M10 1l2 2-5 5a3 3 0 11-2-2l5-5zM8 3l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function MailIcon() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M2 5l6 4 6-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>; }