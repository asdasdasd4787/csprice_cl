$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$scssDir = Join-Path $root "scss"
$cssDir = Join-Path $root "css"

if (-not (Test-Path $scssDir)) {
    throw "SCSS directory not found: $scssDir"
}

New-Item -ItemType Directory -Force -Path $cssDir | Out-Null

$sassCommand = Get-Command sass -ErrorAction SilentlyContinue
$scssFiles = Get-ChildItem -Path $scssDir -Filter *.scss -File

foreach ($file in $scssFiles) {
    $cssTarget = Join-Path $cssDir ($file.BaseName + ".css")

    if ($sassCommand) {
        & $sassCommand.Source $file.FullName $cssTarget --style=expanded
    } else {
        Copy-Item -LiteralPath $file.FullName -Destination $cssTarget -Force
    }
}

if ($sassCommand) {
    Write-Output "SCSS compiled to CSS with sass."
} else {
    Write-Output "sass was not found; SCSS files were mirrored to CSS because the current sources are CSS-compatible SCSS."
}
