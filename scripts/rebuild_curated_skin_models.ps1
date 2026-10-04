param()

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$buildScript = Join-Path $projectRoot "scripts\build_textured_model_from_cs2items.ps1"
$manifestPath = Join-Path $projectRoot "assets\models\skins\manifest.json"
$libraryRoot = "C:\Users\dogeg\Desktop\CSGO WEAPONS RIFLE\CSGO WEAPONS"
$modelRoot = Join-Path $libraryRoot "model"
$textureRoot = Join-Path $libraryRoot "texture"

if (-not (Test-Path $buildScript)) {
  throw "Build script not found: $buildScript"
}

$jobs = @(
  @{
    MarketName = "AK-47 | The Empress"
    FinishToken = "gs_ak47_empress"
    BaseModelPath = (Join-Path $modelRoot "v_rif_ak47_ak47_model.fbx")
    AlbedoPath = (Join-Path $textureRoot "ak47_empress.png")
  },
  @{
    MarketName = "AK-47 | Asiimov"
    FinishToken = "cu_ak47_asiimov"
    BaseModelPath = (Join-Path $modelRoot "v_rif_ak47_ak47_model.fbx")
    AlbedoPath = (Join-Path $textureRoot "ak47_asiimov.png")
  },
  @{
    MarketName = "AK-47 | Aquamarine Revenge"
    FinishToken = "cu_ak47_courage_alt"
    BaseModelPath = (Join-Path $modelRoot "v_rif_ak47_ak47_model.fbx")
    AlbedoPath = (Join-Path $textureRoot "ak47_courage.png")
  },
  @{
    MarketName = "M4A4 | Neo-Noir"
    FinishToken = "cu_m4a4_neo_noir"
    BaseModelPath = (Join-Path $modelRoot "v_rif_m4a1_v_m4a1_model.fbx")
    AlbedoPath = (Join-Path $textureRoot "m4a4_neo_noir.png")
    NormalPath = (Join-Path $textureRoot "m4a4_neo_noir_normal.png")
  }
)

foreach ($job in $jobs) {
  Write-Host ("Rebuilding " + $job.MarketName + "...")
  $args = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $buildScript,
    "-MarketName", $job.MarketName,
    "-FinishToken", $job.FinishToken,
    "-BaseModelPath", $job.BaseModelPath,
    "-AlbedoPath", $job.AlbedoPath
  )

  if ($job.NormalPath) {
    $args += @("-NormalPath", $job.NormalPath)
  }

  & powershell @args
  if ($LASTEXITCODE -ne 0) {
    throw "Failed rebuilding $($job.MarketName)"
  }
}

Write-Host "Curated rebuild complete. Legacy skin entries remain in the manifest and should be rebuilt with the main CS2 texture pipeline when needed."
