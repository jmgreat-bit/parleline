import React, { useState } from 'react';
import {
  User,
  Lock,
  Smartphone,
  CheckCircle2,
  X,
  History,
  Clock,
  Sparkles,
  Database,
  LogOut,
  QrCode,
} from 'lucide-react';
import { CallRecord, UserProfile } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  currentUser: UserProfile | null;
  callLogs: CallRecord[];
  onClose: () => void;
  onLoginSuccess: (user: UserProfile, token: string, data: any) => void;
  onLogout: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  currentUser,
  callLogs,
  onClose,
  onLoginSuccess,
  onLogout,
}) => {
  const [tab, setTab] = useState<'login' | 'register' | 'phone' | 'history'>(
    currentUser ? 'history' : 'login'
  );
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any = {};
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text || `Server error (${res.status})`);
      }

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      localStorage.setItem('parleline_auth_token', data.token);
      onLoginSuccess(data.user, data.token, data.data);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || username, username, password }),
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any = {};
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(text || `Server error (${res.status})`);
      }

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      localStorage.setItem('parleline_auth_token', data.token);
      onLoginSuccess(data.user, data.token, data.data);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-[#181614] border border-white/15 rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl text-[#EDE8DF]">
        {/* Header Tabs */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-1.5 p-1 bg-white/5 rounded-xl border border-white/10 text-xs">
            {!currentUser ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setTab('login');
                    setErrorMsg(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                    tab === 'login'
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-[#9E978C] hover:text-white'
                  }`}
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('register');
                    setErrorMsg(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                    tab === 'register'
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-[#9E978C] hover:text-white'
                  }`}
                >
                  Create Account
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setTab('history')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    tab === 'history'
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-[#9E978C] hover:text-white'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  Call Logs ({callLogs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTab('phone')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    tab === 'phone'
                      ? 'bg-emerald-600 text-white font-semibold'
                      : 'text-[#9E978C] hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  Phone Sync
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#9E978C] hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex-1 overflow-y-auto">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          {/* TAB 1: LOG IN */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <h3 className="text-lg font-serif font-bold text-white">Log in to ParleLine</h3>
                <p className="text-xs text-[#9E978C] mt-0.5">
                  Access your language workspaces, call history, and memory records.
                </p>
              </div>

              <div>
                <label className="text-xs text-[#A39C8E] block mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. james"
                  className="w-full bg-[#1F1D1A] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-[#A39C8E] block mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#1F1D1A] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-lg shadow-emerald-950/50 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Signing in...' : 'Log In & Load Workspaces'}
              </button>

              <div className="pt-2 text-center text-xs text-[#9E978C]">
                Don't have an account yet?{' '}
                <button
                  type="button"
                  onClick={() => setTab('register')}
                  className="text-emerald-400 hover:underline cursor-pointer"
                >
                  Create one now
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: REGISTER */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <h3 className="text-lg font-serif font-bold text-white">Create ParleLine Account</h3>
                <p className="text-xs text-[#9E978C] mt-0.5">
                  Save your calls, learned vocabulary, and practice history permanently in the database.
                </p>
              </div>

              <div>
                <label className="text-xs text-[#A39C8E] block mb-1">Your Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. James"
                  className="w-full bg-[#1F1D1A] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-[#A39C8E] block mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. james"
                  className="w-full bg-[#1F1D1A] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-[#A39C8E] block mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#1F1D1A] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-lg shadow-emerald-950/50 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Creating account...' : 'Create Account & Sync to Database'}
              </button>

              <div className="pt-2 text-center text-xs text-[#9E978C]">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setTab('login')}
                  className="text-emerald-400 hover:underline cursor-pointer"
                >
                  Log in here
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: PHONE & MOBILE ACCESS */}
          {tab === 'phone' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-700/50">
                <Smartphone className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-white">Open on Your Phone</h4>
                  <p className="text-xs text-emerald-200/80 mt-0.5">
                    Connect your phone to the same Wi-Fi network and open this URL in your mobile browser:
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#100F0E] border border-white/10 text-center space-y-2">
                <span className="text-[11px] text-[#A39C8E] block uppercase tracking-wider">
                  Mobile Browser URL:
                </span>
                <p className="font-mono text-base font-bold text-emerald-400 select-all py-1">
                  http://172.31.32.163:3000
                </p>
                <p className="text-[11px] text-[#8F887B]">
                  Type this URL into Safari or Chrome on your phone to call and chat hands-free!
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2 text-xs">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>Cloud Database &amp; Synchronization</span>
                </span>
                <p className="text-[#A39C8E] leading-relaxed">
                  All your language workspaces (French, Swahili, Spanish, Mandarin), your past call durations, and mastered phrases are stored in your persistent server database (`data/`).
                </p>
                <p className="text-[#A39C8E] leading-relaxed">
                  If you want to plug in an external <strong>Supabase</strong> or <strong>Firebase</strong> project, simply provide your project URL and API key in `.env`.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: CALL LOGS & SESSION RECORDS */}
          {tab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div>
                  <h3 className="text-base font-serif font-bold text-white">Call Session Records</h3>
                  <p className="text-xs text-[#9E978C]">
                    Every phone call duration, topic, and mastered phrase is logged for AI continuity.
                  </p>
                </div>
                {currentUser && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="px-2.5 py-1 text-xs text-rose-400 hover:text-white rounded-lg hover:bg-rose-950/40 border border-rose-800/40 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                )}
              </div>

              {callLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#8F887B]">
                  No phone calls recorded yet. Click the green "Call Camille" button to start your first live phone conversation!
                </div>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {callLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white flex items-center gap-1.5">
                          <span>📞 {log.companionName}</span>
                          <span className="text-[#8F887B] font-normal">· Stage {log.stageAtCall}</span>
                        </span>
                        <span className="font-mono text-emerald-400 font-medium">
                          {formatDuration(log.durationSeconds)}
                        </span>
                      </div>

                      <p className="text-[#D1C9BA] leading-relaxed">
                        {log.summary}
                      </p>

                      {log.phrasesMastered?.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {log.phrasesMastered.map((p, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-emerald-950/60 text-emerald-300 border border-emerald-700/50 rounded-md text-[10px]"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="text-[10px] text-[#7A7367] pt-1 border-t border-white/5">
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
