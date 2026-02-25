# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for the Axiome API sidecar.
Produces a single-folder dist that Tauri will bundle.

Build command:
  cd API
  pyinstaller axiome_api.spec --noconfirm
"""

import sys
import os
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None

# ── Collect all submodules for libs that use heavy dynamic imports ──
# Without this, scipy/numpy/pandas/sklearn stall or crash at runtime
# because PyInstaller's static analysis misses their lazy-loaded internals.
_scientific_libs = [
    'scipy', 'numpy', 'pandas', 'sklearn', 'skfolio',
    'empyrical', 'quantstats', 'pyportfolioopt', 'cvxpy',
    'yfinance',
]
extra_hiddenimports = []
for lib in _scientific_libs:
    try:
        subs = collect_submodules(lib)
        # Filter out test modules to cut size dramatically
        subs = [s for s in subs if '.tests.' not in s and '.test_' not in s and not s.endswith('.tests')]
        extra_hiddenimports += subs
    except Exception:
        pass  # library not installed — skip

# Also collect data files (e.g. scipy ships .pyd / .so / config data)
extra_datas = []
for lib in ['scipy', 'sklearn', 'numpy', 'certifi']:
    try:
        extra_datas += collect_data_files(lib)
    except Exception:
        pass

a = Analysis(
    ['app/main.py'],
    pathex=['.'],
    binaries=[],
    datas=extra_datas,
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'passlib.handlers.pbkdf2_crypt',
        'passlib.handlers.pbkdf2',
        'passlib.hash',
        'cryptography',
        'sqlalchemy.dialects.sqlite',
    ] + extra_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'test',
        'tests',
        'pandas.tests',
        'scipy.tests',
        'numpy.tests',
        'sklearn.tests',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    name='axiome-api',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # Keep console for sidecar stdout/stderr
    onefile=True,
)
