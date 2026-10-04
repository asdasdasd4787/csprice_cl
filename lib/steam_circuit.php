<?php
declare(strict_types=1);

/**
 * Circuit breaker for live Steam Market calls.
 *
 * csprice.eu's address gets HTTP 429 from every Steam endpoint (priceoverview,
 * listing pages, search) for long stretches. Every item page still fired ~15
 * "live" Steam passes that each sat 5-20 s in retries before giving up - and
 * those seconds were spent holding PHP workers, which is where the chart
 * bundle and everything else on the page queued behind them.
 *
 * The first 429 trips the breaker (a lock file); for the next 15 minutes every
 * live Steam call returns its "rate limited / nothing" value immediately and
 * the callers fall through to the DB / file caches the PC-side syncs keep
 * fresh. When Steam lets the address through again the lock ages out and
 * live calls resume on their own.
 */

const STEAM_CIRCUIT_COOLDOWN_SECONDS = 900;

function steamCircuitFile(): string
{
    return dirname(__DIR__) . '/assets/roi-price-cache/steam_429.lock';
}

/** True while live Steam calls should be skipped. */
function steamCircuitOpen(): bool
{
    $file = steamCircuitFile();
    if (!is_file($file)) {
        return false;
    }
    $mtime = (int)@filemtime($file);
    return $mtime > 0 && (time() - $mtime) < STEAM_CIRCUIT_COOLDOWN_SECONDS;
}

function steamCircuitTrip(): void
{
    $file = steamCircuitFile();
    $dir = dirname($file);
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    @touch($file);
}

/** Trips the breaker when a response looks rate-limited; returns whether it did. */
function steamCircuitNote(int $status, string $body = ''): bool
{
    $limited = $status === 429
        || ($status >= 400 && $body !== '' && stripos(substr($body, 0, 4000), 'too many requests') !== false);
    if ($limited) {
        steamCircuitTrip();
    }
    return $limited;
}
