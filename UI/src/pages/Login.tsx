import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';
import axiomeLogo from '@/img/axiome-logo.png';

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [shaking, setShaking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const ok = await login(username, password);
    if (!ok) {
      setError('Invalid username or password');
      setShaking(true);
      setTimeout(() => setShaking(false), 600);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-600/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/[0.02] rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <img src={axiomeLogo} alt="Axiome" className="w-64 h-auto mx-auto mb-4" />
          <p className="text-sm text-slate-500 mt-1">Multi-Asset Analytics Platform</p>
        </div>

        {/* Login Card */}
        <div
          className={`bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl ${
            shaking ? 'animate-[shake_0.5s_ease-in-out]' : ''
          }`}
        >
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white">Sign in</h2>
            <p className="text-sm text-slate-500 mt-1">Enter your credentials to access the platform</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(''); }}
                placeholder="Enter your username"
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-white px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder:text-slate-600 transition-all"
                autoFocus
                autoComplete="username"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter your password"
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl text-sm text-white px-4 py-3 pr-11 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder:text-slate-600 transition-all"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!username || !password}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30"
            >
              Sign In <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Demo credentials */}
        <div className="mt-6 bg-slate-900/40 border border-slate-800/50 rounded-xl p-4">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Demo Credentials</div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setUsername('admin'); setPassword('admin'); setError(''); }}
              className="flex flex-col items-start p-3 rounded-lg bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/50 hover:border-slate-600 transition-all cursor-pointer"
            >
              <span className="text-xs font-medium text-amber-400">Administrator</span>
              <span className="text-[11px] text-slate-500 mt-0.5 font-mono">admin / admin</span>
            </button>
            <button
              onClick={() => { setUsername('user'); setPassword('user'); setError(''); }}
              className="flex flex-col items-start p-3 rounded-lg bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/50 hover:border-slate-600 transition-all cursor-pointer"
            >
              <span className="text-xs font-medium text-blue-400">Standard User</span>
              <span className="text-[11px] text-slate-500 mt-0.5 font-mono">user / user</span>
            </button>
          </div>
        </div>
      </div>

      {/* Shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 50%, 90% { transform: translateX(-6px); }
          30%, 70% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
