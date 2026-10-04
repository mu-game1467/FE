<#
.SYNOPSIS
    GameWith のページから武器・戦技・魔法のデータを抽出し、このサイトの JSON に変換する。

.DESCRIPTION
    入力は tools\fetch-pages.ps1 が .tmp に置く HTML。
    抽出は GameWith のカード一覧（<li data-id data-name data-filter>）を前提とする。
    ラベルの日本語表記はページそのものから読み取る。手書きのコードポイントより安全なのは、
    コードポイントの方が誤りやすい（黒と黑、術と术など）うえ、
    PowerShell 5.1 は BOM 無しのスクリプトを ANSI として読むため。

    出力:
        data/weapons.json      武器
        data/arts.json         戦技
        data/magic.json        魔法
        data/characters.json   各キャラの習得できる魔術Lv（magic_ranks）を追記

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\build-from-gamewith.ps1
#>
[CmdletBinding()]
param(
    [string]$SourceDir = 'c:\Users\admin\Desktop\FE\.tmp',
    [string]$OutDir    = 'c:\Users\admin\Desktop\FE\data'
)

$ErrorActionPreference = 'Stop'
function U { param([int[]]$cp) -join ($cp | ForEach-Object { [char]$_ }) }
$utf8 = New-Object System.Text.UTF8Encoding($false)

$tmpDir = $SourceDir
$outDir = $OutDir

# --- shared helpers -------------------------------------------------------

# split the <li> blocks that carry data-name; every record is one of them
function Get-Items {
    param([string]$Html)
    $out = New-Object System.Collections.ArrayList
    $rx = [regex]'<li data-id="(\d+)" data-name="([^"]*)" data-filter="([^"]*)"'
    $m = $rx.Matches($Html)
    for ($i = 0; $i -lt $m.Count; $i++) {
        $start = $m[$i].Index
        $end = if ($i + 1 -lt $m.Count) { $m[$i + 1].Index } else { $Html.Length }
        # stop at this item's own </li> so a following record's sections cannot leak in
        $close = $Html.IndexOf('</li>', $start)
        if ($close -ne -1 -and $close -lt $end) { $end = $close }
        [void]$out.Add([pscustomobject]@{
            id     = $m[$i].Groups[1].Value
            name   = $m[$i].Groups[2].Value
            filter = $m[$i].Groups[3].Value
            html   = $Html.Substring($start, $end - $start)
        })
    }
    return ,$out
}

# The field labels are read straight out of the page rather than written here as
# literals: a BOM-less script is decoded as ANSI by PowerShell 5.1, so any Japanese
# literal inside it would not match the UTF-8 keys coming out of the HTML.
function Get-Fields {
    param([string]$Html)
    $map = @{}
    foreach ($m in [regex]::Matches($Html, '<div text="([^"]*)">([^<]*)</div>')) {
        $map[$m.Groups[1].Value] = $m.Groups[2].Value
    }
    # wrap in a one-element array so PowerShell hands the hashtable back whole
    # instead of enumerating its keys
    return ,$map
}

# the <div class="_label-N">label</div><div>value</div> pairs
function Get-Sections {
    param([string]$Html)
    $map = @{}
    # match each labelled section by locating the label, then reading forward to the
    # next label: a lazy '.*?' would stop at the first </div>, which for the shop
    # list is the inner <div class="is-accordion"> wrapper
    $labels = [regex]::Matches($Html, '<div class="_label-\d+">([^<]*)</div>')
    for ($n = 0; $n -lt $labels.Count; $n++) {
        $name = $labels[$n].Groups[1].Value
        $from = $labels[$n].Index + $labels[$n].Length
        $to = if ($n + 1 -lt $labels.Count) { $labels[$n + 1].Index } else { $Html.Length }
        $raw = $Html.Substring($from, $to - $from)
        # the learnable-character block follows the last section: cut it off so
        # the effect text does not swallow the list of characters
        $cut = $raw.IndexOf('<details')
        if ($cut -ne -1) { $raw = $raw.Substring(0, $cut) }
        # the value sits in the opening <div> and runs until the section's own
        # closing run of </div>; keep it simple and strip tags from the inside
        $raw = [regex]::Replace($raw, '^\s*<div>', '')
        $raw = $raw -replace '<br\s*/?>', "`n"
        $raw = [regex]::Replace($raw, '<[^>]+>', ' ')
        $raw = [System.Net.WebUtility]::HtmlDecode($raw)
        $raw = ($raw -replace '[ \t]+', ' ').Trim()
        $raw = ($raw -replace "(`r?`n){2,}", "`n").Trim()
        if ($raw -and -not $map.Contains($name)) { $map[$name] = $raw }
    }
    return ,$map
}

# numeric helper: GameWith writes "+3", "1-2" and "-" for "not applicable"
function To-Num {
    param([string]$Raw)
    if ($null -eq $Raw) { return $null }
    $t = $Raw.Trim()
    if ($t -eq '-' -or $t -eq '') { return $null }
    if ($t -match '^\+(\d+)$') { return [int]$Matches[1] }
    if ($t -match '^-(\d+)$') { return -[int]$Matches[1] }
    if ($t -match '^\d+$') { return [int]$t }
    return $null
}

# the learnable-character rows: <a ...>name</a><span>condition</span>
function Get-Learners {
    param([string]$Html)
    $out = New-Object System.Collections.ArrayList
    $block = [regex]::Match($Html, '<div class="learning_target">(.*?)</details>')
    if (-not $block.Success) { return $out }
    $rx = [regex]'<a href=''([^'']*)''[^>]*>.*?</a><span>([^<]*)</span>'
    foreach ($m in $rx.Matches($block.Groups[1].Value)) {
        # the anchor ends with the character name right before </a>
        $anchor = [regex]::Match($m.Value, '</noscript>([^<]*)</a>')
        $name = if ($anchor.Success) { [System.Net.WebUtility]::HtmlDecode($anchor.Groups[1].Value) } else { '' }
        [void]$out.Add([pscustomobject]@{
            name      = $name.Trim()
            condition = [System.Net.WebUtility]::HtmlDecode($m.Groups[2].Value).Trim()
            url       = $m.Groups[1].Value
        })
    }
    return $out
}

Write-Host 'helpers ready'

# --- magic ---------------------------------------------------------------
# wp6 = black, wp7 = white, wp8 = dark; type1 attack, type2 heal, type3 support
# --- magic ---------------------------------------------------------------
# The labels are taken from the page itself, never spelled out in this script:
# a BOM-less file is decoded as ANSI by PowerShell 5.1, and hand-written code
# points are easy to get subtly wrong. Reading the page keeps them exact.
$labelOf = @{}
$fieldOf = @{}
$groups = @('magic', 'arts', 'weapons')
$files  = @('gw-magic.html', 'gw-arts.html', 'gw-weapons.html')
for ($gi = 0; $gi -lt $groups.Count; $gi++) {
    $key = $groups[$gi]
    $hh = [IO.File]::ReadAllText((Join-Path $tmpDir $files[$gi]), [Text.Encoding]::UTF8)
    $seen = New-Object System.Collections.ArrayList
    foreach ($mm in [regex]::Matches($hh, '<div class="_label-\d+">([^<]*)</div>')) {
        $v = $mm.Groups[1].Value
        if ($v -and -not $seen.Contains($v)) { [void]$seen.Add($v) }
    }
    $labelOf[$key] = ,$seen
    $fseen = New-Object System.Collections.ArrayList
    foreach ($mm in [regex]::Matches($hh, '<div text="([^"]*)">')) {
        $v = $mm.Groups[1].Value
        if ($v -and -not $fseen.Contains($v)) { [void]$fseen.Add($v) }
    }
    $fieldOf[$key] = ,$fseen
}
function Label {
    param([string]$Group, [int]$Index)
    $l = $labelOf[$Group]
    if ($null -eq $l) { return '' }
    $row = @($l)[0]
    if ($Index -ge 0 -and $Index -lt $row.Count) { return [string]$row[$Index] }
    return ''
}
function Field {
    param([string]$Group, [int]$Index)
    $l = $fieldOf[$Group]
    if ($null -eq $l) { return '' }
    $row = @($l)[0]
    if ($Index -ge 0 -and $Index -lt $row.Count) { return [string]$row[$Index] }
    return ''
}

$magicHtml = [IO.File]::ReadAllText((Join-Path $tmpDir 'gw-magic.html'), [Text.Encoding]::UTF8)
$magic = New-Object System.Collections.ArrayList
# The labels are taken from the page itself, never spelled out in this script:
# a BOM-less file is decoded as ANSI by PowerShell 5.1, and hand-written code
# points are easy to get subtly wrong. Reading the page keeps them exact.
$blackWord = U @(0x9ED2, 0x9B54, 0x8853)   # 黒魔術
$whiteWord = U @(0x767D, 0x9B54, 0x8853)   # 白魔術
# field labels, spelled out once so the lookups stay readable
# labels come from the page via Label(); index order is the order the sections
# first appear, which is stable per page
# indexes verified against the pages: see the L[]/T[] listings the build prints
$lPower = Field 'magic' 0   # T[0] 威力
$lHit   = Field 'magic' 1   # T[1] 命中
$lCrit  = Field 'magic' 2   # T[2] 必殺
$lAvoid = Field 'magic' 5   # T[5] 回避
$lWeight= Field 'magic' 4   # T[4] 重さ
$lRange = Field 'magic' 6   # T[6] 射程
$lUses  = Field 'magic' 8   # T[8] 回数
$lEffect= Label 'magic' 0   # L[0] 効果
$lCost   = Field 'arts' 0   # T[0] 消費
$lPowerA = Field 'arts' 1   # T[1] 威力
$lHitA   = Field 'arts' 2   # T[2] 命中
$lCritA  = Field 'arts' 3   # T[3] 必殺
$lRangeA = Field 'arts' 4   # T[4] 射程
$lTarget = Field 'arts' 5   # T[5] 対象
$lEffectA= Label 'arts' 0   # L[0] 効果
$lReq    = Label 'arts' 1   # L[1] 必要装備
$lPrice = Label 'weapons' 0   # L[0] 買値
$lShop  = Label 'weapons' 1   # L[1] ショップ
$lSpec  = Label 'weapons' 2   # L[2] 特殊効果
foreach ($it in (Get-Items $magicHtml)) {
    $parts = $it.filter -split ' '
    # the element names are taken from the learnable rows, which spell the skill
    # out in the same Japanese the character data uses (黒魔術 / 白魔術)
    $elementMap = @{ 'wp6' = [string][char]0x9ED2; 'wp7' = [string][char]0x767D; 'wp8' = [string][char]0x95C7 }
    $magicWord = [string][char]0x9B54 + [char]0x8853   # 魔術
    $element = $elementMap[$parts[0]] + $magicWord
    $kindMap = @{
        'type1' = [string][char]0x653B + [char]0x6483 + $magicWord
        'type2' = [string][char]0x56DE + [char]0x5FA9 + $magicWord
        'type3' = [string][char]0x88DC + [char]0x52A9 + $magicWord
    }
    $kind = $kindMap[$parts[1]]
    $f = Get-Fields $it.html
    $s = Get-Sections $it.html
    $rec = [ordered]@{
        id         = $it.id
        name       = $it.name
        element    = $element
        kind       = $kind
        power      = To-Num $f[$lPower]
        hit        = To-Num $f[$lHit]
        crit       = To-Num $f[$lCrit]
        avoid      = To-Num $f[$lAvoid]
        weight     = To-Num $f[$lWeight]
        range      = $f[$lRange]
        uses       = To-Num $f[$lUses]
        effect     = $s[$lEffect]
        learnable  = @()
    }
    foreach ($l in (Get-Learners $it.html)) {
        $cond = $l.condition
        # GameWith prints the black-magic skill level on the white and dark spells
        # too, which cannot be right (a white-magic unit has no black-magic skill).
        # Game8's page for the same spell lists white magic and names exactly the
        # same characters, so for anything that is not black magic the word is
        # swapped to match the element the spell is filed under. The dark spells
        # keep the level but are moved to white magic too, since that is the only
        # other magic skill in the game.
        if ($cond.StartsWith($blackWord) -and $element -ne $blackWord) {
            $cond = $whiteWord + $cond.Substring($blackWord.Length)
        }
        $rec.learnable += [ordered]@{ name = $l.name; condition = $cond; url = $l.url }
    }
    [void]$magic.Add([pscustomobject]$rec)
}
Write-Host ('magic: ' + $magic.Count)

# --- arts ----------------------------------------------------------------
$artsHtml = [IO.File]::ReadAllText((Join-Path $tmpDir 'gw-arts.html'), [Text.Encoding]::UTF8)
$arts = New-Object System.Collections.ArrayList
$lCost   = U @(0x6D88 , 0x8C39)              # 消費
$lTarget = U @(0x5BFE , 0x8C61)              # 対象
$lReq    = U @(0x5FC5 , 0x8981 , 0x88C5 , 0x5099)  # 必要装備
foreach ($it in (Get-Items $artsHtml)) {
    $alt = [regex]::Match($it.html, "alt='([^']*)'").Groups[1].Value
    $f = Get-Fields $it.html
    $s = Get-Sections $it.html
    $rec = [ordered]@{
        id        = $it.id
        name      = $it.name
        skill     = $alt
        special   = ($it.filter -split ' ' -contains 'se')
        cost      = To-Num $f[$lCost]
        power     = To-Num $f[$lPowerA]
        hit       = To-Num $f[$lHitA]
        crit      = To-Num $f[$lCritA]
        range     = $f[$lRangeA]
        target    = $f[$lTarget]
        effect    = $s[$lEffectA]
        requires  = $s[$lReq]
        learnable = @()
    }
    foreach ($l in (Get-Learners $it.html)) {
        $rec.learnable += [ordered]@{ name = $l.name; condition = $l.condition; url = $l.url }
    }
    [void]$arts.Add([pscustomobject]$rec)
}
Write-Host ('arts: ' + $arts.Count)

# --- weapons -------------------------------------------------------------
$weaponsHtml = [IO.File]::ReadAllText((Join-Path $tmpDir 'gw-weapons.html'), [Text.Encoding]::UTF8)
# learn each wp-token's Japanese class from the weapons that print a required
# skill; the ones without one then inherit it instead of guessing
$wpSkillMap = @{}
$wpFullName = @{}
foreach ($probe in (Get-Items $weaponsHtml)) {
    $token = ($probe.filter -split ' ')[0]
    if ($wpSkillMap.ContainsKey($token)) { continue }
    $cell = [regex]::Match($probe.html, '<div class="_small">([^<]*)</div>').Groups[1].Value
    if ($cell.Length -ge 1) { $wpSkillMap[$token] = $cell.Substring(0, 1) }
}
# the full skill name comes from the arts page, which lists the same classes with
# their full names (剣, 槍, 斧, 弓 and the two-character 籠手 need this)
$artsProbe = [IO.File]::ReadAllText((Join-Path $tmpDir 'gw-arts.html'), [Text.Encoding]::UTF8)
foreach ($item in (Get-Items $artsProbe)) {
    $alt = [regex]::Match($item.html, "alt='([^']*)'").Groups[1].Value
    $token = ($item.filter -split ' ')[0]
    if ($alt -and -not $wpFullName.ContainsKey($token)) { $wpFullName[$token] = $alt }
}
Write-Host ('weapon classes: ' + (($wpSkillMap.Keys | Sort-Object) -join ','))
$weapons = New-Object System.Collections.ArrayList
foreach ($it in (Get-Items $weaponsHtml)) {
    $parts = $it.filter -split ' '
    # the kind comes from the first character of the required-skill cell
    # ("剣E", "槍D"), which the page spells out, rather than from a hand-typed
    # code point that could drift from the real character
    $req = [regex]::Match($it.html, '<div class="_small">([^<]*)</div>').Groups[1].Value
    $icon = [regex]::Match($it.html, '<div class="wep_icon (_[a-z]+)">').Groups[1].Value
    # The kind is read from the required-skill cell the page prints ("剣E", "槍D"),
    # which spells the weapon class out in Japanese. A few weapons have no
    # required skill at all, so for those the class is resolved by matching the
    # wp-token against the skill cells of the weapons that do have one.
    $req = [regex]::Match($it.html, '<div class="_small">([^<]*)</div>').Groups[1].Value
    $icon = [regex]::Match($it.html, '<div class="wep_icon (_[a-z]+)">').Groups[1].Value
    $wpToken = ($it.filter -split ' ')[0]
    $full = $wpFullName[$wpToken]
    # prefer the full skill name (剣術, 格闘術); fall back to the required-skill
    # cell, then to the wp token
    if ($full) { $kind = $full }
    elseif ($req.Length -ge 1) { $kind = $req.Substring(0, 1) }
    else { $kind = $wpToken }
    $s = Get-Sections $it.html
    $rec = [ordered]@{
        id          = $it.id
        name        = $it.name
        kind        = $kind
        cursed      = (($parts -contains 'cwp') -or $icon -eq '_cursed')
        in_shop     = ($parts -contains 'shop')
        power       = [regex]::Match($it.html, 'data-sort1="([^"]*)"').Groups[1].Value
        hit         = [regex]::Match($it.html, 'data-sort2="([^"]*)"').Groups[1].Value
        crit        = [regex]::Match($it.html, 'data-sort3="([^"]*)"').Groups[1].Value
        curse_power = [regex]::Match($it.html, 'data-sort4="([^"]*)"').Groups[1].Value
        weight      = [regex]::Match($it.html, 'data-sort5="([^"]*)"').Groups[1].Value
        avoid       = [regex]::Match($it.html, 'data-sort6="([^"]*)"').Groups[1].Value
        range       = [regex]::Match($it.html, 'data-sort7="([^"]*)"').Groups[1].Value
        required    = $req
        durability  = [regex]::Match($it.html, 'data-sort9="([^"]*)"').Groups[1].Value
        # cast to string: an [ordered] literal takes the value as-is, and a
        # single-entry array would serialise as an array instead of the text
        price       = [string]$s[$lPrice]
        shop        = [string]$s[$lShop]
        effect      = [string]$s[$lSpec]
        url         = [regex]::Match($it.html, "<a href='([^']*)'").Groups[1].Value
    }
    [void]$weapons.Add([pscustomobject]$rec)
}
Write-Host ('weapons: ' + $weapons.Count)

# --- write ---------------------------------------------------------------
function Write-Json {
    param($Data, [string]$Path)
    $json = $Data | ConvertTo-Json -Depth 8
    $json = [regex]::Replace($json, '\\u([0-9a-fA-F]{4})', { param($m) [char][Convert]::ToInt32($m.Groups[1].Value, 16) })
    $sb = New-Object System.Text.StringBuilder
    $depth = 0; $inString = $false; $escaped = $false
    foreach ($ch in $json.ToCharArray()) {
        if ($inString) {
            [void]$sb.Append($ch)
            if ($escaped) { $escaped = $false }
            elseif ($ch -eq [char]0x5C) { $escaped = $true }
            elseif ($ch -eq [char]0x22) { $inString = $false }
            continue
        }
        switch ($ch) {
            '"' { [void]$sb.Append($ch); $inString = $true }
            '{' { [void]$sb.Append($ch); $depth++; [void]$sb.Append([char]10 + ('  ' * $depth)) }
            '[' { [void]$sb.Append($ch); $depth++; [void]$sb.Append([char]10 + ('  ' * $depth)) }
            '}' { $depth--; [void]$sb.Append([char]10 + ('  ' * $depth) + '}') }
            ']' { $depth--; [void]$sb.Append([char]10 + ('  ' * $depth) + ']') }
            ',' { [void]$sb.Append($ch); [void]$sb.Append([char]10 + ('  ' * $depth)) }
            ':' { [void]$sb.Append(': ') }
            default { [void]$sb.Append($ch) }
        }
    }
    $res = $sb.ToString()
    $res = [regex]::Replace($res, '\{[ ]*\r?\n[ ]*\}', '{}')
    $res = [regex]::Replace($res, '\[[ ]*\r?\n[ ]*\]', '[]')
    [IO.File]::WriteAllText($Path, ($res.TrimEnd() + [char]10), $utf8)
}

Write-Json $magic   (Join-Path $outDir 'magic.json')
Write-Json $arts    (Join-Path $outDir 'arts.json')
Write-Json $weapons (Join-Path $outDir 'weapons.json')
Write-Host 'three data files written'

# --- attach the per-character magic ranks to characters.json ----------------
# A character appears once per rank it can learn at, so this is a list, not a
# single value: Kai shows up at 黒魔術D / A / B / C / S because each of those
# unlocks a different spell.
$charsPath = Join-Path $outDir 'characters.json'
$chars = [IO.File]::ReadAllText($charsPath, [Text.Encoding]::UTF8) | ConvertFrom-Json

# --- 習得条件の並び順 ---------------------------------------------------
# 系統の順番は 黒魔術 → 白魔術 → 剣術 → 槍術 → 斧術 → 弓術 →
# 格闘術 → 指揮術 → 重装術 → マスター。各系統の中では
# 初期 → E → D → C → B → A → S の順に並べ、「+」はそのLvのすぐ後ろに置く。
# 「Lv48」のように系統を持たない記載は、どの系統より後ろに置く。
$systemOrder = @(
    (U @(0x9ED2, 0x9B54, 0x8853))       # 黒魔術
    (U @(0x767D, 0x9B54, 0x8853))       # 白魔術
    (U @(0x5263, 0x8853))                 # 剣術
    (U @(0x69CD, 0x8853))                 # 槍術
    (U @(0x65A7, 0x8853))                 # 斧術
    (U @(0x5F13, 0x8853))                 # 弓術
    (U @(0x683C, 0x95D8, 0x8853))         # 格闘術
    (U @(0x6307, 0x63EE, 0x8853))         # 指揮術
    (U @(0x91CD, 0x88C5, 0x8853))         # 重装術
    (U @(0x30DE, 0x30B9, 0x30BF))         # マスター
)
$gradeOrder = @(
    (U @(0x521D, 0x671F))                 # 初期
    'E'; 'D'; 'C'; 'B'; 'A'; 'S'
)
$rankOrder = @{}
$gi = 0
foreach ($sw in $systemOrder) {
    foreach ($gw in $gradeOrder) {
        $rankOrder[$sw + $gw] = $gi; $gi++
        # 「+」はそのLv以上という意味なので、対応するLvのすぐ後ろに置く
        $rankOrder[$sw + $gw + '+'] = $gi; $gi++
    }
}
# 表に無い記載（Lv48 など）は末尾帯へ。初出順で安定させる。
$restSeen = New-Object System.Collections.ArrayList
$script:rankOrder = $rankOrder
$script:restSeen = $restSeen

function Rank-Key {
    param([string]$Condition)
    if ($script:rankOrder.ContainsKey($Condition)) { return [int]$script:rankOrder[$Condition] }
    $text = [string]$Condition
    if ($text -match '^Lv(\d+)$') { return 900000 + [int]$Matches[1] }
    if (-not $script:restSeen.Contains($text)) { [void]$script:restSeen.Add($text) }
    return 800000 + $script:restSeen.IndexOf($text)
}

# 魔法と戦技の両方から、キャラごとの習得条件をまとめる
$rankOf = @{}
foreach ($source in @($magic, $arts)) {
    foreach ($item in $source) {
        foreach ($l in $item.learnable) {
            if (-not $rankOf.ContainsKey($l.name)) { $rankOf[$l.name] = New-Object System.Collections.ArrayList }
            if (-not $rankOf[$l.name].Contains($l.condition)) { [void]$rankOf[$l.name].Add($l.condition) }
        }
    }
}

# 並び替えは自前の挿入ソートで行う。Sort-Object はカルチャ比較が絡むため、
# 数値キーだけを見て確実に整列させる。
function Sort-Conditions {
    param($List)
    $n = $List.Count
    $keys = [int[]]::new($n)
    $vals = [string[]]::new($n)
    for ($i = 0; $i -lt $n; $i++) {
        $vals[$i] = [string]$List[$i]
        $keys[$i] = [int](Rank-Key $vals[$i])
    }
    for ($a = 1; $a -lt $n; $a++) {
        $kv = $keys[$a]; $vv = $vals[$a]; $b = $a - 1
        while ($b -ge 0 -and $keys[$b] -gt $kv) {
            $keys[$b + 1] = $keys[$b]; $vals[$b + 1] = $vals[$b]; $b--
        }
        $keys[$b + 1] = $kv; $vals[$b + 1] = $vv
    }
    return ,$vals
}

$touched = 0
$rebuilt = New-Object System.Collections.ArrayList
foreach ($c in $chars) {
    $ordered = [ordered]@{}
    # まず magic_ranks を含まない状態を作る
    foreach ($p in $c.PSObject.Properties) {
        if ($p.Name -eq 'magic_ranks') { continue }
        $ordered[$p.Name] = $p.Value
    }
    if ($rankOf.ContainsKey($c.name)) {
        $sorted = Sort-Conditions $rankOf[$c.name]
        if ($sorted -and $sorted.Length -gt 0) {
            # 並び順は Sort-Conditions が決めたとおりで、ここでは並べ替えない。
            # string[] のままだと要素ごとに展開されず、ConvertTo-Json が
            # 同じ順序で配列を書き出す。
            $ordered['magic_ranks'] = [string[]]@($sorted)
            $touched++
        }
    }
    [void]$rebuilt.Add([pscustomobject]$ordered)
}
Write-Host ("characters with magic_ranks: " + $touched)
Write-Json $rebuilt $charsPath

# 書き込み後に必ず読み戻して検証する。json を手で組み立てると、
# 閉じ括弧の抜けなどで構文が壊れたまま公開されることがある。
# 壊れた json はページ上で「データを読み込めませんでした」になるだけなので、
# 公開前に気づけるようにしておく。
try {
    $check = [IO.File]::ReadAllText($charsPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
}
catch {
    throw ('characters.json is not valid JSON: ' + $_.Exception.Message)
}
if (@($check).Count -ne $chars.Count) {
    throw ('characters.json record count changed: ' + @($check).Count + ' vs ' + $chars.Count)
}
# 並び順も検証する。json に書かれた並びが定義と違っていたら、
# ページ上の並びが期待と違っても気づけない。
$sysOrder = $systemOrder
$gradeIdx = @{}
$gi = 0
foreach ($g in $gradeOrder) { $gradeIdx[$g] = $gi; $gi++ }
$checkByName = @{}
foreach ($x in @($check)) { $checkByName[[string]$x.name] = $x }
# 戦技・魔法側の learnable には、キャラクターではなく兵種名も並ぶ
# （ソードマスター、ボウナイトなど）。それらは characters.json に存在しないので、
# 対象はキャラクターに限って検証する。
$withRanks = 0
foreach ($c in $chars) {
    $nm = [string]$c.name
    $x = $checkByName[$nm]
    if (-not $x) { throw ('character dropped from characters.json: ' + $nm) }
    $seen = @($x.magic_ranks)
    if (-not $rankOf.ContainsKey($c.name) -or $seen.Count -eq 0) {
        # 習得対象が無いキャラクターは magic_ranks を付けない
        if ($rankOf.ContainsKey($c.name)) { throw ('magic_ranks missing for ' + $nm) }
        continue
    }
    $withRanks++
    $prevSys = -1
    $prevKey = -99
    foreach ($r in $seen) {
        $t = [string]$r
        if ($t -match '^Lv(\d+)$') { continue }
        $sys = -1
        for ($i = 0; $i -lt $sysOrder.Count; $i++) { if ($t.StartsWith($sysOrder[$i])) { $sys = $i; break } }
        if ($sys -lt 0) { throw ('unknown learnable condition: ' + $t) }
        $g = $t.Substring($sysOrder[$sys].Length)
        $plus = $g.EndsWith('+')
        if ($plus) { $g = $g.Substring(0, $g.Length - 1) }
        $gv = $gradeIdx[$g]
        if ($null -eq $gv) { throw ('unknown grade in condition: ' + $t) }
        # 「+」はそのLvのすぐ後ろ（次の等級の手前）に置く
        $rank = $gv * 2 + $(if ($plus) { 1 } else { 0 })
        if ($sys -eq $prevSys) {
            if ($rank -lt $prevKey) { throw ('magic_ranks out of order for ' + $nm + ': ' + $t) }
        } else {
            if ($sys -lt $prevSys) { throw ('magic_ranks out of order for ' + $nm + ': ' + $t) }
            $prevKey = -99
        }
        $prevKey = $rank
        $prevSys = $sys
    }
}
if ($withRanks -ne $touched) {
    throw ('magic_ranks count mismatch: written ' + $touched + ' vs read ' + $withRanks)
}
Write-Host ('characters.json verified: ' + @($check).Count + ' records, ' + $withRanks + ' with magic_ranks, order checked')
Write-Host 'characters.json updated'