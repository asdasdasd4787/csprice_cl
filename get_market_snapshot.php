<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/market_snapshot_helpers.php';
require_once __DIR__ . '/tf2_ai_helpers.php';

try {
    // ?game=tf2: the TF2 markets overview written by scripts/tf2_import.php.
    if (strtolower(trim((string)($_GET['game'] ?? ''))) === 'tf2') {
        $tf2 = tf2MarketSnapshot();
        if ($tf2 === null) {
            respondJson(['success' => false, 'error' => 'TF2 market snapshot is unavailable.'], 409);
        }
        respondJson(['success' => true, 'snapshot' => $tf2, 'cached' => true]);
    }

    $result = marketSnapshotBuild(true);
    if (!$result['success']) {
        respondJson([
            'success' => false,
            'error' => (string)($result['error'] ?? 'Market snapshot is unavailable.'),
        ], 409);
    }

    respondJson([
        'success' => true,
        'snapshot' => $result['snapshot'],
        'cached' => (bool)($result['cached'] ?? false),
    ]);
} catch (Throwable $exception) {
    respondJson([
        'success' => false,
        'error' => $exception->getMessage(),
    ], 500);
}
