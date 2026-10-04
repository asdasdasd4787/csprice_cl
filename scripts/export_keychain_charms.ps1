# Export CS2 keychain (charm) models to web GLTF packs.
param(
  [string]$Cli = "C:\xampp\htdocs\csgo_price_tracker\.tmp_s2v\cli19\Source2Viewer-CLI.exe",
  [string]$Vpk = "D:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive\game\csgo\pak01_dir.vpk",
  [string]$OutRoot = "C:\xampp\htdocs\csgo_price_tracker\assets\models\keychains",
  [string]$ExtractRoot = "C:\xampp\htdocs\csgo_price_tracker\.tmp_s2v\keychain_export"
)

$ErrorActionPreference = "Continue"
New-Item -ItemType Directory -Force -Path $OutRoot, $ExtractRoot | Out-Null

# token => market display name (without Charm | prefix)
$NameMap = @{
  "kc_missinglink_ava" = "Lil' Ava"
  "kc_missinglink_banana" = "That's Bananas"
  "kc_missinglink_bigfoot" = "Lil' Squatch"
  "kc_missinglink_cat" = "Lil' Whiskers"
  "kc_missinglink_catbeach" = "Lil' Sandy"
  "kc_missinglink_chicken" = "Chicken Lil'"
  "kc_missinglink_guerilla" = "Lil' Crass"
  "kc_missinglink_howl" = "Hot Howl"
  "kc_missinglink_kev" = "Big Kev"
  "kc_missinglink_monster" = "Lil' Monster"
  "kc_missinglink_sam_catchup" = "Hot Sauce"
  "kc_missinglink_sam_diamond" = "Diamond Dog"
  "kc_missinglink_sam_salty" = "Pinch O' Salt"
  "kc_missinglink_sam_shape" = "Diner Dog"
  "kc_missinglink_sam_toile" = "Lil' Teacup"
  "kc_missinglink_sas" = "Lil' SAS"
  "kc_missinglink_wurst" = "Hot Wurst"
  "kc_db_biomech" = "Biomech"
  "kc_db_terror" = "Gritty"
  "kc_db_hellcat" = "Splatter Cat"
  "kc_db_ugly" = "Fluffy"
  "kc_db_wood" = "Whittle Guy"
  "kc_db_yinyang" = "Lil' Zen"
  "kc_db_aztec" = "Lil' Facelift"
  "kc_db_200iq" = "Big Brain"
  "kc_db_eviscerate" = "Bomb Tag"
  "kc_db_clown" = "Lil' Bloody"
  "kc_db_dimsum" = "Lil' Dumplin'"
  "kc_db_bombacat" = "Lil' Chomper"
  "kc_db_drbrian" = "Dr. Brian"
  "kc_db_eco" = "Lil' Eco"
  "kc_db_dripfade" = "Glitter Bomb"
  "kc_db_occult" = "Eye of Ball"
  "kc_db_yeti" = "Lil' Yeti"
  "kc_db_eyecritter" = "Hungry Eyes"
  "kc_db_8ball" = "8 Ball IGL"
  "kc_db_flash" = "Flash Bomb"
  "kc_db_incendiary" = "Lil' Ferno"
  "kc_db_lighter" = "Butane Buddy"
  "kc_wpn_usp_yarn" = "Stitch-Loaded"
  "kc_wpn_ctknife_wood" = "Whittle Knife"
  "kc_wpn_mac10_tile" = "Backsplash"
  "kc_wpn_tec9_cap" = "Lil' Cap Gun"
  "kc_wpn_ak_base" = "Baby's AK"
  "kc_wpn_awp_plastic" = "Pocket AWP"
  "kc_wpn_ak_jelly" = "Die-cast AK"
  "kc_wpn_m4a1s_comic" = "POP Art"
  "kc_wpn_mac10_glitter" = "Disco MAC"
  "kc_wpn_tec9_magma" = "Hot Hands"
  "kc_wpn_usp_jewel" = "Glamour Shot"
  "kc_wpn_m4a1s_ss" = "Lil' Squirt"
  "kc_wpn_awp_spoon" = "Titeenium AWP"
  "kc_wpn_tknife_crystal" = "Semi-Precious"
  "kc_wpn_ctknife_gold" = "Baby Karat CT"
  "kc_wpn_tknife_gold" = "Baby Karat T"
  "kc_aus2025" = "Austin 2025 Highlight"
  "kc_bud2025" = "Budapest 2025 Highlight"
  "kc_cologne2026" = "Cologne 2026 Highlight"
}

$VpkPaths = @{
  "kc_missinglink_ava" = "weapons/keychains/missinglink/vmdl/kc_missinglink_ava.vmdl_c"
  "kc_missinglink_banana" = "weapons/keychains/missinglink/vmdl/kc_missinglink_banana.vmdl_c"
  "kc_missinglink_bigfoot" = "weapons/keychains/missinglink/vmdl/kc_missinglink_bigfoot.vmdl_c"
  "kc_missinglink_cat" = "weapons/keychains/missinglink/vmdl/kc_missinglink_cat.vmdl_c"
  "kc_missinglink_catbeach" = "weapons/keychains/missinglink/vmdl/kc_missinglink_catbeach.vmdl_c"
  "kc_missinglink_chicken" = "weapons/keychains/missinglink/vmdl/kc_missinglink_chicken.vmdl_c"
  "kc_missinglink_guerilla" = "weapons/keychains/missinglink/vmdl/kc_missinglink_guerilla.vmdl_c"
  "kc_missinglink_howl" = "weapons/keychains/missinglink/vmdl/kc_missinglink_howl.vmdl_c"
  "kc_missinglink_kev" = "weapons/keychains/missinglink/vmdl/kc_missinglink_kev.vmdl_c"
  "kc_missinglink_monster" = "weapons/keychains/missinglink/vmdl/kc_missinglink_monster.vmdl_c"
  "kc_missinglink_sam_catchup" = "weapons/keychains/missinglink/vmdl/kc_missinglink_sam_catchup.vmdl_c"
  "kc_missinglink_sam_diamond" = "weapons/keychains/missinglink/vmdl/kc_missinglink_sam_diamond.vmdl_c"
  "kc_missinglink_sam_salty" = "weapons/keychains/missinglink/vmdl/kc_missinglink_sam_salty.vmdl_c"
  "kc_missinglink_sam_shape" = "weapons/keychains/missinglink/vmdl/kc_missinglink_sam_shape.vmdl_c"
  "kc_missinglink_sam_toile" = "weapons/keychains/missinglink/vmdl/kc_missinglink_sam_toile.vmdl_c"
  "kc_missinglink_sas" = "weapons/keychains/missinglink/vmdl/kc_missinglink_sas.vmdl_c"
  "kc_missinglink_wurst" = "weapons/keychains/missinglink/vmdl/kc_missinglink_wurst.vmdl_c"
  "kc_db_biomech" = "weapons/keychains/drboom/vmdl/kc_db_biomech.vmdl_c"
  "kc_db_terror" = "weapons/keychains/drboom/vmdl/kc_db_terror.vmdl_c"
  "kc_db_hellcat" = "weapons/keychains/drboom/vmdl/kc_db_hellcat.vmdl_c"
  "kc_db_ugly" = "weapons/keychains/drboom/vmdl/kc_db_ugly.vmdl_c"
  "kc_db_wood" = "weapons/keychains/drboom/vmdl/kc_db_wood.vmdl_c"
  "kc_db_yinyang" = "weapons/keychains/drboom/vmdl/kc_db_yinyang.vmdl_c"
  "kc_db_aztec" = "weapons/keychains/drboom/vmdl/kc_db_aztec.vmdl_c"
  "kc_db_200iq" = "weapons/keychains/drboom/vmdl/kc_db_200iq.vmdl_c"
  "kc_db_eviscerate" = "weapons/keychains/drboom/vmdl/kc_db_eviscerate.vmdl_c"
  "kc_db_clown" = "weapons/keychains/drboom/vmdl/kc_db_clown.vmdl_c"
  "kc_db_dimsum" = "weapons/keychains/drboom/vmdl/kc_db_dimsum.vmdl_c"
  "kc_db_bombacat" = "weapons/keychains/drboom/vmdl/kc_db_bombacat.vmdl_c"
  "kc_db_drbrian" = "weapons/keychains/drboom/vmdl/kc_db_drbrian.vmdl_c"
  "kc_db_eco" = "weapons/keychains/drboom/vmdl/kc_db_eco.vmdl_c"
  "kc_db_dripfade" = "weapons/keychains/drboom/vmdl/kc_db_dripfade.vmdl_c"
  "kc_db_occult" = "weapons/keychains/drboom/vmdl/kc_db_occult.vmdl_c"
  "kc_db_yeti" = "weapons/keychains/drboom/vmdl/kc_db_yeti.vmdl_c"
  "kc_db_eyecritter" = "weapons/keychains/drboom/vmdl/kc_db_eyecritter.vmdl_c"
  "kc_db_8ball" = "weapons/keychains/drboom/vmdl/kc_db_8ball.vmdl_c"
  "kc_db_flash" = "weapons/keychains/drboom/vmdl/kc_db_flash.vmdl_c"
  "kc_db_incendiary" = "weapons/keychains/drboom/vmdl/kc_db_incendiary.vmdl_c"
  "kc_db_lighter" = "weapons/keychains/drboom/vmdl/kc_db_lighter.vmdl_c"
  "kc_wpn_usp_yarn" = "weapons/keychains/weapon_1/vmdl/kc_wpn_usp_yarn.vmdl_c"
  "kc_wpn_ctknife_wood" = "weapons/keychains/weapon_1/vmdl/kc_wpn_ctknife_wood.vmdl_c"
  "kc_wpn_mac10_tile" = "weapons/keychains/weapon_1/vmdl/kc_wpn_mac10_tile.vmdl_c"
  "kc_wpn_tec9_cap" = "weapons/keychains/weapon_1/vmdl/kc_wpn_tec9_cap.vmdl_c"
  "kc_wpn_ak_base" = "weapons/keychains/weapon_1/vmdl/kc_wpn_ak_base.vmdl_c"
  "kc_wpn_awp_plastic" = "weapons/keychains/weapon_1/vmdl/kc_wpn_awp_plastic.vmdl_c"
  "kc_wpn_ak_jelly" = "weapons/keychains/weapon_1/vmdl/kc_wpn_ak_jelly.vmdl_c"
  "kc_wpn_m4a1s_comic" = "weapons/keychains/weapon_1/vmdl/kc_wpn_m4a1s_comic.vmdl_c"
  "kc_wpn_mac10_glitter" = "weapons/keychains/weapon_1/vmdl/kc_wpn_mac10_glitter.vmdl_c"
  "kc_wpn_tec9_magma" = "weapons/keychains/weapon_1/vmdl/kc_wpn_tec9_magma.vmdl_c"
  "kc_wpn_usp_jewel" = "weapons/keychains/weapon_1/vmdl/kc_wpn_usp_jewel.vmdl_c"
  "kc_wpn_m4a1s_ss" = "weapons/keychains/weapon_1/vmdl/kc_wpn_m4a1s_ss.vmdl_c"
  "kc_wpn_awp_spoon" = "weapons/keychains/weapon_1/vmdl/kc_wpn_awp_spoon.vmdl_c"
  "kc_wpn_tknife_crystal" = "weapons/keychains/weapon_1/vmdl/kc_wpn_tknife_crystal.vmdl_c"
  "kc_wpn_ctknife_gold" = "weapons/keychains/weapon_1/vmdl/kc_wpn_ctknife_gold.vmdl_c"
  "kc_wpn_tknife_gold" = "weapons/keychains/weapon_1/vmdl/kc_wpn_tknife_gold.vmdl_c"
  "kc_aus2025" = "weapons/keychains/aus2025/kc_aus2025.vmdl_c"
  "kc_bud2025" = "weapons/keychains/bud2025/kc_bud2025.vmdl_c"
  "kc_cologne2026" = "weapons/keychains/cologne2026/kc_cologne2026.vmdl_c"
}

$manifest = [ordered]@{
  version = "20260808-charms-unique-1"
  items = [ordered]@{}
}

$ok = 0
$fail = 0

foreach ($token in ($VpkPaths.Keys | Sort-Object)) {
  $vpkPath = $VpkPaths[$token]
  $display = $NameMap[$token]
  if (-not $display) { continue }

  $tokenOut = Join-Path $OutRoot $token
  $extractDir = Join-Path $ExtractRoot $token
  if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
  New-Item -ItemType Directory -Force -Path $tokenOut, $extractDir | Out-Null

  Write-Host "[export] $token"
  # CLI writes VCS-version warnings to stderr; do not abort the batch.
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  & $Cli -i $Vpk -o $extractDir --decompile -f $vpkPath --gltf_export_format gltf --gltf_export_materials --gltf_textures_adapt 2>$null | Out-Null
  $ErrorActionPreference = $prevEap

  $gltf = Get-ChildItem -Recurse $extractDir -Filter "*.gltf" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch "physics" } |
    Sort-Object Length -Descending |
    Select-Object -First 1

  if (-not $gltf) {
    Write-Host "  FAIL: no gltf for $token"
    $fail++
    continue
  }

  # Copy gltf + sidecars into stable folder, rename main file to charm.gltf
  Get-ChildItem $tokenOut -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  $srcDir = $gltf.Directory.FullName
  Copy-Item -Force (Join-Path $srcDir "*") $tokenOut
  $destGltf = Join-Path $tokenOut "charm.gltf"
  if ($gltf.Name -ne "charm.gltf") {
    $copied = Join-Path $tokenOut $gltf.Name
    if (Test-Path $copied) {
      Move-Item -Force $copied $destGltf
    }
  }

  # Drop physics sidecar from public pack
  Get-ChildItem $tokenOut -Filter "*_physics*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

  $modelUrl = "assets/models/keychains/$token/charm.gltf?v=20260808-charms-unique-1"
  $market = "Charm | $display"
  $manifest.items[$market] = [ordered]@{
    token = $token
    model_url = $modelUrl
    display_name = $display
  }
  $ok++
  Write-Host "  OK -> $modelUrl"
}

$manifestPath = Join-Path $OutRoot "manifest.json"
$json = ($manifest | ConvertTo-Json -Depth 6)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($manifestPath, $json, $utf8NoBom)
Write-Host "Wrote $manifestPath with $($manifest.items.Count) charms (ok=$ok fail=$fail)"
