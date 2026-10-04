<?php
declare(strict_types=1);

/**
 * Refresh Steam prices used by Mark AI (default examples + popular cases).
 */
require __DIR__ . '/../app_bootstrap.php';
require_once __DIR__ . '/../ai_chat_helpers.php';
require_once __DIR__ . '/../roi_prices_db.php';

$names = array_values(array_unique(array_merge(
    aiChatDefaultSuggestionNames(),
    [
        'Dreams & Nightmares Case',
        'Kilowatt Case',
        'Revolution Case',
        'Fracture Case',
        'Recoil Case',
        'Gallery Case',
        'Fever Case',
        'AK-47 | Redline (Minimal Wear)',
        'AK-47 | Redline (Field-Tested)',
        'AWP | Asiimov (Field-Tested)',
        'M4A1-S | Printstream (Field-Tested)',
        'Sticker | Titan (Holo) | Katowice 2014',
    ]
)));

$pdo = marketHistoryPdoConnection();
roiPricesEnsureTable($pdo);

$ok = 0;
$fail = 0;
foreach ($names as $i => $name) {
    if ($i > 0) {
        usleep(180000);
    }
    $live = aiChatFetchSteamLivePrice($name);
    if (!is_array($live) || !empty($live['_rate_limited']) || (float)($live['current_price'] ?? 0) <= 0) {
        echo "FAIL {$name}\n";
        $fail++;
        if (!empty($live['_rate_limited'])) {
            echo "rate limited — sleeping 20s\n";
            sleep(20);
        }
        continue;
    }
    aiChatPersistSteamPriceRow($name, $live, null);
    echo 'OK  ' . $name . ' €' . number_format((float)$live['current_price'], 2) . "\n";
    $ok++;
}

echo "done ok={$ok} fail={$fail}\n";

// Kick a broader skins-only background sync if available.
if (function_exists('priceCacheTriggerBackgroundSync')) {
    $state = priceCacheTriggerBackgroundSync(6, 200);
    echo 'background_sync=' . json_encode($state) . "\n";
}
