# Registers Windows Task Scheduler jobs that keep roi_prices fresh for the Deals
# page, so the page reads the cache instead of calling marketplace APIs live.
#
# Run once, elevated:  powershell -ExecutionPolicy Bypass -File scripts\register-roi-price-sync-task.ps1
# Remove with:         schtasks /Delete /TN "CS2\<name>" /F   (RoiPriceSyncSteam / Skinport / Dmarket)

$php  = "C:\xampp\php\php.exe"
$dir  = "C:\xampp\htdocs\csgo_price_tracker"
$roi  = "$dir\sync_roi_prices.php"
$prov = "$dir\sync_provider_prices.php"
$wear = "$dir\sync_steam_wear_prices.php"

function Register-Sync($name, $argString, $everyHours, $timeLimitMin) {
    $action  = New-ScheduledTaskAction -Execute $php -Argument $argString -WorkingDirectory $dir
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(10) `
                -RepetitionInterval (New-TimeSpan -Hours $everyHours)
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
                -ExecutionTimeLimit (New-TimeSpan -Minutes $timeLimitMin) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName "CS2\$name" -Action $action -Trigger $trigger -Settings $settings `
        -Description "Refresh roi_prices for the CS2 Deals page ($name)." -Force | Out-Null
    Write-Host "Registered CS2\$name"
}

# Skinport: one bulk /v1/items call, cheap on rate limit — refresh hourly.
Register-Sync "RoiPriceSyncSkinport" "$prov --source=skinport --stale-hours=1" 1 15

# DMarket: per-title, paced — refresh every 6h, skins only, capped per run.
Register-Sync "RoiPriceSyncDmarket" "$prov --source=dmarket --skins-only --batch=10 --sleep=1200 --stale-hours=6 --limit=2500" 6 60

# Steam: priceoverview is heavily rate-limited (~20/min/IP). Paced batch=1, every
# 2h, skins-led, capped — populates gradually and self-heals after 429 bans.
Register-Sync "RoiPriceSyncSteam" "$roi --skins-only --batch=1 --sleep=4000 --stale-hours=6 --limit=500" 2 45

# Steam StatTrak: separate, lower-priority pass for StatTrak™ wear prices (item
# page wear table). Same rate-limit pacing; runs every 12h.
Register-Sync "RoiPriceSyncSteamStatTrak" "$roi --skins-only --stattrak-only --batch=1 --sleep=4000 --stale-hours=24 --limit=400" 12 45

# Item-page base wear table: per-wear Steam prices into Supabase steam_analyst_prices.
# Paced (single request + 3.5s sleep); fills gradually. Runs every 8h.
Register-Sync "SteamWearPrices" "$wear --skins-only --sleep=3500 --stale-hours=12 --limit=300" 8 55

# Item-page SV column: "Souvenir <skin> (<wear>)" Steam prices into roi_prices.
# Has to run from a PC - csprice.eu's own address gets 429 from every Steam
# endpoint. One market-search request per skin covers all five wears, so the
# whole set (~1,450 skins) is ~85 min at 3.5s; the 24h freshness skip makes
# later runs short. (Also registered directly with schtasks on 2026-09-25.)
Register-Sync "SteamSouvenirPrices" "$dir\sync_steam_souvenir_prices.php --skins-only --sleep=3500 --stale-hours=24" 6 150

Write-Host ""
Write-Host "Run any now, e.g.:  schtasks /Run /TN `"CS2\RoiPriceSyncSkinport`""
