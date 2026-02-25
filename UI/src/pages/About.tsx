import { Heart, Github, Mail } from 'lucide-react';
import { open } from '@tauri-apps/api/shell';

const openExternal = (url: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  open(url).catch(() => window.open(url, '_blank'));
};

export function About() {
  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header Section */}
        <div className="mb-12 text-center">
          <div className="mb-6">
            <img 
              src="/src/img/axiome-logo.png" 
              alt="Axiome Logo" 
              className="h-20 mx-auto mb-4"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">About Axiome</h1>
          <p className="text-xl text-slate-400 mb-8">
            Advanced Portfolio Management, Analytics & Optimization Platform
          </p>
        </div>

        {/* Creator Section */}
        <div className="bg-gradient-to-r from-blue-600/10 to-indigo-600/10 border border-blue-600/20 rounded-xl p-8 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Heart className="w-6 h-6 text-red-500" />
            <h2 className="text-2xl font-bold text-white">Built by Josh E. SOUSSAN</h2>
          </div>
          <p className="text-slate-300 mb-6">
            Axiome combines advanced portfolio analytics with modern web technologies to empower investors 
            with data-driven insights and powerful optimization tools.
          </p>
          <div className="flex gap-4">
            <a
              href="https://github.com/joshsssn"
              onClick={openExternal('https://github.com/joshsssn')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors cursor-pointer"
            >
              <Github className="w-4 h-4" />
              GitHub
            </a>
            <a
              href="mailto:josh.soussan.candidatures@gmail.com"
              onClick={openExternal('mailto:josh.soussan.candidatures@gmail.com')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors cursor-pointer"
              title="Click to email josh.soussan.candidatures@gmail.com"
            >
              <Mail className="w-4 h-4" />
              Contact
            </a>
          </div>
        </div>

        {/* License Section */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-8">
          <h3 className="text-xl font-bold text-white mb-4">📄 License</h3>
          <p className="text-slate-300 mb-4">
            Axiome and its entire codebase is licensed under the <strong>Apache License 2.0</strong>.
          </p>
          <div className="bg-slate-800/50 p-4 rounded-lg text-slate-300 text-sm space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-green-400">✅</span>
              <span>Commercial use allowed</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-400">✅</span>
              <span>Modification allowed</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-400">✅</span>
              <span>Distribution allowed</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-400">✅</span>
              <span>Private use allowed</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">⚠️</span>
              <span>License and copyright notice required</span>
            </div>
          </div>
          <p className="text-slate-400 text-sm mt-4">
            For full license details, visit{' '}
            <a
              href="https://www.apache.org/licenses/LICENSE-2.0"
              onClick={openExternal('https://www.apache.org/licenses/LICENSE-2.0')}
              className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
            >
              Apache License 2.0
            </a>
          </p>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-slate-800 text-center text-slate-400">
          <p>
            © 2026 Axiome. Licensed under Apache License 2.0.
          </p>
          <p className="mt-2">
            Built with <Heart className="w-4 h-4 text-red-500 inline" /> by Josh E. SOUSSAN
          </p>
        </div>
      </div>
    </div>
  );
}
