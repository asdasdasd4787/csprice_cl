param(
    [int]$ItemId = 1,
    [string]$LookupName = ""
)

$phpPath = "C:\xampp\php\php.exe"
$scriptPath = "C:\xampp\htdocs\csgo_price_tracker\sync_market_price_history.php"

$arguments = @($scriptPath)

if ($ItemId -gt 0) {
    $arguments += "--item-id=$ItemId"
}

if ($LookupName -ne "") {
    $arguments += "--lookup-name=$LookupName"
}

& $phpPath @arguments
