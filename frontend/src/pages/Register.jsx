import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [form, setForm] = useState({ email: '', username: '', password: '', passwordConfirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.passwordConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await register(form.email, form.username, form.password, form.passwordConfirm);
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
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface-900)] px-4 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[var(--color-accent-end)] opacity-[0.04] blur-[120px]" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] rounded-full bg-[var(--color-cyan-glow)] opacity-[0.03] blur-[120px]" />

      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--color-accent-start)] to-[var(--color-accent-end)] flex items-center justify-center mb-4 shadow-xl shadow-indigo-500/20">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Create Account</h1>
          <p className="text-[var(--color-surface-500)] text-sm mt-1">Start summarizing your meetings</p>
        </div>

        {/* Form */}
        <div className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">Username</label>
              <input type="text" value={form.username} onChange={update('username')} placeholder="johndoe" className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">Password</label>
              <input type="password" value={form.password} onChange={update('password')} placeholder="••••••••" className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#94a3b8] mb-1.5">Confirm Password</label>
              <input type="password" value={form.passwordConfirm} onChange={update('passwordConfirm')} placeholder="••••••••" className="input-field" required />
            </div>

            {error && (
              <div className="text-[var(--color-danger)] text-sm bg-[rgba(248,113,113,0.1)] px-4 py-2.5 rounded-xl border border-[rgba(248,113,113,0.2)]">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-accent w-full mt-2">
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-[var(--color-surface-500)] mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-[var(--color-accent-start)] hover:text-[var(--color-accent-end)] font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
