<?php
declare(strict_types=1);
require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/lib/skin_asset_helpers.php';

$query = trim((string)($_GET['q'] ?? ''));
$limit = max(1, min(60, (int)($_GET['limit'] ?? 24)));

// TF2 (tf2price.eu, `game=tf2`): the navbar search over the TF2 index
// instead of the CS2 catalog (user, 2026-09-30: "make the search bar work
// for tf2"). Same result shape as below plus `href`, the item's clean page.
if (strtolower((string)($_GET['game'] ?? '')) === 'tf2') {
    require_once __DIR__ . '/tf2_ai_helpers.php';
    if ($query === '' || mb_strlen($query) < 2) {
        respondJson(['items' => []]);
        exit;
    }
    $tokens = [];
    foreach (preg_split('/\s+/u', mb_strtolower($query), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $part) {
        if ($part !== '' && !in_array($part, $tokens, true)) {
            $tokens[] = $part;
        }
    }
    $q = mb_strtolower($query);
    $hits = [];
    foreach (tf2AiItems() as $i => $row) {
        $name = (string)($row[0] ?? '');
        $effect = preg_replace('/^★\s*/u', '', (string)($row[1] ?? ''));
        $full = mb_strtolower(trim(($effect !== '' ? $effect . ' ' : '') . $name));
        $ok = true;
        foreach ($tokens as $token) {
            if (mb_strpos($full, $token) === false) {
                $ok = false;
                break;
            }
        }
        if (!$ok) {
            continue;
        }
        $priced = 0;
        foreach ([3, 4, 8, 9] as $col) {
            if (is_numeric($row[$col] ?? null) && (float)$row[$col] > 0) {
                $priced = 1;
                break;
            }
        }
        $score = ($full === $q ? 100000 : 0)
            + (str_starts_with($full, $q) ? 20000 : 0)
            + (str_starts_with(mb_strtolower($name), $tokens[0] ?? $q) ? 5000 : 0)
            + ($effect === '' ? 2000 : 0)
            + $priced * 1000
            + min(999, (int)($row[5] ?? 0));
        $hits[] = [$score, $i];
        if (count($hits) >= 4000) {
            break;
        }
    }
    usort($hits, static fn(array $a, array $b) => $b[0] <=> $a[0]);
    $items = [];
    $rows = tf2AiItems();
    foreach (array_slice($hits, 0, $limit) as [, $i]) {
        $row = $rows[$i];
        $name = (string)$row[0];
        $effect = (string)($row[1] ?? '');
        $base = (int)($row[6] ?? -1);
        $steam = is_numeric($row[4] ?? null) && (float)$row[4] > 0 ? round((float)$row[4], 2) : null;
        $cheapest = null;
        foreach ([3, 8, 9, 4] as $col) {
            if (is_numeric($row[$col] ?? null) && (float)$row[$col] > 0 && ($cheapest === null || (float)$row[$col] < $cheapest)) {
                $cheapest = round((float)$row[$col], 2);
            }
        }
        $items[] = [
            'market_hash_name' => $name,
            'display_name' => ($effect !== '' ? preg_replace('/^★\s*/u', '', $effect) . ' ' : '') . $name,
            'name_color' => (string)($row[7] ?? '') !== '' ? (string)$row[7] : 'B0C3D9',
            'category' => (string)($row[2] ?? ''),
            'type_note' => (string)($row[11] ?? ''),
            'image' => tf2AiImage($name, $effect, $base),
            'seed_sell_price' => $steam ?? $cheapest,
            'seed_sell_listings' => (int)($row[5] ?? 0) > 0 ? (int)$row[5] : null,
            'href' => tf2ItemHref($name, $effect, (string)($row[11] ?? ''), $base, $cheapest !== null),
            'game' => 'tf2',
        ];
    }
    respondJson(['items' => $items]);
    exit;
}

$randomCount = max(0, min(10, (int)($_GET['random'] ?? 0)));
// Minimum listings for an item to be eligible as a random suggestion.
const SEARCH_RANDOM_MIN_LISTINGS = 50;
// At most this many suggestions from any one category, so one big category
// cannot take every slot.
const SEARCH_RANDOM_PER_CATEGORY = 2;

$catalogFile = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
if (!is_file($catalogFile)) {
    respondJson(['items' => []]);
    exit;
}

/*
 * `?random=N` - the phone search screen's suggestions when nothing is typed.
 *
 * Only items that have BOTH a price and an image are eligible, because a
 * suggestion row shows both and a blank one is worse than one fewer row. The
 * draw is weighted by listing count so the names that come up are ones people
 * recognise, rather than a uniform pick out of ~29,000 items that mostly
 * surfaces obscure stickers.
 *
 * sqrt() rather than the raw count: Dreams & Nightmares has ~366,000 listings
 * against a few hundred for a mid-tier skin, and weighting on the raw number
 * would return the same half-dozen items on every draw. The square root keeps
 * popular items favoured while leaving the long tail reachable.
 */
if ($randomCount > 0) {
    $catalog = json_decode((string)file_get_contents($catalogFile), true);
    $pool = is_array($catalog['items'] ?? null) ? $catalog['items'] : [];

    $eligible = [];
    $weights = [];
    $total = 0.0;
    foreach ($pool as $item) {
        if (!is_array($item)) {
            continue;
        }
        if (!is_numeric($item['seed_sell_price'] ?? null) || (float)$item['seed_sell_price'] <= 0) {
            continue;
        }
        if (resolveSearchImage($item) === '') {
            continue;
        }
        $listings = is_numeric($item['seed_sell_listings'] ?? null) ? (int)$item['seed_sell_listings'] : 0;
        // A floor, not just a weight. With `max(1, $listings)` every zero-listing
        // item still carried weight 1, and across ~29,000 of them the long tail
        // out-voted the popular names - the first draws returned graffiti and a
        // Souvenir Charm nobody has heard of. Requiring a real market presence
        // is what makes "things people recognise" true rather than aspirational.
        if ($listings < SEARCH_RANDOM_MIN_LISTINGS) {
            continue;
        }
        $weight = sqrt($listings);
        $eligible[] = $item;
        $weights[] = $weight;
        $total += $weight;
    }

    $picked = [];
    $seen = [];
    $catCount = [];
    $guard = 0;
    while (count($picked) < $randomCount && $eligible !== [] && $guard < 4000) {
        $guard++;
        $roll = mt_rand() / mt_getrandmax() * $total;
        $acc = 0.0;
        foreach ($eligible as $i => $item) {
            $acc += $weights[$i];
            if ($acc < $roll) {
                continue;
            }
            $key = (string)($item['market_hash_name'] ?? $i);
            if (isset($seen[$key])) {
                break;
            }
            /* Cap per category. Listings-weighting alone returned five stickers
               every time: stickers are ~21,000 of the ~29,000 catalogue entries
               AND carry the largest listing counts, so they won every slot on
               both counts. A cap is what turns "popular" into the mix of a case,
               a couple of skins and a sticker that the screen is for. */
            $cat = (string)($item['category'] ?? 'other');
            $catCount[$cat] = $catCount[$cat] ?? 0;
            if ($catCount[$cat] >= SEARCH_RANDOM_PER_CATEGORY) {
                break;
            }
            $catCount[$cat]++;
            $seen[$key] = true;
            $picked[] = [
                'market_hash_name'   => (string)($item['market_hash_name'] ?? ''),
                'display_name'       => (string)($item['display_name'] ?? ''),
                'image'              => resolveSearchImage($item),
                'name_color'         => (string)($item['name_color'] ?? 'B0C3D9'),
                'category'           => (string)($item['category'] ?? 'other'),
                'type_note'          => (string)($item['type_note'] ?? ''),
                'seed_sell_price'    => (float)$item['seed_sell_price'],
                'seed_sell_listings' => is_numeric($item['seed_sell_listings'] ?? null) ? (int)$item['seed_sell_listings'] : null,
                'selected_wear'      => (string)($item['selected_wear'] ?? ''),
            ];
            break;
        }
    }

    respondJson(['items' => $picked]);
    exit;
}

if ($query === '' || mb_strlen($query) < 2) {
    respondJson(['items' => []]);
    exit;
}

$data = json_decode((string)file_get_contents($catalogFile), true);
$all  = is_array($data['items'] ?? null) ? $data['items'] : [];
$tokens = [];
foreach (preg_split('/\s+/u', mb_strtolower($query), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $part) {
    $part = trim((string)$part);
    if ($part !== '' && !in_array($part, $tokens, true)) {
        $tokens[] = $part;
    }
}
$scored = [];

/**
 * @return list<string>
 */
function searchTokens(string $query): array
{
    $out = [];
    foreach (preg_split('/\s+/u', mb_strtolower(trim($query)), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $part) {
        $part = trim((string)$part);
        if ($part !== '' && !in_array($part, $out, true)) {
            $out[] = $part;
        }
    }
    return $out;
}

/**
 * @param array<string, mixed> $item
 */
function searchBlob(array $item): string
{
    return mb_strtolower(trim(implode(' ', [
        (string)($item['market_hash_name'] ?? ''),
        (string)($item['display_name'] ?? ''),
        (string)($item['type_note'] ?? ''),
        (string)($item['category_label'] ?? ''),
    ])));
}

/**
 * Every query token must appear somewhere in the item text.
 *
 * @param list<string> $tokens
 */
function matchesSearchTokens(string $blob, array $tokens): bool
{
    if ($tokens === []) {
        return false;
    }
    foreach ($tokens as $token) {
        if (mb_strpos($blob, $token) === false) {
            return false;
        }
    }
    return true;
}

/**
 * @param array<string, mixed> $item
 */
function startWithBonus(array $item, string $query): int
{
    $name = mb_strtolower((string)($item['market_hash_name'] ?? ''));
    $display = mb_strtolower((string)($item['display_name'] ?? ''));
    $q = mb_strtolower($query);
    $category = (string)($item['category'] ?? '');
    $tokens = searchTokens($query);
    $first = $tokens[0] ?? $q;

    $weapon = trim(explode('|', $name)[0] ?? $name);
    $starts = str_starts_with($name, $q)
        || str_starts_with($display, $q)
        || str_starts_with($name, $first)
        || str_starts_with($display, $first)
        || str_starts_with($weapon, $first);

    if (!$starts) {
        return 0;
    }

    if ($category === 'stickers' && str_starts_with($name, 'sticker |')) {
        return 5500;
    }
    if ($category === 'graffiti') {
        return 5000;
    }
    if (in_array($category, ['skins', 'knives', 'gloves', 'agents'], true)) {
        return 5000;
    }
    if ($category === 'cases') {
        return 1800;
    }
    if ($category === 'collectibles') {
        return 700;
    }
    if ($category === 'tools') {
        return 500;
    }

    return 3200;
}

/**
 * @param array<string, mixed> $item
 */
function isCatalogTokenSearchName(string $name): bool
{
    $value = trim($name);
    if ($value === '') {
        return false;
    }
    if (preg_match('/\bSouvenir Token$/iu', $value)) {
        return true;
    }
    if (!preg_match('/ Souvenir Package$/iu', $value)) {
        return false;
    }
    if (preg_match('/\bHighlight\s+Souvenir Package$/iu', $value)) {
        return false;
    }

    return !preg_match(
        '/\b(Ancient|Anubis|Dust II|Inferno|Mirage|Nuke|Overpass|Train|Vertigo|Cobblestone|Cache|Office|Italy|Aztec|Canals|Biome|Black Gold|Season|Sugarcane|Lake|Safehouse|Bazaar|Shortdust|Engage|Basalt|Insert|Thrill|Thera|Palacio|Memento|Assembly|Agency|Ali|Alpine|Abbey|Apollo|Blacksite|Breach|Climb|Edin|Ember|Farm|Gulag|Jungle|Marquis|Mocha|Museum|Ravine|Rialto|Rooster|Sanctum|Scar|Shoots|Stadium|Studio|Subzero|Zoo)\s+Souvenir Package$/iu',
        $value
    );
}

/**
 * @param array<string, mixed> $item
 */
function scoreSearchItem(string $query, array $item): int
{
    $q = mb_strtolower($query);
    $tokens = searchTokens($query);
    $name = mb_strtolower((string)($item['market_hash_name'] ?? ''));
    $display = mb_strtolower((string)($item['display_name'] ?? ''));
    $typeNote = mb_strtolower((string)($item['type_note'] ?? ''));
    $categoryLabel = mb_strtolower((string)($item['category_label'] ?? ''));
    $blob = searchBlob($item);

    if (!matchesSearchTokens($blob, $tokens)) {
        return 0;
    }

    $score = 0;
    $firstToken = $tokens[0] ?? $q;

    if ($name === $q || $display === $q) {
        $score += 10000;
    }

    if (str_starts_with($q, 'sticker slab |')) {
        if (str_starts_with($name, 'sticker slab |')) {
            $score += 8000;
        } elseif (str_starts_with($name, 'sticker |')) {
            $score -= 12000;
        }
    } elseif (str_starts_with($q, 'sticker |')) {
        if (str_starts_with($name, 'sticker slab |')) {
            $score -= 12000;
        }
    }

    $score += startWithBonus($item, $query);

    $firstSegment = trim(explode('|', $name)[0] ?? $name);
    if (str_starts_with($firstSegment, $q) || str_starts_with($firstSegment, $firstToken)) {
        $score += 2500;
    }

    $pos = mb_strpos($name, $q);
    if ($pos !== false) {
        $score += max(0, 800 - ($pos * 4));
    } else {
        $pos = mb_strpos($display, $q);
        if ($pos !== false) {
            $score += max(0, 600 - ($pos * 4));
        }
    }

    foreach ($tokens as $i => $token) {
        $tpos = mb_strpos($name, $token);
        if ($tpos === false) {
            $tpos = mb_strpos($display, $token);
            if ($tpos === false) {
                $tpos = mb_strpos($typeNote, $token);
                if ($tpos === false) {
                    $tpos = mb_strpos($categoryLabel, $token);
                    if ($tpos === false) {
                        return 0;
                    }
                }
            }
        }
        $score += max(0, 520 - ((int)$tpos * 3) - ($i * 20));
    }

    if (count($tokens) > 1) {
        $score += 900;
    }

    if (str_starts_with($name, 'sticker |')) {
        $score += 1200;
    }

    if (str_starts_with($name, 'sealed graffiti |') || str_starts_with($name, 'graffiti |')) {
        $score += 500;
    }

    if (str_contains($name, 'autograph capsule')) {
        $score -= 350;
    }

    if (isCatalogTokenSearchName($name)) {
        $score -= 15000;
    }

    if (preg_match('/\bcoin\b/u', $name)) {
        $score -= 250;
    }

    if (str_contains($name, 'souvenir package')) {
        $score -= 600;
    }

    if (!preg_match('/\b20\d{2}\b/u', $query) && preg_match('/\b(20\d{2})\b/u', $name, $yearMatch)) {
        $score += max(0, ((int)$yearMatch[1] - 2000) * 50);
    }

    $parts = array_map('trim', explode('|', $name));
    $lastPart = mb_strtolower((string)end($parts));
    if ($lastPart !== '' && (str_contains($lastPart, $q) || str_contains($q, $lastPart) || str_contains($lastPart, $firstToken))) {
        if (str_starts_with($name, 'sticker |')) {
            $score += 1100;
        }
    }

    if (str_starts_with($name, 'sticker |') && str_contains($name, $firstToken)) {
        $score += 1500;
    }

    if (preg_match('/\b20\d{2}\b/u', $query)) {
        if (str_starts_with($name, 'sticker |')) {
            $score += 3500;
        }
        if (str_contains($name, 'capsule') && !str_starts_with($name, 'sticker |')) {
            $score -= 2200;
        }
    }

    $price = is_numeric($item['seed_sell_price'] ?? null) ? (float)$item['seed_sell_price'] : null;
    if ($price !== null && $price >= 0) {
        $score += 1800;
    } else {
        $score -= 2800;
    }

    $listings = is_numeric($item['seed_sell_listings'] ?? null) ? (int)$item['seed_sell_listings'] : 0;
    $score += min(120, (int)round(log($listings + 1, 10) * 30));

    return $score;
}

/**
 * @param array<string, mixed> $item
 */
function resolveSearchImage(array $item): string
{
    $steam = trim((string)($item['steam_image_url'] ?? ''));
    if ($steam !== '' && str_starts_with($steam, 'http')) {
        return $steam;
    }

    $image = trim((string)($item['image'] ?? ''));
    if ($image !== '' && str_starts_with($image, 'http')) {
        return $image;
    }

    $local = trim((string)($item['local_path'] ?? ''));
    if ($local !== '' && !in_array($local, ['assets/markets/steam.png', 'assets/markets/steam.webp'], true)) {
        return $local;
    }

    return $image;
}

foreach ($all as $item) {
    if (!is_array($item)) {
        continue;
    }

    $blob = searchBlob($item);
    if (!matchesSearchTokens($blob, $tokens)) {
        continue;
    }

    $score = scoreSearchItem($query, $item);
    if ($score <= 0) {
        continue;
    }

    $scored[] = [
        'score' => $score,
        'item'  => [
            'market_hash_name'   => (string)($item['market_hash_name'] ?? ''),
            'display_name'       => (string)($item['display_name'] ?? ''),
            'image'              => resolveSearchImage($item),
            'name_color'         => (string)($item['name_color'] ?? 'B0C3D9'),
            'category'           => (string)($item['category'] ?? 'other'),
            'type_note'          => (string)($item['type_note'] ?? ''),
            'seed_sell_price'    => is_numeric($item['seed_sell_price'] ?? null) ? (float)$item['seed_sell_price'] : null,
            'seed_sell_listings' => is_numeric($item['seed_sell_listings'] ?? null) ? (int)$item['seed_sell_listings'] : null,
            'selected_wear'      => (string)($item['selected_wear'] ?? ''),
        ],
    ];
}

usort($scored, static function (array $left, array $right): int {
    $scoreCmp = $right['score'] <=> $left['score'];
    if ($scoreCmp !== 0) {
        return $scoreCmp;
    }

    $leftHasPrice = is_numeric($left['item']['seed_sell_price'] ?? null) ? 1 : 0;
    $rightHasPrice = is_numeric($right['item']['seed_sell_price'] ?? null) ? 1 : 0;

    return $rightHasPrice <=> $leftHasPrice;
});

$results = array_map(static fn(array $row): array => $row['item'], array_slice($scored, 0, $limit));

respondJson(['items' => array_values($results)]);
