# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['../backend/app.py'],
    pathex=[],
    binaries=[],
    datas=[('frontend', 'frontend'), ('assets', 'assets'), ('backend/memo_utils.py', '.'), ('backend/security_utils.py', '.'), ('backend/store_utils.py', '.')],
    hiddenimports=['flask', 'PIL'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='star-office-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
