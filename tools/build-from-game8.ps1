<#
.SYNOPSIS
    FE (Banshisenko) database builder.

.DESCRIPTION
    Reads Game8's static "ikusei simulator" JSON
    (https://assets.game8.jp/tools/script_template/fe_banshisenko_ikusei_sim.json)
    and converts it into the JSON files this static site reads.

    The source file uses opaque column keys (col_1, col_2, ...). The mapping to
    readable fields is verified against Game8's rendered tables and is
    documented in tools/MAPPINGS.md.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\build-from-game8.ps1
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\build-from-game8.ps1 -Download
#>
[CmdletBinding()]
param(
    [string]$SourceFile = 'c:\Users\admin\Desktop\FE\.tmp\ikusei.json',
    [string]$SourceUrl  = 'https://assets.game8.jp/tools/script_template/fe_banshisenko_ikusei_sim.json',
    [string]$OutDir     = 'c:\Users\admin\Desktop\FE\data',
    [switch]$Download
)

$ErrorActionPreference = 'Stop'
if ($Download -or -not (Test-Path $SourceFile)) {
    Write-Host "Downloading $SourceUrl ..."
    $dir = Split-Path $SourceFile -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    curl.exe -sL -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' $SourceUrl -o $SourceFile
}

# ---------------------------------------------------------------- helpers ----
function Clean([object]$v) {
    if ($null -eq $v) { return $null }
    $s = ([string]$v) -replace '[\r\n\t]+', ' '
    $s = $s.Trim()
    if ($s -eq '') { return $null }
    return $s
}

function SplitList([object]$v) {
    $s = Clean $v
    if (-not $s) { return @() }
    return @($s -split ':' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
}

# "+10" / "-5" / "0" -> 10 / -5 / 0
function Num([object]$v) {
    $s = Clean $v
    if ($null -eq $s) { return $null }
    $s = $s -replace '[+]', ''
    $n = 0
    if ([int]::TryParse($s, [ref]$n)) { return $n }
    return $null
}

# Japanese literals are built from code points so this script stays ASCII only
# (Windows PowerShell reads BOM-less .ps1 as ANSI and would corrupt them).
function U { param([string]$hex) -join (($hex -split '\s+') | Where-Object { $_ } | ForEach-Object { [char][Convert]::ToInt32($_, 16) }) }

$Female  = U '5973 6027'   # "jo sex" (women)
$Male    = U '7537'        # "dan" (men, the value app.js compares against gender)
$MaleSex = U '7537 6027'   # "dan sex" (men, as the lock text reads)
$Only    = U '9650 5B9A'   # "limited to"
$NA      = U '5BFE 8C61 5916'   # "not applicable"
# A literal range: PowerShell would turn two code points into a single character,
# which is not the character class a regex needs.
# Kanji plus katakana, because a movement type such as 騎乗 is written in
# katakana while the skill effect may use either script.
$Kanbun  = '\u4e00-\u9fff\u30a0-\u30ff'
$NoClassOf = U '306E 5175 7A2E 306B 306A 308C 306A 3044'   # "...cannot become a class"
# The type list is written before the phrase and separated by ideographic
# commas, so capture the whole run and let SplitList break it apart. The run is
# matched lazily; a greedy match would swallow the comma and join two types.
# The list of types sits right before the phrase, separated by ideographic
# commas. Scan backwards from the phrase instead of guessing a list length: take
# the two to four characters that precede it, then split on the comma.
$NoClassPattern = '([\u4e00-\u9fff\u30a0-\u30ff]{2,4}?)[\u3001]?([\u4e00-\u9fff\u30a0-\u30ff]{2,4}?)?[\u3001]?' + $NoClassOf

# id-safe slug (japanese kept as-is; these are only used as DOM ids)
function Slug([string]$s) {
    $t = $s -replace '[^0-9A-Za-z\u3040-\u30ff\u4e00-\u9faf]+', '_'
    $t = $t -replace '^_+|_+$', ''
    return $t.ToLowerInvariant()
}

function Format-Json([string]$json) {
    # PowerShell 5.1's ConvertTo-Json pads with double spaces and nests deep;
    # re-emit compact, 2-space indented JSON (values never contain newlines).
    $json = [regex]::Replace($json, '\r?\n\s*', '')
    $json = [regex]::Replace($json, '"\s*:\s*', '": ')
    $sb = New-Object System.Text.StringBuilder
    $depth = 0
    $inString = $false
    $escaped = $false
    foreach ($ch in $json.ToCharArray()) {
        if ($inString) {
            [void]$sb.Append($ch)
            if ($escaped) { $escaped = $false }
            elseif ($ch -eq '\') { $escaped = $true }
            elseif ($ch -eq '"') { $inString = $false }
            continue
        }
        switch ($ch) {
            '"'  { $inString = $true; [void]$sb.Append($ch) }
            '{'  { [void]$sb.Append($ch); $depth++; [void]$sb.Append("`n" + ('  ' * $depth)) }
            '['  { [void]$sb.Append($ch); $depth++; [void]$sb.Append("`n" + ('  ' * $depth)) }
            '}'  { $depth--; [void]$sb.Append("`n" + ('  ' * $depth) + '}') }
            ']'  { $depth--; [void]$sb.Append("`n" + ('  ' * $depth) + ']') }
            ','  { [void]$sb.Append($ch); [void]$sb.Append("`n" + ('  ' * $depth)) }
            ':'  { [void]$sb.Append(': ') }
            default { [void]$sb.Append($ch) }
        }
    }
    $out = $sb.ToString()
    # collapse empty containers: "{  \n<pad>}" -> "{}"
    $out = [regex]::Replace($out, '\{[ ]*\r?\n[ ]*\}', '{}')
    $out = [regex]::Replace($out, '\[[ ]*\r?\n[ ]*\]', '[]')
    return ($out.TrimEnd() + "`n")
}

function Write-Json([object]$value, [string]$path) {
    $json = $value | ConvertTo-Json -Depth 12
    # PowerShell 5.1 escapes non-ASCII as \uXXXX; restore real UTF-8 characters.
    $json = [regex]::Unescape($json)
    [System.IO.File]::WriteAllText($path, (Format-Json $json), (New-Object System.Text.UTF8Encoding($false)))
    Write-Host ("Wrote {0} ({1:N1} KB)" -f $path, ((Get-Item $path).Length / 1KB))
}


# -------------------------------------------------------- column mappings ----
# Stat order used by BOTH characters (col_20..col_28) and classes (col_3..col_11).
$StatKeys = @('hp', 'str', 'mag', 'spd', 'dex', 'def', 'res', 'lck', 'cha')

# Route blocks inside the recruit-condition group (23028). Each route occupies
# 11 columns and the offsets inside a block are identical.
$Routes = @(
    [pscustomobject]@{ Id = 'kai';      Col = 1;  Label = 'Kai route' },
    [pscustomobject]@{ Id = 'dietrich'; Col = 12; Label = 'Dietrich route' },
    [pscustomobject]@{ Id = 'theodora'; Col = 23; Label = 'Theodora route' },
    [pscustomobject]@{ Id = 'reda';     Col = 34; Label = 'Reda route' },
    [pscustomobject]@{ Id = 'savior';   Col = 45; Label = 'Savior route' }
)
# offsets inside a route block (0 = first column of the block)
$RoMethod = 0   # join method  (story / scout)
$RoPart   = 1   # part         (part 1 / part 3 ...)
$RoStage  = 2   # stage        (chapter 7 / stage 5 ...)
$RoPlace  = 6   # place        (capital Dagsion ...)
$RoSupp   = 7   # support level
$RoFame   = 8   # fame level
$RoExtra  = 10  # negotiation / extra condition
$RoNote   = 5   # savior block free text note (block start + 5 => col_50)

# ----------------------------------------------------------------- load ------
$raw = Get-Content $SourceFile -Raw -Encoding UTF8 | ConvertFrom-Json
$groups = @{}
foreach ($g in $raw) { $groups[[string]$g.id] = $g.db_data }
Write-Host ("Loaded groups: " + (($groups.Keys | Sort-Object) -join ', '))

$charRows  = $groups['23026']   # character growth rates
$classRows = $groups['23029']   # classes
$skillRows = $groups['23030']   # personal skills / blood seals / roots / blaze*
$joinRows  = $groups['23028']   # recruit conditions, per route
$baseRows  = $groups['23049']   # starting class + level 1 stats

function RowByTitle($rows, [string]$title) {
    return $rows | Where-Object { $_.title -eq $title } | Select-Object -First 1
}

# Every movement type any class actually uses, so a movement restriction read
# off an effect text can be checked against this instead of trusted blindly.
$knownMoveTypes = @{}
foreach ($cl in $classRows) {
    $mv = Clean $cl.col_33
    if ($mv) {
        foreach ($part in (SplitList $mv)) {
            if (-not $knownMoveTypes.ContainsKey($part)) { $knownMoveTypes[$part] = $true }
        }
    }
}

# ------------------------------------------- skills / blood seals / roots -----
# Group 23030 holds everything a character owns: category, holders, effect.
$skillEntries = @{}
foreach ($r in $skillRows) {
    $name = Clean $r.title
    if (-not $name) { continue }
    $entry = [ordered]@{
        name   = $name
        type   = (Clean $r.col_1)
        effect = (Clean $r.col_10)
        owners = @(SplitList $r.col_2)
    }
    foreach ($extra in @(@('obtain', 11), @('power', 12), @('range', 13), @('hit', 14), @('critical', 15), @('stat_bonus', 16))) {
        $v = Clean $r.($extra[1])
        if ($v) { $entry[$extra[0]] = $v }
    }
    $skillEntries[$name] = $entry
}
Write-Host ("Skill-like entries: " + $skillEntries.Count)


# ------------------------------------------------------------- characters ----
$characters = @()
$skipped = @()
foreach ($r in $charRows) {
    $name = Clean $r.title
    if (-not $name) { continue }

    # ---- growth rates (col_20..col_28) and total (col_29) ----
    $growth = [ordered]@{}
    $complete = $true
    for ($i = 0; $i -lt $StatKeys.Count; $i++) {
        $v = Num $r.("col_" + (20 + $i))
        if ($null -eq $v) { $complete = $false; break }
        $growth[$StatKeys[$i]] = $v
    }
    if (-not $complete) { $skipped += $name; continue }

    $sum = 0
    foreach ($k in $StatKeys) { $sum += $growth[$k] }
    $declared = Num $r.col_29
    if ($null -ne $declared -and $declared -ne $sum) {
        Write-Warning ("{0}: growth total mismatch (declared {1} vs computed {2})" -f $name, $declared, $sum)
    }
    $growth['total'] = $sum

    $c = [ordered]@{
        id           = (Slug $name)
        name         = $name
        gender       = (Clean $r.col_3)
        growth_rates = $growth
    }
    if (Clean $r.url)    { $c['source_url'] = (Clean $r.url) }
    if (Clean $r.col_59) { $c['voice_actor'] = (Clean $r.col_59) }
    if (Clean $r.col_30) { $c['favorites']   = (Clean $r.col_30) }

    # ---- portrait ----
    # Stored as a site-root-relative path so the JSON stays portable, and the
    # file is fetched locally by tools\fetch-character-images.ps1 rather than
    # hotlinked, so the pages render offline and never depend on their CDN.
    if ((Clean $r.image_url) -and ($name -notmatch '[\\/:*?"<>|]')) {
        $ext = 'webp'
        if ((Clean $r.image_url) -match '\.(png|jpe?g|webp|gif)/') { $ext = $Matches[1].ToLower() }
        $c['image'] = "images/characters/$name.$ext"
    }

    # ---- blaze related fields (only the nine "blaze" units have them) ----
    if (Clean $r.col_5) { $c['blaze_type']  = (Clean $r.col_5) }
    if (Clean $r.col_6) { $c['blaze_skill'] = (Clean $r.col_6) }
    if (Clean $r.col_8) { $c['blaze_arts']  = (Clean $r.col_8) }

    # ---- skills ----
    $forte  = @(SplitList $r.col_12)
    $usable = @(SplitList $r.col_13)
    $weak   = @(SplitList $r.col_14)
    if ($forte.Count)  { $c['forte_skills']  = $forte }
    if ($usable.Count) { $c['usable_skills'] = $usable }
    if ($weak.Count)   { $c['weak_skills']   = $weak }

    # ---- personal skill (col_10) and blood seals (col_11), resolved via 23030 ----
    $psName = Clean $r.col_10
    if ($psName) {
        $ps = [ordered]@{ name = $psName }
        if ($skillEntries.ContainsKey($psName) -and $skillEntries[$psName].effect) {
            $ps['effect'] = $skillEntries[$psName].effect
        }
        $c['personal_skill'] = $ps
    }
    $seals = @()
    foreach ($sn in @(SplitList $r.col_11)) {
        $s = [ordered]@{ name = $sn }
        if ($skillEntries.ContainsKey($sn) -and $skillEntries[$sn].effect) {
            $s['effect'] = $skillEntries[$sn].effect
        }
        $seals += $s
    }
    if ($seals.Count) { $c['blood_seals'] = $seals }

    # Movement types this unit may never take, read off the effect text of the
    # personal skill or a blood seal that forbids a class.
    $blocked = New-Object System.Collections.Generic.List[string]
    $effectTexts = @()
    if ($c['personal_skill'] -and $c['personal_skill']['effect']) { $effectTexts += $c['personal_skill']['effect'] }
    foreach ($s in $seals) { if ($s['effect']) { $effectTexts += $s['effect'] } }
    foreach ($txt in $effectTexts) {
        foreach ($mm in [regex]::Matches($txt, $NoClassPattern)) {
            foreach ($grp in @($mm.Groups[1], $mm.Groups[2])) {
                if (-not $grp.Success) { continue }
                foreach ($mv in (SplitList $grp.Value)) {
                    # keep only names some class actually uses; a loose match can
                    # run into the surrounding sentence and invent a type
                    if ($knownMoveTypes.ContainsKey($mv) -and -not $blocked.Contains($mv)) { $blocked.Add($mv) }
                }
            }
        }
    }
    # The in-game mounted term covers both of ours, so list both spellings.
    $Mounted = U '9A0E 4E57'
    $Rider   = U '9A0E 5175'
    if ($blocked.Contains($Mounted)) {
        foreach ($alt in @($Mounted, $Rider)) { if (-not $blocked.Contains($alt)) { $blocked.Add($alt) } }
    }
    if ($blocked.Count) { $c['blocked_move_types'] = @($blocked) }

    # ---- status when the unit first appears (group 23049).
    #      Note: col_2 is the level the unit joins at (1 for the protagonists and
    #      chapter 1 recruits, 8 / 12 / 23 / 45 for later recruits).
    $b = RowByTitle $baseRows $name
    if ($b -and (Clean $b.col_1)) {
        $init = [ordered]@{
            class = (Clean $b.col_1)
            level = (Num $b.col_2)
        }
        $bstats = [ordered]@{}
        for ($i = 0; $i -lt $StatKeys.Count; $i++) {
            $v = Num $b.("col_" + (3 + $i))
            if ($null -ne $v) { $bstats[$StatKeys[$i]] = $v }
        }
        if ($bstats.Count) { $init['stats'] = $bstats }
        $c['start'] = $init
    }

    # ---- recruit conditions per route (group 23028) ----
    $j = RowByTitle $joinRows $name
    if ($j) {
        $recruit = [ordered]@{}
        foreach ($rt in $Routes) {
            $start  = $rt.Col
            $method = Clean $j.("col_" + ($start + $RoMethod))
            $stage  = Clean $j.("col_" + ($start + $RoStage))
            if (-not $method -and -not $stage) { continue }
            $e = [ordered]@{}
            if ($method)             { $e['method'] = $method }
            $part = Clean $j.("col_" + ($start + $RoPart))
            if ($part)               { $e['part']  = $part }
            if ($stage)              { $e['stage'] = $stage }
            $place = Clean $j.("col_" + ($start + $RoPlace))
            if ($place)              { $e['place'] = $place }
            $supp = Num $j.("col_" + ($start + $RoSupp))
            if ($null -ne $supp)     { $e['support_level'] = $supp }
            $fame = Num $j.("col_" + ($start + $RoFame))
            if ($null -ne $fame)     { $e['fame_level'] = $fame }
            $extra = Clean $j.("col_" + ($start + $RoExtra))
            if ($extra)              { $e['condition'] = $extra }
            $note = Clean $j.("col_" + ($start + $RoNote))
            if ($note)               { $e['note'] = $note }
            $recruit[$rt.Id] = $e
        }
        if ($recruit.Count) { $c['recruit'] = $recruit }
    }

    $characters += [pscustomobject]$c
}
Write-Host ("Characters with growth data: " + $characters.Count)
if ($skipped.Count) { Write-Host ("Skipped (no growth data): " + ($skipped -join ', ')) }


# ---------------------------------------------------------------- classes ----
$classes = @()
$classSkills = @()   # unit skills and master skills come from the class group
foreach ($r in $classRows) {
    $name = Clean $r.title
    if (-not $name) { continue }

    $c = [ordered]@{
        id   = (Slug $name)
        name = $name
        tier = (Clean $r.col_1)
    }
    # col_2 carries a gender lock (e.g. a "women only" marker). Store it as the
    # genders the class EXCLUDES, which is how app.js checks it; a unit with no
    # gender, such as the saviour, is then excluded from neither side.
    $lock = Clean $r.col_2
    if ($lock) {
        $excluded = New-Object System.Collections.Generic.List[string]
        if ($lock -match ($Female + $Only)) { $excluded.Add($Male) }
        if ($lock -match ($MaleSex + $Only)) { $excluded.Add([char]0x5973) }
        if ($excluded.Count) { $c['excluded_genders'] = @($excluded) }
    }
    if (Clean $r.url) { $c['source_url'] = (Clean $r.url) }

    # per stat growth bonus (col_3..col_11)
    $g = [ordered]@{}
    for ($i = 0; $i -lt $StatKeys.Count; $i++) {
        $v = Num $r.("col_" + (3 + $i))
        if ($null -ne $v) { $g[$StatKeys[$i]] = $v }
    }
    if ($g.Count) { $c['growth_bonus'] = $g }

    # per stat starting bonus (col_12..col_20). Separate from growth_bonus: the
    # first is the growth rate the unit gains with, the second is added to the
    # stats the unit starts with when it changes into this class. Game8's own
    # expected-value tool reads both, and only this column set was missing here.
    $sb = [ordered]@{}
    for ($i = 0; $i -lt $StatKeys.Count; $i++) {
        $v = Num $r.("col_" + (12 + $i))
        if ($null -ne $v) { $sb[$StatKeys[$i]] = $v }
    }
    if ($sb.Count) { $c['stat_bonus'] = $sb }

    $mv = Num $r.col_34
    if ($null -ne $mv) { $c['movement'] = $mv }
    if (Clean $r.col_33) { $c['move_type'] = (Clean $r.col_33) }
    $tp = Num $r.col_39
    if ($null -ne $tp) { $c['tp'] = $tp }

    $skills = @(SplitList $r.col_35)
    if ($skills.Count) { $c['usable_skills'] = $skills }

    $unitSkill = Clean $r.col_36
    if ($unitSkill) {
        $c['class_skill'] = $unitSkill
        foreach ($s in (SplitList $r.col_36)) {
            $classSkills += [pscustomobject][ordered]@{
                name = $s; type = 'class skill'; source = $name
                effect = $null; owners = @($name)
            }
        }
    }
    $master = Clean $r.col_37
    if ($master) {
        $c['master_skill'] = $master
        $classSkills += [pscustomobject][ordered]@{
            name = $master; type = 'master skill'; source = $name
            effect = $null; owners = @($name)
        }
    }
    # proficiency bonus granted by this class, e.g. "lance +1, mounted +2"
    if (Clean $r.col_40) { $c['weapon_exp_bonus'] = (Clean $r.col_40) }

    # required skill ranks, e.g. "cavalry A"
    $req = @()
    foreach ($pair in @(@(42, 43), @(44, 45), @(46, 47))) {
        $sn = Clean $r.("col_" + $pair[0])
        $rk = Clean $r.("col_" + $pair[1])
        if ($sn -and $rk) { $req += ("{0} {1}" -f $sn, $rk) }
    }
    if ($req.Count) { $c['required_skills'] = $req }

    # skill rank caps, e.g. "sword S / lance S"
    $caps = @()
    foreach ($pair in @(@(48, 49), @(50, 51), @(52, 53), @(54, 55))) {
        $sn = Clean $r.("col_" + $pair[0])
        $rk = Clean $r.("col_" + $pair[1])
        if ($sn -and $rk) { $caps += ("{0} {1}" -f $sn, $rk) }
    }
    if ($caps.Count) { $c['skill_caps'] = $caps }

    if (Clean $r.col_38) { $c['description'] = (Clean $r.col_38) }
    if (Clean $r.col_41) { $c['unlock_item'] = (Clean $r.col_41) }
    if (Clean $r.col_60) { $c['unlock_note'] = (Clean $r.col_60) }

    $classes += [pscustomobject]$c
}
Write-Host ("Classes: " + $classes.Count)


# ----------------------------------------------------------------- skills ----
# Everything from group 23030 (personal skills, blood seals, roots, blaze arts,
# blaze types / skills / arts) plus the unit and master skills taken from classes.
$skills = @()
foreach ($name in ($skillEntries.Keys | Sort-Object)) {
    $e = $skillEntries[$name]
    $s = [ordered]@{
        id     = (Slug $name)
        name   = $name
        type   = $e.type
        effect = $e.effect
        owners = @($e.owners)
    }
    foreach ($k in @('obtain', 'power', 'range', 'hit', 'critical', 'stat_bonus')) {
        if ($e.Contains($k)) { $s[$k] = $e[$k] }
    }
    $skills += [pscustomobject]$s
}
foreach ($s in $classSkills) { $skills += $s }
Write-Host ("Skills: " + $skills.Count)

# --------------------------------------------------------------- validate ----
# Every skill / blood seal / blaze value a character points at must exist in the
# skill table, otherwise the column mapping is wrong.
$unknown = @{}
foreach ($c in $characters) {
    $refs = @()
    $props = $c.PSObject.Properties.Name
    if ($props -contains 'personal_skill') { $refs += $c.personal_skill.name }
    if ($props -contains 'blaze_type')  { $refs += $c.blaze_type }
    if ($props -contains 'blaze_skill') { $refs += $c.blaze_skill }
    if ($props -contains 'blaze_arts')  { $refs += $c.blaze_arts }
    if ($props -contains 'blood_seals') { $refs += @($c.blood_seals | ForEach-Object { $_.name }) }
    foreach ($ref in $refs) {
        if ($ref -and -not $skillEntries.ContainsKey($ref)) { $unknown[$ref] = $true }
    }
}
if ($unknown.Count) {
    Write-Warning ("Unresolved references (column mapping may be wrong): " + (($unknown.Keys | Sort-Object) -join ', '))
} else {
    Write-Host "OK: all skill / blood seal / blaze references resolved"
}

$classNames = @{}
foreach ($c in $classes) { $classNames[$c.name] = $true }
$badClasses = @{}
foreach ($c in $characters) {
    $props = $c.PSObject.Properties.Name
    if ($props -contains 'start' -and $c.start.class -and -not $classNames.ContainsKey($c.start.class)) {
        $badClasses[$c.initial.class] = $true
    }
}
if ($badClasses.Count) { Write-Warning ("Unknown starting classes: " + (($badClasses.Keys) -join ', ')) }
else { Write-Host "OK: all starting classes resolved" }

$noRecruit = @($characters | Where-Object { -not ($_.PSObject.Properties.Name -contains 'recruit') })
if ($noRecruit.Count) { Write-Host ("No recruit info for: " + (($noRecruit | ForEach-Object { $_.name }) -join ', ')) }

# PowerShell unrolls single element arrays, which would turn ["x"] into "x" in
# the JSON output and break the renderer. Catch that here.
$arrayFields = @('forte_skills', 'usable_skills', 'weak_skills', 'blood_seals')
$bad = @()
foreach ($c in $characters) {
    foreach ($f in $arrayFields) {
        if (($c.PSObject.Properties.Name -contains $f) -and $c.$f -isnot [array]) { $bad += "$($c.name).$f" }
    }
}
foreach ($c in $classes) {
    if (($c.PSObject.Properties.Name -contains 'usable_skills') -and $c.usable_skills -isnot [array]) { $bad += "$($c.name).usable_skills" }
}
if ($bad.Count) { Write-Warning ("Fields that would serialise as a scalar: " + ($bad -join ', ')) }
else { Write-Host "OK: all list fields serialise as JSON arrays" }

# ------------------------------------------------------------------ write ----
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
Write-Json $characters (Join-Path $OutDir 'characters.json')
Write-Json $classes   (Join-Path $OutDir 'classes.json')
Write-Json $skills    (Join-Path $OutDir 'skills.json')

# A tiny side-car so the pages can say how fresh the data is. Kept out of the
# three data files because those are plain arrays their consumers iterate.
$meta = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    counts       = [ordered]@{
        characters = $characters.Count
        classes    = $classes.Count
        skills     = $skills.Count
    }
    source_url = $SourceUrl
}

# events.json is hand written, so this script never touches it, but meta.json
# used to carry its count and the footer showed it. Carry it over from the file
# that is already on disk so re-running the build does not drop the number.
$eventsPath = Join-Path $OutDir 'events.json'
if (Test-Path $eventsPath) {
    try {
        $ev = Get-Content $eventsPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $evCount = @($ev.sections | ForEach-Object { $_.events } | ForEach-Object { $_ }).Count
        if ($evCount -gt 0) { $meta['counts']['events'] = $evCount }
    } catch {
        Write-Warning ("could not count data\events.json, its count is left out: " + $_.Exception.Message)
    }
}

Write-Json $meta (Join-Path $OutDir 'meta.json')
Write-Host "Done."

