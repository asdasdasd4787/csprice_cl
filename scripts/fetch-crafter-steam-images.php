<?php
declare(strict_types=1);

require __DIR__ . '/../sync_steam_item_images.php';

$mapPath = __DIR__ . '/../assets/models/crafter/batch-map.json';
$map = json_decode((string)file_get_contents($mapPath), true);
if (!is_array($map)) {
    fwrite(STDERR, "Invalid batch map.\n");
    exit(1);
}

$items = is_array($map['items'] ?? null) ? $map['items'] : [];
$updated = 0;

foreach ($items as &$entry) {
    if (!is_array($entry)) {
        continue;
    }

    $name = trim((string)($entry['market_name'] ?? ''));
    if ($name === '') {
        continue;
    }

    $resolved = steamImageResolveFromSearch($name . ' (Field-Tested)');
    $image = trim((string)($resolved['image_url'] ?? ''));
    if ($image === '') {
        fwrite(STDERR, "Missing Steam image for {$name}\n");
        continue;
    }

    if (($entry['preview_image'] ?? '') !== $image) {
        $entry['preview_image'] = $image;
        $updated++;
        echo "Updated {$name}\n";
    }
}
unset($entry);

$map['version'] = '20260705-crafter-steam-previews-1';
$map['items'] = $items;
file_put_contents($mapPath, json_encode($map, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");

echo "Done. Updated {$updated} preview image(s).\n";
