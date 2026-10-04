<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
require __DIR__ . '/shadowpay_helpers.php';
set_time_limit(90);

$raw = (string)file_get_contents('php://input');
$payload = json_decode($raw, true);
// Cached answer when a recent identical request exists (see provider_quote_cache.php).
require_once __DIR__ . '/provider_quote_cache.php';
providerQuoteCacheStart('shadowpay', $raw);
if (!is_array($payload)) {
    $payload = $_GET;
}

$names = shadowpayRequestedNames($payload);
if (!$names) {
    respondJson([
        'success' => false,
        'source' => 'shadowpay',
        'error' => 'No names',
        'items' => [],
    ]);
}

$config = appConfig()['shadowpay'] ?? [];
$preferLive = !empty($payload['prefer_live']) || !empty($payload['fresh']) || !empty($payload['ignore_cache']);
$cacheOnly = !empty($payload['cache_only']) || !empty($payload['offline_cache_only']);

$quotes = shadowpayFetchQuotes($names, $config, [
    'cache_only' => $cacheOnly,
    'prefer_live' => $preferLive,
    'include_history' => $preferLive && !$cacheOnly && count($names) === 1,
]);

$items = [];
foreach ($names as $name) {
    $quote = $quotes[$name] ?? null;
    if (!is_array($quote)) {
        continue;
    }
    $items[] = $quote;
}

respondJson([
    'success' => true,
    'source' => 'shadowpay',
    'items' => $items,
    'updated_at' => gmdate(DATE_ATOM),
]);
