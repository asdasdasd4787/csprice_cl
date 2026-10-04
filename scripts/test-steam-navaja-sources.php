<?php
require __DIR__ . '/../get_roi_prices_cached.php';
$name = '★ Navaja Knife | Doppler (Factory New)';
$overview = cachedLiveFetchSteamOverview($name);
$listing = cachedLiveFetchSteamListing($name, true);
echo "overview: " . json_encode($overview) . "\n";
echo "listing: " . json_encode($listing) . "\n";
