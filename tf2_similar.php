<?php
declare(strict_types=1);

/**
 * Similar TF2 items for an item page (tf2price.eu), the counterpart of the
 * CS2 page's "More <weapon> finishes" strip (user, 2026-10-03: "recommend
 * similar items to buy").
 *
 *   tf2_similar.php?item=<name>&e=<effect>&limit=8
 *
 * Picks from the TF2 index: the same market category (an unusual's siblings
 * are other unusuals of that hat first, then other unusual hats), priced on
 * a market, closest in price to this item, liquid ones first. Never the item
 * itself. Cached an hour; the index refreshes weekly.
 */

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/tf2_ai_helpers.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=3600');

$name = trim((string)($_GET['item'] ?? ''));
$effect = trim((string)($_GET['e'] ?? ''));
$limit = max(1, min(12, (int)($_GET['limit'] ?? 8)));
if ($name === '') {
    echo json_encode(['items' => []]);
    exit;
}

/**
 * The item's image; a quality variant (Strange / Killstreak / Vintage …) has no
 * base index in the index, so it borrows the plain item's schema image.
 */
function tf2SimilarImage(string $name, string $effect, int $base): string
{
    $img = tf2AiImage($name, $effect, $base);
    if ($img !== '') {
        return $img;
    }
    $plain = $name;
    for ($i = 0; $i < 4; $i++) {
        $next = (string)preg_replace('/^(?:Strange|Vintage|Genuine|Haunted|Collector\x27s|Festivized|Professional Killstreak|Specialized Killstreak|Killstreak|Unusual|Festive)\s+/iu', '', $plain);
        if ($next === $plain) {
            break;
        }
        $plain = $next;
    }
    if ($plain === $name) {
        return '';
    }
    $alt = tf2AiRow($plain, '') ?? tf2AiRow('The ' . $plain, '');
    return $alt ? tf2AiImage((string)$alt[0], '', (int)($alt[6] ?? -1)) : '';
}

$price = static function (array $r): ?float {
    $best = null;
    foreach ([4, 3, 8, 9] as $col) {
        if (is_numeric($r[$col] ?? null) && (float)$r[$col] > 0) {
            $v = (float)$r[$col];
            $best = $best === null ? $v : min($best, $v);
        }
    }
    return $best;
};

$self = tf2AiRow($name, $effect) ?? tf2AiRow($name, '');
$selfPrice = $self ? $price($self) : null;
$selfCat = $self ? (string)($self[2] ?? '') : '';
$selfGroup = $self ? (string)($self[11] ?? '') : '';
$selfIsUnusual = $self && (string)($self[1] ?? '') !== '';
$selfName = mb_strtolower($name);

$scored = [];
foreach (tf2AiItems() as $i => $r) {
    $rName = (string)($r[0] ?? '');
    if (mb_strtolower($rName) === $selfName) {
        continue;
    }
    $rCat = (string)($r[2] ?? '');
    $rGroup = (string)($r[11] ?? '');
    $isUnusual = (string)($r[1] ?? '') !== '';
    if ($selfIsUnusual) {
        // An unusual hat's siblings are unusual hats, not unusual taunts.
        if (!$isUnusual || ($selfGroup !== '' && $rGroup !== $selfGroup)) {
            continue;
        }
    } elseif ($selfGroup !== '' ? $rGroup !== $selfGroup : $rCat !== $selfCat) {
        continue;
    }
    $p = $price($r);
    if ($p === null) {
        continue;
    }
    $closeness = $selfPrice ? abs(log($p / $selfPrice)) : 0.0;
    $listings = (int)($r[5] ?? 0);
    // Price closeness first, then liquidity; a Steam price (the item trades
    // on the market) counts a little extra.
    $score = $closeness * 10 - min(5.0, log(1 + $listings)) - (is_numeric($r[4] ?? null) ? 0.5 : 0);
    $scored[] = [$score, $i];
}
usort($scored, static fn(array $a, array $b) => $a[0] <=> $b[0]);

$items = [];
$seen = [];
$rows = tf2AiItems();
foreach ($scored as [, $i]) {
    $r = $rows[$i];
    $key = mb_strtolower((string)$r[0]);
    if ($selfIsUnusual) {
        // One effect per hat, so the strip spans different hats.
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
    }
    $rEffect = (string)($r[1] ?? '');
    $base = (int)($r[6] ?? -1);
    $p = $price($r);
    $items[] = [
        'name' => (string)$r[0],
        'effect' => $rEffect,
        'display_name' => ($rEffect !== '' ? preg_replace('/^★\s*/u', '', $rEffect) . ' ' : '') . (string)$r[0],
        'image' => tf2SimilarImage((string)$r[0], $rEffect, $base),
        'price' => $p !== null ? round($p, 2) : null,
        'listings' => (int)($r[5] ?? 0),
        'color' => (string)($r[7] ?? '') !== '' ? (string)$r[7] : 'B0C3D9',
        'group' => (string)($r[11] ?? ''),
        'href' => tf2ItemHref((string)$r[0], $rEffect, (string)($r[11] ?? ''), $base, true),
    ];
    if (count($items) >= $limit) {
        break;
    }
}

echo json_encode(['items' => $items, 'group' => $selfGroup, 'unusual' => $selfIsUnusual], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
