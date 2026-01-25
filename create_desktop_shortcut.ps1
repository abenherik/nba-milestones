# Create Desktop Shortcut for NBA Stats Update
# Run this once to add an "Update NBA Stats" icon to your desktop

$desktopPath = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath "Update NBA Stats.lnk"
$targetPath = Join-Path $PSScriptRoot "UPDATE_STATS.bat"

$WScriptShell = New-Object -ComObject WScript.Shell
$shortcut = $WScriptShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = "Update NBA player stats from NBA API (30-45 min)"
$shortcut.IconLocation = "shell32.dll,13"  # Basketball/Sports icon
$shortcut.Save()

Write-Host "Desktop shortcut created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "You can now double-click 'Update NBA Stats' on your desktop to update player data." -ForegroundColor Cyan
Write-Host ""
pause
