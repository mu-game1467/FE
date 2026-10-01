<#
.SYNOPSIS
    リポジトリ全体を走査して、日本語以外の言語の文字が混入していないか確かめる。

.DESCRIPTION
    生成した文章やコメントに中国語・韓国語などが紛れ込むことがあるので、
    commit の前にこれを走らせて確かめる。U+FFFD（文字化け跡）も一緒に検出する。

    読み取り専用。何か検出しても自動では書き換えない。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\scan-stray-characters.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# Hangul syllables / jamo / compatibility jamo, the extended blocks, and the
# replacement character that a mis-decoded byte leaves behind. Kanji are shared
# with Chinese so they are not flagged on their own.
function Test-Stray([string]$Text) {
    $hits = @()
    for ($i = 0; $i -lt $Text.Length; $i++) {
        $c = [int]$Text[$i]
        $stray = ($c -ge 0xAC00 -and $c -le 0xD7A3) -or   # Hangul syllables
                 ($c -ge 0x1100 -and $c -le 0x11FF) -or   # Hangul jamo
                 ($c -ge 0x3130 -and $c -le 0x318F) -or   # Hangul compatibility jamo
                 ($c -ge 0xA960 -and $c -le 0xA97F) -or   # Hangul extended-A
                 ($c -ge 0xD7B0 -and $c -le 0xD7FF) -or   # Hangul extended-B
                 ($c -eq 0xFFFD)                         # replacement character
        if ($stray) {
            $line = ($Text.Substring(0, $i) -split "`n").Count
            $hits += ('U+{0:X4} at line {1}' -f $c, $line)
        }
    }
    return $hits
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

$skipDirs = @('.git', 'images', '.tmp', '.kilo')
$extensions = @('.js', '.css', '.md', '.html', '.ps1', '.json')

$files = Get-ChildItem -Path $repoRoot -Recurse -File |
    Where-Object { $extensions -contains $_.Extension } |
    Where-Object {
        $parts = $_.FullName.Substring($repoRoot.Length + 1).Split([char]0x5C)
        -not ($parts | Where-Object { $skipDirs -contains $_ })
    }

$bad = 0
foreach ($f in $files) {
    $text = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8)
    $hits = Test-Stray $text
    if ($hits.Count -gt 0) {
        $rel = $f.FullName.Substring($repoRoot.Length + 1)
        Write-Host ("BAD  {0}" -f $rel)
        $hits | Select-Object -First 5 | ForEach-Object { Write-Host ("     " + $_) }
        $bad++
    }
}

Write-Host ("Scanned {0} files, {1} with stray characters" -f $files.Count, $bad)
if ($bad -gt 0) { exit 1 }