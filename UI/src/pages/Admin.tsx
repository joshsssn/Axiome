import { useState, useEffect, useCallback } from 'react';
import { type User } from '@/data/mockData';
import { api } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { UserPlus, Shield, User as UserIcon, Search, Trash2, Check, X } from 'lucide-react';

export function Admin() {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [userList, setUserList] = useState<User[]>([]);
  const [newUser, setNewUser] = useState({ username: '', email: '', role: 'user', password: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const { user: authUser } = useAuth();

  // Fetch real users
  const fetchUsers = useCallback(async () => {
    try {
      const data = await api.users.list();
      const mapped: User[] = (data ?? []).map((u: any) => ({
        id: u.id,
        username: u.username,
        email: u.email ?? '',
        role: (u.role === 'admin' ? 'admin' : 'user') as 'admin' | 'user',
        status: u.is_active !== false ? 'active' as const : 'inactive' as const,
        lastLogin: '',
        portfolioCount: 0,
      }));
      if (mapped.length > 0) setUserList(mapped);
    } catch {
      // Fallback to mock
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.email || !newUser.password) return;
    try {
      await api.users.create({
        username: newUser.username,
        email: newUser.email,
        password: newUser.password,
        role: newUser.role,
      });
      setShowModal(false);
      setNewUser({ username: '', email: '', role: 'user', password: '' });
      fetchUsers();
    } catch (e) {
      console.error('Create user failed', e);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    try {
      await api.users.delete(userId);
      setDeleteConfirm(null);
      fetchUsers();
    } catch (e) {
      console.error('Delete user failed', e);
    }
  };

  const filtered = userList.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-slate-400 text-sm mt-1">Administrator panel — manage accounts and permissions</p>
        </div>
        <button onClick={() => setShowModal(!showModal)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <UserPlus className="w-4 h-4" /> Add User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Users" value={userList.length.toString()} sub="accounts" />
        <StatCard label="Active" value={userList.filter(u => u.status === 'active').length.toString()} sub="online capable" />
        <StatCard label="Admins" value={userList.filter(u => u.role === 'admin').length.toString()} sub="full access" />
        <StatCard label="Portfolios" value={userList.reduce((s, u) => s + u.portfolioCount, 0).toString()} sub="total managed" />
      </div>

      {/* Users Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
        <div className="p-4 border-b border-slate-700/50 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500" />
          </div>
          <span className="text-xs text-slate-500">{filtered.length} users</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                {['User', 'Email', 'Role', 'Status', 'Last Login', 'Portfolios', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${u.role === 'admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {u.username[0].toUpperCase()}
                      </div>
                      <span className="font-medium text-white">{u.username}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${u.role === 'admin' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                      {u.role === 'admin' ? <Shield className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${u.status === 'active' ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${u.status === 'active' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs font-mono">{u.lastLogin}</td>
                  <td className="px-4 py-3 text-slate-300 font-mono">{u.portfolioCount}</td>
                  <td className="px-4 py-3">
                    {u.id !== authUser?.id ? (
                      deleteConfirm === u.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                            title="Confirm delete"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="p-1.5 rounded-lg bg-slate-700/50 text-slate-400 hover:bg-slate-700 transition-colors"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(u.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                          title="Delete user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )
                    ) : (
                      <span className="text-[10px] text-slate-600">You</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-white mb-4">Create New User</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Username</label>
                <input type="text" placeholder="e.g. jdoe" value={newUser.username}
                  onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Email</label>
                <input type="email" placeholder="e.g. john@example.com" value={newUser.email}
                  onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Role</label>
                <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:border-blue-500">
                  <option value="user">Standard User</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Initial Password</label>
                <input type="password" placeholder="Min 8 characters" value={newUser.password}
                  onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:border-blue-500" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-700 transition-colors">
                  Cancel
                </button>
                <button onClick={handleCreateUser}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
                  Create User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}
