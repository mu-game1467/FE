<#
    .SYNOPSIS
    Generates one detail page per class under classes/<name>/index.html.

    .DESCRIPTION
    Companion to generate-character-pages.ps1. Each page only carries the class
    name in <body data-class="...">; app.js fetches data/classes.json plus
    data/characters.json and renders the details (growth bonus, unlock rules,
    and - the useful part - what every character would grow into in this class).

    Run it after regenerating the data:
        powershell -ExecutionPolicy Bypass -File tools\generate-class-pages.ps1

    Pages that no longer exist in classes.json are removed, so the folder
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
if (-not $DataFile) { $DataFile = Join-Path $repoRoot 'data\classes.json' }
if (-not $OutRoot) { $OutRoot = Join-Path $repoRoot 'classes' }

# Japanese literals are built from code points so this script stays ASCII only
# (Windows PowerShell reads .ps1 files as ANSI when they have no BOM).
function U { param([string]$hex) -join (($hex -split '\s+') | Where-Object { $_ } | ForEach-Object { [char][Convert]::ToInt32($_, 16) }) }

$titleSuffix = U '5175 7A2E'                                     # 兵種
$siteName    = U '30D5 30A1 30A4 30A2 30FC 30A8 30E0 30D6 30EC 30E0 20 4E07 7D2B 5343 7D05'  # ファイアーエムブレム 万紫千紅
$navHome     = U '30DB 30FC 30E0'                                    # ホーム
$labelCh     = U '30AD 30E3 30E9 30AF 30BF 30FC'                    # キャラクター
$labelSkill  = U '30B9 30AD 30EB'                                    # スキル
$labelItem   = U '30A2 30A4 30C6 30E0'                               # アイテム
$labelGear   = U '88C5 5099 54C1'                               # 装備品
$labelWeapon = U '6B66 5668'                                     # 武器
$labelArt    = U '6226 6280'                                     # 戦技
$labelMagic  = U '9B54 6CD5'                                     # 魔法
$labelEvent  = U '96A0 3057 30A4 30D9 30F3 30C8'                    # 隠しイベント
$back        = (U '2190 0020') + $titleSuffix + (U '4E00 89A7')      # ← 兵種一覧

$classes = Get-Content $DataFile -Raw -Encoding UTF8 | ConvertFrom-Json
$classes = @($classes | ForEach-Object { $_ })
if (-not $classes.Count) { throw "no classes found in $DataFile" }

$invalid = '[\/:*?"<>|]'
$written = @()
$skipped = @()
foreach ($c in $classes) {
    $name = [string]$c.name
    if (-not $name) { continue }
    if ($name -match $invalid -or $name -match '^\s|\s$') {
        $skipped += $name
        continue
    }
    $dir = Join-Path $OutRoot $name
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

    $title = "$name - $titleSuffix"
    $html = @"
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>$title</title>
    <link rel="stylesheet" href="../../styles.css">
</head>
<body data-class="$name">
    <header>
        <h1>$siteName</h1>
        <nav>
            <ul>
                <li><a href="../../index.html">$navHome</a></li>
                <li><a href="../../characters/">$labelCh</a></li>
                <li><a href="../" class="active">$titleSuffix</a></li>
                <li><a href="../../skills/">$labelSkill</a></li>
                <li><a href="../../items/">$labelItem</a></li>
                <li><a href="../../gear/">$labelGear</a></li>
                <li><a href="../../weapons/">$labelWeapon</a></li>
                <li><a href="../../arts/">$labelArt</a></li>
                <li><a href="../../magic/">$labelMagic</a></li>
                <li><a href="../../events/">$labelEvent</a></li>
            </ul>
        </nav>
    </header>
    <main>
        <section>
            <p class="page-note"><a href="../">$back</a></p>
            <div id="class-detail"></div>
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

Write-Host ("Wrote {0} class pages to {1}" -f $written.Count, $OutRoot)
if ($skipped.Count) { Write-Warning ("skipped (unsafe directory name): " + ($skipped -join ', ')) }
if ($stale.Count) { Write-Host ("Removed stale pages: " + ($stale -join ', ')) }
