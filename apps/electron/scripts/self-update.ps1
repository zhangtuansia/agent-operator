# Windows self-update script
# This script is executed to apply updates on Windows
#
# Arguments:
#   -InstallerPath: Path to the downloaded NSIS installer
#   -AppPath: Path to the app executable (for relaunch)

param(
    [string]$InstallerPath,
    [string]$AppPath
)

$LogFile = "$env:TEMP\cowork-update.log"

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Add-Content -Path $LogFile -Value $logMessage
    Write-Host $logMessage
}

Write-Log "Starting Windows update..."
Write-Log "Installer: $InstallerPath"
Write-Log "App: $AppPath"

if (-not $InstallerPath -or -not $AppPath) {
    Write-Log "Error: Usage: self-update.ps1 -InstallerPath <path> -AppPath <path>"
    exit 1
}

if (-not (Test-Path $InstallerPath)) {
    Write-Log "Error: Installer not found: $InstallerPath"
    exit 1
}

# Wait for the app to close
Write-Log "Waiting for app to quit..."
Start-Sleep -Seconds 2

# Additional wait: check if the app process is still running
$AppName = [System.IO.Path]::GetFileNameWithoutExtension($AppPath)
for ($i = 1; $i -le 10; $i++) {
    $process = Get-Process -Name $AppName -ErrorAction SilentlyContinue
    if (-not $process) {
        Write-Log "App has quit"
        break
    }
    Write-Log "Waiting for $AppName to quit (attempt $i/10)..."
    Start-Sleep -Seconds 1
}

# Run the installer silently
Write-Log "Running installer..."
try {
    $process = Start-Process -FilePath $InstallerPath -ArgumentList "/S" -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        Write-Log "Installer exited with code: $($process.ExitCode)"
    } else {
        Write-Log "Installation successful"
    }
} catch {
    Write-Log "Error running installer: $_"
    exit 1
}

# Remove the installer
Write-Log "Cleaning up installer..."
try {
    Remove-Item -Path $InstallerPath -Force -ErrorAction SilentlyContinue
} catch {
    Write-Log "Warning: Failed to remove installer: $_"
}

# Relaunch the app
Write-Log "Relaunching app..."
Start-Sleep -Seconds 1
try {
    Start-Process -FilePath $AppPath
    Write-Log "Update complete!"
} catch {
    Write-Log "Error relaunching app: $_"
    exit 1
}
