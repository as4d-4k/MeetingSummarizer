import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid credentials.');
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

      <div className="auth-container">

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
          <div className="auth-card-header">
            <h2 className="auth-title">Welcome back</h2>
            <p className="auth-subtitle">Sign in to your workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="auth-input"
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="auth-input"
                required
              />
            </div>

            {error && (
              <div className="auth-error">
                <ErrorIcon />
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? (
                <>
                  <span className="auth-spinner" />
                  Signing in…
                </>
              ) : (
                <>
                  <SignInIcon />
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="auth-footer">
            <span>Don't have an account?</span>
            <Link to="/register" className="auth-link">Create one</Link>
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
          width: 100%; max-width: 400px;
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

        /* Form */
        .auth-form { display: flex; flex-direction: column; gap: 18px; }

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

        /* Error */
        .auth-error {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; color: #FF6B6B;
          background: rgba(255,107,107,0.08);
          border: 1px solid rgba(255,107,107,0.2);
          border-radius: var(--radius-md); padding: 10px 14px;
        }

        /* Submit */
        .auth-submit {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; padding: 12px;
          background: linear-gradient(135deg, #6C63FF, #9B8FFF);
          border: none; border-radius: var(--radius-md); color: #fff;
          font-family: var(--font-body); font-size: 14px; font-weight: 500;
          cursor: pointer; margin-top: 4px;
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
      <path d="M6 3H3a1 1 0 00-1 1v8a1 1 0 001 1h3M10 5l3 3-3 3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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