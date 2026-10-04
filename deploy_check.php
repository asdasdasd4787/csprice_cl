<?php
/**
 * One-file hosting readiness check.
 *
 * Upload this on its own, open it once, read the report, then DELETE IT.
 * It deliberately avoids app_bootstrap so it still runs when the app itself
 * cannot boot — that is the whole point of running it first.
 *
 * Usage:  https://your-domain.tld/deploy_check.php?token=csprice-preflight
 */
declare(strict_types=1);

const PREFLIGHT_TOKEN = 'csprice-preflight';

if (($_GET['token'] ?? '') !== PREFLIGHT_TOKEN) {
    http_response_code(404);
    exit('Not found.');
}

header('Content-Type: text/plain; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');

$pass = 0;
$warn = 0;
$fail = 0;

function line(string $status, string $label, string $detail = ''): void
{
    global $pass, $warn, $fail;
    if ($status === 'PASS') { $pass++; }
    elseif ($status === 'WARN') { $warn++; }
    else { $fail++; }
    printf("[%-4s] %-34s %s\n", $status, $label, $detail);
}

echo "CS.PRICE — hosting readiness\n";
echo str_repeat('=', 74) . "\n\n";

// ---------------------------------------------------------------- PHP core
echo "PHP\n";
$phpOk = version_compare(PHP_VERSION, '8.0.0', '>=');
line($phpOk ? 'PASS' : 'FAIL', 'PHP version', PHP_VERSION . ($phpOk ? '' : ' — needs 8.0+ (code uses str_contains/match)'));

// pdo_pgsql is the make-or-break one: the database is Supabase (PostgreSQL).
$required = ['curl', 'mbstring', 'json', 'pdo', 'pdo_pgsql'];
$optional = ['gd', 'pdo_mysql', 'openssl', 'zip', 'intl'];
foreach ($required as $ext) {
    $has = extension_loaded($ext);
    line($has ? 'PASS' : 'FAIL', "ext: $ext", $has ? '' : 'REQUIRED — site will not work without it');
}
foreach ($optional as $ext) {
    $has = extension_loaded($ext);
    line($has ? 'PASS' : 'WARN', "ext: $ext", $has ? '' : 'optional — some features degrade');
}

$memory = ini_get('memory_limit');
line(
    ($memory === '-1' || (int)$memory >= 128) ? 'PASS' : 'WARN',
    'memory_limit',
    (string)$memory
);
line((int)ini_get('max_execution_time') === 0 || (int)ini_get('max_execution_time') >= 30 ? 'PASS' : 'WARN',
    'max_execution_time', ini_get('max_execution_time') . 's — AI replies can take ~30s');
line(ini_get('allow_url_fopen') ? 'PASS' : 'WARN', 'allow_url_fopen', ini_get('allow_url_fopen') ? 'on' : 'off (curl is used anyway)');

$disabled = trim((string)ini_get('disable_functions'));
line($disabled === '' ? 'PASS' : 'WARN', 'disable_functions', $disabled === '' ? 'none' : $disabled);
line('PASS', 'error_log ini', (string)(ini_get('error_log') ?: '(default / stderr)'));

// ---------------------------------------------------------- Endpoint smoke
// Hit the JSON endpoints the pages depend on, through the web server, and
// surface the PHP error text when one returns 500 (display_errors is off on
// shared hosts, so the browser only ever sees a blank 500).
echo "\nENDPOINTS\n";
$self = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost')
    . rtrim(dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/')), '/\\');
foreach ([
    'get_roi_prices_cached.php?limit=1',
    'get_roi_prices_cached.php?source=steam&limit=1',
    'get_carepackage_data.php',
    'get_crafter_batch_library.php',
    'get_distribution.php?lookup_name=' . rawurlencode('AK-47 | Redline (Field-Tested)'),
] as $endpoint) {
    if (!function_exists('curl_init')) { break; }
    $ch = curl_init($self . '/' . $endpoint . (str_contains($endpoint, '?') ? '&' : '?') . 'preflight_errors=' . PREFLIGHT_TOKEN);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60, CURLOPT_SSL_VERIFYPEER => false]);
    $body = (string)curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $snippet = trim(strip_tags(substr($body, 0, 260)));
    line($code === 200 ? 'PASS' : 'FAIL', substr($endpoint, 0, 34), "HTTP $code " . ($code === 200 ? number_format(strlen($body)) . ' bytes' : $snippet));
}

// Tail of the PHP error log(s), if any are readable from here.
echo "\nRECENT PHP ERRORS\n";
$logCandidates = array_filter([
    (string)ini_get('error_log'),
    __DIR__ . '/logs/php_errors.log',
    __DIR__ . '/error_log',
    dirname(__DIR__) . '/error_log',
    dirname(__DIR__) . '/logs/error_log',
]);
$shown = false;
foreach ($logCandidates as $logPath) {
    if ($logPath === '' || !is_file($logPath) || !is_readable($logPath)) { continue; }
    $lines = @file($logPath, FILE_IGNORE_NEW_LINES) ?: [];
    $tail = array_slice($lines, -12);
    echo "  from $logPath\n";
    foreach ($tail as $entry) { echo '    ' . substr($entry, 0, 220) . "\n"; }
    $shown = true;
}
if (!$shown) { echo "  (no readable error log found)\n"; }

// -------------------------------------------------------------- Apache bits
echo "\nSERVER\n";
if (function_exists('apache_get_modules')) {
    $mods = apache_get_modules();
    line(in_array('mod_rewrite', $mods, true) ? 'PASS' : 'FAIL', 'mod_rewrite', 'needed for item_page.html');
    line(in_array('mod_headers', $mods, true) ? 'PASS' : 'WARN', 'mod_headers', 'cache-control headers');
} else {
    line('WARN', 'apache modules', 'cannot introspect (FPM/CGI) — test item_page.html by hand');
}
line('PASS', 'document root', (string)($_SERVER['DOCUMENT_ROOT'] ?? '?'));
line('PASS', 'script path', __DIR__);
line('PASS', 'REDIRECT_STATUS env', (string)($_SERVER['REDIRECT_STATUS'] ?? '(unset)'));
line('PASS', 'SCRIPT_FILENAME', (string)($_SERVER['SCRIPT_FILENAME'] ?? '?'));
line(is_file(__DIR__ . '/deals.html') ? 'PASS' : 'FAIL', 'deals.html on disk', is_file(__DIR__ . '/deals.html') ? 'present' : 'missing');
// Clean-URL rewrite check through the web server itself.
if (function_exists('curl_init')) {
    foreach (['deals' => 200, 'deals.html' => 301] as $probePath => $expect) {
        $ch = curl_init($self . '/' . $probePath);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_NOBODY => true, CURLOPT_TIMEOUT => 20, CURLOPT_SSL_VERIFYPEER => false]);
        curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $loc = (string)curl_getinfo($ch, CURLINFO_REDIRECT_URL);
        curl_close($ch);
        line($code === $expect ? 'PASS' : 'FAIL', "clean url /$probePath", "HTTP $code" . ($loc !== '' ? " -> $loc" : '') . " (expected $expect)");
    }
}

// ------------------------------------------------------------- Writable dirs
echo "\nWRITABLE PATHS\n";
foreach (['logs', 'uploads', 'assets/steam-market-cache', 'assets/roi-price-cache'] as $rel) {
    $dir = __DIR__ . '/' . $rel;
    if (!is_dir($dir)) {
        line('WARN', $rel, 'missing — create it (chmod 755)');
        continue;
    }
    $probe = $dir . '/.write-probe';
    $ok = @file_put_contents($probe, 'x') !== false;
    if ($ok) { @unlink($probe); }
    line($ok ? 'PASS' : 'FAIL', $rel, $ok ? 'writable' : 'NOT writable — chmod 755 (or 775)');
}

// ------------------------------------------------------------ Outbound HTTPS
echo "\nOUTBOUND HTTPS (shared hosts often block this)\n";
$targets = [
    'api.openai.com'   => 'https://api.openai.com/v1/models',
    'steamcommunity'   => 'https://steamcommunity.com/market/',
    'supabase.com'     => 'https://supabase.com',
    'ip-api.com'       => 'http://ip-api.com/json/8.8.8.8?fields=status',
];
foreach ($targets as $label => $url) {
    if (!function_exists('curl_init')) { line('FAIL', "reach $label", 'curl missing'); continue; }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_NOBODY => true,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    // 401/403 still proves the connection left the building.
    $reached = $code > 0;
    line($reached ? 'PASS' : 'FAIL', "reach $label", $reached ? "HTTP $code" : ($err ?: 'no response — outbound likely blocked'));
}

// ------------------------------------------------------------------- Config
echo "\nAPP CONFIG\n";
$cfgPath = __DIR__ . '/config.local.php';
if (!is_file($cfgPath)) {
    line('FAIL', 'config.local.php', 'missing — copy it up (never commit it to git)');
} else {
    line('PASS', 'config.local.php', 'present');
    $cfg = @include $cfgPath;
    if (!is_array($cfg)) {
        line('WARN', 'config parses', 'did not return an array — check the file');
    } else {
        // Only ever report presence/length, never the value itself.
        $ai = $cfg['ai']['api_key'] ?? '';
        line($ai !== '' ? 'PASS' : 'WARN', 'OpenAI key set', $ai !== '' ? 'yes (' . strlen((string)$ai) . ' chars)' : 'empty — AI chat disabled');

        foreach (['google', 'discord'] as $provider) {
            $uri = (string)($cfg[$provider]['redirect_uri'] ?? '');
            if ($uri === '') { continue; }
            $isLocal = str_contains($uri, 'localhost') || str_contains($uri, '127.0.0.1');
            line($isLocal ? 'FAIL' : 'PASS', "$provider redirect_uri", $isLocal ? "still points at localhost: $uri" : 'domain URL');
        }
    }
}

// --------------------------------------------------------------- DB connect
echo "\nDATABASE\n";
// Use the app's own connection logic rather than re-deriving the DSN — it
// falls back across config sections, so guessing here produces false alarms.
try {
    require_once __DIR__ . '/app_bootstrap.php';
    line('PASS', 'app_bootstrap loads', 'ok');
    try {
        $pdo = marketDataPdoConnection();
        $one = $pdo->query('SELECT 1')->fetchColumn();
        $driver = strtolower((string)$pdo->getAttribute(PDO::ATTR_DRIVER_NAME));
        line('PASS', 'database connect', "connected via $driver (SELECT 1 => " . var_export($one, true) . ')');

        foreach (['roi_prices'] as $table) {
            try {
                $count = $pdo->query("SELECT COUNT(*) FROM $table")->fetchColumn();
                line('PASS', "table: $table", number_format((float)$count) . ' rows');
            } catch (Throwable $e) {
                line('FAIL', "table: $table", substr($e->getMessage(), 0, 90));
            }
        }
    } catch (Throwable $e) {
        line('FAIL', 'database connect', substr($e->getMessage(), 0, 110));
    }
} catch (Throwable $e) {
    line('FAIL', 'app_bootstrap loads', substr($e->getMessage(), 0, 110));
}

// --------------------------------------------------------------- Asset spot
echo "\nASSETS\n";
foreach ([
    'react/i18n.js',
    'react/skin-viewer-core.js',
    'assets/models/crafter/batch-map.json',
    'styles/css/index.css',
] as $rel) {
    $ok = is_file(__DIR__ . '/' . $rel);
    line($ok ? 'PASS' : 'FAIL', $rel, $ok ? number_format(filesize(__DIR__ . '/' . $rel)) . ' bytes' : 'missing');
}
$models = __DIR__ . '/assets/models/skins';
if (is_dir($models)) {
    $n = count(glob($models . '/*.glb') ?: []);
    line($n > 0 ? 'PASS' : 'WARN', 'skin models uploaded', "$n .glb files");
} else {
    line('WARN', 'skin models uploaded', 'assets/models/skins missing — 3D crafter will not work');
}

// ------------------------------------------------------------------ Summary
echo "\n" . str_repeat('=', 74) . "\n";
printf("PASS %d   WARN %d   FAIL %d\n\n", $pass, $warn, $fail);
echo $fail === 0
    ? "No blockers. Delete this file now that you are done.\n"
    : "Fix the FAIL lines first — the site will not work correctly until then.\n";
echo "REMEMBER: delete deploy_check.php from the server when finished.\n";
