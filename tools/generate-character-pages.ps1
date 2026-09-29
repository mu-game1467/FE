<#
.SYNOPSIS
    Generates one detail page per character under characters/<name>/index.html.

.DESCRIPTION
    Each page is a thin shell: it only carries the character name in
    <body data-character="...">, and app.js fetches data/characters.json plus
    data/classes.json to render the details (growth rates, skills, recruit
    conditions and the growth rates for every class).

    Run it after regenerating the data:
        powershell -ExecutionPolicy Bypass -File tools\generate-character-pages.ps1

    Pages that no longer exist in characters.json are removed, so the folder
    always mirrors the data.
#>
[CmdletBinding()]
param(
    [string]$DataFile = '',
    [string]$OutRoot = ''
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
if (-not $DataFile) { $DataFile = Join-Path $repoRoot 'data\characters.json' }
if (-not $OutRoot) { $OutRoot = Join-Path $repoRoot 'characters' }

# Japanese literals are built from code points so this script stays ASCII only
# (Windows PowerShell reads .ps1 files as ANSI when they have no BOM).
function U { param([string]$hex) -join (($hex -split '\s+') | Where-Object { $_ } | ForEach-Object { [char][Convert]::ToInt32($_, 16) }) }

$titleSuffix = U '30C7 30FC 30BF 30D9 30FC 30B9'   # データベース
$siteName    = U '30D5 30A1 30A4 30A2 30FC 30A8 30E0 30D6 30EC 30E0 20 4E07 7D2B 5343 7D05'  # ファイアーエムブレム 万紫千紅
$navHome     = U '30DB 30FC 30E0'                   # ホーム
$labelCh     = U '30AD 30E3 30E9 30AF 30BF 30FC'   # キャラクター
$labelClass  = U '5175 7A2E'                    # 兵種
$labelSkill  = U '30B9 30AD 30EB'                   # スキル
$labelItem   = U '30A2 30A4 30C6 30E0'              # アイテム
$labelEvent  = U '96A0 3057 30A4 30D9 30F3 30C8'   # 隠しイベント
# NOTE: the parentheses matter. In argument mode PowerShell would pass '+', $labelCh
# and the second U() call as extra arguments to U, leaving $back as just the arrow.
$back        = (U '2190 0020') + $labelCh + (U '4E00 89A7')  # ← キャラクター一覧

# NB: ConvertFrom-Json returns the array itself, so do not wrap it in @()
# (that would create a single element holding the whole array).
$characters = Get-Content $DataFile -Raw -Encoding UTF8 | ConvertFrom-Json
$characters = @($characters | ForEach-Object { $_ })
if (-not $characters.Count) { throw "no characters found in $DataFile" }

# keep the pages in sync with the data -------------------------------------------------
$invalid = '[\/:*?"<>|]'
$written = @()
$skipped = @()
foreach ($c in $characters) {
    $name = [string]$c.name
    if (-not $name) { continue }
    if ($name -match $invalid -or $name -match '^\s|\s$') {
        $skipped += $name
        continue
    }
    $dir = Join-Path $OutRoot $name
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

    $title = "$name - FE$titleSuffix"
    $html = @"
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>$title</title>
    <link rel="stylesheet" href="../../styles.css">
</head>
<body data-character="$name">
    <header>
        <h1>$siteName</h1>
        <nav>
            <ul>
                <li><a href="../../index.html">$navHome</a></li>
                <li><a href="../" class="active">$labelCh</a></li>
                <li><a href="../../classes/">$labelClass</a></li>
                <li><a href="../../skills/">$labelSkill</a></li>
                <li><a href="../../items/">$labelItem</a></li>
                <li><a href="../../events/">$labelEvent</a></li>
            </ul>
        </nav>
    </header>
    <main>
        <section>
            <p class="page-note"><a href="../">$back</a></p>
            <div id="character-detail"></div>
        </section>
    </main>
    <footer>
        <p>$siteName</p>
    </footer>
    <script src="../../app.js"></script>
</body>
</html>
"@
    [System.IO.File]::WriteAllText((Join-Path $dir 'index.html'), $html, $utf8)
    $written += $name
}

# remove stale pages ------------------------------------------------------------------
$stale = @()
foreach ($dir in (Get-ChildItem -LiteralPath $OutRoot -Directory)) {
    if ($written -notcontains $dir.Name) {
        $stale += $dir.Name
        Remove-Item -LiteralPath $dir.FullName -Recurse -Force
    }
}

Write-Host ("Wrote {0} character pages to {1}" -f $written.Count, $OutRoot)
if ($skipped.Count) { Write-Warning ("skipped (unsafe directory name): " + ($skipped -join ', ')) }
if ($stale.Count) { Write-Host ("Removed stale pages: " + ($stale -join ', ')) }
