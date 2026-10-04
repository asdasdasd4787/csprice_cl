<?php
declare(strict_types=1);

require_once __DIR__ . '/steam_auth_helpers.php';

try {
    $forceRefresh = isset($_GET['refresh'])
        ? filter_var($_GET['refresh'], FILTER_VALIDATE_BOOL)
        : false;
    $publicMode = isset($_GET['public'])
        ? filter_var($_GET['public'], FILTER_VALIDATE_BOOL)
        : false;
    $requestedSteamId = preg_replace('/\D+/', '', (string)($_GET['steamid'] ?? '')) ?: '';

    $user = steamSessionUser();
    $steamId = '';
    $provider = strtolower(trim((string)($user['provider'] ?? 'steam')));

    if ($user !== null && ($provider === '' || $provider === 'steam')) {
        $steamId = preg_replace('/\D+/', '', (string)($user['steamid'] ?? '')) ?: '';
    }

    if ($publicMode && $requestedSteamId !== '' && preg_match('/^\d{17}$/', $requestedSteamId)) {
        $steamId = $requestedSteamId;
    }

    if ($steamId === '') {
        respondJson([
            'authenticated' => $user !== null,
            'error' => 'Not authenticated with Steam.',
        ], 401);
    }

    // ?app=440: the Team Fortress 2 inventory (tf2price.eu), priced from the
    // TF2 index; CS2 (730) keeps the cached Steam sync below.
    $appId = (int)($_GET['app'] ?? 730);
    if ($appId === 440) {
        require_once __DIR__ . '/tf2_inventory_helpers.php';
        $inventory = tf2InventoryFetch($steamId, (bool)$forceRefresh);
    } else {
        $inventory = steamSyncInventoryCache($steamId, (bool)$forceRefresh);
    }

    respondJson([
        'authenticated' => $user !== null,
        'user' => $user,
        'inventory' => $inventory,
        'source_steamid' => $steamId,
        'public_lookup' => $publicMode && $requestedSteamId !== '',
    ]);
} catch (Throwable $exception) {
    respondJson([
        'authenticated' => true,
        'error' => $exception->getMessage(),
    ], 500);
}
