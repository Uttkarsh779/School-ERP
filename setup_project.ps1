# setup_project.ps1
# Script to rename crm-ascs to frontend and initialize the backend folder tree.

$WorkingDir = "D:\web_development\DreamProj"

# 1. Rename crm-ascs to frontend
$OldFrontend = Join-Path $WorkingDir "crm-ascs"
$NewFrontend = Join-Path $WorkingDir "frontend"

if (Test-Path -Path $OldFrontend) {
    Write-Host "Renaming '$OldFrontend' to '$NewFrontend'..." -ForegroundColor Cyan
    # Use native Windows cmd rename to bypass VS Code/Explorer file handle locks
    $result = cmd /c rename "$OldFrontend" "frontend" 2>&1
    if (Test-Path -Path $NewFrontend) {
        Write-Host "Frontend directory renamed successfully!" -ForegroundColor Green
    } else {
        Write-Host "Rename failed. Please rename 'crm-ascs' to 'frontend' manually in File Explorer, then re-run." -ForegroundColor Red
        Write-Host "Error: $result" -ForegroundColor DarkRed
    }
} else {
    Write-Host "Frontend directory already renamed or not found at: $OldFrontend" -ForegroundColor Yellow
}

# 2. Create backend folder structures
$BackendDir = Join-Path $WorkingDir "backend"
$SubDirs = @(
    "src",
    "src/config",
    "src/controllers",
    "src/models",
    "src/routes",
    "src/middleware"
)

Write-Host "Initializing backend folders in '$BackendDir'..." -ForegroundColor Cyan
if (!(Test-Path -Path $BackendDir)) {
    New-Item -ItemType Directory -Path $BackendDir -Force | Out-Null
}

foreach ($sub in $SubDirs) {
    $target = Join-Path $BackendDir $sub
    if (!(Test-Path -Path $target)) {
        New-Item -ItemType Directory -Path $target -Force | Out-Null
    }
}

Write-Host "Restructuring completed successfully!" -ForegroundColor Green
Write-Host "You can now run 'npm install' in both the frontend and backend folders after dependencies are configured." -ForegroundColor Yellow
