param(
    [int]$ItemId = 1,
    [string]$TaskName = ""
)

if ($TaskName -eq "") {
    $TaskName = "CS2MarketPriceHistorySync-Item$ItemId"
}

$runnerPath = "C:\xampp\htdocs\csgo_price_tracker\scripts\run-market-history-sync.ps1"
$taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`" -ItemId $ItemId"

schtasks /Create /F /SC HOURLY /MO 12 /TN $TaskName /TR $taskCommand
