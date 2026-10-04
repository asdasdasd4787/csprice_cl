<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
require __DIR__ . '/lib/skin_asset_helpers.php';

$query = trim((string)($_GET['market_hash_name'] ?? $_GET['name'] ?? $_GET['q'] ?? ''));
if ($query === '') {
    respondJson(['error' => 'Missing market_hash_name'], 400);
    exit;
}

$manifestPath = __DIR__ . '/assets/models/skins/manifest.json';
$manifestItems = [];
if (is_file($manifestPath)) {
    $payload = json_decode((string)file_get_contents($manifestPath), true);
    $manifestItems = is_array($payload['items'] ?? null) ? $payload['items'] : [];
}

$match = resolveManifestMatch($manifestItems, $query);
$marketName = (string)($match['market_name'] ?? $query);
$finishToken = trim((string)($match['finish_token'] ?? ''));
$modelUrl = trim((string)($match['model_url'] ?? ''));
$crafter = resolveCrafterBakedModel($query) ?: resolveCrafterBakedModel($marketName);
if ($crafter) {
    $crafterUrl = trim((string)($crafter['model_url'] ?? ''));
    $modelIsBase = $modelUrl === '' || str_contains(str_replace('\\', '/', $modelUrl), 'assets/models/base/');
    if ($crafterUrl !== '' && $modelIsBase) {
        $modelUrl = $crafterUrl;
        if ($finishToken === '') {
            $finishToken = trim((string)($crafter['finish_token'] ?? ''));
        }
        if (trim((string)($crafter['market_name'] ?? '')) !== '') {
            $marketName = (string)$crafter['market_name'];
        }
    }
}
$texturePack = $finishToken !== '' ? resolveTexturePack($finishToken) : null;
$baseModelUrl = resolveBaseModelUrl($marketName);
$modelPathRaw = ltrim(str_replace('\\', '/', preg_replace('/\?.*$/', '', $modelUrl) ?? $modelUrl), '/');
$hasBakedFile = $modelPathRaw !== '' && is_file(__DIR__ . '/' . $modelPathRaw);

respondJson([
    'market_name' => $marketName,
    'finish_token' => $finishToken,
    'model_url' => $modelUrl,
    'base_model_url' => $baseModelUrl,
    'textures' => $texturePack,
    'has_textured_model' => $modelUrl !== '',
    'prefer_base_model' => $texturePack !== null && $baseModelUrl !== '' && $modelUrl === '',
    'prefer_baked_model' => $hasBakedFile,
]);
