<#
.SYNOPSIS
    データ取得元の HTML を集める。サイトを増やさるときは $SOURCES に1行足す。

.DESCRIPTION
    このスクリプトは「取得」だけを行い、抽出は build-from-gamewith.ps1 が担当する。
    両者を分けているのは、取得元を増やす変更が抽出ロジックへ影響しないようにするため。
    新しいサイトを足す手順:
      1. $SOURCES に id / name / url / file を追加する
      2. build-from-gamewith.ps1 の抽出規則を足す
      3. tools\MAPPINGS.md にマッピングを追記する

.PARAMETER Offline
    取得済みの HTML を再利用して取得をスキップする。

.PARAMETER Source
    取得対象の key（gamewith / appmedia / pegasus）。省略時はすべて。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\fetch-pages.ps1
    powershell -ExecutionPolicy Bypass -File tools\fetch-pages.ps1 -Source gamewith -Offline
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = 'c:\Users\admin\Desktop\FE',
    [string[]]$Source,
    [switch]$Offline
)

$ErrorActionPreference = 'Stop'
$tmpDir = Join-Path $RepoRoot '.tmp'
if (-not (Test-Path $tmpDir)) { New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null }

# 取得元の定義。ここを増やすだけで新しいサイトに対応できる。
$SOURCES = @(
    [pscustomobject]@{
        key   = 'gamewith'
        name  = 'GameWith'
        pages = @(
            [pscustomobject]@{ id = '574424'; file = 'gw-magic.html'   }
            [pscustomobject]@{ id = '573032'; file = 'gw-arts.html'    }
            [pscustomobject]@{ id = '576859'; file = 'gw-weapons.html' }
        )
    }
    [pscustomobject]@{
        key   = 'appmedia'
        name  = 'AppMedia'
        pages = @(
            [pscustomobject]@{ id = '80411827'; file = 'am-weapons.html' }
            [pscustomobject]@{ id = '80415292'; file = 'am-arts.html'    }
            [pscustomobject]@{ id = '80415379'; file = 'am-magic-white.html' }
            [pscustomobject]@{ id = '80415376'; file = 'am-magic-black.html' }
        )
    }
    [pscustomobject]@{
        # 2026-10 時点: 装備・アイテムのページが未作成（?cmd=edit&page=...）のため、
        # 抽出できるデータはまだ無い。ページが追加されたら id を入れる。
        key   = 'pegasus'
        name  = 'PegasusKnight'
        pages = @(
            [pscustomobject]@{ id = ''; file = 'pg-equipment.html' }
        )
    }
)

# key から URL の組み立て方
$UrlBuilder = @{
    gamewith  = { param($id) 'https://gamewith.jp/fefw/' + $id }
    appmedia  = { param($id) 'https://appmedia.jp/fe_banshisenkou/' + $id }
    pegasus   = { param($id) 'https://www.pegasusknight.com/wiki/fe18/' + $id }
}

$wanted = if ($Source) { $Source } else { $SOURCES | ForEach-Object { $_.key } }

foreach ($src in $SOURCES) {
    if ($wanted -notcontains $src.key) { continue }
    Write-Host ('=== ' + $src.name + ' (' + $src.key + ') ===')
    foreach ($page in $src.pages) {
        $target = Join-Path $tmpDir $page.file
        if ($Offline) {
            if (Test-Path $target) {
                Write-Host ('  reuse  ' + $page.file + '  ' + (Get-Item $target).Length)
            } else {
                Write-Host ('  MISSING ' + $page.file + '  (offline)')
            }
            continue
        }
        if (-not $page.id) {
            # ページ ID が未確定のもの。URL を $page.url に足せば取得できる。
            Write-Host ('  skip   ' + $page.file + '  (page id not set yet)')
            continue
        }
        $builder = $UrlBuilder[$src.key]
        $url = & $builder $page.id
        Write-Host ('  fetch  ' + $url)
        Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing -TimeoutSec 30 `
            -Headers @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        Write-Host ('  saved  ' + $page.file + '  ' + (Get-Item $target).Length + ' bytes')
    }
}

Write-Host 'done'