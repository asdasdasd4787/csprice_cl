<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

header('Content-Type: application/json; charset=utf-8');

function oddsRespond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function oddsNormalizeName(string $name): string
{
    return strtolower(trim(preg_replace('/\s+/', ' ', $name)));
}

function oddsStripArticle(string $name): string
{
    return preg_replace('/^the\s+/i', '', oddsNormalizeName($name)) ?? oddsNormalizeName($name);
}

function oddsCatalogCachePath(): string
{
    return __DIR__ . '/assets/cache/allTrackedCases.json';
}

function oddsFetchJson(string $url, int $timeoutSeconds = 25): ?array
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_CONNECTTIMEOUT => min(10, $timeoutSeconds),
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            . '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);

    $body = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);

    if ($body === false || $status >= 400 || $body === '') {
        return null;
    }

    $decoded = json_decode((string)$body, true);
    return is_array($decoded) ? $decoded : null;
}

function oddsLoadCatalog(): ?array
{
    $cachePath = oddsCatalogCachePath();
    $ttlSeconds = 86400;

    if (is_file($cachePath)) {
        $modifiedAt = @filemtime($cachePath);
        if ($modifiedAt !== false && $modifiedAt >= time() - $ttlSeconds) {
            $cached = json_decode((string)@file_get_contents($cachePath), true);
            if (is_array($cached) && $cached) {
                return $cached;
            }
        }
    }

    $catalog = oddsFetchJson('https://csroi.com/pastData/allTrackedCases.json', 30);
    if (!is_array($catalog) || !$catalog) {
        return null;
    }

    $cacheDir = dirname($cachePath);
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0775, true);
    }
    @file_put_contents($cachePath, json_encode($catalog, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

    return $catalog;
}

function oddsFindCatalogEntry(array $catalog, string $query): ?array
{
    $needle = oddsNormalizeName($query);
    if ($needle === '') {
        return null;
    }

    $needleLoose = oddsStripArticle($needle);

    foreach ($catalog as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $name = oddsNormalizeName((string)($entry['Name'] ?? ''));
        if ($name === $needle || oddsStripArticle($name) === $needleLoose) {
            return $entry;
        }
    }

    foreach ($catalog as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $name = oddsNormalizeName((string)($entry['Name'] ?? ''));
        $nameLoose = oddsStripArticle($name);
        if ($name !== '' && (
            str_contains($name, $needle)
            || str_contains($needle, $name)
            || str_contains($nameLoose, $needleLoose)
            || str_contains($needleLoose, $nameLoose)
        )) {
            return $entry;
        }
    }

    return null;
}

// Standard 5-tier rarity ladder every tracked case/terminal drop follows.
// "rare_special" is Valve's internal "Contraband" bucket in this dataset —
// the knife/glove slot, not literal contraband-rarity items.
const ODDS_TIERS = [
    ['key' => 'rare_special', 'label' => 'Rare Special (knife / glove)', 'sourceKey' => 'Contraband'],
    ['key' => 'covert', 'label' => 'Covert', 'sourceKey' => 'Covert'],
    ['key' => 'classified', 'label' => 'Classified', 'sourceKey' => 'Classified'],
    ['key' => 'restricted', 'label' => 'Restricted', 'sourceKey' => 'Restricted'],
    ['key' => 'milspec', 'label' => 'Mil-Spec', 'sourceKey' => 'Mil_Spec'],
];

$name = trim((string)($_GET['name'] ?? ''));
if ($name === '') {
    oddsRespond(['success' => false, 'error' => 'Missing name parameter.'], 400);
}

$catalog = oddsLoadCatalog();
if (!is_array($catalog)) {
    oddsRespond(['success' => false, 'error' => 'Unable to load catalog.'], 500);
}

$entry = oddsFindCatalogEntry($catalog, $name);
if (!is_array($entry)) {
    oddsRespond(['success' => false, 'error' => 'No odds data for this item.', 'matched' => false]);
}

$chances = is_array($entry['RarityChances'] ?? null) ? $entry['RarityChances'] : [];
$values = is_array($entry['RarityValuesSteam'] ?? null) ? $entry['RarityValuesSteam'] : [];

$tiers = [];
foreach (ODDS_TIERS as $tier) {
    $chance = (float)($chances[$tier['sourceKey']] ?? 0);
    $value = (float)($values[$tier['sourceKey']] ?? 0);
    if ($chance <= 0) {
        continue;
    }
    $tiers[] = [
        'key' => $tier['key'],
        'label' => $tier['label'],
        'chance' => $chance,
        'avg_value' => $value,
    ];
}

if (!$tiers) {
    oddsRespond(['success' => false, 'error' => 'No rarity odds available for this item.', 'matched' => true]);
}

$casePrice = (float)($entry['CollectionPriceSteam'] ?? 0);
$keyPrice = (float)($entry['KeyCostSteam'] ?? 0);

oddsRespond([
    'success' => true,
    'name' => (string)($entry['Name'] ?? $name),
    'matched' => true,
    'case_price' => $casePrice > 0 ? $casePrice : null,
    'key_price' => $keyPrice > 0 ? $keyPrice : null,
    'tiers' => $tiers,
    'updated_at' => time(),
]);
