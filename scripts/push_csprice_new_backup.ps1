# Push local csprice-new-backup branch to GitHub repo Doge47dev/csprice-new
# Run from project root after: gh auth login

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$gh = "$env:TEMP\gh-cli\bin\gh.exe"
if (-not (Test-Path $gh)) {
    Write-Host "GitHub CLI not found at $gh"
    Write-Host "Install: winget install GitHub.cli"
    exit 1
}

& $gh auth status
if ($LASTEXITCODE -ne 0) {
    Write-Host "Run: gh auth login"
    exit 1
}

$remote = "csprice-new"
$repo = "Doge47dev/csprice-new"

git remote remove $remote 2>$null
& $gh repo create $repo --public --description "CSPrice project backup (csprice-new)" --source $root --remote $remote --push --head csprice-new-backup 2>$null
if ($LASTEXITCODE -ne 0) {
    git remote add $remote "https://github.com/$repo.git"
    git push -u $remote csprice-new-backup:main
}

Write-Host "Done: https://github.com/$repo"
