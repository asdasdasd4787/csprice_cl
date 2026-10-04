<?php
declare(strict_types=1);

/**
 * The Team Fortress 2 inventory for the dashboard (login.html on tf2price.eu):
 * Steam's inventory for app 440, every item priced from the TF2 index
 * (assets/data/tf2/ai-index.json, the same data Dell answers from) and
 * linked to its item page. Cached as a file per Steam id for 15 minutes;
 * "refresh" bypasses the cache.
 */

require_once __DIR__ . '/steam_auth_helpers.php';
require_once __DIR__ . '/tf2_ai_helpers.php';

const TF2_INVENTORY_CACHE_DIR = __DIR__ . '/assets/cache/tf2-inventory';
const TF2_INVENTORY_CACHE_TTL = 900;
const TF2_INVENTORY_PAGE_SIZE = 2000;
const TF2_INVENTORY_MAX_PAGES = 10;
// Community (backpack.tf) prices in refined metal, written by
// scripts/tf2_backpack_import.php. Optional: without the file the metal
// fallback below is the 1-scrap baseline.
const TF2_BACKPACK_PRICES = __DIR__ . '/assets/data/tf2/backpack-prices.json';

function tf2InventoryFetch(string $steamId, bool $forceRefresh = false): array
{
    $file = TF2_INVENTORY_CACHE_DIR . '/' . md5($steamId) . '.json';
    if (!$forceRefresh && is_file($file) && (time() - (int)filemtime($file)) < TF2_INVENTORY_CACHE_TTL) {
        $cached = json_decode((string)file_get_contents($file), true);
        if (is_array($cached) && isset($cached['items'])) {
            $cached['cached'] = true;
            return $cached;
        }
    }

    $cursor = null;
    $items = [];
    $seen = [];
    $pages = 0;
    $total = 0;
    while ($pages < TF2_INVENTORY_MAX_PAGES) {
        $page = steamFetchInventory($steamId, TF2_INVENTORY_PAGE_SIZE, $cursor, 440);
        foreach ((array)($page['items'] ?? []) as $item) {
            if (!is_array($item)) {
                continue;
            }
            $assetId = (string)($item['asset_id'] ?? '');
            if ($assetId !== '' && isset($seen[$assetId])) {
                continue;
            }
            if ($assetId !== '') {
                $seen[$assetId] = true;
            }
            $items[] = tf2InventoryPriceItem($item);
        }
        $pages++;
        $total = max($total, (int)($page['total_inventory_count'] ?? 0));
        $next = trim((string)($page['last_assetid'] ?? ''));
        if (empty($page['more_items']) || $next === '' || $next === (string)$cursor) {
            break;
        }
        $cursor = $next;
    }

    $payload = [
        'app_id' => 440,
        'items' => $items,
        'total_inventory_count' => max($total, count($items)),
        'page_count' => $pages,
        'last_synced_at' => gmdate('c'),
        'ref_eur_rate' => tf2RefEurRate(),
        'cached' => false,
    ];
    if (!is_dir(TF2_INVENTORY_CACHE_DIR)) {
        @mkdir(TF2_INVENTORY_CACHE_DIR, 0755, true);
    }
    @file_put_contents($file, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    return $payload;
}

/**
 * Adds the index prices (Steam, Mannco, Skinport, DMarket, in EUR) and the
 * item page link. An unusual is looked up with its effect; anything the
 * index does not know keeps null prices.
 */
function tf2InventoryPriceItem(array $item): array
{
    $name = trim((string)($item['market_hash_name'] ?? $item['name'] ?? ''));
    $effect = trim((string)($item['effect'] ?? ''));
    $row = $name !== '' ? tf2AiRow($name, $effect) : null;
    if ($row === null && $effect !== '' && $name !== '') {
        $row = tf2AiRow($name, '');
    }
    $price = static function ($value): ?float {
        return is_numeric($value) && (float)$value > 0 ? round((float)$value, 2) : null;
    };
    $prices = [
        'steam' => $row ? $price($row[4] ?? null) : null,
        'mannco' => $row ? $price($row[3] ?? null) : null,
        'skinport' => $row ? $price($row[8] ?? null) : null,
        'dmarket' => $row ? $price($row[9] ?? null) : null,
    ];
    $item['tf2_prices'] = $prices;
    // Items Steam does not sell (a dropped Tomislav, a craftable hat) are
    // still worth metal: backpack.tf's price when imported, else the usual
    // baseline (user, 2026-09-30: "show the price in scrap which is 0.11 ref").
    $ref = array_filter($prices) === [] ? tf2InventoryRefPrice($item) : null;
    $item['ref_price'] = $ref;
    $item['ref_price_eur'] = $ref !== null ? round($ref * tf2RefEurRate(), 4) : null;
    $item['detail_url'] = $row
        ? tf2ItemHref((string)$row[0], (string)($row[1] ?? ''), (string)($row[11] ?? ''), (int)($row[6] ?? -1), array_filter($prices) !== [])
        : '';
    return $item;
}

/** backpack.tf pricelist file: ['key_ref' => float, 'prices' => ['<quality>|<craftable 1/0>|<name>' => ref]]. */
function tf2BackpackPrices(): array
{
    static $data = null;
    if ($data === null) {
        $decoded = is_file(TF2_BACKPACK_PRICES) ? json_decode((string)file_get_contents(TF2_BACKPACK_PRICES), true) : null;
        $data = is_array($decoded) && is_array($decoded['prices'] ?? null) ? $decoded : ['key_ref' => 0.0, 'prices' => []];
    }
    return $data;
}

/**
 * EUR per refined metal: the key's EUR price (index Steam price, else
 * Mannco) over its metal price from backpack.tf; without that, the index's
 * own Refined Metal price.
 */
function tf2RefEurRate(): float
{
    static $rate = null;
    if ($rate !== null) {
        return $rate;
    }
    $price = static function (?array $row): float {
        foreach ([4, 3] as $col) {
            if ($row && is_numeric($row[$col] ?? null) && (float)$row[$col] > 0) {
                return (float)$row[$col];
            }
        }
        return 0.0;
    };
    $keyEur = $price(tf2AiRow('Mann Co. Supply Crate Key'));
    $keyRef = (float)(tf2BackpackPrices()['key_ref'] ?? 0);
    if ($keyEur > 0 && $keyRef > 0) {
        return $rate = round($keyEur / $keyRef, 5);
    }
    $refined = $price(tf2AiRow('Refined Metal'));
    return $rate = $refined > 0 ? $refined : 0.04;
}

/** The item's quality, from Steam's tag or the name prefix ("Strange Tomislav"). */
function tf2InventoryQuality(array $item): string
{
    $quality = strtolower(trim((string)($item['quality'] ?? '')));
    if ($quality !== '') {
        return $quality;
    }
    $name = trim((string)($item['market_hash_name'] ?? $item['name'] ?? ''));
    foreach (['Strange', 'Unusual', 'Vintage', 'Genuine', 'Haunted', "Collector's", 'Community', 'Self-Made', 'Valve'] as $prefix) {
        if (stripos($name, $prefix . ' ') === 0) {
            return strtolower($prefix);
        }
    }
    return 'unique';
}

/**
 * Metal price (refined) for an item without a market price: backpack.tf's
 * entry for its quality/craftability, else the baseline - a craftable unique
 * weapon is one scrap (0.11 ref), a craftable unique cosmetic 1.33 ref, the
 * metals themselves their face value. null when nothing applies.
 */
function tf2InventoryRefPrice(array $item): ?float
{
    $name = trim((string)($item['market_hash_name'] ?? $item['name'] ?? ''));
    if ($name === '') {
        return null;
    }
    // Untradable items (tour badges, achievement rewards) are worth nothing to anyone.
    if (array_key_exists('tradable', $item) && !$item['tradable']) {
        return null;
    }
    $quality = tf2InventoryQuality($item);
    $craftable = array_key_exists('craftable', $item) ? (bool)$item['craftable'] : true;
    $base = preg_replace('/^(Strange|Unusual|Vintage|Genuine|Haunted|Collector\'s|Community|Self-Made|Valve)\s+/iu', '', $name);
    $candidates = array_unique([$base, preg_replace('/^The\s+/iu', '', $base), 'The ' . $base]);

    $prices = tf2BackpackPrices()['prices'];
    foreach ($candidates as $candidate) {
        $key = $quality . '|' . ($craftable ? '1' : '0') . '|' . mb_strtolower($candidate);
        if (isset($prices[$key]) && (float)$prices[$key] > 0) {
            return round((float)$prices[$key], 2);
        }
    }

    $metal = ['scrap metal' => 0.11, 'reclaimed metal' => 0.33, 'refined metal' => 1.0];
    if (isset($metal[mb_strtolower($base)])) {
        return $metal[mb_strtolower($base)];
    }
    if ($quality !== 'unique' || !$craftable) {
        return null;
    }
    $slot = strtolower(trim((string)($item['slot'] ?? '')));
    $type = strtolower(trim((string)($item['type'] ?? '')));
    if (str_contains($slot, 'weapon') || $slot === 'pda' || $slot === 'building' || preg_match('/level \d+ .*(weapon|pistol|rifle|gun|launcher|sword|knife|wrench|bat|shovel|axe|bow|scattergun|shotgun|smg|minigun|flame thrower|medi gun|sapper|pda|jar|lunch box|bonk|boots)/i', $type)) {
        return 0.11;
    }
    if ($slot === 'cosmetic' || preg_match('/level \d+ (hat|cosmetic|mask|glasses|hair|helmet|coat|jacket|shirt|suit|beard|badge|medal|pin|hood|cap|apparel|headgear|pocket buddy|scarf|boots|shoes|gloves|backpack|bandana|sash|wings|tail)/i', $type)) {
        return 1.33;
    }
    return null;
}
