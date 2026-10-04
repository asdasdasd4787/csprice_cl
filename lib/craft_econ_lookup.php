<?php
declare(strict_types=1);

function craftEconLookupPath(): string
{
    return __DIR__ . '/../assets/data/craft-econ-lookup.json';
}

/**
 * @return array{version?:int,skins?:array<string,array<string,mixed>>,stickers?:array<string,array<string,mixed>>}
 */
function loadCraftEconLookup(): array
{
    static $cache = null;
    if (is_array($cache)) {
        return $cache;
    }

    $path = craftEconLookupPath();
    if (!is_file($path)) {
        $cache = [];
        return $cache;
    }

    $decoded = json_decode((string)file_get_contents($path), true);
    if (!is_array($decoded)) {
        $cache = [];
        return $cache;
    }

    // Normalize sticker/skin keys once so double-space API dumps still resolve.
    if (isset($decoded['stickers']) && is_array($decoded['stickers'])) {
        $decoded['stickers'] = craftEconNormalizeLookupMap($decoded['stickers']);
    }
    if (isset($decoded['skins']) && is_array($decoded['skins'])) {
        $decoded['skins'] = craftEconNormalizeLookupMap($decoded['skins']);
    }
    if (isset($decoded['keychains']) && is_array($decoded['keychains'])) {
        $decoded['keychains'] = craftEconNormalizeLookupMap($decoded['keychains']);
    }
    if (isset($decoded['highlights']) && is_array($decoded['highlights'])) {
        $decoded['highlights'] = craftEconNormalizeLookupMap($decoded['highlights']);
    }
    if (isset($decoded['sticker_slabs']) && is_array($decoded['sticker_slabs'])) {
        $decoded['sticker_slabs'] = craftEconNormalizeLookupMap($decoded['sticker_slabs']);
    }

    $cache = $decoded;
    return $cache;
}

function craftEconLookupKey(string $value): string
{
    $key = mb_strtolower(trim($value));
    // ByMykel dumps sometimes embed double spaces around "|" (e.g. "ninjas in pyjamas  |").
    $key = preg_replace('/\s+/u', ' ', $key) ?? $key;
    return $key;
}

/**
 * Re-index a lookup map so every key is whitespace-normalized.
 *
 * @param array<string, mixed> $map
 * @return array<string, mixed>
 */
function craftEconNormalizeLookupMap(array $map): array
{
    $normalized = [];
    foreach ($map as $key => $value) {
        if (!is_array($value)) {
            continue;
        }
        $nk = craftEconLookupKey((string)$key);
        if ($nk === '') {
            continue;
        }
        // Prefer the first entry; duplicates after normalize should be identical IDs.
        if (!isset($normalized[$nk])) {
            $normalized[$nk] = $value;
        }
    }
    return $normalized;
}

/**
 * Historical Steam market names that don't match CSGO-API sticker names.
 *
 * @return array<int, string>
 */
function craftStickerNameAliases(string $marketHashName): array
{
    $raw = trim($marketHashName);
    if ($raw === '') {
        return [];
    }

    $normalized = preg_replace('/\s+/u', ' ', $raw) ?? $raw;
    $aliases = [$raw, $normalized];

    // Cloud9 traded as "Cloud9 G2A" at Katowice 2015.
    if (preg_match('/^Sticker \| Cloud9(\s+\([^)]+\))? \| Katowice 2015$/iu', $normalized, $m)) {
        $finish = $m[1] ?? '';
        $aliases[] = 'Sticker | Cloud9 G2A' . $finish . ' | Katowice 2015';
    }

    // Complexity rebranded from Counter Logic Gaming after Katowice 2015 stickers shipped.
    if (preg_match('/^Sticker \| Complexity Gaming(\s+\([^)]+\))? \| Katowice 2015$/iu', $normalized, $m)) {
        $finish = $m[1] ?? '';
        $aliases[] = 'Sticker | Counter Logic Gaming' . $finish . ' | Katowice 2015';
    }

    // Steam sometimes lists mouz under Katowice 2015; the paper sticker is Katowice 2014.
    if (preg_match('/^Sticker \| mousesports(\s+\([^)]+\))? \| Katowice 2015$/iu', $normalized, $m)) {
        $finish = $m[1] ?? '';
        $aliases[] = 'Sticker | mousesports' . $finish . ' | Katowice 2014';
        $aliases[] = 'Sticker | mousesports' . $finish . ' | Cologne 2015';
    }

    // Team Liquid wasn't in the Kato 2015 sticker set; closest paper logo era is Cologne/Cluj 2016.
    if (preg_match('/^Sticker \| Team Liquid(\s+\([^)]+\))? \| Katowice 2015$/iu', $normalized, $m)) {
        $finish = $m[1] ?? '';
        $aliases[] = 'Sticker | Team Liquid' . $finish . ' | Cologne 2016';
        $aliases[] = 'Sticker | Team Liquid' . $finish . ' | MLG Columbus 2016';
    }

    // Newer majors renamed paper "Glitter" finish to "Embroidered".
    if (preg_match('/^(Sticker \| .+?) \(Glitter\)( \| .+)$/iu', $normalized, $m)) {
        $aliases[] = $m[1] . ' (Embroidered)' . $m[2];
    }

    $unique = [];
    foreach ($aliases as $alias) {
        $label = trim((string)$alias);
        if ($label === '') {
            continue;
        }
        $unique[$label] = $label;
    }
    return array_values($unique);
}

/**
 * Lookup keys are wear-specific ("mp5-sd | agent (factory new)"). Build aliases so
 * a base name, StatTrak/Souvenir prefix, or missing ★ still resolves.
 *
 * @return array<int, string>
 */
function craftSkinNameCandidates(string $marketHashName): array
{
    $wears = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
    $raw = trim(preg_replace('/\s+/u', ' ', $marketHashName) ?? $marketHashName);
    $names = [];
    $push = static function (string $name) use (&$names): void {
        $name = trim($name);
        if ($name !== '') {
            $names[$name] = $name;
        }
    };

    $push($raw);

    $wear = '';
    $base = $raw;
    if (preg_match('/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/u', $raw, $match)) {
        $base = trim((string)$match[1]);
        $wear = (string)$match[2];
        $push($base);
    }

    $stripped = preg_replace('/^[\s★*]+/u', '', $base) ?? $base;
    $stripped = preg_replace('/^(souvenir|stattrak™|stattrak)\s+/iu', '', $stripped) ?? $stripped;
    $stripped = trim($stripped);
    $push($stripped);
    if ($stripped !== '') {
        $push('★ ' . $stripped);
    }

    $bases = array_values($names);
    foreach ($bases as $candidateBase) {
        if ($wear !== '') {
            $push($candidateBase . ' (' . $wear . ')');
            continue;
        }
        foreach ($wears as $wearLabel) {
            $push($candidateBase . ' (' . $wearLabel . ')');
        }
    }

    return array_values($names);
}

/**
 * @return array{def_index:int,paint_index:int,rarity:int}|null
 */
function resolveCraftSkinEcon(string $marketHashName): ?array
{
    $lookup = loadCraftEconLookup();
    $skins = is_array($lookup['skins'] ?? null) ? $lookup['skins'] : [];
    if (!$skins) {
        return null;
    }

    foreach (craftSkinNameCandidates($marketHashName) as $candidate) {
        $key = craftEconLookupKey($candidate);
        if ($key === '' || !isset($skins[$key]) || !is_array($skins[$key])) {
            continue;
        }

        $entry = $skins[$key];
        $defIndex = (int)($entry['def_index'] ?? 0);
        $paintIndex = (int)($entry['paint_index'] ?? 0);
        if ($defIndex <= 0 || $paintIndex <= 0) {
            continue;
        }

        return [
            'def_index' => $defIndex,
            'paint_index' => $paintIndex,
            'rarity' => max(0, (int)($entry['rarity'] ?? 4)),
        ];
    }

    return null;
}

/**
 * @param array<string, mixed> $entry
 * @return array{sticker_id:int,inspect_url?:string,rarity?:int}|null
 */
function craftStickerEconFromEntry(array $entry): ?array
{
    $stickerId = (int)($entry['sticker_id'] ?? 0);
    if ($stickerId <= 0) {
        return null;
    }

    $inspectUrl = trim((string)($entry['inspect_url'] ?? ''));
    $rarity = max(0, (int)($entry['rarity'] ?? 4));
    if ($inspectUrl === '') {
        $inspectUrl = craftBuildStandaloneStickerInspectUrl($stickerId, $rarity);
    }

    $payload = ['sticker_id' => $stickerId];
    if ($inspectUrl !== '') {
        $payload['inspect_url'] = $inspectUrl;
        $payload['rarity'] = $rarity;
    }

    return $payload;
}

/**
 * Build a CS2 standalone-sticker inspect link (defIndex 1209 + kit id).
 */
function craftBuildStandaloneStickerInspectUrl(int $stickerId, int $rarity = 4): string
{
    if ($stickerId <= 0) {
        return '';
    }

    static $cache = [];
    $cacheKey = $stickerId . ':' . $rarity;
    if (isset($cache[$cacheKey])) {
        return $cache[$cacheKey];
    }

    $script = __DIR__ . '/../scripts/build-sticker-inspect-url.js';
    if (!is_file($script)) {
        return '';
    }

    $cmd = 'node '
        . escapeshellarg($script)
        . ' '
        . escapeshellarg((string)$stickerId)
        . ' '
        . escapeshellarg((string)max(0, $rarity));
    // shell_exec is disabled (undefined) on shared hosting — then there is no inspect URL.
    $output = function_exists('shell_exec') ? @shell_exec($cmd) : '';
    $url = trim((string)$output);
    if ($url === '' || stripos($url, 'steam://') !== 0) {
        return '';
    }

    $cache[$cacheKey] = $url;
    return $url;
}

/**
 * @return array{sticker_id:int,inspect_url?:string,rarity?:int}|null
 */
/**
 * Compact name → sticker kit id map from the Skin Crafter catalog.
 *
 * @return array<string, int>
 */
function loadCrafterStickerIdMap(): array
{
    static $cache = null;
    if (is_array($cache)) {
        return $cache;
    }

    $path = __DIR__ . '/../assets/data/crafter-sticker-catalog.json';
    if (!is_file($path)) {
        $cache = [];
        return $cache;
    }

    $decoded = json_decode((string)file_get_contents($path), true);
    $items = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];
    $map = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $stickerId = (int)($item['sticker_id'] ?? 0);
        if ($stickerId <= 0 || $stickerId === 1209) {
            continue;
        }
        foreach (['market_hash_name', 'display_name'] as $field) {
            $key = craftEconLookupKey((string)($item[$field] ?? ''));
            if ($key !== '' && !isset($map[$key])) {
                $map[$key] = $stickerId;
            }
        }
    }

    $cache = $map;
    return $cache;
}

function resolveCraftStickerEcon(string $marketHashName): ?array
{
    $lookup = loadCraftEconLookup();
    $stickers = is_array($lookup['stickers'] ?? null) ? $lookup['stickers'] : [];

    foreach (craftStickerNameAliases($marketHashName) as $candidate) {
        $key = craftEconLookupKey($candidate);
        if ($key === '' || !isset($stickers[$key]) || !is_array($stickers[$key])) {
            continue;
        }
        $resolved = craftStickerEconFromEntry($stickers[$key]);
        if ($resolved) {
            return $resolved;
        }
    }

    // Last resort: match "Sticker | Team (Finish) | Event" ignoring extra spaces / casing
    // already handled by aliases; try without finish variant if base exists.
    $normalized = preg_replace('/\s+/u', ' ', trim($marketHashName)) ?? trim($marketHashName);
    if (preg_match('/^(Sticker \| .+?) \([^)]+\)( \| .+)$/iu', $normalized, $m)) {
        $plain = $m[1] . $m[2];
        $key = craftEconLookupKey($plain);
        if ($key !== '' && isset($stickers[$key]) && is_array($stickers[$key])) {
            $resolved = craftStickerEconFromEntry($stickers[$key]);
            if ($resolved) {
                return $resolved;
            }
        }
    }

    $catalog = loadCrafterStickerIdMap();
    if ($catalog) {
        foreach (craftStickerNameAliases($marketHashName) as $candidate) {
            $key = craftEconLookupKey($candidate);
            if ($key === '' || !isset($catalog[$key])) {
                continue;
            }
            $resolved = craftStickerEconFromEntry(['sticker_id' => $catalog[$key]]);
            if ($resolved) {
                return $resolved;
            }
        }
    }

    return null;
}

/**
 * @return array{def_index:int,inspect_url:string,rarity?:int}|null
 */
function resolveCraftAgentEcon(string $marketHashName): ?array
{
    $lookup = loadCraftEconLookup();
    $agents = is_array($lookup['agents'] ?? null) ? $lookup['agents'] : [];
    if (!$agents) {
        return null;
    }

    $key = craftEconLookupKey($marketHashName);
    if ($key === '' || !isset($agents[$key]) || !is_array($agents[$key])) {
        return null;
    }

    $entry = $agents[$key];
    $defIndex = (int)($entry['def_index'] ?? 0);
    $inspectUrl = trim((string)($entry['inspect_url'] ?? ''));
    if ($defIndex <= 0 || $inspectUrl === '') {
        return null;
    }

    return [
        'def_index' => $defIndex,
        'inspect_url' => $inspectUrl,
        'rarity' => max(0, (int)($entry['rarity'] ?? 0)),
    ];
}

/**
 * @return array{def_index:int,inspect_url:string,type?:string}|null
 */
function resolveCraftCrateEcon(string $marketHashName): ?array
{
    $lookup = loadCraftEconLookup();
    $crates = is_array($lookup['crates'] ?? null) ? $lookup['crates'] : [];
    if (!$crates) {
        return null;
    }

    $candidates = [];
    $raw = trim($marketHashName);
    if ($raw !== '') {
        $candidates[] = $raw;
        $candidates[] = preg_replace('/^PGL\s+/i', '', $raw) ?? $raw;
        $candidates[] = preg_replace('/^ELEAGUE\s+/i', '', $raw) ?? $raw;
        $candidates[] = preg_replace('/^MLG\s+/i', '', $raw) ?? $raw;
        if (!preg_match('/^PGL\s+/i', $raw) && stripos($raw, 'antwerp') !== false) {
            $candidates[] = 'PGL ' . $raw;
        }
    }

    foreach ($candidates as $candidate) {
        $key = craftEconLookupKey((string)$candidate);
        if ($key === '' || !isset($crates[$key]) || !is_array($crates[$key])) {
            continue;
        }
        $entry = $crates[$key];
        $defIndex = (int)($entry['def_index'] ?? 0);
        $inspectUrl = trim((string)($entry['inspect_url'] ?? ''));
        if ($defIndex <= 0 || $inspectUrl === '') {
            continue;
        }
        return [
            'def_index' => $defIndex,
            'inspect_url' => $inspectUrl,
            'type' => trim((string)($entry['type'] ?? '')),
        ];
    }

    return null;
}

/**
 * @param array<int, string> $stickerNames
 * @return array{
 *   skin: array<string, mixed>|null,
 *   stickers: array<string, array<string, mixed>>,
 *   missing_stickers: array<int, string>
 * }
 */
function resolveCraftKeychainEcon(string $marketHashName): ?array
{
    $lookup = loadCraftEconLookup();
    $keychains = is_array($lookup['keychains'] ?? null) ? $lookup['keychains'] : [];
    $highlights = is_array($lookup['highlights'] ?? null) ? $lookup['highlights'] : [];
    $stickerSlabs = is_array($lookup['sticker_slabs'] ?? null) ? $lookup['sticker_slabs'] : [];
    $raw = trim($marketHashName);
    if ($raw === '') {
        return null;
    }

    // Highlight souvenir charms: sticker_id = series keychain, highlight_reel = clip id.
    $hlKey = craftEconLookupKey($raw);
    if ($hlKey !== '' && isset($highlights[$hlKey]) && is_array($highlights[$hlKey])) {
        $defIndex = (int)($highlights[$hlKey]['def_index'] ?? 0);
        $reel = (int)($highlights[$hlKey]['highlight_reel'] ?? 0);
        if ($defIndex > 0) {
            $out = ['def_index' => $defIndex];
            if ($reel > 0) {
                $out['highlight_reel'] = $reel;
            }
            return $out;
        }
    }

    // Sticker slabs: keychain 37 + paint_kit = sealed sticker defindex.
    if (preg_match('/^Sticker\s+Slab\s*\|/iu', $raw)) {
        $slabKey = craftEconLookupKey($raw);
        if ($slabKey !== '' && isset($stickerSlabs[$slabKey]) && is_array($stickerSlabs[$slabKey])) {
            $defIndex = (int)($stickerSlabs[$slabKey]['def_index'] ?? 37);
            $paintKit = (int)($stickerSlabs[$slabKey]['paint_kit'] ?? 0);
            if ($defIndex > 0 && $paintKit > 0) {
                return ['def_index' => $defIndex, 'paint_kit' => $paintKit];
            }
        }
        // Fallback: resolve sealed sticker by stripping the slab prefix.
        $stickerName = preg_replace('/^Sticker\s+Slab\s*/iu', 'Sticker ', $raw) ?? $raw;
        $sticker = resolveCraftStickerEcon($stickerName);
        if ($sticker && (int)($sticker['sticker_id'] ?? 0) > 0) {
            return [
                'def_index' => 37,
                'paint_kit' => (int)$sticker['sticker_id'],
            ];
        }
    }

    if (!$keychains) {
        return null;
    }

    $candidates = [$raw];
    // Souvenir tournament charms share the same keychain defindex as the base Charm | name.
    if (preg_match('/^Souvenir\s+Charm\s*\|/iu', $raw)) {
        $candidates[] = preg_replace('/^Souvenir\s+/iu', '', $raw) ?? $raw;
        // "Souvenir Charm | Austin 2025 Highlight | Moment" → base series charm.
        if (preg_match('/^(?:Souvenir\s+)?Charm\s*\|\s*(.+?\bHighlight)\b/iu', $raw, $m)) {
            $series = trim((string)($m[1] ?? ''));
            if ($series !== '') {
                $candidates[] = 'Charm | ' . $series;
                $candidates[] = 'Souvenir Charm | ' . $series;
            }
        }
    }

    foreach ($candidates as $candidate) {
        $key = craftEconLookupKey((string)$candidate);
        if ($key !== '' && isset($keychains[$key]) && is_array($keychains[$key])) {
            $defIndex = (int)($keychains[$key]['def_index'] ?? 0);
            if ($defIndex > 0) {
                return ['def_index' => $defIndex];
            }
        }
    }

    return null;
}

function resolveCraftEconBundle(string $skinMarketHashName, array $stickerNames, array $keychainNames = []): array
{
    $skin = resolveCraftSkinEcon($skinMarketHashName);
    $stickers = [];
    $missingStickers = [];

    foreach ($stickerNames as $name) {
        $label = trim((string)$name);
        if ($label === '') {
            continue;
        }
        $resolved = resolveCraftStickerEcon($label);
        if ($resolved) {
            $stickers[$label] = $resolved;
            $normalizedKey = craftEconLookupKey($label);
            if ($normalizedKey !== '' && $normalizedKey !== $label) {
                $stickers[$normalizedKey] = $resolved;
            }
        } else {
            $missingStickers[] = $label;
        }
    }

    $keychains = [];
    $missingKeychains = [];
    foreach ($keychainNames as $name) {
        $label = trim((string)$name);
        if ($label === '') {
            continue;
        }
        $resolved = resolveCraftKeychainEcon($label);
        if ($resolved) {
            $keychains[$label] = $resolved;
        } else {
            $missingKeychains[] = $label;
        }
    }

    return [
        'skin' => $skin,
        'stickers' => $stickers,
        'missing_stickers' => array_values(array_unique($missingStickers)),
        'keychains' => $keychains,
        'missing_keychains' => array_values(array_unique($missingKeychains)),
    ];
}
