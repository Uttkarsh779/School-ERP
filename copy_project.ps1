# copy_project.ps1
# Script to recursively copy files from current workspace to D:\web_development\DreamProj
# Excluding node_modules and .git to optimize performance and prevent copying heavy dependencies.

$SourcePath = "d:\Internship Peymagen"
$DestinationPath = "D:\web_development\DreamProj"

# Check if Destination directory exists, if not, create it
if (!(Test-Path -Path $DestinationPath)) {
    New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
    Write-Host "Created destination folder: $DestinationPath" -ForegroundColor Green
}

Write-Host "Scanning source files..."
$allFiles = Get-ChildItem -Path $SourcePath -Recurse | Where-Object {
    $_.FullName -notmatch '\\(node_modules|\.git)($|\\)'
}

Write-Host "Copying files to $DestinationPath..." -ForegroundColor Cyan

$count = 0
foreach ($item in $allFiles) {
    # Determine the target path using PowerShell's case-insensitive -replace operator
    $targetPath = $item.FullName -replace "^$([regex]::Escape($SourcePath))", $DestinationPath

    if ($item.PSIsContainer) {
        # If it's a directory, create it
        if (!(Test-Path -Path $targetPath)) {
            New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
        }
    } else {
        # If it's a file, ensure parent directory exists, then copy
        $parentDir = Split-Path -Parent $targetPath
        if (!(Test-Path -Path $parentDir)) {
            New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
        }
        Copy-Item -Path $item.FullName -Destination $targetPath -Force
        $count++
    }
}

Write-Host "Successfully copied $count files!" -ForegroundColor Green
Write-Host "Note: Heavy dependency folder 'node_modules' was excluded. Please open the terminal in '$DestinationPath\crm-ascs' and run 'npm install' to install package dependencies." -ForegroundColor Yellow
