<?php
declare(strict_types=1);

require_once __DIR__ . '/sync_roi_catalog.php';

$lookup = roiBuildSkinOriginLookup();
$path = roiSaveSkinOriginLookup($lookup);

if (PHP_SAPI === 'cli') {
    echo json_encode([
        'success' => true,
        'output' => str_replace(__DIR__ . '/', '', $path),
        'total_count' => count($lookup),
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
    exit(0);
}

header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'success' => true,
    'output' => basename($path),
    'total_count' => count($lookup),
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
