param(
  [string]$ItemUrl = "",
  [string]$MarketName = "",
  [string]$WeaponSlug = "",
  [string]$FinishToken = "",
  [string]$BaseModelPath = "",
  [string]$AlbedoPath = "",
  [string]$NormalPath = "",
  [string]$RoughnessPath = "",
  [string]$AoPath = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$vpkPath = "D:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive\game\csgo\pak01_dir.vpk"
$s2vPath = Join-Path $projectRoot "tmp-s2v-cli\Source2Viewer-CLI.exe"
$blenderPath = "D:\SteamLibrary\steamapps\common\Blender\blender.exe"
$itemsGameCache = Join-Path $projectRoot "tmp_items_game\scripts\items\items_game.txt"
$tempRoot = Join-Path $projectRoot "tmp_skin_pipeline"
$skinsRoot = Join-Path $projectRoot "assets\models\skins"
$manifestPath = Join-Path $skinsRoot "manifest.json"
$blenderScript = Join-Path $projectRoot "scripts\blender_apply_single_skin.py"
$patinaScript = Join-Path $projectRoot "scripts\blender_bake_patina_skin.py"
$paintIndexCache = Join-Path $tempRoot "paint_vcompmat_index.txt"

function Assert-Exists([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) {
    throw "$Label not found: $Path"
  }
}

function Normalize-WeaponSlug([string]$Slug) {
  switch ($Slug.ToLowerInvariant()) {
    "ak-47" { return "ak47" }
    "aug" { return "aug" }
    "awp" { return "awp" }
    "cz75-auto" { return "cz75a" }
    "desert-eagle" { return "deagle" }
    "dual-berettas" { return "elite" }
    "famas" { return "famas" }
    "five-seven" { return "fiveseven" }
    "g3sg1" { return "g3sg1" }
    "galil-ar" { return "galilar" }
    "glock-18" { return "glock18" }
    "m249" { return "m249" }
    "m4a1-s" { return "m4a1_silencer" }
    "m4a4" { return "m4a4" }
    "mac-10" { return "mac10" }
    "mag-7" { return "mag7" }
    "mp5-sd" { return "mp5sd" }
    "mp7" { return "mp7" }
    "mp9" { return "mp9" }
    "negev" { return "negev" }
    "nova" { return "nova" }
    "p2000" { return "hkp2000" }
    "p250" { return "p250" }
    "p90" { return "p90" }
    "pp-bizon" { return "bizon" }
    "r8-revolver" { return "revolver" }
    "sawed-off" { return "sawedoff" }
    "scar-20" { return "scar20" }
    "sg-553" { return "sg556" }
    "ssg-08" { return "ssg08" }
    "tec-9" { return "tec9" }
    "ump-45" { return "ump45" }
    "usp-s" { return "usp_silencer" }
    "xm1014" { return "xm1014" }
    "bayonet" { return "knife\knife_bayonet" }
    "m9-bayonet" { return "knife\knife_m9" }
    "bowie-knife" { return "knife\knife_bowie" }
    "butterfly-knife" { return "knife\knife_butterfly" }
    "classic-knife" { return "knife\knife_css" }
    "falchion-knife" { return "knife\knife_falchion" }
    "flip-knife" { return "knife\knife_flip" }
    "gut-knife" { return "knife\knife_gut" }
    "huntsman-knife" { return "knife\knife_tactical" }
    "karambit" { return "knife\knife_karambit" }
    "kukri-knife" { return "knife\knife_kukri" }
    "navaja-knife" { return "knife\knife_navaja" }
    "nomad-knife" { return "knife\knife_outdoor" }
    "paracord-knife" { return "knife\knife_cord" }
    "shadow-daggers" { return "knife\knife_push" }
    "skeleton-knife" { return "knife\knife_skeleton" }
    "stiletto-knife" { return "knife\knife_stiletto" }
    "talon-knife" { return "knife\knife_talon" }
    "ursus-knife" { return "knife\knife_ursus" }
    default { return ($Slug.ToLowerInvariant() -replace '-', '') }
  }
}

function Ensure-ItemsGameCache() {
  if (Test-Path $itemsGameCache) {
    return
  }

  $outputDir = Join-Path $projectRoot "tmp_items_game"
  New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
  & $s2vPath -i $vpkPath -o $outputDir --decompile -f "scripts/items/items_game.txt" | Out-Null
}

function Ensure-PaintIndexCache() {
  if (Test-Path $paintIndexCache) {
    return
  }

  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  $listing = & $s2vPath -i $vpkPath -l -f "weapons/paints/"
  $listing | Set-Content $paintIndexCache
}

function Get-MarketNameFromTitle([string]$Html) {
  if ($Html -match '<title>\s*([^<]+?)\s*-\s*CS2 Items\s*</title>') {
    return $Matches[1].Trim()
  }
  return ""
}

function Get-DerivedFinishToken([string]$SourceUrl, [string]$WeaponSlug) {
  if (-not $SourceUrl) {
    return ""
  }
  $lastSegment = ([uri]$SourceUrl).Segments[-1].TrimEnd('/')
  if ($lastSegment -match '^\d+-(.+)$') {
    $suffix = ($Matches[1] -replace '-', '_').ToLowerInvariant()
    return (Normalize-WeaponSlug $WeaponSlug) + "_" + $suffix
  }
  return ""
}

function Get-PaintIndexFromHtml([string]$Html) {
  if ($Html -match 'Finish Catalog:\s*(\d+)') {
    return $Matches[1].Trim()
  }
  return ""
}

function Try-BuildFromCsMoneyAssets(
  [string]$WeaponSlug,
  [string]$PaintIndex,
  [string]$FinishToken,
  [string]$MarketName,
  [string]$SourceUrl
) {
  $nodeScript = Join-Path $projectRoot "scripts\build_textured_model_from_csmoney.js"
  if (-not (Test-Path $nodeScript)) {
    return $false
  }

  $nodeArgs = @(
    $nodeScript,
    "--weapon-slug", $WeaponSlug,
    "--paint-index", $PaintIndex,
    "--finish-token", $FinishToken,
    "--market-name", $MarketName
  )
  if ($SourceUrl) {
    $nodeArgs += @("--source-url", $SourceUrl)
  }

  & node @nodeArgs
  return ($LASTEXITCODE -eq 0)
}

function Get-FinishToken([string]$Html, [string]$WeaponSlug, [string]$SourceUrl) {
  $patterns = @(
    '<li>\s*Finish Catalog:\s*\d+\s*(?:·|&middot;|&#183;|&#xB7;)\s*(?:<[^>]+>)?\s*([a-z0-9_]+)\s*(?:</[^>]+>)?\s*</li>',
    'Finish Catalog:\s*\d+\s*(?:·|&middot;|&#183;|&#xB7;)\s*([a-z0-9_]+)'
  )

  foreach ($pattern in $patterns) {
    if ($Html -match $pattern) {
      return $Matches[1].Trim()
    }
  }

  $derived = Get-DerivedFinishToken $SourceUrl $WeaponSlug
  if ($derived) {
    return $derived
  }

  throw "Finish token not found on page."
}

function Get-CompositeMaterialPath([string]$ItemsGameText, [string]$FinishToken) {
  $lines = $ItemsGameText -split "`r?`n"
  $currentBlock = New-Object System.Collections.Generic.List[string]
  $braceDepth = 0
  $collecting = $false

  foreach ($line in $lines) {
    if (-not $collecting) {
      if ($line -match '^\s*"\d+"\s*$') {
        $currentBlock.Clear()
        $currentBlock.Add($line) | Out-Null
      } elseif ($currentBlock.Count -gt 0 -and $line -match '^\s*\{\s*$') {
        $collecting = $true
        $braceDepth = 1
        $currentBlock.Add($line) | Out-Null
      }
      continue
    }

    $currentBlock.Add($line) | Out-Null
    if ($line -match '\{') { $braceDepth += ([regex]::Matches($line, '\{')).Count }
    if ($line -match '\}') { $braceDepth -= ([regex]::Matches($line, '\}')).Count }

    if ($braceDepth -le 0) {
      $blockText = ($currentBlock -join "`n")
      if ($blockText -match ('"name"\s*"?' + [Regex]::Escape($FinishToken) + '"?')) {
        $pathMatch = [Regex]::Match($blockText, '"composite_material_path"\s*"([^"]+)"')
        if ($pathMatch.Success) {
          return $pathMatch.Groups[1].Value.Trim()
        }
      }

      $collecting = $false
      $braceDepth = 0
      $currentBlock.Clear()
    }
  }

  return ""
}

function Find-FallbackCompositeMaterialPath([string]$FinishToken) {
  Ensure-PaintIndexCache
  $escapedToken = [Regex]::Escape($FinishToken)
  $match = Select-String -Path $paintIndexCache -Pattern ("weapons/paints/.+/" + $escapedToken + "\.vcompmat_c") | Select-Object -First 1
  if (-not $match) {
    return ""
  }

  $line = [string]$match.Line
  if ($line -match '(weapons/paints/[^\s]+\.vcompmat)_c') {
    return $Matches[1]
  }

  return ""
}

function Resolve-CompositeMaterialPath([string]$ItemsGameText, [string]$FinishToken) {
  $direct = Get-CompositeMaterialPath $ItemsGameText $FinishToken
  if ($direct) {
    return $direct
  }

  $fallback = Find-FallbackCompositeMaterialPath $FinishToken
  if ($fallback) {
    return $fallback
  }

  throw "Composite material path not found for $FinishToken"
}

function Get-TexturePathsFromVCompmat([string]$VCompmatPath) {
  $content = Get-Content $VCompmatPath -Raw
  $map = @{}
  $currentName = ""
  foreach ($line in ($content -split "`r?`n")) {
    if ($line -match 'm_strName = "([^"]+)"') {
      $currentName = $Matches[1]
      continue
    }
    if ($line -match 'm_strTextureRuntimeResourcePath = resource_name:"([^"]+)"') {
      $map[$currentName] = $Matches[1]
    }
  }
  return $map
}

function Get-SpecificMaterialPathFromVCompmat([string]$VCompmatPath) {
  $content = Get-Content $VCompmatPath -Raw
  $match = [Regex]::Match($content, 'm_strSpecificContainerMaterial\s*=\s*(?:resource_name:)?\"([^\"]+)\"')
  if ($match.Success) {
    return $match.Groups[1].Value.Trim()
  }
  return ""
}

function Get-TexturePathsFromVmat([string]$VmatPath) {
  $content = Get-Content $VmatPath -Raw
  $map = @{}

  foreach ($name in @(
    "g_tPattern",
    "g_tNormal",
    "g_tAmbientOcclusion",
    "g_tPaintRoughness",
    "g_tMetalness",
    "g_tPearlescenceMask",
    "g_tColor",
    "g_tMasks"
  )) {
    $match = [Regex]::Match($content, '"' + [Regex]::Escape($name) + '"\s*"([^"]+)"')
    if ($match.Success) {
      $map[$name] = $match.Groups[1].Value.Trim()
    }
  }

  return $map
}

function Get-AsciiStringsFromBinary([string]$FilePath) {
  $bytes = [System.IO.File]::ReadAllBytes($FilePath)
  $text = [System.Text.Encoding]::ASCII.GetString($bytes)
  $values = New-Object System.Collections.Generic.List[string]
  foreach ($match in [Regex]::Matches($text, '[ -~]{8,}')) {
    $values.Add($match.Value) | Out-Null
  }
  return $values
}

function Get-TexturePathsFromCompiledVmatC([string]$SpecificMaterialPath, [string]$WorkDir) {
  # Current CS2 shader bytecode (VCS v71) breaks VRF material decompile.
  # Fall back to dumping the compiled .vmat_c and recovering texture paths from embedded strings.
  $rawDir = Join-Path $WorkDir "vmat_raw"
  New-Item -ItemType Directory -Force -Path $rawDir | Out-Null
  $filter = if ($SpecificMaterialPath.ToLowerInvariant().EndsWith(".vmat")) {
    $SpecificMaterialPath + "_c"
  } else {
    $SpecificMaterialPath
  }
  & $s2vPath -i $vpkPath -o $rawDir -f $filter | Out-Null
  $rawFile = Get-ChildItem $rawDir -Recurse -Filter "*.vmat_c" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $rawFile) {
    return @{}
  }

  $strings = Get-AsciiStringsFromBinary $rawFile.FullName
  $vtexPaths = @(
    $strings |
      Where-Object { $_ -match '(?i)^materials/.+\.vtex$' } |
      ForEach-Object { $_.Trim() } |
      Select-Object -Unique
  )
  if (-not $vtexPaths.Count) {
    return @{}
  }

  $map = @{}
  $patternCandidates = @(
    $vtexPaths | Where-Object {
      ($_ -match '(?i)/paints/') -and
      ($_ -notmatch '(?i)(_normal_|paint_wear|gun_grunge|default_paintao|default_paintmask|default_rough|default_weapon_color|glitter_normal)')
    }
  )
  if ($patternCandidates.Count -gt 0) {
    $map["g_tPattern"] = (
      $patternCandidates | Sort-Object `
        @{ Expression = { if ($_ -match '(?i)/workshop/') { 0 } elseif ($_ -match '(?i)_tga_') { 1 } elseif ($_ -match '(?i)/default/') { 3 } else { 2 } } }, `
        @{ Expression = { $_.Length }; Descending = $true } |
      Select-Object -First 1
    )
  }

  $normal = $vtexPaths | Where-Object { $_ -match '(?i)_normal_' -and $_ -notmatch '(?i)glitter_normal|squares_glitter' } | Select-Object -First 1
  if (-not $normal) {
    $normal = $vtexPaths | Where-Object { $_ -match '(?i)_normal_' } | Select-Object -First 1
  }
  if ($normal) { $map["g_tNormal"] = $normal }

  $color = $vtexPaths | Where-Object { $_ -match '(?i)default_weapon_color|/g_tColor|_color_' } | Select-Object -First 1
  if ($color) { $map["g_tColor"] = $color }

  $masks = $vtexPaths | Where-Object { $_ -match '(?i)default_paintmask|paintmask|_masks_' } | Select-Object -First 1
  if ($masks) { $map["g_tMasks"] = $masks }

  $ao = $vtexPaths | Where-Object { $_ -match '(?i)default_paintao|paintao|ambientocclusion' } | Select-Object -First 1
  if ($ao) { $map["g_tAmbientOcclusion"] = $ao }

  $rough = $vtexPaths | Where-Object { $_ -match '(?i)default_rough|paintroughness|metalness' } | Select-Object -First 1
  if ($rough) { $map["g_tPaintRoughness"] = $rough }

  return $map
}

function Export-VtexToPng([string]$RuntimeResourcePath, [string]$OutputDir) {
  $resourceFilter = if ($RuntimeResourcePath.ToLowerInvariant().EndsWith(".vtex")) {
    $RuntimeResourcePath + "_c"
  } else {
    $RuntimeResourcePath
  }

  & $s2vPath -i $vpkPath -o $OutputDir --decompile -f $resourceFilter | Out-Null
  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($RuntimeResourcePath)
  $png = Get-ChildItem $OutputDir -Recurse -Filter ($baseName + ".png") -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($png) {
    return $png.FullName
  }
  return $null
}

function Find-WeaponDefaultTexture([string]$WeaponFolder, [string]$Kind, [string]$OutputDir) {
  # Kind: normal | ao | rough | color
  $listing = & $s2vPath -i $vpkPath -l -f ("weapons/models/" + $WeaponFolder + "/materials/")
  $pattern = switch ($Kind.ToLowerInvariant()) {
    "normal" { "default_normal" }
    "ao" { "default_ao" }
    "rough" { "default_rough" }
    "color" { "default_color" }
    default { $Kind }
  }
  $match = $listing | Where-Object { $_ -match [Regex]::Escape($pattern) -and $_ -match '\.vtex_c' } | Select-Object -First 1
  if (-not $match) {
    return $null
  }
  if ($match -match '(weapons/models/[^\s]+\.vtex)_c') {
    return Export-VtexToPng $Matches[1] $OutputDir
  }
  return $null
}

function Get-PaintIndexFromItemsGame([string]$ItemsGameText, [string]$FinishToken) {
  if (-not $ItemsGameText -or -not $FinishToken) {
    return ""
  }

  $lines = $ItemsGameText -split "`r?`n"
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -notmatch ('"name"\s*"' + [Regex]::Escape($FinishToken) + '"')) {
      continue
    }
    for ($scan = $index; $scan -ge 0; $scan--) {
      if ($lines[$scan] -match '^\s*"(\d+)"\s*$') {
        return $Matches[1]
      }
    }
  }

  return ""
}

function ShouldUsePatinaBake([string]$FinishToken) {
  if (-not $FinishToken) {
    return $false
  }
  return $FinishToken -match '^(aq_|am_)'
}

function ShouldSkipCsMoneyColorBake([string]$FinishToken) {
  if (-not $FinishToken) {
    return $false
  }
  # CS.MONEY only ships normal/ORM for many finishes — not a usable albedo (yellow/wrong bake).
  return $FinishToken -match '^(aq_|am_|gs_)'
}

function Get-CsMoneyLegacyMeshFolder([string]$WeaponSlug) {
  switch ($WeaponSlug.ToLowerInvariant()) {
    "ak-47" { return "weapon_ak47" }
    "m4a4" { return "weapon_m4a1" }
    "m4a1-s" { return "weapon_m4a1_silencer" }
    "awp" { return "weapon_awp" }
    "usp-s" { return "weapon_usp_silencer" }
    "glock-18" { return "weapon_glock18" }
    "desert-eagle" { return "weapon_deagle" }
    "p250" { return "weapon_p250" }
    "famas" { return "weapon_famas" }
    "galil-ar" { return "weapon_galilar" }
    "aug" { return "weapon_aug" }
    "sg-553" { return "weapon_sg556" }
    "ssg-08" { return "weapon_ssg08" }
    "scar-20" { return "weapon_scar20" }
    "g3sg1" { return "weapon_g3sg1" }
    "mac-10" { return "weapon_mac10" }
    "mp9" { return "weapon_mp9" }
    "mp7" { return "weapon_mp7" }
    "mp5-sd" { return "weapon_mp5sd" }
    "ump-45" { return "weapon_ump45" }
    "p90" { return "weapon_p90" }
    "pp-bizon" { return "weapon_bizon" }
    "nova" { return "weapon_nova" }
    "xm1014" { return "weapon_xm1014" }
    "mag-7" { return "weapon_mag7" }
    "sawed-off" { return "weapon_sawedoff" }
    "m249" { return "weapon_m249" }
    "negev" { return "weapon_negev" }
    "cz75-auto" { return "weapon_cz75a" }
    "tec-9" { return "weapon_tec9" }
    "five-seven" { return "weapon_fiveseven" }
    "dual-berettas" { return "weapon_elite" }
    "p2000" { return "weapon_hkp2000" }
    "r8-revolver" { return "weapon_revolver" }
    default { return $null }
  }
}

function Ensure-CsMoneyLegacyMesh([string]$WeaponSlug, [string]$WorkDir) {
  $meshFolder = Get-CsMoneyLegacyMeshFolder $WeaponSlug
  if (-not $meshFolder) {
    return $null
  }

  $meshDir = Join-Path $WorkDir "csmoney"
  $meshPath = Join-Path $meshDir "mesh.glb"
  if (Test-Path $meshPath) {
    return $meshPath
  }

  New-Item -ItemType Directory -Force -Path $meshDir | Out-Null
  $meshUrl = "https://assets.cs.money/3d/assets/rifles/$meshFolder/legacy/mesh.glb"
  Write-Host "Downloading CS.MONEY legacy mesh: $meshUrl"
  Invoke-WebRequest -Uri $meshUrl -OutFile $meshPath -UseBasicParsing
  if (-not (Test-Path $meshPath)) {
    return $null
  }
  return $meshPath
}

function Get-UseLegacyModel([string]$ItemsGameText, [string]$FinishToken) {
  if (-not $ItemsGameText -or -not $FinishToken) {
    return $false
  }
  $pattern = '"name"\s+"' + [Regex]::Escape($FinishToken) + '"[\s\S]*?"use_legacy_model"\s+"1"'
  return [bool]($ItemsGameText -match $pattern)
}

function Update-Manifest([string]$MarketName, [string]$FinishToken, [string]$ModelPath, [string]$SourceUrl) {
  New-Item -ItemType Directory -Force -Path $skinsRoot | Out-Null
  $relativeModel = $ModelPath.Replace($projectRoot + "\", "").Replace("\", "/")

  $manifest = @()
  if (Test-Path $manifestPath) {
    $rawManifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    if ($rawManifest.items) {
      $manifest = @($rawManifest.items)
    } elseif ($rawManifest -is [System.Array]) {
      $manifest = @($rawManifest)
    }
  }

  $entry = [PSCustomObject]@{
    market_name = $MarketName
    finish_token = $FinishToken
    model_url = $relativeModel
    source_url = $SourceUrl
    updated_at = (Get-Date).ToString("o")
  }

  $next = @($entry) + @($manifest | Where-Object { $_.market_name -ne $MarketName })
  $json = ([PSCustomObject]@{ items = $next } | ConvertTo-Json -Depth 6)
  [System.IO.File]::WriteAllText($manifestPath, $json, [System.Text.UTF8Encoding]::new($false))
}

Assert-Exists $blenderPath "Blender"
Assert-Exists $blenderScript "Blender skin script"
Assert-Exists $patinaScript "Blender patina bake script"

if (-not $BaseModelPath -and -not $ItemUrl -and (-not $MarketName -or -not $WeaponSlug -or -not $FinishToken)) {
  throw "Provide ItemUrl, or provide MarketName + WeaponSlug + FinishToken."
}

$html = ""
$marketName = $MarketName
$itemSlug = $WeaponSlug
$finishTokenResolved = $FinishToken

if ($ItemUrl) {
  $response = Invoke-WebRequest -Uri $ItemUrl -UseBasicParsing
  $html = $response.Content
  if (-not $marketName) {
    $marketName = Get-MarketNameFromTitle $html
  }
  if (-not $itemSlug) {
    $itemSlug = ([uri]$ItemUrl).Segments[1].TrimEnd('/')
  }
  if (-not $finishTokenResolved) {
    $finishTokenResolved = Get-FinishToken $html $itemSlug $ItemUrl
  }
}

if (-not $marketName) {
  $marketName = $finishTokenResolved
}

$resolvedBaseModel = $BaseModelPath
$resolvedAlbedo = $AlbedoPath
$resolvedNormal = $NormalPath
$resolvedRoughness = $RoughnessPath
$resolvedAo = $AoPath
$resolvedPaintIndex = ""
$itemsGameText = ""
if (Test-Path $itemsGameCache) {
  $itemsGameText = Get-Content $itemsGameCache -Raw
}

if ($html) {
  $resolvedPaintIndex = Get-PaintIndexFromHtml $html
}

if (-not $resolvedPaintIndex -and $itemsGameText -and $finishTokenResolved) {
  $resolvedPaintIndex = Get-PaintIndexFromItemsGame $itemsGameText $finishTokenResolved
}

if (-not $resolvedBaseModel -and -not $resolvedAlbedo -and $resolvedPaintIndex -and $itemSlug -and $finishTokenResolved) {
  if (-not (ShouldSkipCsMoneyColorBake $finishTokenResolved)) {
    $csMoneySource = if ($ItemUrl) { $ItemUrl } else { "" }
    if (Try-BuildFromCsMoneyAssets $itemSlug $resolvedPaintIndex $finishTokenResolved $marketName $csMoneySource) {
      $csMoneyModel = Join-Path $skinsRoot ($finishTokenResolved + ".glb")
      $normalAlphaPatch = Join-Path $projectRoot "scripts\patch_glb_normal_alpha.py"
      if ((Test-Path $csMoneyModel) -and (Test-Path $normalAlphaPatch)) {
        Write-Host "Patching normal-map alpha for WebGL: $csMoneyModel"
        & python $normalAlphaPatch --dirs $csMoneyModel
      }
      Write-Host "Built model via CS.MONEY UV assets (paint index $resolvedPaintIndex)."
      exit 0
    }
    Write-Host "CS.MONEY UV asset build unavailable for paint index $resolvedPaintIndex; falling back to VPK extraction."
  } else {
    Write-Host "Skipping CS.MONEY color bake for patina/antiqued finish $finishTokenResolved; using VPK pattern textures."
  }
}

if (-not $resolvedBaseModel) {
  Assert-Exists $vpkPath "CS2 VPK"
  Assert-Exists $s2vPath "Source2Viewer CLI"
  Ensure-ItemsGameCache
  Assert-Exists $itemsGameCache "items_game cache"

  $weaponFolder = Normalize-WeaponSlug $itemSlug
  $baseModelDirectory = Join-Path $projectRoot ("assets\models\base\weapons\models\" + $weaponFolder)
  $baseModelFile = Get-ChildItem $baseModelDirectory -Filter *.glb | Where-Object { $_.Name -notlike '*_physics.glb' } | Select-Object -First 1
  if (-not $baseModelFile) {
    throw "Base model GLB not found for weapon folder $weaponFolder"
  }

  $itemsGameText = Get-Content $itemsGameCache -Raw
  $compositePath = Resolve-CompositeMaterialPath $itemsGameText $finishTokenResolved
  if (-not $compositePath) {
    throw "No reliable composite material path found for $finishTokenResolved. Build this skin with explicit local texture overrides instead."
  }

  $workDir = Join-Path $tempRoot $finishTokenResolved
  $vcompmatDir = Join-Path $workDir "vcompmat"
  $textureDir = Join-Path $workDir "textures"
  New-Item -ItemType Directory -Force -Path $vcompmatDir, $textureDir, $skinsRoot | Out-Null

  & $s2vPath -i $vpkPath -o $vcompmatDir --decompile -f ($compositePath + "_c") | Out-Null
  $vcompmatFile = Get-ChildItem $vcompmatDir -Recurse -Filter ([System.IO.Path]::GetFileNameWithoutExtension($compositePath)) -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $vcompmatFile) {
    $vcompmatFile = Get-ChildItem $vcompmatDir -Recurse -Filter ([System.IO.Path]::GetFileName($compositePath)) -ErrorAction SilentlyContinue | Select-Object -First 1
  }
  if (-not $vcompmatFile) {
    throw "Decompiled vcompmat was not found for $finishTokenResolved"
  }

  $textureMap = Get-TexturePathsFromVCompmat $vcompmatFile.FullName
  if (-not $textureMap.ContainsKey("g_tPattern")) {
    $specificMaterialPath = Get-SpecificMaterialPathFromVCompmat $vcompmatFile.FullName
    if ($specificMaterialPath) {
      # Prefer compiled vmat_c string recovery. Full VRF .vmat decompile currently fails on CS2 VCS v71 shaders.
      Write-Host "Recovering textures from compiled vmat_c (VRF material decompile skipped)."
      $textureMap = Get-TexturePathsFromCompiledVmatC $specificMaterialPath $workDir
      if (-not $textureMap.ContainsKey("g_tPattern")) {
        $vmatDir = Join-Path $workDir "vmat"
        New-Item -ItemType Directory -Force -Path $vmatDir | Out-Null
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
          & $s2vPath -i $vpkPath -o $vmatDir --decompile -f ($specificMaterialPath + "_c") 2>$null | Out-Null
        } catch {
        } finally {
          $ErrorActionPreference = $prevEap
        }
        $vmatFile = Get-ChildItem $vmatDir -Recurse -Filter ([System.IO.Path]::GetFileNameWithoutExtension($specificMaterialPath)) -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $vmatFile) {
          $vmatFile = Get-ChildItem $vmatDir -Recurse -Filter ([System.IO.Path]::GetFileName($specificMaterialPath)) -ErrorAction SilentlyContinue | Select-Object -First 1
        }
        if ($vmatFile) {
          $textureMap = Get-TexturePathsFromVmat $vmatFile.FullName
        }
      }
      if (-not $textureMap.ContainsKey("g_tPattern")) {
        throw "Could not recover paint textures for $finishTokenResolved from $specificMaterialPath"
      }
    }
  }

  $resolvedAlbedo = if ($textureMap.ContainsKey("g_tPattern")) { Export-VtexToPng $textureMap["g_tPattern"] $textureDir } else { $null }
  $resolvedNormal = if ($textureMap.ContainsKey("g_tNormal")) { Export-VtexToPng $textureMap["g_tNormal"] $textureDir } else { $null }
  $resolvedRoughness = if ($textureMap.ContainsKey("g_tPaintRoughness")) { Export-VtexToPng $textureMap["g_tPaintRoughness"] $textureDir } elseif ($textureMap.ContainsKey("g_tMetalness")) { Export-VtexToPng $textureMap["g_tMetalness"] $textureDir } else { $null }
  $resolvedAo = if ($textureMap.ContainsKey("g_tFinalAmbientOcclusion")) { Export-VtexToPng $textureMap["g_tFinalAmbientOcclusion"] $textureDir } elseif ($textureMap.ContainsKey("g_tAmbientOcclusion")) { Export-VtexToPng $textureMap["g_tAmbientOcclusion"] $textureDir } else { $null }
  $resolvedBaseColor = if ($textureMap.ContainsKey("g_tColor")) { Export-VtexToPng $textureMap["g_tColor"] $textureDir } else { $null }
  $resolvedPaintMask = if ($textureMap.ContainsKey("g_tMasks")) { Export-VtexToPng $textureMap["g_tMasks"] $textureDir } else { $null }

  if (Get-UseLegacyModel $itemsGameText $finishTokenResolved) {
    $legacyMesh = Ensure-CsMoneyLegacyMesh $itemSlug $workDir
    if ($legacyMesh) {
      $resolvedBaseModel = $legacyMesh
    } else {
      $resolvedBaseModel = $baseModelFile.FullName
    }
  } else {
    $resolvedBaseModel = $baseModelFile.FullName
  }
}

Assert-Exists $resolvedBaseModel "Base model"
Assert-Exists $resolvedAlbedo "Albedo texture"

$outputModel = Join-Path $skinsRoot ($finishTokenResolved + ".glb")
$normalTexture = if ($resolvedNormal) { $resolvedNormal } else { "" }
$roughnessTexture = if ($resolvedRoughness) { $resolvedRoughness } else { "" }
$aoTexture = if ($resolvedAo) { $resolvedAo } else { "" }
$baseColorTexture = if ($resolvedBaseColor) { $resolvedBaseColor } else { "" }
$paintMaskTexture = if ($resolvedPaintMask) { $resolvedPaintMask } else { "" }

if (-not $itemsGameText) {
  Ensure-ItemsGameCache
  if (Test-Path $itemsGameCache) {
    $itemsGameText = Get-Content $itemsGameCache -Raw
  }
}
$meshPreference = if (Get-UseLegacyModel $itemsGameText $finishTokenResolved) { "legacy" } else { "hd" }
Write-Host "Using mesh preference: $meshPreference for $finishTokenResolved"

# Cartel-quality: paint pattern as albedo + weapon default normal/AO/rough, PNG embeds.
if (-not $weaponFolder) {
  $weaponFolder = Normalize-WeaponSlug $itemSlug
}
if (-not $textureDir) {
  $textureDir = Join-Path $tempRoot ($finishTokenResolved + "\textures")
  New-Item -ItemType Directory -Force -Path $textureDir | Out-Null
}

$weaponNormal = Find-WeaponDefaultTexture $weaponFolder "normal" $textureDir
$weaponAo = Find-WeaponDefaultTexture $weaponFolder "ao" $textureDir
$weaponRough = Find-WeaponDefaultTexture $weaponFolder "rough" $textureDir
if ($weaponNormal) {
  $resolvedNormal = $weaponNormal
  $normalTexture = $weaponNormal
  Write-Host "Using weapon default normal: $resolvedNormal"
}
if ($weaponAo) {
  $resolvedAo = $weaponAo
  $aoTexture = $weaponAo
  Write-Host "Using weapon default AO: $resolvedAo"
}
if ($weaponRough) {
  $resolvedRoughness = $weaponRough
  $roughnessTexture = $weaponRough
  Write-Host "Using weapon default roughness: $resolvedRoughness"
} elseif ($weaponAo) {
  $resolvedRoughness = $weaponAo
  $roughnessTexture = $weaponAo
}

$prepareScript = Join-Path $projectRoot "scripts\prepare_cartel_quality_texture.py"
$preparedDir = Join-Path $tempRoot ($finishTokenResolved + "\cartel_quality")
New-Item -ItemType Directory -Force -Path $preparedDir | Out-Null
$PrepareTexture = {
  param([string]$SourcePath, [string]$DestName)
  if (-not $SourcePath -or -not (Test-Path $SourcePath)) { return "" }
  $destPath = Join-Path $preparedDir $DestName
  & python $prepareScript --src $SourcePath --dst $destPath --size 2048 | Out-Host
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $destPath)) {
    throw "Failed preparing Cartel-quality texture: $SourcePath"
  }
  return $destPath
}
$resolvedAlbedo = & $PrepareTexture $resolvedAlbedo "albedo.png"
if ($normalTexture) { $normalTexture = & $PrepareTexture $normalTexture "normal.png" }
if ($roughnessTexture) { $roughnessTexture = & $PrepareTexture $roughnessTexture "rough.png" }
if ($aoTexture) { $aoTexture = & $PrepareTexture $aoTexture "ao.png" }

$blenderArgs = @(
  "--background",
  "--python", $blenderScript,
  "--",
  "--base-model", $resolvedBaseModel,
  "--albedo", $resolvedAlbedo
)
if ($normalTexture) {
  $blenderArgs += @("--normal", $normalTexture)
}
if ($roughnessTexture) {
  $blenderArgs += @("--roughness", $roughnessTexture)
}
if ($aoTexture) {
  $blenderArgs += @("--ao", $aoTexture)
}
$blenderArgs += @("--output", $outputModel, "--mesh-preference", $meshPreference)
if (Test-Path $outputModel) {
  Remove-Item $outputModel -Force -ErrorAction SilentlyContinue
}
& $blenderPath @blenderArgs | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Blender skin build failed for $finishTokenResolved"
}

Assert-Exists $outputModel "Textured skin model"

# Cartel-quality WebGL fix: zero-alpha normal maps premultiply to black/"zebra" stripes.
$normalAlphaPatch = Join-Path $projectRoot "scripts\patch_glb_normal_alpha.py"
if (Test-Path $normalAlphaPatch) {
  Write-Host "Patching normal-map alpha for WebGL: $outputModel"
  & python $normalAlphaPatch --dirs $outputModel
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: normal-alpha patch failed (exit $LASTEXITCODE); model left unpatched."
  }
}

Update-Manifest $marketName $finishTokenResolved $outputModel $ItemUrl

Write-Host "Built model: $outputModel"
Write-Host "Manifest updated: $manifestPath"
