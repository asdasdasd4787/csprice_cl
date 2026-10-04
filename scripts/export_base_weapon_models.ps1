$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$cliPath = Join-Path $projectRoot "tmp-s2v-cli\Source2Viewer-CLI.exe"
$vpkPath = "D:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive\game\csgo\pak01_dir.vpk"
$outputRoot = Join-Path $projectRoot "assets\models\base"

$weaponModels = @(
  "weapons/models/ak47/weapon_rif_ak47.vmdl_c"
  "weapons/models/aug/weapon_rif_aug.vmdl_c"
  "weapons/models/awp/weapon_snip_awp.vmdl_c"
  "weapons/models/bizon/weapon_smg_bizon.vmdl_c"
  "weapons/models/cz75a/weapon_pist_cz75a.vmdl_c"
  "weapons/models/deagle/weapon_pist_deagle.vmdl_c"
  "weapons/models/elite/weapon_pist_elite.vmdl_c"
  "weapons/models/famas/weapon_rif_famas.vmdl_c"
  "weapons/models/fiveseven/weapon_pist_fiveseven.vmdl_c"
  "weapons/models/g3sg1/weapon_snip_g3sg1.vmdl_c"
  "weapons/models/galilar/weapon_rif_galilar.vmdl_c"
  "weapons/models/glock18/weapon_pist_glock18.vmdl_c"
  "weapons/models/hkp2000/weapon_pist_hkp2000.vmdl_c"
  "weapons/models/m249/weapon_mach_m249.vmdl_c"
  "weapons/models/m4a1_silencer/weapon_rif_m4a1_silencer.vmdl_c"
  "weapons/models/m4a4/weapon_rif_m4a4.vmdl_c"
  "weapons/models/mac10/weapon_smg_mac10.vmdl_c"
  "weapons/models/mag7/weapon_shot_mag7.vmdl_c"
  "weapons/models/mp5sd/weapon_smg_mp5sd.vmdl_c"
  "weapons/models/mp7/weapon_smg_mp7.vmdl_c"
  "weapons/models/mp9/weapon_smg_mp9.vmdl_c"
  "weapons/models/negev/weapon_mach_negev.vmdl_c"
  "weapons/models/nova/weapon_shot_nova.vmdl_c"
  "weapons/models/p250/weapon_pist_p250.vmdl_c"
  "weapons/models/p90/weapon_smg_p90.vmdl_c"
  "weapons/models/revolver/weapon_pist_revolver.vmdl_c"
  "weapons/models/sawedoff/weapon_shot_sawedoff.vmdl_c"
  "weapons/models/scar20/weapon_snip_scar20.vmdl_c"
  "weapons/models/sg556/weapon_rif_sg556.vmdl_c"
  "weapons/models/ssg08/weapon_snip_ssg08.vmdl_c"
  "weapons/models/taser/weapon_pist_taser.vmdl_c"
  "weapons/models/tec9/weapon_pist_tec9.vmdl_c"
  "weapons/models/ump45/weapon_smg_ump45.vmdl_c"
  "weapons/models/usp_silencer/weapon_pist_usp_silencer.vmdl_c"
  "weapons/models/xm1014/weapon_shot_xm1014.vmdl_c"
  "weapons/models/knife/knife_bayonet/weapon_knife_bayonet.vmdl_c"
  "weapons/models/knife/knife_bowie/weapon_knife_bowie.vmdl_c"
  "weapons/models/knife/knife_butterfly/weapon_knife_butterfly.vmdl_c"
  "weapons/models/knife/knife_css/weapon_knife_css.vmdl_c"
  "weapons/models/knife/knife_falchion/weapon_knife_falchion.vmdl_c"
  "weapons/models/knife/knife_flip/weapon_knife_flip.vmdl_c"
  "weapons/models/knife/knife_gut/weapon_knife_gut.vmdl_c"
  "weapons/models/knife/knife_tactical/weapon_knife_tactical.vmdl_c"
  "weapons/models/knife/knife_karambit/weapon_knife_karambit.vmdl_c"
  "weapons/models/knife/knife_kukri/weapon_knife_kukri.vmdl_c"
  "weapons/models/knife/knife_m9/weapon_knife_m9.vmdl_c"
  "weapons/models/knife/knife_navaja/weapon_knife_navaja.vmdl_c"
  "weapons/models/knife/knife_outdoor/weapon_knife_outdoor.vmdl_c"
  "weapons/models/knife/knife_cord/weapon_knife_cord.vmdl_c"
  "weapons/models/knife/knife_push/weapon_knife_push.vmdl_c"
  "weapons/models/knife/knife_skeleton/weapon_knife_skeleton.vmdl_c"
  "weapons/models/knife/knife_stiletto/weapon_knife_stiletto.vmdl_c"
  "weapons/models/knife/knife_talon/weapon_knife_talon.vmdl_c"
  "weapons/models/knife/knife_ursus/weapon_knife_ursus.vmdl_c"
)

if (-not (Test-Path $cliPath)) {
  throw "Source2Viewer CLI was not found at $cliPath"
}

if (-not (Test-Path $vpkPath)) {
  throw "Counter-Strike 2 VPK was not found at $vpkPath"
}

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

foreach ($modelPath in $weaponModels) {
  $glbRelative = [System.IO.Path]::ChangeExtension($modelPath, ".glb")
  $glbOutput = Join-Path $outputRoot ($glbRelative -replace "/", "\")

  if (Test-Path $glbOutput) {
    Write-Host "[skip] $glbRelative"
    continue
  }

  Write-Host "[export] $glbRelative"
  & $cliPath `
    -i $vpkPath `
    -o $outputRoot `
    --decompile `
    -f $modelPath `
    --gltf_export_format glb `
    --gltf_export_materials `
    --gltf_textures_adapt
}
