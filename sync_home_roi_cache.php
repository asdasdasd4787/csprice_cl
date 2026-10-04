<?php
declare(strict_types=1);
/**
 * Background worker — builds roi_home_cache.json read by get_home_roi.php.
 * Triggered automatically when the cache is missing or stale (1hr TTL).
 * Runs fire-and-forget; never called directly by a browser request.
 */

require __DIR__ . '/app_bootstrap.php';
set_time_limit(180);

// ── Constants ─────────────────────────────────────────────────────────────────

define('SYNC_HOME_CATALOG',   __DIR__ . '/assets/steam-market-cache/roi_catalog.json');
define('SYNC_HOME_OUTPUT',    __DIR__ . '/assets/steam-market-cache/roi_home_cache.json');
define('SYNC_HOME_LOCK',      sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'csgo_home_roi_sync.lock');
define('SYNC_HOME_TOP_N',     6);    // items per trending / declining section
define('SYNC_HOME_RANGE',     30);   // days for ROI window
define('SYNC_HOME_SAMPLE',    120);  // Skinport items to fetch if no cached data
define('SYNC_HOME_MIN_PRICE', 0.10); // skip items cheaper than this (EUR)

// ── Python resolver ───────────────────────────────────────────────────────────

function homeResolvePython(): string
{
    $override = trim((string)getenv('PYTHON_BIN'));
    if ($override !== '') return $override;
    $localAppData = getenv('LOCALAPPDATA');
    if (is_string($localAppData) && $localAppData !== '') {
        $matches = glob(
            $localAppData . DIRECTORY_SEPARATOR . 'Python'
            . DIRECTORY_SEPARATOR . 'pythoncore-*'
            . DIRECTORY_SEPARATOR . 'python.exe'
        );
        if (is_array($matches) && $matches) {
            rsort($matches);
            return $matches[0];
        }
        $bin = $localAppData . DIRECTORY_SEPARATOR . 'Python'
             . DIRECTORY_SEPARATOR . 'bin' . DIRECTORY_SEPARATOR . 'python.exe';
        if (is_file($bin)) return $bin;
    }
    return 'python';
}

// ── File cache (mirrors cachedFileCachePath / cachedFileLoad / cachedFileSave) ─

function homeFileCachePath(string $name): string
{
    $slug = preg_replace('/[^a-z0-9_.-]+/i', '_', strtolower($name)) ?: 'item';
    return rtrim(sys_get_temp_dir(), '\\/') . DIRECTORY_SEPARATOR
        . 'csgo_roi_skinport_' . $slug . '.json';
}

function homeFileLoad(string $name, int $ttl = 3600): ?array
{
    $path  = homeFileCachePath($name);
    if (!is_file($path)) return null;
    $mtime = @filemtime($path);
    if ($mtime === false || $mtime < time() - $ttl) return null;
    $data = json_decode((string)@file_get_contents($path), true);
    return is_array($data) ? $data : null;
}

function homeFileSave(string $name, array $data): void
{
    @file_put_contents(homeFileCachePath($name), json_encode($data));
}

// ── ROI computation ───────────────────────────────────────────────────────────

function homeHistoryBaseline(array $history, int $days, ?float $cp): array
{
    if (!$history) {
        return ['current' => $cp, 'baseline' => null, 'pct' => null];
    }
    $latest     = $history[count($history) - 1];
    $current    = $cp ?? round((float)$latest['price'], 2);
    $targetTime = (int)$latest['time'] - ($days * 86400);
    $baseline   = $history[0];
    foreach ($history as $pt) {
        if ((int)$pt['time'] <= $targetTime) {
            $baseline = $pt;
        } else {
            break;
        }
    }
    $bp  = round((float)$baseline['price'], 2);
    $pct = $bp > 0 ? round((($current - $bp) / $bp) * 100, 2) : null;
    return ['current' => $current, 'baseline' => $bp, 'pct' => $pct];
}

// ── Skinport live fetch ───────────────────────────────────────────────────────

function homeFetchSkinport(array $names): array
{
    if (!$names) return [];

    $pythonScript = <<<'PY'
import base64, json, sys, requests

names = json.loads(base64.b64decode(sys.argv[1]).decode('utf-8'))
headers = {'Accept-Encoding': 'br', 'Accept': 'application/json'}

hist = requests.get('https://api.skinport.com/v1/sales/history',
    params={'app_id': 730, 'currency': 'EUR', 'market_hash_name': ','.join(names)},
    headers=headers, timeout=60)
hist.raise_for_status()

items = requests.get('https://api.skinport.com/v1/items',
    params={'app_id': 730, 'currency': 'EUR', 'tradable': 1},
    headers=headers, timeout=60)
items.raise_for_status()

wanted = set(names)
h = {r['market_hash_name']: r for r in hist.json() if isinstance(r,dict) and r.get('market_hash_name') in wanted}
i = {r['market_hash_name']: r for r in items.json() if isinstance(r,dict) and r.get('market_hash_name') in wanted}
print(json.dumps({'history': h, 'items': i}))
PY;

    $command = sprintf('%s - %s',
        escapeshellarg(homeResolvePython()),
        escapeshellarg(base64_encode(json_encode($names, JSON_UNESCAPED_UNICODE)))
    );
    $pipes = [];
    $proc  = proc_open($command, [0 => ['pipe','r'], 1 => ['pipe','w'], 2 => ['pipe','w']], $pipes);
    if (!is_resource($proc)) return [];

    fwrite($pipes[0], $pythonScript);
    fclose($pipes[0]);
    $stdout = (string)stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exit = proc_close($proc);
    if ($exit !== 0 || $stdout === '') return [];

    $payload   = json_decode($stdout, true);
    if (!is_array($payload)) return [];

    $histRows  = is_array($payload['history'] ?? null) ? $payload['history'] : [];
    $itemRows  = is_array($payload['items']   ?? null) ? $payload['items']   : [];
    $now       = time();
    $results   = [];

    foreach ($names as $name) {
        $h = $histRows[$name] ?? [];
        $i = $itemRows[$name] ?? [];
        if (!$h && !$i) continue;

        // Current price from items endpoint
        $cp = null;
        foreach (['median_price','mean_price','min_price','suggested_price'] as $k) {
            if (isset($i[$k]) && is_numeric($i[$k])) { $cp = round((float)$i[$k], 2); break; }
        }
        if ($cp === null) {
            foreach (['median','avg','min'] as $k) {
                if (isset($h['last_24_hours'][$k]) && is_numeric($h['last_24_hours'][$k])) {
                    $cp = round((float)$h['last_24_hours'][$k], 2); break;
                }
            }
        }
        if ($cp === null) continue;

        // Synthetic time-series from bucket medians
        $pts = [];
        foreach ([['last_90_days',90],['last_30_days',30],['last_7_days',7],['last_24_hours',1]] as [$bucket,$days]) {
            foreach (['median','avg','min'] as $k) {
                if (isset($h[$bucket][$k]) && is_numeric($h[$bucket][$k])) {
                    $pts[] = ['time' => $now - $days * 86400, 'price' => round((float)$h[$bucket][$k], 4)];
                    break;
                }
            }
        }
        $pts[] = ['time' => $now, 'price' => $cp];
        usort($pts, static fn($a, $b) => $a['time'] <=> $b['time']);

        $row = [
            'current_price' => $cp,
            'sell_orders'   => isset($i['quantity']) ? (int)$i['quantity'] : null,
            'buy_orders'    => null,
            'price_history' => json_encode($pts),
            'updated_at'    => gmdate(DATE_ATOM),
        ];
        $results[$name] = $row;
        homeFileSave($name, $row);
    }
    return $results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

try {
    // Load catalog
    if (!is_file(SYNC_HOME_CATALOG)) {
        exit(0); // catalog not built yet; try again later
    }
    $catalogData = json_decode((string)file_get_contents(SYNC_HOME_CATALOG), true);
    if (!is_array($catalogData) || !is_array($catalogData['items'] ?? null)) {
        exit(0);
    }

    $allItems = $catalogData['items'];

    // Filter: must have a price and be above minimum
    $candidates = array_filter($allItems, static function (array $item): bool {
        $price = $item['seed_sell_price'] ?? null;
        return is_numeric($price) && (float)$price >= SYNC_HOME_MIN_PRICE;
    });

    // Sort by seed price desc — higher-value items tend to have more volatile ROI
    usort($candidates, static fn($a, $b) =>
        (float)($b['seed_sell_price'] ?? 0) <=> (float)($a['seed_sell_price'] ?? 0)
    );

    // Work with top 500 candidates to keep memory manageable
    $candidates = array_slice(array_values($candidates), 0, 500);

    // Step 1: load from local file cache (fast, no network)
    $rowsByName = [];
    $needFetch  = [];
    foreach ($candidates as $item) {
        $name = (string)$item['market_hash_name'];
        $row  = homeFileLoad($name);
        if ($row !== null && isset($row['price_history'])) {
            $rowsByName[$name] = $row;
        } else {
            $needFetch[] = $name;
        }
    }

    // Step 2: if too few cached items, fetch a sample from Skinport
    if (count($rowsByName) < SYNC_HOME_TOP_N * 4) {
        $toFetch     = array_slice($needFetch, 0, SYNC_HOME_SAMPLE);
        $liveResults = homeFetchSkinport($toFetch);
        foreach ($liveResults as $name => $row) {
            $rowsByName[$name] = $row;
        }
    }

    // Step 3: compute 30D ROI for each item with price history
    $roiItems = [];
    foreach ($candidates as $item) {
        $name = (string)$item['market_hash_name'];
        $row  = $rowsByName[$name] ?? null;
        if ($row === null) continue;

        $history = [];
        if (is_string($row['price_history'] ?? null) && $row['price_history'] !== '') {
            $decoded = json_decode($row['price_history'], true);
            if (is_array($decoded)) $history = $decoded;
        }
        if (count($history) < 2) continue;

        $cp      = isset($row['current_price']) ? (float)$row['current_price'] : null;
        $result  = homeHistoryBaseline($history, SYNC_HOME_RANGE, $cp);
        if ($result['pct'] === null) continue;

        $roiItems[] = [
            'market_hash_name' => $name,
            'display_name'     => (string)($item['display_name'] ?? $name),
            'image'            => (string)($item['image'] ?? ''),
            'price'            => round((float)$result['current'], 2),
            'roi_pct'          => $result['pct'],
        ];
    }

    // Sort for trending (highest ROI) and declining (lowest ROI)
    $trending  = $roiItems;
    $declining = $roiItems;
    usort($trending,  static fn($a, $b) => $b['roi_pct'] <=> $a['roi_pct']);
    usort($declining, static fn($a, $b) => $a['roi_pct'] <=> $b['roi_pct']);

    // Filter: trending must be positive, declining must be negative
    $trending  = array_values(array_filter($trending,  static fn($r) => $r['roi_pct'] > 0));
    $declining = array_values(array_filter($declining, static fn($r) => $r['roi_pct'] < 0));

    $output = [
        'success'    => true,
        'trending'   => array_slice($trending,  0, SYNC_HOME_TOP_N),
        'declining'  => array_slice($declining, 0, SYNC_HOME_TOP_N),
        'built_at'   => gmdate(DATE_ATOM),
        'item_count' => count($roiItems),
    ];

    file_put_contents(SYNC_HOME_OUTPUT, json_encode($output, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

} catch (Throwable $e) {
    // Silently exit; get_home_roi.php will retry on next request
} finally {
    // Always remove the lock so future requests can trigger a rebuild
    @unlink(SYNC_HOME_LOCK);
}
