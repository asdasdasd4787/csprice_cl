<?php
/**
 * Tells the front end whether this browser is allowed in, so the UI can put up
 * the lock overlay instead of silently failing every fetch.
 *
 * Public by design (it is the one thing a blocked visitor may ask) and answers
 * nothing but a boolean plus the device label - no keys, no device list.
 */
declare(strict_types=1);

require_once __DIR__ . '/access_gate.php';

header('Content-Type: application/json');
header('Cache-Control: no-store, private');
header('X-Robots-Tag: noindex, nofollow');

$verdict = cspriceGateEvaluate();

echo json_encode([
    'gate_enabled' => cspriceGateEnabled(),
    'allowed' => (bool)$verdict['allowed'],
    'reason' => (string)$verdict['reason'],
    'device' => $verdict['device']['label'] ?? '',
]);
