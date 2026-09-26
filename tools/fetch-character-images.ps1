<#
    .SYNOPSIS
    Downloads the character portraits into images/characters/.

    .DESCRIPTION
    tools\build-from-game8.ps1 writes an "image" field into data\characters.json
    that points at a LOCAL file (e.g. images/characters/<name>.webp). This script
    fetches those files from the image_url in the same Game8 source JSON, so the
    published pages never hotlink Game8's CDN and keep working offline.

    The destination path is derived from image_url with the same rule the build
    script uses, so the two always agree.

    Run it after regenerating the data:
        powershell -ExecutionPolicy Bypass -File tools\build-from-game8.ps1 -Download
        powershell -ExecutionPolicy Bypass -File tools\fetch-character-images.ps1

    .PARAMETER Force
    Re-download files that already exist and pass the image check.
#>
[CmdletBinding()]
param(
    [string]$SourceFile = 'c:\Users\admin\Desktop\FE\.tmp\ikusei.json',
    [string]$SourceUrl  = 'https://assets.game8.jp/tools/script_template/fe_banshisenko_ikusei_sim.json',
    [string]$OutDir     = 'c:\Users\admin\Desktop\FE\images\characters',
    [switch]$Force
)

# ASCII only: Windows PowerShell reads BOM-less .ps1 as ANSI, so a Japanese
# literal here would corrupt the parse. Names come from the JSON at runtime.
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$CharGroupId = 23026
$invalid = '[\\/:*?"<>|]'

if (-not (Test-Path $SourceFile)) {
    Write-Host "Downloading $SourceUrl ..."
    $dir = Split-Path -Parent $SourceFile
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    curl.exe -sL -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' $SourceUrl -o $SourceFile
    if (-not (Test-Path $SourceFile)) { throw "could not download $SourceUrl" }
}

# --- true when the bytes really are an image, not an error page -------------
function Test-Image([string]$path) {
    try { $b = [System.IO.File]::ReadAllBytes($path) } catch { return $false }
    if ($b.Length -lt 1024) { return $false }
    $ascii = [System.Text.Encoding]::ASCII
    if ($b.Length -ge 12 -and $ascii.GetString($b, 0, 4) -eq 'RIFF' -and $ascii.GetString($b, 8, 4) -eq 'WEBP') { return $true }
    if ($b.Length -ge 8 -and $b[0] -eq 0x89 -and $ascii.GetString($b, 1, 3) -eq 'PNG') { return $true }
    if ($b.Length -ge 3 -and $b[0] -eq 0xFF -and $b[1] -eq 0xD8 -and $b[2] -eq 0xFF) { return $true }
    if ($b.Length -ge 4 -and $ascii.GetString($b, 0, 4) -eq 'GIF8') { return $true }
    return $false
}

$raw = [System.IO.File]::ReadAllText($SourceFile, $utf8)
$src = $raw | ConvertFrom-Json
$group = @(@($src | Where-Object { $_.id -eq $CharGroupId })[0])
if (-not $group.Count) { throw "group $CharGroupId not found in $SourceFile" }
$rows = @($group[0].db_data)

# col_20..col_28 are the nine growth rates. The build script only keeps rows
# where all nine parse, so mirror that here: otherwise this would download
# portraits for entries that never reach characters.json.
$statCols = 20..28

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$downloaded = 0; $kept = 0; $failed = @(); $skipped = 0
foreach ($r in $rows) {
    $name = [string]$r.title
    $url = [string]$r.image_url
    if (-not $name -or -not $url) { $skipped++; continue }
    if ($name -match $invalid) { $skipped++; continue }
    $usable = $true
    foreach ($c in $statCols) {
        $v = [string]$r.("col_" + $c)
        $n = 0
        if (-not [int]::TryParse(($v -replace '[+]', ''), [ref]$n)) { $usable = $false; break }
    }
    if (-not $usable) { $skipped++; continue }
    $ext = 'webp'
    if ($url -match '\.(png|jpe?g|webp|gif)/') { $ext = $Matches[1].ToLower() }
    $dest = Join-Path $OutDir ($name + '.' + $ext)

    if ((Test-Path $dest) -and -not $Force) {
        if (Test-Image $dest) { $kept++; continue }
        Write-Warning ("re-fetching, not a valid image: " + $dest)
    }
    try {
        curl.exe -sL --fail --max-time 60 -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' $url -o $dest
        if (-not (Test-Path $dest)) { throw 'no file written' }
        if (-not (Test-Image $dest)) {
            Remove-Item $dest -Force -ErrorAction SilentlyContinue
            throw 'downloaded bytes are not an image'
        }
        $downloaded++
    } catch {
        $failed += ($name + ' (' + $_.Exception.Message + ')')
    }
}

$bytes = (Get-ChildItem $OutDir -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
Write-Host ("Portraits: {0} downloaded, {1} already present, {2} skipped, {3} failed" -f $downloaded, $kept, $skipped, $failed.Count)
Write-Host ("Total on disk: {0} files, {1:N1} MB in {2}" -f @(Get-ChildItem $OutDir -File).Count, ($bytes / 1MB), $OutDir)
if ($failed.Count) {
    Write-Warning ("failed: " + ($failed -join '; '))
    exit 1
}
