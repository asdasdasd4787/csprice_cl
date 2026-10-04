<?php
declare(strict_types=1);

/**
 * Lightweight ARIMA (p,d,q) forecaster for CS2 skin price series.
 * See: https://en.wikipedia.org/wiki/Autoregressive_integrated_moving_average
 */

function aiArimaResampleWeekly(array $history): array
{
    $buckets = [];
    foreach ($history as $point) {
        if (!is_array($point)) {
            continue;
        }
        $time = (int)($point['time'] ?? 0);
        $price = (float)($point['price'] ?? 0);
        if ($time <= 0 || $price <= 0) {
            continue;
        }
        $week = (int)floor($time / 604800) * 604800;
        if (!isset($buckets[$week])) {
            $buckets[$week] = ['sum' => 0.0, 'n' => 0, 't' => $week];
        }
        $buckets[$week]['sum'] += $price;
        $buckets[$week]['n']++;
    }

    if (!$buckets) {
        return [];
    }

    ksort($buckets);
    $series = [];
    foreach ($buckets as $bucket) {
        $series[] = [
            't' => (int)$bucket['t'],
            'p' => round($bucket['sum'] / max(1, (int)$bucket['n']), 4),
        ];
    }

    return $series;
}

function aiArimaDifference(array $values, int $d): array
{
    $out = $values;
    for ($step = 0; $step < $d; $step++) {
        if (count($out) < 2) {
            return [];
        }
        $next = [];
        for ($i = 1, $n = count($out); $i < $n; $i++) {
            $next[] = $out[$i] - $out[$i - 1];
        }
        $out = $next;
    }
    return $out;
}

function aiArimaIntegrate(array $diffs, array $seed, int $d): array
{
    $out = $diffs;
    for ($step = $d - 1; $step >= 0; $step--) {
        $base = $seed[$step] ?? (end($seed) ?: 0.0);
        $integrated = [];
        $prev = $base;
        foreach ($out as $delta) {
            $prev += $delta;
            $integrated[] = $prev;
        }
        $out = $integrated;
    }
    return $out;
}

function aiArimaAutocovariance(array $series, int $lag): float
{
    $n = count($series);
    if ($n <= $lag || $n < 2) {
        return 0.0;
    }
    $mean = array_sum($series) / $n;
    $cov = 0.0;
    $count = $n - $lag;
    for ($i = 0; $i < $count; $i++) {
        $cov += ($series[$i] - $mean) * ($series[$i + $lag] - $mean);
    }
    return $cov / $n;
}

function aiArimaYuleWalker(array $series, int $p): array
{
    if ($p <= 0) {
        return [];
    }

    $gamma = [];
    for ($i = 0; $i <= $p; $i++) {
        $gamma[$i] = aiArimaAutocovariance($series, $i);
    }

    if (abs($gamma[0]) < 1e-12) {
        return array_fill(0, $p, 0.0);
    }

    $matrix = [];
    $vector = [];
    for ($i = 0; $i < $p; $i++) {
        $row = [];
        for ($j = 0; $j < $p; $j++) {
            $row[] = $gamma[abs($i - $j)];
        }
        $matrix[] = $row;
        $vector[] = $gamma[$i + 1];
    }

    return aiArimaSolveLinear($matrix, $vector) ?? array_fill(0, $p, 0.0);
}

function aiArimaSolveLinear(array $a, array $b): ?array
{
    $n = count($b);
    if ($n === 0 || count($a) !== $n) {
        return null;
    }

    for ($i = 0; $i < $n; $i++) {
        $a[$i][] = $b[$i];
    }

    for ($col = 0; $col < $n; $col++) {
        $pivot = $col;
        for ($row = $col + 1; $row < $n; $row++) {
            if (abs($a[$row][$col]) > abs($a[$pivot][$col])) {
                $pivot = $row;
            }
        }
        if (abs($a[$pivot][$col]) < 1e-12) {
            return null;
        }
        if ($pivot !== $col) {
            $tmp = $a[$col];
            $a[$col] = $a[$pivot];
            $a[$pivot] = $tmp;
        }
        $div = $a[$col][$col];
        for ($j = $col; $j <= $n; $j++) {
            $a[$col][$j] /= $div;
        }
        for ($row = 0; $row < $n; $row++) {
            if ($row === $col) {
                continue;
            }
            $factor = $a[$row][$col];
            for ($j = $col; $j <= $n; $j++) {
                $a[$row][$j] -= $factor * $a[$col][$j];
            }
        }
    }

    $x = [];
    for ($i = 0; $i < $n; $i++) {
        $x[] = $a[$i][$n];
    }
    return $x;
}

function aiArimaFitResiduals(array $diffSeries, array $ar, int $q): array
{
    $p = count($ar);
    $n = count($diffSeries);
    $residuals = array_fill(0, $n, 0.0);
    $ma = array_fill(0, max(0, $q), 0.0);

    for ($pass = 0; $pass < 2; $pass++) {
        for ($t = 0; $t < $n; $t++) {
            $pred = 0.0;
            for ($i = 0; $i < $p; $i++) {
                $idx = $t - $i - 1;
                if ($idx >= 0) {
                    $pred += $ar[$i] * $diffSeries[$idx];
                }
            }
            for ($j = 0; $j < $q; $j++) {
                $idx = $t - $j - 1;
                if ($idx >= 0) {
                    $pred += $ma[$j] * $residuals[$idx];
                }
            }
            $residuals[$t] = $diffSeries[$t] - $pred;
        }

        if ($q <= 0) {
            break;
        }

        // OLS for MA coeffs using lagged residuals.
        $rows = [];
        $ys = [];
        for ($t = max($p, $q); $t < $n; $t++) {
            $arPart = 0.0;
            for ($i = 0; $i < $p; $i++) {
                $arPart += $ar[$i] * $diffSeries[$t - $i - 1];
            }
            $row = [];
            for ($j = 0; $j < $q; $j++) {
                $row[] = $residuals[$t - $j - 1];
            }
            $rows[] = $row;
            $ys[] = $diffSeries[$t] - $arPart;
        }
        if (count($rows) >= $q) {
            $xtx = [];
            $xty = array_fill(0, $q, 0.0);
            for ($i = 0; $i < $q; $i++) {
                $xtx[$i] = array_fill(0, $q, 0.0);
            }
            foreach ($rows as $rIdx => $row) {
                for ($i = 0; $i < $q; $i++) {
                    $xty[$i] += $row[$i] * $ys[$rIdx];
                    for ($j = 0; $j < $q; $j++) {
                        $xtx[$i][$j] += $row[$i] * $row[$j];
                    }
                }
            }
            $solved = aiArimaSolveLinear($xtx, $xty);
            if (is_array($solved)) {
                $ma = $solved;
            }
        }
    }

    return ['ma' => $ma, 'residuals' => $residuals];
}

function aiArimaAic(array $residuals, int $params): float
{
    $n = count($residuals);
    if ($n < 2) {
        return INF;
    }
    $sse = 0.0;
    foreach ($residuals as $r) {
        $sse += $r * $r;
    }
    $sigma2 = max(1e-12, $sse / $n);
    return $n * log($sigma2) + 2 * $params;
}

function aiArimaFitModel(array $values, int $p, int $d, int $q): ?array
{
    $diff = aiArimaDifference($values, $d);
    if (count($diff) < max(8, $p + $q + 4)) {
        return null;
    }

    $ar = aiArimaYuleWalker($diff, $p);
    $fit = aiArimaFitResiduals($diff, $ar, $q);
    $ma = $fit['ma'];
    $residuals = $fit['residuals'];
    $aic = aiArimaAic($residuals, $p + $q + ($d > 0 ? 1 : 0));

    $sse = 0.0;
    foreach ($residuals as $r) {
        $sse += $r * $r;
    }
    $sigma = sqrt(max(1e-12, $sse / max(1, count($residuals))));

    return [
        'p' => $p,
        'd' => $d,
        'q' => $q,
        'ar' => $ar,
        'ma' => $ma,
        'residuals' => $residuals,
        'diff' => $diff,
        'values' => $values,
        'sigma' => $sigma,
        'aic' => $aic,
    ];
}

function aiArimaSelectModel(array $values): ?array
{
    $best = null;
    // Cap d at 1 for multi-year horizons — d=2 often explodes when integrated far ahead.
    foreach ([0, 1, 2] as $p) {
        foreach ([0, 1] as $d) {
            foreach ([0, 1, 2] as $q) {
                if ($p + $d + $q === 0) {
                    continue;
                }
                $model = aiArimaFitModel($values, $p, $d, $q);
                if ($model === null) {
                    continue;
                }
                // Reject explosive AR roots (|phi| >= 1).
                $explosive = false;
                foreach ($model['ar'] as $phi) {
                    if (abs((float)$phi) >= 0.98) {
                        $explosive = true;
                        break;
                    }
                }
                if ($explosive) {
                    continue;
                }
                if ($best === null || $model['aic'] < $best['aic']) {
                    $best = $model;
                }
            }
        }
    }
    return $best;
}

function aiArimaPredict(array $model, int $steps): array
{
    $p = (int)$model['p'];
    $d = (int)$model['d'];
    $q = (int)$model['q'];
    $ar = $model['ar'];
    $ma = $model['ma'];
    $diff = $model['diff'];
    $residuals = $model['residuals'];
    $values = $model['values'];
    $sigma = (float)$model['sigma'];

    $workDiff = $diff;
    $workResid = $residuals;
    $forecastDiff = [];

    for ($h = 0; $h < $steps; $h++) {
        $pred = 0.0;
        for ($i = 0; $i < $p; $i++) {
            $idx = count($workDiff) - $i - 1;
            if ($idx >= 0) {
                $pred += $ar[$i] * $workDiff[$idx];
            }
        }
        for ($j = 0; $j < $q; $j++) {
            $idx = count($workResid) - $j - 1;
            if ($idx >= 0) {
                $pred += $ma[$j] * $workResid[$idx];
            }
        }
        $forecastDiff[] = $pred;
        $workDiff[] = $pred;
        $workResid[] = 0.0; // future innovations assumed 0
    }

    $seed = [];
    for ($i = 0; $i < max(1, $d); $i++) {
        $seed[] = $values[count($values) - 1 - $i] ?? $values[count($values) - 1];
    }
    $seed = array_reverse($seed);
    $levels = aiArimaIntegrate($forecastDiff, $seed, $d);

    $out = [];
    foreach ($levels as $i => $level) {
        $se = $sigma * sqrt($i + 1);
        $out[] = [
            'p' => max(0.01, (float)$level),
            'lo' => max(0.01, (float)$level - 1.28 * $se),
            'hi' => max(0.01, (float)$level + 1.28 * $se),
        ];
    }
    return $out;
}

function aiArimaSupplyDemandBias(?int $sellOrders, ?int $buyOrders, ?int $volume24h): array
{
    $pressure = 0.0; // negative = bearish, positive = bullish
    $notes = [];

    if ($sellOrders !== null && $sellOrders > 0) {
        if ($sellOrders >= 400) {
            $pressure -= 0.18;
            $notes[] = 'High sell listings (' . number_format($sellOrders) . ') add supply pressure.';
        } elseif ($sellOrders <= 40) {
            $pressure += 0.10;
            $notes[] = 'Thin sell-side listings (' . number_format($sellOrders) . ') can support price.';
        } else {
            $notes[] = 'Sell listings: ' . number_format($sellOrders) . '.';
        }
    }

    if ($volume24h !== null && $volume24h > 0) {
        if ($volume24h >= 80) {
            $pressure += 0.08;
            $notes[] = 'Strong recent trade volume (' . number_format($volume24h) . '/24h).';
        } elseif ($volume24h <= 5) {
            $pressure -= 0.06;
            $notes[] = 'Low liquidity (24h volume ' . number_format($volume24h) . ') increases uncertainty.';
        } else {
            $notes[] = '24h volume: ' . number_format($volume24h) . '.';
        }
    }

    if ($buyOrders !== null && $sellOrders !== null && $sellOrders > 0) {
        $ratio = $buyOrders / max(1, $sellOrders);
        if ($ratio >= 0.75) {
            $pressure += 0.07;
            $notes[] = 'Buy/sell order balance leans toward demand.';
        } elseif ($ratio <= 0.15) {
            $pressure -= 0.08;
            $notes[] = 'Buy demand looks weak vs listings.';
        }
    }

    $pressure = max(-0.35, min(0.35, $pressure));
    $label = $pressure > 0.06 ? 'demand-leaning' : ($pressure < -0.06 ? 'supply-heavy' : 'balanced');

    return [
        'bias' => $pressure,
        'label' => $label,
        'notes' => $notes,
    ];
}

function aiArimaStabilizePath(array $points, array $historyValues, float $current): array
{
    if (!$points) {
        return $points;
    }

    $nHist = count($historyValues);
    $window = array_slice($historyValues, max(0, $nHist - 16));
    $mean = $window ? array_sum($window) / count($window) : $current;
    $minH = $window ? min($window) : $current;
    $maxH = $window ? max($window) : $current;
    $range = max(abs($maxH - $minH), max(0.5, $current * 0.35));
    $steps = count($points);

    // Recent weekly drift from history — keeps the mid path from going flat.
    $lookback = min(26, max(4, $nHist - 1));
    $past = (float)($historyValues[$nHist - 1 - $lookback] ?? $current);
    $weeklyDrift = ($current - $past) / max(1, $lookback);
    $weeklyDrift = max(-abs($current) * 0.025, min(abs($current) * 0.035, $weeklyDrift));
    // Slight positive bias when history is sideways so the forecast still has a readable slope.
    if (abs($weeklyDrift) < abs($current) * 0.002) {
        $weeklyDrift = abs($current) * 0.004;
    }

    $out = [];
    $prev = $current;
    foreach ($points as $i => $point) {
        $raw = max(0.01, (float)$point['p']);
        // Light mean-reversion only — heavy blending was flattening the mid line.
        $blend = min(0.28, (($i + 1) / max(1, $steps)) * 0.32);
        $trendLevel = max(0.01, $current + ($weeklyDrift * ($i + 1)));
        $level = ($raw * (1.0 - $blend) * 0.55) + ($trendLevel * 0.45) + ($mean * $blend * 0.15);

        // Soft weekly step cap (~10% of recent level).
        $maxStep = max(0.05, abs($prev) * 0.10);
        if ($level > $prev + $maxStep) {
            $level = $prev + $maxStep;
        } elseif ($level < $prev - $maxStep) {
            $level = $prev - $maxStep;
        }

        // Expanding envelope around recent trading range (upside-friendly).
        $expand = 1.0 + (($i + 1) / max(1, $steps)) * 1.8;
        $loBound = max(0.01, $current - ($range * $expand * 0.35));
        $hiBound = $current + ($range * $expand);
        $level = max($loBound, min($hiBound, $level));

        $spread = max(0.05, abs((float)$point['hi'] - (float)$point['lo']) / 2);
        $spread *= (1 + (($i + 1) / max(1, $steps)) * 0.75);
        // Lift mid toward the upside so the dashed prediction climbs with the cone.
        $hi = max(0.01, $level + $spread);
        $mid = $level + ($spread * 0.42);
        $mid = min($hi * 0.98, max($level, $mid));

        $out[] = [
            'p' => round($mid, 4),
            // No downside cone — floor sits on the prediction path.
            'lo' => round($mid, 4),
            'hi' => round($hi, 4),
        ];
        $prev = $mid;
    }

    return $out;
}

function aiArimaApplyBias(array $points, float $biasPerYear, int $stepsPerYear): array
{
    if (abs($biasPerYear) < 0.001 || !$points) {
        return $points;
    }

    $out = [];
    foreach ($points as $i => $point) {
        $years = ($i + 1) / max(1, $stepsPerYear);
        $factor = 1.0 + ($biasPerYear * $years);
        $factor = max(0.35, min(2.2, $factor));
        $mid = max(0.01, round($point['p'] * $factor, 4));
        $hi = max(0.01, round($point['hi'] * $factor, 4));
        $out[] = [
            'p' => $mid,
            'lo' => $mid,
            'hi' => max($hi, $mid),
        ];
    }
    return $out;
}

function aiArimaDownsample(array $points, int $maxPoints): array
{
    $n = count($points);
    if ($n <= $maxPoints) {
        return $points;
    }
    $step = (int)ceil($n / $maxPoints);
    $out = [];
    for ($i = 0; $i < $n; $i += $step) {
        $out[] = $points[$i];
    }
    $last = $points[$n - 1];
    if ($out[count($out) - 1] !== $last) {
        $out[] = $last;
    }
    return $out;
}

/**
 * Build a chart-ready ARIMA forecast payload from ROI-style history points.
 *
 * @param array $history [{time, price}, ...]
 * @param array $meta [current_price, sell_orders, buy_orders, volume_24h, item_name]
 */
function aiArimaBuildForecast(array $history, array $meta = [], int $horizonYears = 1): ?array
{
    $weekly = aiArimaResampleWeekly($history);
    if (count($weekly) < 10) {
        return null;
    }

    $values = array_map(static fn(array $p): float => (float)$p['p'], $weekly);
    $model = aiArimaSelectModel($values);
    if ($model === null) {
        return null;
    }

    $horizonYears = max(1, min(3, $horizonYears));
    $stepsPerYear = 52;
    $steps = max(26, (int)round($horizonYears * $stepsPerYear));
    $rawForecast = aiArimaPredict($model, $steps);

    $sd = aiArimaSupplyDemandBias(
        isset($meta['sell_orders']) ? (int)$meta['sell_orders'] : null,
        isset($meta['buy_orders']) ? (int)$meta['buy_orders'] : null,
        isset($meta['volume_24h']) ? (int)$meta['volume_24h'] : null
    );
    $rawForecast = aiArimaApplyBias($rawForecast, (float)$sd['bias'], $stepsPerYear);
    $rawForecast = aiArimaStabilizePath($rawForecast, $values, (float)($meta['current_price'] ?? end($values)));

    $lastT = (int)$weekly[count($weekly) - 1]['t'];
    $week = 604800;
    $forecastPoints = [];
    foreach ($rawForecast as $i => $point) {
        $forecastPoints[] = [
            't' => $lastT + (($i + 1) * $week),
            'p' => round((float)$point['p'], 2),
            'lo' => round((float)$point['lo'], 2),
            'hi' => round((float)$point['hi'], 2),
        ];
    }

    // Model on weekly series; chart uses full lifetime raw history (first listing → today).
    $rawForChart = [];
    $todayEnd = time() + 86400;
    foreach ($history as $point) {
        if (!is_array($point)) {
            continue;
        }
        $time = (int)($point['time'] ?? 0);
        // Accept ms timestamps from mixed sources.
        if ($time > 100000000000) {
            $time = (int)floor($time / 1000);
        }
        $price = (float)($point['price'] ?? 0);
        if ($time <= 0 || $time > $todayEnd || $price <= 0) {
            continue;
        }
        $rawForChart[] = ['t' => $time, 'p' => $price];
    }
    usort($rawForChart, static fn(array $a, array $b): int => $a['t'] <=> $b['t']);
    $historyForChart = aiArimaDownsample($rawForChart ?: $weekly, 900);
    $forecastForChart = aiArimaDownsample($forecastPoints, max(24, min(64, $steps)));

    $current = (float)($meta['current_price'] ?? end($values));
    $projected = (float)$forecastPoints[count($forecastPoints) - 1]['p'];
    $changePct = $current > 0 ? round((($projected - $current) / $current) * 100, 2) : null;

    $idx1y = min(count($forecastPoints) - 1, max(0, $stepsPerYear - 1));
    $year1 = (float)$forecastPoints[$idx1y]['p'];
    $year2 = $projected;

    $outlook = 'neutral';
    if (is_numeric($changePct)) {
        if ($changePct >= 8) {
            $outlook = 'bullish';
        } elseif ($changePct <= -8) {
            $outlook = 'bearish';
        }
    }

    $historyStart = (int)($historyForChart[0]['t'] ?? 0);
    $historyEnd = (int)($historyForChart[count($historyForChart) - 1]['t'] ?? 0);

    return [
        'item_name' => (string)($meta['item_name'] ?? ''),
        'model' => 'Future',
        'aic' => round((float)$model['aic'], 2),
        'horizon_years' => $horizonYears,
        'history_range' => 'lifetime',
        'history_points' => count($historyForChart),
        'history_start' => $historyStart > 0 ? $historyStart : null,
        'history_end' => $historyEnd > 0 ? $historyEnd : null,
        'current_price' => round($current, 2),
        'projected_price' => round($projected, 2),
        'projected_1y' => round($year1, 2),
        'projected_2y' => round((float)$year2, 2),
        'change_pct' => $changePct,
        'outlook' => $outlook,
        'supply_demand' => $sd['label'],
        'signal_notes' => $sd['notes'],
        'history' => array_map(static function (array $p): array {
            return ['t' => (int)$p['t'], 'p' => round((float)$p['p'], 2)];
        }, $historyForChart),
        'forecast' => $forecastForChart,
        'disclaimer' => 'Illustrative future path — not financial advice.',
    ];
}
