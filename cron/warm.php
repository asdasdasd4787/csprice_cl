<?php
/**
 * Entry point for the host's folder cron ("adresářový cron" on Český hosting,
 * folder "cron", every 15 minutes). Runs one slice of scripts/cron_warm.php,
 * which keeps the item pages' chart data cached. Does nothing when opened in
 * a browser.
 */
if (PHP_SAPI !== 'cli' && (isset($_SERVER['REQUEST_METHOD']) || isset($_SERVER['HTTP_HOST']))) {
    http_response_code(404);
    exit;
}
$argv = [__FILE__, '40', 'https://csprice.eu'];
require dirname(__DIR__) . '/scripts/cron_warm.php';
