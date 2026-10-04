<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
require __DIR__ . '/dmarket_helpers.php';
set_time_limit(90);

$raw = (string)file_get_contents('php://input');
$payload = json_decode($raw, true);
// Cached answer when a recent identical request exists (see provider_quote_cache.php).
require_once __DIR__ . '/provider_quote_cache.php';
providerQuoteCacheStart('dmarket', $raw);
if (!is_array($payload)) {
    $payload = $_GET;
}

$names = dmarketRequestedNames($payload);
if (!$names) {
    respondJson([
        'success' => false,
        'source' => 'dmarket',
        'error' => 'No names',
        'items' => [],
    ]);
}

$config = appConfig()['dmarket'] ?? [];
$quotes = dmarketFetchQuotes($names, $config, [
    'cache_only' => !empty($payload['cache_only']) || !empty($payload['offline_cache_only']),
    'prefer_live' => !empty($payload['prefer_live']) || !empty($payload['fresh']) || !empty($payload['ignore_cache']) || !empty($payload['deals_mode']),
    'max_live_requests' => isset($payload['max_live_requests']) ? (int)$payload['max_live_requests'] : null,
    'skip_history' => !empty($payload['skip_history']) || !empty($payload['deals_mode']),
    'deals_mode' => !empty($payload['deals_mode']),
]);

$items = [];
foreach ($names as $name) {
    $quote = $quotes[$name] ?? null;
    if (!is_array($quote) || empty($quote['available']) || !empty($quote['_no_listing'])) {
        continue;
    }
    $items[] = $quote;
}

respondJson([
    'success' => true,
    'source' => 'dmarket',
    'items' => $items,
    'updated_at' => gmdate(DATE_ATOM),
]);
