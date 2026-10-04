<?php
/**
 * Counts the catalog per weapon / weapon class / section so the category pages
 * can show "SMGs · 303 skins" without downloading the 4 MB catalog.
 *
 * Writes assets/data/catalog-counts.json. Run after roi_catalog.json changes
 * (the deploy script runs it before every sync):
 *   php scripts/build_catalog_counts.php
 *
 * Skins are counted like the item pages list them: one card per skin, wear
 * variants collapsed, StatTrak™ / Souvenir versions counted as their own card.
 */
declare(strict_types=1);

ini_set('memory_limit', '1024M');

$root = dirname(__DIR__);
$json = $root . '/assets/steam-market-cache/roi_catalog.json';
$outFile = $root . '/assets/data/catalog-counts.json';
if (!is_file($json)) {
    fwrite(STDERR, "missing $json\n");
    exit(1);
}

$data = json_decode((string)file_get_contents($json), true);
$items = is_array($data['items'] ?? null) ? $data['items'] : (is_array($data) ? $data : []);

$stripWear = static function (string $name): string {
    return trim((string)preg_replace('/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i', '', $name));
};
$weaponBase = static function (string $name): string {
    $base = (string)preg_replace('/^(?:★\s*)?(?:StatTrak™\s*|Souvenir\s*)?(?:★\s*)?/u', '', $name);
    $pipe = mb_strpos($base, ' | ');
    return trim($pipe === false ? $base : mb_substr($base, 0, $pipe));
};

$weapons = [];      // "AK-47" => distinct skins
$topSkins = [];     // "AK-47" => ['name' => …, 'image' => …, 'price' => …] (priciest listing)
$classes = [];      // sub_filter => distinct skins
$seenSkins = [];    // dedupe wear variants
$sections = [];

// Same preference as catalogImageSource() on the client: official Steam icon,
// then a remote image, then the local file.
$imageFor = static function (array $item): string {
    foreach (['steam_image_url', 'image'] as $key) {
        $value = trim((string)($item[$key] ?? ''));
        if (str_starts_with($value, 'http')) {
            return $value;
        }
    }
    $local = trim((string)($item['local_path'] ?? $item['image'] ?? ''));
    if ($local !== '' && !in_array(ltrim($local, '/'), ['assets/markets/steam.png', 'assets/markets/steam.webp'], true)) {
        return $local;
    }
    return '';
};

foreach ($items as $item) {
    if (!is_array($item)) {
        continue;
    }
    $name = trim((string)($item['market_hash_name'] ?? ''));
    if ($name === '') {
        continue;
    }
    $category = (string)($item['category'] ?? '');
    $sub = (string)($item['sub_filter'] ?? '');

    if (in_array($category, ['skins', 'knives', 'gloves'], true)) {
        $key = $stripWear($name);
        $weapon = $weaponBase($key);
        // Priciest skin per weapon (any wear) for the category-page data line.
        $price = is_numeric($item['seed_sell_price'] ?? null) ? (float)$item['seed_sell_price'] : 0.0;
        $image = $imageFor($item);
        if ($weapon !== '' && $price > 0 && $image !== '' && $price > (float)($topSkins[$weapon]['price'] ?? 0)) {
            $topSkins[$weapon] = ['name' => $key, 'image' => $image, 'price' => round($price, 2)];
        }
        if (isset($seenSkins[$key])) {
            continue;
        }
        $seenSkins[$key] = true;
        if ($weapon !== '') {
            $weapons[$weapon] = ($weapons[$weapon] ?? 0) + 1;
        }
        $cls = $category === 'skins' ? $sub : $category;
        if ($cls !== '') {
            $classes[$cls] = ($classes[$cls] ?? 0) + 1;
        }
        continue;
    }

    if ($category === 'stickers') {
        if ($sub === 'stickers' && !str_starts_with($name, 'Sticker Slab |')) {
            $sections['stickers'] = ($sections['stickers'] ?? 0) + 1;
        }
        continue;
    }
    if ($category === 'cases') {
        $sections['cases'] = ($sections['cases'] ?? 0) + ($sub === 'cases' ? 1 : 0);
        $sections['capsules'] = ($sections['capsules'] ?? 0) + ($sub === 'capsules' ? 1 : 0);
        continue;
    }
    if ($category === 'collectibles') {
        $sections['pins'] = ($sections['pins'] ?? 0) + ($sub === 'pins' ? 1 : 0);
        continue;
    }
    if (in_array($category, ['agents', 'charms', 'patches', 'music', 'graffiti'], true)) {
        $sections[$category] = ($sections[$category] ?? 0) + 1;
    }
}

// Class aliases the pages use (heavy = shotguns + LMGs, rare = knives + gloves).
$classes['lmgs'] = $classes['heavy'] ?? 0;
$classes['heavy'] = ($classes['shotguns'] ?? 0) + ($classes['lmgs'] ?? 0);
$classes['rare'] = ($classes['knives'] ?? 0) + ($classes['gloves'] ?? 0);
$sections['other'] = ($sections['agents'] ?? 0) + ($sections['charms'] ?? 0) + ($sections['patches'] ?? 0)
    + ($sections['music'] ?? 0) + ($sections['pins'] ?? 0) + ($sections['graffiti'] ?? 0);

ksort($weapons);
ksort($topSkins);
ksort($classes);
ksort($sections);

$payload = [
    'generated' => gmdate('c'),
    'weapons' => $weapons,
    'top_skins' => $topSkins,
    'classes' => $classes,
    'sections' => $sections,
];
if (!is_dir(dirname($outFile))) {
    mkdir(dirname($outFile), 0775, true);
}
file_put_contents($outFile, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
printf("catalog-counts.json: %d weapons, classes %s, sections %s\n", count($weapons), json_encode($classes), json_encode($sections));
