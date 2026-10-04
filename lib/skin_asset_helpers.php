<?php
declare(strict_types=1);

function normalizeSkinName(string $value): string
{
    return mb_strtolower(trim(preg_replace('/\s+/u', ' ', $value) ?? $value));
}

function stripMarketDecorators(string $value): string
{
    $value = trim(preg_replace('/\s+/u', ' ', $value) ?? $value);
    $value = preg_replace('/^[\s★\*\x{2605}]+/u', '', $value) ?? $value;
    $value = preg_replace('/^(souvenir|stattrak™|stattrak)\s+/iu', '', $value) ?? $value;
    // Mojibake star prefix from malformed manifest exports.
    $value = preg_replace('/^[\x{00e2}\x{02dc}\x{0080}\x{0099}\x{00a9}\s]+/u', '', $value) ?? $value;

    return trim($value);
}

function catalogMatchKey(string $value): string
{
    [$base] = splitWearName(stripMarketDecorators($value));

    return normalizeSkinName($base);
}

function splitWearName(string $value): array
{
    if (preg_match('/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/u', trim($value), $matches)) {
        return [trim((string)$matches[1]), trim((string)$matches[2])];
    }
    return [trim($value), ''];
}

function resolveManifestMatch(array $items, string $query): ?array
{
    $target = normalizeSkinName($query);
    [$baseTarget] = splitWearName($query);
    $baseNorm = normalizeSkinName($baseTarget);

    foreach ($items as $entry) {
        $name = normalizeSkinName((string)($entry['market_name'] ?? ''));
        if ($name === $target || $name === $baseNorm) {
            return $entry;
        }
    }

    foreach ($items as $entry) {
        $name = (string)($entry['market_name'] ?? '');
        [$baseName] = splitWearName($name);
        if (normalizeSkinName($baseName) === $baseNorm) {
            return $entry;
        }
    }

    return null;
}

function resolveBaseModelUrl(string $marketName): string
{
    $weaponPart = trim(explode('|', $marketName)[0] ?? $marketName);
    $normalized = mb_strtolower(trim($weaponPart));

    $weaponSlugMap = [
        'ak-47' => 'assets/models/base/weapons/models/ak47/weapon_rif_ak47.glb',
        'm4a4' => 'assets/models/base/weapons/models/m4a4/weapon_rif_m4a4.glb',
        'm4a1-s' => 'assets/models/base/weapons/models/m4a1_silencer/weapon_rif_m4a1_silencer.glb',
        'awp' => 'assets/models/base/weapons/models/awp/weapon_snip_awp.glb',
        'usp-s' => 'assets/models/base/weapons/models/usp_silencer/weapon_pist_usp_silencer.glb',
        'glock-18' => 'assets/models/base/weapons/models/glock18/weapon_pist_glock18.glb?v=20260827-glock-skinglockggod-1',
        'desert eagle' => 'assets/models/base/weapons/models/deagle/weapon_pist_deagle.glb',
        'p250' => 'assets/models/base/weapons/models/p250/weapon_pist_p250.glb',
        'cz75-auto' => 'assets/models/base/weapons/models/cz75a/weapon_pist_cz75a.glb',
        'ump-45' => 'assets/models/base/weapons/models/ump45/weapon_smg_ump45.glb',
        'aug' => 'assets/models/base/weapons/models/aug/weapon_rif_aug.glb',
        'famas' => 'assets/models/base/weapons/models/famas/weapon_rif_famas.glb',
        'mp7' => 'assets/models/base/weapons/models/mp7/weapon_smg_mp7.glb',
        'mp9' => 'assets/models/base/weapons/models/mp9/weapon_smg_mp9.glb',
        'p90' => 'assets/models/base/weapons/models/p90/weapon_smg_p90.glb',
        'nova' => 'assets/models/base/weapons/models/nova/weapon_shot_nova.glb',
        'xm1014' => 'assets/models/base/weapons/models/xm1014/weapon_shot_xm1014.glb',
        'ssg 08' => 'assets/models/base/weapons/models/ssg08/weapon_snip_ssg08.glb',
        'scar-20' => 'assets/models/base/weapons/models/scar20/weapon_snip_scar20.glb',
        'bowie' => 'assets/models/base/weapons/models/knife/knife_bowie/weapon_knife_bowie.glb',
    ];

    foreach ($weaponSlugMap as $needle => $url) {
        if (str_contains($normalized, $needle)) {
            return $url;
        }
    }

    return '';
}

function resolveCrafterBatchModelUrl(array $entry, string $version = ''): array
{
    $explicitModelUrl = trim((string)($entry['model_url'] ?? ''));
    $sourceFile = trim((string)($entry['file'] ?? ''));
    $destFile = trim((string)($entry['dest_file'] ?? $sourceFile));
    $root = dirname(__DIR__);

    if ($explicitModelUrl !== '') {
        $relative = preg_replace('/\?.*$/', '', $explicitModelUrl) ?? $explicitModelUrl;
        $modelPath = $root . '/' . ltrim(str_replace('\\', '/', $relative), '/');
        $modelUrl = $explicitModelUrl;
        if ($version !== '' && !str_contains($modelUrl, '?')) {
            $modelUrl .= '?v=' . rawurlencode($version);
        }

        return [
            'model_url' => $modelUrl,
            'has_baked_model' => is_file($modelPath),
        ];
    }

    if ($destFile === '') {
        return ['model_url' => '', 'has_baked_model' => false];
    }

    $relative = 'assets/models/crafter/' . str_replace('\\', '/', $destFile);
    $modelUrl = $relative;
    if ($version !== '') {
        $modelUrl .= '?v=' . rawurlencode($version);
    }

    return [
        'model_url' => $modelUrl,
        'has_baked_model' => is_file($root . '/' . $relative),
    ];
}

function resolveCrafterBakedModel(string $marketName): ?array
{
    static $index = null;
    if ($index === null) {
        $index = [];
        $mapPath = dirname(__DIR__) . '/assets/models/crafter/batch-map.json';
        if (is_file($mapPath)) {
            $map = json_decode((string)file_get_contents($mapPath), true);
            $version = trim((string)($map['version'] ?? ''));
            foreach (is_array($map['items'] ?? null) ? $map['items'] : [] as $entry) {
                if (!is_array($entry)) {
                    continue;
                }

                $name = stripMarketDecorators(trim((string)($entry['market_name'] ?? '')));
                if ($name === '') {
                    continue;
                }

                $resolved = resolveCrafterBatchModelUrl($entry, $version);
                if ($resolved['model_url'] === '' || !$resolved['has_baked_model']) {
                    continue;
                }

                $index[catalogMatchKey($name)] = [
                    'market_name' => $name,
                    'model_url' => $resolved['model_url'],
                    'has_baked_model' => true,
                    'finish_token' => trim((string)($entry['finish_token'] ?? '')),
                ];
            }
        }
    }

    $key = catalogMatchKey($marketName);
    if ($key === '' || !isset($index[$key])) {
        return null;
    }

    return $index[$key];
}

function resolveTexturePack(string $finishToken): ?array
{
    $finishToken = trim($finishToken);
    if ($finishToken === '') {
        return null;
    }

    $vmatDir = __DIR__ . '/../tmp_skin_pipeline/' . $finishToken . '/vmat/materials/models/weapons/customization/paints/vmats';
    if (!is_dir($vmatDir)) {
        return null;
    }

    $skip = [
        'default_8aa56190_metal.png',
        'gun_grunge.png',
        'paint_wear.png',
        'squares_glitter_25145674_mask.png',
    ];

    $albedo = null;
    $normal = null;
    $mask = null;

    foreach (scandir($vmatDir) ?: [] as $file) {
        if (!is_string($file) || !str_ends_with(strtolower($file), '.png')) {
            continue;
        }
        if (in_array($file, $skip, true)) {
            continue;
        }
        $lower = strtolower($file);
        if (str_contains($lower, '_normal')) {
            $normal = $file;
            continue;
        }
        if (str_contains($lower, '_mask')) {
            $mask = $file;
            continue;
        }
        $albedo = $file;
    }

    if ($albedo === null && $normal === null) {
        return null;
    }

    $webBase = 'tmp_skin_pipeline/' . rawurlencode($finishToken) . '/vmat/materials/models/weapons/customization/paints/vmats/';
    $pack = ['finish_token' => $finishToken];
    if ($albedo !== null) {
        $pack['albedo'] = $webBase . rawurlencode($albedo);
    }
    if ($normal !== null) {
        $pack['normal'] = $webBase . rawurlencode($normal);
    }
    if ($mask !== null) {
        $pack['mask'] = $webBase . rawurlencode($mask);
    }

    $wearFile = $vmatDir . DIRECTORY_SEPARATOR . 'paint_wear.png';
    if (is_file($wearFile)) {
        $pack['wear'] = $webBase . rawurlencode('paint_wear.png');
    }

    return $pack;
}

function loadSteamImageManifestIndex(): array
{
    static $index = null;
    if ($index !== null) {
        return $index;
    }

    $index = ['byKey' => []];
    $manifestPath = __DIR__ . '/../assets/steam-market-cache/manifest.json';
    if (!is_file($manifestPath)) {
        return $index;
    }

    $rows = json_decode((string)file_get_contents($manifestPath), true);
    if (!is_array($rows)) {
        return $index;
    }

    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }

        $name = trim((string)($row['market_hash_name'] ?? $row['resolved_market_hash_name'] ?? ''));
        if ($name === '' || !str_contains($name, '|')) {
            continue;
        }

        $key = catalogMatchKey($name);
        $entry = [
            'image' => trim((string)($row['project_image_path'] ?? $row['local_path'] ?? $row['steam_image_url'] ?? '')),
            'steam_image_url' => trim((string)($row['steam_image_url'] ?? '')),
            'project_image_path' => trim((string)($row['project_image_path'] ?? '')),
            'local_path' => trim((string)($row['local_path'] ?? '')),
            'category' => trim((string)($row['category'] ?? '')),
        ];

        if (!isset($index['byKey'][$key]) || $entry['image'] !== '') {
            $index['byKey'][$key] = $entry;
        }
    }

    return $index;
}

function lookupSteamImageManifestEntry(string $marketName): ?array
{
    $index = loadSteamImageManifestIndex();
    $key = catalogMatchKey($marketName);

    return $index['byKey'][$key] ?? null;
}

function resolveCatalogImageFromEntry(?array $entry): string
{
    if ($entry === null) {
        return '';
    }

    foreach (['project_image_path', 'local_path', 'steam_image_url', 'image'] as $field) {
        $value = trim((string)($entry[$field] ?? ''));
        if ($value !== '') {
            return $value;
        }
    }

    return '';
}

function resolveWeaponImageFolders(string $marketName): array
{
    $weaponPart = trim(explode('|', $marketName)[0] ?? $marketName);
    $normalized = mb_strtolower(trim($weaponPart));

    $map = [
        'ak-47' => ['ak47'],
        'm4a1-s' => ['m4a1_silencer'],
        'm4a4' => ['m4a1', 'm4a4'],
        'awp' => ['awp'],
        'usp-s' => ['usp_silencer'],
        'glock-18' => ['glock', 'glock18'],
        'desert eagle' => ['deagle'],
        'p250' => ['p250'],
        'cz75-auto' => ['cz75a'],
        'famas' => ['famas'],
        'galil ar' => ['galilar'],
        'ssg 08' => ['ssg08'],
        'scar-20' => ['scar20'],
        'aug' => ['aug'],
        'sg 553' => ['sg556'],
        'mp7' => ['mp7'],
        'mp9' => ['mp9'],
        'p90' => ['p90'],
        'ump-45' => ['ump45'],
        'mac-10' => ['mac10'],
        'mp5-sd' => ['mp5sd'],
        'nova' => ['nova'],
        'xm1014' => ['xm1014'],
        'mag-7' => ['mag7'],
        'sawed-off' => ['sawedoff'],
        'negev' => ['negev'],
        'm249' => ['m249'],
        'g3sg1' => ['g3sg1'],
        'p2000' => ['hkp2000', 'p2000'],
        'tec-9' => ['tec9'],
        'five-seven' => ['fiveseven'],
        'dual berettas' => ['elite'],
        'r8 revolver' => ['revolver'],
        'pp-bizon' => ['bizon'],
    ];

    foreach ($map as $needle => $folders) {
        if (str_contains($normalized, $needle)) {
            return $folders;
        }
    }

    $slug = preg_replace('/[^a-z0-9]+/', '', $normalized) ?? '';
    return $slug !== '' ? [$slug] : [];
}

function resolveCsroiPreviewImageUrl(string $marketName, string $finishToken): string
{
    $finishToken = trim($finishToken);
    if ($finishToken === '') {
        return '';
    }

    foreach (resolveWeaponImageFolders($marketName) as $folder) {
        if ($folder === '') {
            continue;
        }

        return 'https://cdn.csroi.com/default_generated/weapon_'
            . rawurlencode($folder) . '_'
            . rawurlencode($finishToken) . '_light_png.png';
    }

    return '';
}

function isReadableProjectAsset(string $relativePath): bool
{
    if ($relativePath === '' || !str_starts_with($relativePath, 'assets/')) {
        return false;
    }

    $absolute = dirname(__DIR__) . '/' . ltrim(str_replace('\\', '/', $relativePath), '/');

    return is_file($absolute) && filesize($absolute) > 256;
}

function isXm1014MarketName(string $marketName): bool
{
    return (bool)preg_match('/xm[\s-]?1014/i', $marketName);
}

function resolveXm1014LocalPreview(string $marketName): string
{
    if (!isXm1014MarketName($marketName)) {
        return '';
    }

    $base = preg_replace('/^(?:★\s*)?(?:StatTrak™|StatTrak|Souvenir)\s+/iu', '', $marketName) ?? $marketName;
    $base = preg_replace('/\s+\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i', '', $base) ?? $base;
    $parts = explode('|', $base, 2);
    $skin = trim((string)($parts[1] ?? ''));
    if ($skin === '') {
        return '';
    }

    $slug = strtolower(preg_replace('/[^a-z0-9]+/i', '-', $skin) ?? '');
    $slug = trim($slug, '-');
    $candidates = [
        'assets/weapons/shotguns/' . $skin . '.webp',
        'assets/weapons/shotguns/' . $skin . '.png',
        'assets/weapons/shotguns/' . str_replace(' ', '-', $skin) . '.webp',
        'assets/weapons/shotguns/' . str_replace(' ', '-', $skin) . '.png',
    ];
    if ($slug !== '') {
        $candidates[] = 'assets/weapons/shotguns/' . $slug . '.webp';
        $candidates[] = 'assets/weapons/shotguns/' . $slug . '.png';
    }

    foreach ($candidates as $path) {
        if (isReadableProjectAsset($path)) {
            return $path . '?v=20260912-xm-fullgun-1';
        }
    }

    return '';
}

function resolveSkinPreviewImageUrl(string $marketName, string $finishToken, ?array $imageMeta = null): string
{
    // Catalog / item-hero photos use official Steam icons so the full XM1014
    // (muzzle to stock) is visible. Local noshell webps are tight-cropped.
    $image = resolveCatalogImageFromEntry($imageMeta);
    if ($image !== '') {
        if (str_starts_with($image, 'http')) {
            return $image;
        }
        if (isReadableProjectAsset($image)) {
            return $image;
        }
    }

    if ($imageMeta !== null) {
        $steam = trim((string)($imageMeta['steam_image_url'] ?? ''));
        if ($steam !== '' && str_starts_with($steam, 'http')) {
            return $steam;
        }
    }

    if ($finishToken !== '') {
        $csroi = resolveCsroiPreviewImageUrl($marketName, $finishToken);
        if ($csroi !== '') {
            return $csroi;
        }
    }

    return $image;
}

function normalizeSkinNameColor(string $value, string $fallback = '4B69FF'): string
{
    $hex = strtoupper(ltrim(trim($value), '#'));
    if (preg_match('/^[0-9A-F]{6}$/', $hex)) {
        return $hex;
    }

    $fallbackHex = strtoupper(ltrim(trim($fallback), '#'));
    return preg_match('/^[0-9A-F]{6}$/', $fallbackHex) ? $fallbackHex : '4B69FF';
}

function loadRoiCatalogNameColorIndex(): array
{
    static $index = null;
    if ($index !== null) {
        return $index;
    }

    $index = [];
    $path = __DIR__ . '/../assets/steam-market-cache/roi_catalog.json';
    if (!is_file($path)) {
        return $index;
    }

    $payload = json_decode((string)file_get_contents($path), true);
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }

        $name = trim((string)($item['market_hash_name'] ?? ''));
        if ($name === '') {
            continue;
        }

        $key = catalogMatchKey($name);
        if (!isset($index[$key])) {
            $index[$key] = normalizeSkinNameColor((string)($item['name_color'] ?? ''));
        }
    }

    return $index;
}

function loadRoiCatalogImageIndex(): array
{
    static $index = null;
    if ($index !== null) {
        return $index;
    }

    $index = [];
    $path = __DIR__ . '/../assets/steam-market-cache/roi_catalog.json';
    if (!is_file($path)) {
        return $index;
    }

    $payload = json_decode((string)file_get_contents($path), true);
    $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }

        $name = trim((string)($item['market_hash_name'] ?? ''));
        if ($name === '') {
            continue;
        }

        $key = catalogMatchKey($name);
        if (isset($index[$key])) {
            continue;
        }

        $image = resolveCatalogImageFromEntry($item);
        if ($image !== '') {
            $index[$key] = $image;
        }
    }

    return $index;
}

/**
 * The site's normal item pages, category grids, and search all resolve a
 * skin's picture straight from the main catalog — do the same here instead
 * of guessing a CDN filename, which only works for a fraction of skins.
 */
function resolveSkinCatalogImage(string $marketName): string
{
    $key = catalogMatchKey($marketName);
    $index = loadRoiCatalogImageIndex();

    return $index[$key] ?? '';
}

function squashSkinToken(string $value): string
{
    return (string)preg_replace('/[^a-z0-9]+/', '', mb_strtolower($value));
}

/**
 * Catalog images grouped by weapon, so a near-miss can be resolved without
 * rescanning the whole index per lookup.
 *
 * @return array<string, array<string, string>> weapon => [squashed skin => image]
 */
function loadRoiCatalogImageByWeapon(): array
{
    static $byWeapon = null;
    if ($byWeapon !== null) {
        return $byWeapon;
    }

    $byWeapon = [];
    foreach (loadRoiCatalogImageIndex() as $key => $image) {
        $parts = explode('|', $key);
        if (count($parts) < 2) {
            continue;
        }
        $weapon = trim($parts[0]);
        $skin = squashSkinToken(implode('|', array_slice($parts, 1)));
        if ($weapon === '' || $skin === '') {
            continue;
        }
        if (!isset($byWeapon[$weapon][$skin])) {
            $byWeapon[$weapon][$skin] = $image;
        }
    }

    return $byWeapon;
}

/**
 * The catalog image for a skin, tolerating the shortened names the Skin Crafter
 * batch map carries.
 *
 * Crafter entries come from workshop/source files and abbreviate: "Desert Eagle
 * | Mecha" for "Mecha Industries", "AK-47 | Anubis" for "Legion of Anubis",
 * "Nova | Hyperbeast" for "Hyper Beast". Those never key-match, so the crafter
 * fell back to a generic untextured render while item cards showed the real
 * artwork. Matching within the same weapon on a punctuation-free name closes
 * the gap; the shortest candidate wins so "Mecha" resolves to "Mecha
 * Industries" rather than some longer name that merely contains it.
 */
function resolveSkinCatalogImageLoose(string $marketName): string
{
    $exact = resolveSkinCatalogImage($marketName);
    if ($exact !== '') {
        return $exact;
    }

    $parts = explode('|', catalogMatchKey($marketName));
    if (count($parts) < 2) {
        return '';
    }
    $weapon = trim($parts[0]);
    $skin = squashSkinToken(implode('|', array_slice($parts, 1)));
    if ($weapon === '' || $skin === '') {
        return '';
    }

    $candidates = loadRoiCatalogImageByWeapon()[$weapon] ?? [];
    $best = '';
    $bestLength = PHP_INT_MAX;
    foreach ($candidates as $candidateKey => $image) {
        // PHP turns numeric-looking array keys into ints ("27" -> 27), so a skin
        // name that squashes to digits arrives here as an integer.
        $candidate = (string)$candidateKey;
        // The 4-char floor keeps short fragments from latching onto unrelated names.
        $matches = $candidate === $skin
            || str_starts_with($candidate, $skin)
            || (strlen($skin) >= 4 && str_contains($candidate, $skin))
            || (strlen($candidate) >= 4 && str_contains($skin, $candidate));
        if (!$matches) {
            continue;
        }
        if (strlen($candidate) < $bestLength) {
            $bestLength = strlen($candidate);
            $best = $image;
        }
    }

    return $best;
}

function resolveSkinNameColor(string $marketName, string $explicit = ''): string
{
    $normalizedExplicit = strtoupper(ltrim(trim($explicit), '#'));
    if (preg_match('/^[0-9A-F]{6}$/', $normalizedExplicit)) {
        return $normalizedExplicit;
    }

    $key = catalogMatchKey($marketName);
    $catalogIndex = loadRoiCatalogNameColorIndex();
    if (isset($catalogIndex[$key])) {
        return $catalogIndex[$key];
    }

    return '4B69FF';
}
