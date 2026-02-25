import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Plus, Trash2, User } from 'lucide-react';
import axiomeLogo from '@/img/axiome-logo.png';

export function UserPicker() {
  const { users, selectUser, createUser, deleteUser, isLoading } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newOrg, setNewOrg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createUser({ displayName: newName.trim(), organization: newOrg.trim() });
    setNewName('');
    setNewOrg('');
    setShowCreate(false);
  };

  const handleDelete = async (userId: number) => {
    setDeleteError(null);
    try {
      await deleteUser(userId);
      setConfirmDelete(null);
    } catch (e: any) {
      setDeleteError(e?.message || 'Failed to delete profile');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <img src={axiomeLogo} alt="Axiome" className="h-16 mb-2 object-contain" />
      <p className="text-slate-400 text-sm mb-10">Select your profile to continue</p>

      {/* User Grid */}
      <div className="flex flex-wrap items-center justify-center gap-6 max-w-3xl">
        {users.map(user => (
          <div
            key={user.id}
            className="relative group"
          >
            <button
              onClick={() => selectUser(user.id)}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-slate-800/50 border border-slate-700/50 hover:border-blue-500/50 hover:bg-slate-800 transition-all w-40"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-slate-700"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold border-2 border-slate-700">
                  {user.displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                </div>
              )}
              <div className="text-center">
                <div className="text-sm font-semibold text-white truncate max-w-[120px]">{user.displayName}</div>
                {user.organization && (
                  <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{user.organization}</div>
                )}
              </div>
            </button>
            {/* Delete button (on hover) */}
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(user.id); }}
              className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete user"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {/* Add user button */}
        <button
          onClick={() => setShowCreate(true)}
          className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-dashed border-slate-700 hover:border-blue-500/50 transition-all w-40"
        >
          <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center border-2 border-slate-700">
            <Plus className="w-8 h-8 text-slate-500" />
          </div>
          <div className="text-sm font-medium text-slate-400">Add Profile</div>
        </button>
      </div>

      {/* Create user modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <User className="w-5 h-5 text-blue-400" />
              New Profile
            </h2>
            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">Name *</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Your name"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder:text-slate-600"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1.5 font-medium">Organization</label>
              <input
                type="text"
                value={newOrg}
                onChange={e => setNewOrg(e.target.value)}
                placeholder="Company or fund (optional)"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder:text-slate-600"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 px-4 py-2.5 border border-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setConfirmDelete(null)}>
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-white">Delete Profile?</h2>
            <p className="text-sm text-slate-400">
              This will permanently delete <span className="text-white font-medium">{users.find(u => u.id === confirmDelete)?.displayName}</span> and all their portfolios. This cannot be undone.
            </p>
            {deleteError && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{deleteError}</p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2.5 border border-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
