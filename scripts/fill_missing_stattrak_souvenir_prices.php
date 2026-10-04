<?php
// One-off data repair: the local synthetic Skinport items index
// (assets/skinport-cache/items_index.json) has partial wear-tier coverage
// for StatTrak/Souvenir variants — some base skins only got a price for 1-2
// of the 5 wears when the fictional catalog data was generated. This backfills
// the missing wears for any base skin that already demonstrates ST/SV
// eligibility (i.e. already has at least one valid ST or SV price point),
// deriving the missing prices from that skin's normal-wear prices scaled by
// the median special/normal ratio observed on the wears that do have both.
// It never invents ST/SV eligibility for a skin that has none.

$path = __DIR__ . '/../assets/skinport-cache/items_index.json';
$json = json_decode(file_get_contents($path), true);
if (!is_array($json) || !is_array($json['items'] ?? null)) {
    fwrite(STDERR, "Could not load items_index.json\n");
    exit(1);
}
$items = $json['items'];

$WEARS = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];

function parseSkinportName(string $name): array
{
    foreach (['StatTrak™ ' => 'StatTrak™', 'Souvenir ' => 'Souvenir'] as $needle => $label) {
        if (strpos($name, $needle) === 0) {
            $rest = substr($name, strlen($needle));
            if (preg_match('/^(.*) \(([^)]+)\)$/u', $rest, $m)) {
                return [$label, $m[1], $m[2]];
            }
            return [$label, $rest, null];
        }
    }
    if (preg_match('/^(.*) \(([^)]+)\)$/u', $name, $m)) {
        return ['', $m[1], $m[2]];
    }
    return ['', $name, null];
}

$groups = [];
foreach ($items as $name => $row) {
    if (!is_array($row)) continue;
    [$prefix, $base, $wear] = parseSkinportName((string)$name);
    if ($wear === null || !in_array($wear, $WEARS, true)) continue;
    $groups[$base][$prefix === '' ? 'normal' : $prefix][$wear] = $row;
}

$filled = 0;
$skinsTouched = 0;
$now = time();

foreach ($groups as $base => $prefixes) {
    if (!isset($prefixes['normal'])) continue;
    $normal = $prefixes['normal'];

    foreach (['Souvenir', 'StatTrak™'] as $special) {
        if (!isset($prefixes[$special])) continue;
        $specialRows = $prefixes[$special];

        $ratios = [];
        foreach ($WEARS as $w) {
            $n = $normal[$w]['min_price'] ?? null;
            $s = $specialRows[$w]['min_price'] ?? null;
            if (is_numeric($n) && $n > 0 && is_numeric($s) && $s > 0) {
                $ratios[] = $s / $n;
            }
        }
        if (!$ratios) continue;
        sort($ratios);
        $mid = intdiv(count($ratios), 2);
        $ratio = count($ratios) % 2
            ? $ratios[$mid]
            : ($ratios[$mid - 1] + $ratios[$mid]) / 2;

        $touchedThisSkin = false;
        foreach ($WEARS as $w) {
            $n = $normal[$w]['min_price'] ?? null;
            if (!is_numeric($n) || $n <= 0) continue;

            $existing = $specialRows[$w] ?? null;
            $hasPrice = is_array($existing) && is_numeric($existing['min_price'] ?? null) && $existing['min_price'] > 0;
            if ($hasPrice) continue;

            $price = round($n * $ratio, 2);
            $wearSlug = strtolower(str_replace(' ', '-', $w));
            $baseSlug = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $base), '-'));
            $itemPageSlug = $special === 'Souvenir' ? "souvenir-$baseSlug" : "stattrak-$baseSlug";
            $fullName = ($special === 'Souvenir' ? 'Souvenir ' : 'StatTrak™ ') . "$base ($w)";

            $template = is_array($existing) ? $existing : (reset($specialRows) ?: []);
            $listings = $template['listings'] ?? ($normal[$w]['listings'] ?? 0);
            $itemsCt = $template['items'] ?? $listings;
            $quantity = max(1, (int)($template['quantity'] ?? 1));
            $marketPage = $template['market_page'] ?? ($normal[$w]['market_page'] ?? '');

            $items[$fullName] = [
                'market_hash_name' => $fullName,
                'version' => null,
                'currency' => 'EUR',
                'suggested_price' => $price,
                'item_page' => "https://skinport.com/item/$itemPageSlug-$wearSlug",
                'market_page' => $marketPage,
                'min_price' => $price,
                'max_price' => $price,
                'mean_price' => $price,
                'median_price' => $price,
                'quantity' => $quantity,
                'created_at' => $now,
                'updated_at' => $now,
                'listings' => $listings,
                'items' => $itemsCt,
                'listings_source' => 'item_menus_listings',
                'listings_fetched_at' => $now,
            ];
            $filled++;
            $touchedThisSkin = true;
        }
        if ($touchedThisSkin) $skinsTouched++;
    }
}

$json['items'] = $items;
file_put_contents($path, json_encode($json));

echo "Filled $filled missing wear-tier price rows across $skinsTouched skin/quality groups.\n";
