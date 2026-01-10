# Create IT Review ZIP Package - Simple Version
# Uses robocopy to avoid file lock issues

$sourceDir = "c:\Users\helmu\Desktop\Antigravity\dienstplan-app"
$outputZip = "c:\Users\helmu\Desktop\Antigravity\WoBePlaner_IT_Review.zip"
$tempDir = "$env:TEMP\it_review_package"

Write-Host "Creating IT Review Package..." -ForegroundColor Cyan

# Cleanup first
if (Test-Path $tempDir) { 
    cmd /c "rmdir /s /q `"$tempDir`"" 2>$null
    Start-Sleep -Milliseconds 500
}
if (Test-Path $outputZip) { Remove-Item $outputZip -Force }

New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
New-Item -ItemType Directory -Path "$tempDir\docs" -Force | Out-Null
New-Item -ItemType Directory -Path "$tempDir\src" -Force | Out-Null
New-Item -ItemType Directory -Path "$tempDir\public" -Force | Out-Null
New-Item -ItemType Directory -Path "$tempDir\migrations" -Force | Out-Null
New-Item -ItemType Directory -Path "$tempDir\supabase" -Force | Out-Null
New-Item -ItemType Directory -Path "$tempDir\tests" -Force | Out-Null
New-Item -ItemType Directory -Path "$tempDir\scripts" -Force | Out-Null

# Copy directories with robocopy
Write-Host "Copying directories..." -ForegroundColor Yellow
robocopy "$sourceDir\src" "$tempDir\src" /E /NP /NFL /NDL /NJH /NJS 2>$null
robocopy "$sourceDir\public" "$tempDir\public" /E /NP /NFL /NDL /NJH /NJS 2>$null
robocopy "$sourceDir\migrations" "$tempDir\migrations" /E /NP /NFL /NDL /NJH /NJS 2>$null
robocopy "$sourceDir\supabase" "$tempDir\supabase" /E /NP /NFL /NDL /NJH /NJS 2>$null
robocopy "$sourceDir\tests" "$tempDir\tests" /E /NP /NFL /NDL /NJH /NJS 2>$null
robocopy "$sourceDir\scripts" "$tempDir\scripts" /E /NP /NFL /NDL /NJH /NJS 2>$null

# Copy only non-dev docs
$docsToInclude = @(
    "IT_REVIEW_SUMMARY.md",
    "DATABASE_SCHEMA.md",
    "RLS_POLICIES.md",
    "DEPLOYMENT.md",
    "SECURE_ONBOARDING.md",
    "PUSH_NOTIFICATIONS_SETUP.md",
    "TECHNICAL_DOCS.md"
)
foreach ($doc in $docsToInclude) {
    $src = "$sourceDir\docs\$doc"
    if (Test-Path $src) { Copy-Item $src "$tempDir\docs\" -Force }
}

# Copy root files
$rootFiles = @(
    "index.html",
    "package.json",
    "package-lock.json",
    "vite.config.js",
    "tailwind.config.js",
    "postcss.config.js",
    "eslint.config.js",
    "playwright.config.ts",
    ".env",
    ".gitignore",
    "README.md",
    "README_IT_REVIEW.md"
)

Write-Host "Copying root files..." -ForegroundColor Yellow
foreach ($file in $rootFiles) {
    $src = "$sourceDir\$file"
    if (Test-Path $src) { Copy-Item $src "$tempDir\" -Force }
}

# Remove the ZIP script itself from the package
Remove-Item "$tempDir\scripts\create_it_review_package.ps1" -ErrorAction SilentlyContinue

# Create ZIP using .NET directly
Write-Host "Creating ZIP..." -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $outputZip)

# Get size
$zipInfo = Get-Item $outputZip
$zipSizeMB = [math]::Round($zipInfo.Length / 1MB, 2)

# Cleanup
cmd /c "rmdir /s /q `"$tempDir`"" 2>$null

Write-Host ""
Write-Host "SUCCESS!" -ForegroundColor Green
Write-Host "ZIP created: $outputZip" -ForegroundColor White
Write-Host "Size: $zipSizeMB MB" -ForegroundColor White
