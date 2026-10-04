<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/mark_daily_pulse_helpers.php';

try {
    $forceRefresh = false;
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        $rawBody = file_get_contents('php://input');
        $payload = json_decode($rawBody ?: '[]', true);
        $forceRefresh = is_array($payload)
            && filter_var((string)($payload['refresh_summary'] ?? ''), FILTER_VALIDATE_BOOLEAN);
    } elseif (isset($_GET['refresh_summary'])) {
        $forceRefresh = filter_var((string)$_GET['refresh_summary'], FILTER_VALIDATE_BOOLEAN);
    }

    respondJson(markDailyPulsePayload($forceRefresh));
} catch (Throwable $exception) {
    respondJson([
        'success' => false,
        'error' => $exception->getMessage(),
    ], 500);
}
