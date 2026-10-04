<?php
declare(strict_types=1);

/**
 * Kick off a background DB sync when cached prices are older than 24 hours.
 * Called once per session / site load — does not block on Steam or provider APIs.
 */

require __DIR__ . '/app_bootstrap.php';
require __DIR__ . '/price_cache_service.php';

try {
    $payload = [];
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $raw = (string)file_get_contents('php://input');
        if ($raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                $payload = $decoded;
            }
        }
    }

    $staleHours = max(1, (int)($payload['stale_hours'] ?? PRICE_CACHE_DEFAULT_HOURS));
    $limit = max(50, min(500, (int)($payload['limit'] ?? 250)));
    $result = priceCacheTriggerBackgroundSync($staleHours, $limit);

    respondJson([
        'success' => true,
        'sync' => $result,
        'state' => priceCacheReadSyncState(),
        'max_age_hours' => $staleHours,
    ]);
} catch (Throwable $e) {
    respondJson(['success' => false, 'error' => $e->getMessage()], 500);
}
