<?php
/**
 * Pre-compresses the item catalog for catalog_json.php.
 * Run after roi_catalog.json changes:  php scripts/build_catalog_gz.php
 */
declare(strict_types=1);

$json = dirname(__DIR__) . '/assets/steam-market-cache/roi_catalog.json';
if (!is_file($json)) {
    fwrite(STDERR, "missing $json\n");
    exit(1);
}
$raw = (string)file_get_contents($json);
$gz = gzencode($raw, 9);
if ($gz === false) {
    fwrite(STDERR, "gzencode failed\n");
    exit(1);
}
file_put_contents($json . '.gz', $gz);
touch($json . '.gz', filemtime($json) + 1);
printf("roi_catalog.json %s MB -> roi_catalog.json.gz %s MB\n", number_format(strlen($raw) / 1048576, 1), number_format(strlen($gz) / 1048576, 1));
