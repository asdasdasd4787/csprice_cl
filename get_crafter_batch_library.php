<?php

declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
require __DIR__ . '/lib/skin_asset_helpers.php';

$mapPath = __DIR__ . '/assets/models/crafter/batch-map.json';
if (!is_file($mapPath)) {
    respondJson(['items' => [], 'total' => 0, 'error' => 'Crafter batch map missing.']);
}

$map = json_decode((string)file_get_contents($mapPath), true);
if (!is_array($map)) {
    respondJson(['items' => [], 'total' => 0, 'error' => 'Invalid crafter batch map.']);
}

$version = trim((string)($map['version'] ?? '20260704-crafter-batch-2'));
$destDir = __DIR__ . '/assets/models/crafter';
$library = [];

foreach (is_array($map['items'] ?? null) ? $map['items'] : [] as $entry) {
    if (!is_array($entry)) {
        continue;
    }

    $marketName = stripMarketDecorators(trim((string)($entry['market_name'] ?? '')));
    $sourceFile = trim((string)($entry['file'] ?? ''));
    $destFile = trim((string)($entry['dest_file'] ?? $sourceFile));
    $explicitModelUrl = trim((string)($entry['model_url'] ?? ''));
    if ($marketName === '' || ($destFile === '' && $explicitModelUrl === '')) {
        continue;
    }

    if ($explicitModelUrl !== '') {
        $modelPath = __DIR__ . '/' . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, ltrim($explicitModelUrl, '/'));
        $hasBakedModel = is_file($modelPath);
        $modelUrl = $explicitModelUrl . (str_contains($explicitModelUrl, '?') ? '' : ('?v=' . rawurlencode($version)));
    } else {
        $destPath = $destDir . DIRECTORY_SEPARATOR . $destFile;
        $hasBakedModel = is_file($destPath);
        $modelUrl = 'assets/models/crafter/' . str_replace('\\', '/', $destFile) . '?v=' . rawurlencode($version);
    }
    $previewImage = trim((string)($entry['preview_image'] ?? ''));
    $finishToken = trim((string)($entry['finish_token'] ?? ''));
    $baseModelUrl = resolveBaseModelUrl($marketName);
    $imageMeta = lookupSteamImageManifestEntry($marketName);
    // The workshop render that used to be the card art. Still resolved, but now
    // only as the last resort behind the real item artwork.
    $renderImage = resolveXm1014LocalPreview($marketName);
    if ($renderImage === '') {
        $renderImage = $previewImage;
        $isTrustedRemote = $renderImage !== ''
            && (str_contains($renderImage, 'steamstatic.com') || str_contains($renderImage, 'csroi.com'));
        $isRealLocalFile = $renderImage !== '' && !preg_match('#^https?://#i', $renderImage)
            && is_file(__DIR__ . '/' . ltrim(strtok($renderImage, '?'), '/'));
        if ($renderImage === '' || (!$isTrustedRemote && !$isRealLocalFile)) {
            $renderImage = resolveSkinPreviewImageUrl($marketName, $finishToken, $imageMeta);
        }
        if ($renderImage === '' && $previewImage !== '') {
            $renderImage = $previewImage;
        }
    }

    // Crafter cards show the same artwork as item cards: the ROI catalog image,
    // matched loosely so the batch map's shortened names ("Desert Eagle | Mecha",
    // "Nova | Hyperbeast") still land on the real entry. A handful of catalog
    // rows point at dead URLs, so the render rides along as fallback_image and
    // the card swaps to it on error rather than rendering blank.
    $image = resolveSkinCatalogImageLoose($marketName);
    if ($image === '') {
        $image = $renderImage;
    }

    $library[] = [
        'market_name' => $marketName,
        'finish_token' => $finishToken,
        'model_url' => $modelUrl,
        'base_model_url' => $baseModelUrl,
        'textures' => null,
        'image' => $image,
        'fallback_image' => ($renderImage !== '' && $renderImage !== $image) ? $renderImage : '',
        'name_color' => resolveSkinNameColor($marketName, trim((string)($entry['name_color'] ?? ''))),
        'type_note' => 'Skin',
        'category' => 'skins',
        'craftable' => $hasBakedModel,
        'has_baked_model' => $hasBakedModel,
        'batch_file' => $sourceFile,
        'updated_at' => $version,
    ];
}

// The upstream catalog occasionally maps two entirely different market names
// to the same cached image (a scrape/index bug in roi_catalog.json, not
// anything specific to the crafter). Two distinct skins can never legitimately
// share one artwork, so when that collision surfaces here, swap each
// colliding card to its own unique render instead of showing another item's
// picture under the wrong name.
$imageCounts = [];
foreach ($library as $row) {
    if ($row['image'] === '') {
        continue;
    }
    $imageCounts[$row['image']] = ($imageCounts[$row['image']] ?? 0) + 1;
}
foreach ($library as &$row) {
    if ($row['image'] === '' || ($imageCounts[$row['image']] ?? 0) <= 1) {
        continue;
    }
    if ($row['fallback_image'] !== '') {
        $goodImage = $row['fallback_image'];
        $row['fallback_image'] = $row['image'];
        $row['image'] = $goodImage;
    } else {
        $row['image'] = '';
    }
}
unset($row);

respondJson([
    'items' => $library,
    'total' => count($library),
    'version' => $version,
]);
