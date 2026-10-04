<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
require __DIR__ . '/lib/skin_asset_helpers.php';

$manifestPath = __DIR__ . '/assets/models/skins/manifest.json';

$manifestItems = [];
if (is_file($manifestPath)) {
    $payload = json_decode((string)file_get_contents($manifestPath), true);
    $manifestItems = is_array($payload['items'] ?? null) ? $payload['items'] : [];
}

$imageIndex = loadSteamImageManifestIndex();
$seen = [];
$library = [];

foreach ($manifestItems as $entry) {
    if (!is_array($entry)) {
        continue;
    }
    $marketName = trim((string)($entry['market_name'] ?? ''));
    if ($marketName === '' || !str_contains($marketName, '|')) {
        continue;
    }
    $marketName = stripMarketDecorators($marketName);
    if ($marketName === '' || strlen($marketName) > 160 || !str_contains($marketName, '|')) {
        continue;
    }
    $key = catalogMatchKey($marketName);
    if (isset($seen[$key])) {
        continue;
    }
    $seen[$key] = true;

    $finishToken = trim((string)($entry['finish_token'] ?? ''));
    $textures = $finishToken !== '' ? resolveTexturePack($finishToken) : null;
    $imageMeta = $imageIndex['byKey'][$key] ?? lookupSteamImageManifestEntry($marketName);
    $baseModelUrl = resolveBaseModelUrl($marketName);
    $previewOverride = trim((string)($entry['preview_image'] ?? ''));
    $localXm = resolveXm1014LocalPreview($marketName);
    $image = $localXm !== ''
        ? $localXm
        : ($previewOverride !== ''
            ? $previewOverride
            : resolveSkinPreviewImageUrl($marketName, $finishToken, $imageMeta));
    $modelUrl = trim((string)($entry['model_url'] ?? ''));
    $modelPathRaw = $modelUrl !== '' ? ltrim(str_replace('\\', '/', preg_replace('/\?.*$/', '', $modelUrl) ?? $modelUrl), '/') : '';
    $modelPath = $modelPathRaw !== '' ? (__DIR__ . '/' . $modelPathRaw) : '';
    $hasBakedModel = $modelPath !== '' && is_file($modelPath);
    $category = trim((string)($imageMeta['category'] ?? 'skins'));

    $craftable = ($hasBakedModel && $modelUrl !== '')
        || ($textures !== null && $baseModelUrl !== '');

    $library[] = [
        'market_name' => $marketName,
        'finish_token' => $finishToken,
        'model_url' => $modelUrl,
        'base_model_url' => $baseModelUrl,
        'textures' => $textures,
        'image' => $image,
        'name_color' => '4b69ff',
        'type_note' => $category === 'skins' ? 'Skin' : ucfirst($category !== '' ? $category : 'Skin'),
        'category' => $category !== '' ? $category : 'skins',
        'craftable' => $craftable,
        'has_baked_model' => $hasBakedModel,
        'updated_at' => trim((string)($entry['updated_at'] ?? '')),
    ];
}

usort($library, static fn(array $a, array $b): int => strcmp((string)$a['market_name'], (string)$b['market_name']));

$query = mb_strtolower(trim((string)($_GET['q'] ?? '')));
if ($query !== '') {
    $library = array_values(array_filter(
        $library,
        static fn(array $item): bool => str_contains(mb_strtolower((string)$item['market_name']), $query)
            || str_contains(mb_strtolower((string)$item['finish_token']), $query)
    ));
}

respondJson([
    'items' => $library,
    'total' => count($library),
]);
