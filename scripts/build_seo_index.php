<?php
/**
 * Builds the compact per-item SEO index that item_page.php reads to render
 * server-side <title>, description, Open Graph and Product structured data.
 *
 * Source: assets/steam-market-cache/roi_catalog.json (29k items, 28 MB) — far
 * too big to parse on every page view, so it is split into small shards keyed
 * by the first character of the lower-cased name (assets/seo/idx/<char>.json).
 *
 * Run after the catalog changes:  php scripts/build_seo_index.php
 */
declare(strict_types=1);

$root = dirname(__DIR__);
$source = $root . '/assets/steam-market-cache/roi_catalog.json';
$outDir = $root . '/assets/seo/idx';

if (!is_file($source)) {
    fwrite(STDERR, "catalog missing: $source\n");
    exit(1);
}
$decoded = json_decode((string)file_get_contents($source), true);
$items = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];
if (!$items) {
    fwrite(STDERR, "catalog has no items\n");
    exit(1);
}

require_once $root . '/seo_helpers.php';

if (!is_dir($outDir)) {
    mkdir($outDir, 0755, true);
}
foreach (glob($outDir . '/*.json') ?: [] as $old) {
    unlink($old);
}

$shards = [];
$count = 0;
foreach ($items as $item) {
    if (!is_array($item)) {
        continue;
    }
    $name = trim((string)($item['market_hash_name'] ?? ''));
    if ($name === '') {
        continue;
    }
    $image = trim((string)($item['steam_image_url'] ?? ''));
    if ($image === '') {
        $image = trim((string)($item['image'] ?? ''));
    }
    $entry = [
        'n' => $name,
        'd' => trim((string)($item['display_name'] ?? $name)),
        'i' => $image,
        'c' => trim((string)($item['category_label'] ?? $item['category'] ?? '')),
        'k' => trim((string)($item['category'] ?? '')),
        't' => trim((string)($item['type_note'] ?? '')),
        'r' => trim((string)($item['rarity'] ?? $item['rarity_label'] ?? '')),
        'col' => trim((string)($item['collection'] ?? $item['collection_name'] ?? $item['case'] ?? '')),
    ];
    $key = seoItemKey($name);
    $shard = seoShardName($key);
    $shards[$shard][$key] = $entry;
    // Wear-less alias so item_page.php?display_name=AK-47 | Redline resolves too.
    $base = seoItemKey(seoStripWear($name));
    if ($base !== $key && !isset($shards[seoShardName($base)][$base])) {
        $shards[seoShardName($base)][$base] = $entry;
    }
    $count++;
}

foreach ($shards as $shard => $entries) {
    file_put_contents(
        $outDir . '/' . $shard . '.json',
        json_encode($entries, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    );
}
printf("indexed %d items into %d shards under assets/seo/idx\n", $count, count($shards));
