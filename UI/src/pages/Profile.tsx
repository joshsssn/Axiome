import { useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  User, Building2, Camera, Check, Shield,
  Upload
} from 'lucide-react';

export function Profile() {
  const { currentUser, updateUser } = useAuth();

  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [organization, setOrganization] = useState(currentUser?.organization || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || '');

  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = displayName
    ? displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2 MB'); return; }
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setAvatarUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    if (!currentUser) return;
    await updateUser(currentUser.id, {
      displayName: displayName.trim() || 'User',
      organization: organization.trim(),
      avatarUrl: avatarUrl.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Profile Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Manage your personal information and preferences</p>
      </div>

      {/* Avatar & Identity */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="relative group">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="w-24 h-24 rounded-2xl object-cover border-2 border-slate-700"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold border-2 border-slate-700">
                {initials}
              </div>
            )}
            <div className="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
              onClick={() => fileInputRef.current?.click()}>
              <Camera className="w-6 h-6 text-white" />
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>

          <div className="flex-1 space-y-1">
            <h2 className="text-lg font-semibold text-white">{currentUser?.displayName || 'User'}</h2>
            {currentUser?.organization && (
              <p className="text-sm text-slate-400 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                {currentUser.organization}
              </p>
            )}
            <span className="inline-flex items-center gap-1 mt-2 text-xs px-2.5 py-1 rounded-full font-medium bg-blue-500/10 text-blue-400">
              <Shield className="w-3 h-3" />
              Local User
            </span>
          </div>
        </div>

        {/* Avatar URL input */}
        <div className="mt-5 pt-5 border-t border-slate-700/50">
          <label className="text-xs text-slate-400 block mb-1.5 font-medium">
            <Camera className="w-3 h-3 inline mr-1" />
            Avatar URL
          </label>
          <input
            type="url"
            placeholder="https://example.com/your-photo.jpg"
            value={avatarUrl}
            onChange={e => setAvatarUrl(e.target.value)}
            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder:text-slate-600"
          />
          <p className="text-[10px] text-slate-600 mt-1">Paste any public image URL. Leave empty to use initials.</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 flex items-center gap-2 px-3 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors border border-slate-600/50"
          >
            <Upload className="w-3.5 h-3.5" /> Upload Image
          </button>
        </div>
      </div>

      {/* Personal Info */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-blue-400" />
          Personal Information
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5 font-medium">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your full name"
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder:text-slate-600"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5 font-medium">Organization</label>
            <input
              type="text"
              value={organization}
              onChange={e => setOrganization(e.target.value)}
              placeholder="Your company or fund name"
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder:text-slate-600"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5 pt-5 border-t border-slate-700/50">
          <button
            onClick={handleSaveProfile}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saved ? <Check className="w-4 h-4" /> : <User className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
          {saved && <span className="text-xs text-emerald-400">Profile updated successfully</span>}
        </div>
      </div>

    </div>
  );
}
