<?php
declare(strict_types=1);

/**
 * Rebuild skin_description_lookup.json using flavor (italic) lines only.
 *
 * Usage:
 *   C:\xampp\php\php.exe rebuild_skin_descriptions.php
 */

require __DIR__ . '/sync_roi_catalog.php';

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
}

try {
    $lookup = roiBuildSkinDescriptionLookup();
    $path = roiSaveSkinDescriptionLookup($lookup);
    echo 'Saved ' . count($lookup) . ' flavor descriptions to ' . $path . PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . PHP_EOL);
    exit(1);
}
