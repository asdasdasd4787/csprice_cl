<?php
declare(strict_types=1);

/**
 * Smoke-test ARIMA forecast on a synthetic declining CS2-like price series.
 * Run: C:\xampp\php\php.exe scripts/test_arima_forecast.php
 */

require_once dirname(__DIR__) . '/ai_arima.php';

$now = time();
$history = [];
$price = 55.0;
for ($i = 120; $i >= 0; $i--) {
    // Downtrend with noise + occasional bounce — similar to AWP Exothermic Max chart.
    $noise = (sin($i / 7) * 1.4) + ((($i * 37) % 11) - 5) * 0.15;
    $price = max(3.0, $price - 0.28 + $noise * 0.08);
    $history[] = [
        'time' => $now - ($i * 86400),
        'price' => round($price, 2),
    ];
}

$forecast = aiArimaBuildForecast($history, [
    'item_name' => 'AWP | Exothermic (Field-Tested)',
    'current_price' => (float)$history[count($history) - 1]['price'],
    'sell_orders' => 520,
    'buy_orders' => 40,
    'volume_24h' => 18,
], 2);

if ($forecast === null) {
    fwrite(STDERR, "FAIL: ARIMA returned null\n");
    exit(1);
}

$checks = [
    'has_model' => isset($forecast['model']) && str_starts_with((string)$forecast['model'], 'ARIMA('),
    'has_history' => count($forecast['history'] ?? []) >= 8,
    'has_forecast' => count($forecast['forecast'] ?? []) >= 8,
    'projected_positive' => (float)($forecast['projected_price'] ?? 0) > 0,
    'outlook_set' => in_array((string)($forecast['outlook'] ?? ''), ['bullish', 'bearish', 'neutral'], true),
    'change_sane' => abs((float)($forecast['change_pct'] ?? 9999)) <= 250,
];

$failed = array_filter($checks, static fn($ok) => !$ok);
if ($failed) {
    fwrite(STDERR, "FAIL checks: " . implode(', ', array_keys($failed)) . "\n");
    echo json_encode($forecast, JSON_PRETTY_PRINT) . "\n";
    exit(1);
}

echo "OK ARIMA smoke test\n";
echo "model={$forecast['model']} outlook={$forecast['outlook']} ";
echo "now={$forecast['current_price']} 1y={$forecast['projected_1y']} 2y={$forecast['projected_2y']} ";
echo "change={$forecast['change_pct']}% supply={$forecast['supply_demand']}\n";
echo "history_points=" . count($forecast['history']) . " forecast_points=" . count($forecast['forecast']) . "\n";
exit(0);
