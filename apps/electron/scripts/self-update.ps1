# Windows self-update script
# This script is executed to apply updates on Windows

param(
    [string]$InstallerPath,
    [string]$AppPath
)

if (-not $InstallerPath -or -not $AppPath) {
    Write-Error "Usage: self-update.ps1 -InstallerPath <path> -AppPath <path>"
    exit 1
}

# Wait for the app to close
Start-Sleep -Seconds 2

# Run the installer silently
Start-Process -FilePath $InstallerPath -ArgumentList "/S" -Wait

# Remove the installer
Remove-Item -Path $InstallerPath -Force

# Relaunch the app
Start-Process -FilePath $AppPath
