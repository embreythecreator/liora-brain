from pathlib import Path


def test_windows_native_install_path_docs_match_installer() -> None:
    doc = Path("website/docs/user-guide/windows-native.md").read_text()
    install = Path("scripts/install.ps1").read_text()

    # The launchers live in the managed binary dir OUTSIDE the git checkout
    # (LIORA_HOME\bin, next to the managed uv) — NOT the whole venv\Scripts
    # (which would shadow the user's python, #83797) and NOT a dir inside
    # the checkout (which `liora update`'s autostash swept off disk).
    assert "%LOCALAPPDATA%\\liora\\bin" in doc
    assert (
        "Get-Command liora        # should print "
        "C:\\Users\\<you>\\AppData\\Local\\liora\\bin\\liora.exe"
    ) in doc
    # Installer exposes $LioraHome\bin, and must copy the launchers into it.
    assert '$lioraBin = "$LioraHome\\bin"' in install
    assert "liora.exe" in install and "liora-acp.exe" in install
    # Guard against regressions to either legacy layout.
    assert '$lioraBin = "$InstallDir\\venv\\Scripts"' not in install
    assert '$lioraBin = "$InstallDir\\bin"' not in install
