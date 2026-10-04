<?php
/**
 * Device access gate.
 * =============================================================================
 * Runs before every PHP request on csprice.eu. A request is let through when it
 * carries a valid device cookie, presents a device key, or comes from an
 * allow-listed IP. Everything else gets 403 (JSON) or a redirect to the lock
 * screen (browser).
 *
 * WHAT THIS DOES AND DOES NOT COVER
 * ---------------------------------
 * The host runs nginx with no config access and no working .htaccess, and PHP
 * only runs for *.php. Static files - the generated item pages, the JS bundles,
 * the CSS, the images - are served by nginx directly and CANNOT be gated from
 * here. So:
 *
 *   covered      every .php endpoint: prices, charts, search, AI, inventory,
 *                Steam login, social, uploads. Without a device the site has
 *                no data at all and the UI shows the lock screen.
 *   NOT covered  the static HTML/JS/CSS themselves stay publicly fetchable by
 *                anyone who knows a URL. Closing that needs an edge proxy
 *                (Cloudflare) or an nginx rule from the host.
 *
 * HOW IT IS LOADED
 * ----------------
 * .user.ini sets auto_prepend_file to this file, which covers every .php in the
 * document root and below, including endpoints that never include
 * app_bootstrap.php. app_bootstrap.php requires it a second time as a fallback
 * in case .user.ini is ever ignored; the guard below makes that a no-op.
 *
 * TURNING IT OFF
 * --------------
 * Set 'enabled' => false in access_config.local.php over FTP. That is the
 * escape hatch - it needs no key and no database.
 */

if (defined('CSPRICE_ACCESS_GATE_LOADED')) {
    return;
}
define('CSPRICE_ACCESS_GATE_LOADED', true);
define('CSPRICE_GATE_PREPEND_RAN', true);

// Sync scripts and cron run as CLI and are never a browser request.
if (PHP_SAPI === 'cli') {
    return;
}

const CSPRICE_GATE_COOKIE = 'csprice_access';
const CSPRICE_GATE_COOKIE_DAYS = 365;

/**
 * Endpoints that must answer before a device is known, or the gate could never
 * be opened: the lock screen itself, the status ping the UI uses to decide
 * whether to show it, and the admin API (which carries its own master key, so
 * gating it as well would be a lockout waiting to happen).
 */
const CSPRICE_GATE_PUBLIC_SCRIPTS = [
    'gate.php',
    'access_status.php',
    'access_devices.php',
    // Serves react/*.js gzipped - the same public files nginx already hands
    // out uncompressed, and the lock screen itself is in one of them.
    'static.php',
];

function cspriceGateRoot(): string
{
    return __DIR__;
}

function cspriceGateConfig(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $defaults = [
        'enabled' => false,
        'secret' => '',
        'admin_key' => '',
        'allow_ips' => [],
    ];

    $path = cspriceGateRoot() . '/access_config.local.php';
    if (is_file($path)) {
        $loaded = require $path;
        if (is_array($loaded)) {
            $defaults = array_merge($defaults, $loaded);
        }
    }

    // A gate with no secret cannot verify anything, so it stays open rather
    // than locking the site out on a half-finished deploy.
    if (trim((string)$defaults['secret']) === '') {
        $defaults['enabled'] = false;
    }

    $config = $defaults;
    return $config;
}

function cspriceGateEnabled(): bool
{
    return (bool)cspriceGateConfig()['enabled'];
}

function cspriceGateClientIp(): string
{
    // This host passes the real client address in X-Real-Ip and sets no
    // X-Forwarded-For, so REMOTE_ADDR is already correct; the header is only a
    // fallback. Never trust a client-supplied X-Forwarded-For here.
    $ip = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    if ($ip === '') {
        $ip = trim((string)($_SERVER['HTTP_X_REAL_IP'] ?? ''));
    }
    return $ip;
}

function cspriceGateStorePath(): string
{
    return cspriceGateRoot() . '/data/access/devices.php';
}

/**
 * The device store lives inside the web root because the FTP root IS the web
 * root - there is nowhere else to put it. A leading `<?php exit; ?>` means
 * nginx hands the file to PHP, which prints nothing, so the contents are not
 * downloadable. Keys are stored as HMACs, never in the clear, so even a leak of
 * this file grants nobody access.
 */
function cspriceGateReadDevices(): array
{
    $path = cspriceGateStorePath();
    if (!is_file($path)) {
        return [];
    }
    $raw = (string)file_get_contents($path);
    $newline = strpos($raw, "\n");
    if ($newline !== false) {
        $raw = substr($raw, $newline + 1);
    }
    $decoded = json_decode(trim($raw), true);
    if (!is_array($decoded) || !is_array($decoded['devices'] ?? null)) {
        return [];
    }
    return $decoded['devices'];
}

function cspriceGateWriteDevices(array $devices): bool
{
    $dir = dirname(cspriceGateStorePath());
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        return false;
    }
    $body = "<?php exit; ?>\n" . json_encode(
        ['devices' => array_values($devices)],
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
    );
    return @file_put_contents(cspriceGateStorePath(), $body, LOCK_EX) !== false;
}

function cspriceGateHashKey(string $key): string
{
    return hash_hmac('sha256', $key, (string)cspriceGateConfig()['secret']);
}

function cspriceGateFindDeviceByKey(string $key): ?array
{
    $key = trim($key);
    if ($key === '') {
        return null;
    }
    $hash = cspriceGateHashKey($key);
    foreach (cspriceGateReadDevices() as $device) {
        if (!empty($device['revoked'])) {
            continue;
        }
        if (hash_equals((string)($device['key_hash'] ?? ''), $hash)) {
            return $device;
        }
    }
    return null;
}

function cspriceGateFindDeviceById(string $id): ?array
{
    foreach (cspriceGateReadDevices() as $device) {
        if (!empty($device['revoked'])) {
            continue;
        }
        if (hash_equals((string)($device['id'] ?? ''), $id)) {
            return $device;
        }
    }
    return null;
}

function cspriceGateSignCookie(string $deviceId, int $expires): string
{
    $payload = $deviceId . '|' . $expires;
    return $deviceId . '.' . $expires . '.' . hash_hmac('sha256', $payload, (string)cspriceGateConfig()['secret']);
}

function cspriceGateVerifyCookie(string $value): ?string
{
    $parts = explode('.', trim($value));
    if (count($parts) !== 3) {
        return null;
    }
    [$deviceId, $expires, $signature] = $parts;
    if (!ctype_digit($expires) || (int)$expires < time()) {
        return null;
    }
    $expected = hash_hmac('sha256', $deviceId . '|' . $expires, (string)cspriceGateConfig()['secret']);
    if (!hash_equals($expected, $signature)) {
        return null;
    }
    return cspriceGateFindDeviceById($deviceId) ? $deviceId : null;
}

function cspriceGateIssueCookie(string $deviceId): void
{
    $expires = time() + CSPRICE_GATE_COOKIE_DAYS * 86400;
    setcookie(CSPRICE_GATE_COOKIE, cspriceGateSignCookie($deviceId, $expires), [
        'expires' => $expires,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function cspriceGateClearCookie(): void
{
    setcookie(CSPRICE_GATE_COOKIE, '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function cspriceGateTouchDevice(string $deviceId): void
{
    // One write per device per hour: this runs on every request, and rewriting
    // the store each time would be a pointless disk hit on a shared host.
    $devices = cspriceGateReadDevices();
    $changed = false;
    foreach ($devices as $index => $device) {
        if (($device['id'] ?? '') !== $deviceId) {
            continue;
        }
        if ((int)($device['last_seen'] ?? 0) < time() - 3600) {
            $devices[$index]['last_seen'] = time();
            $changed = true;
        }
        break;
    }
    if ($changed) {
        cspriceGateWriteDevices($devices);
    }
}

/** The key a request presents, from the header, a POST field or the query. */
function cspriceGatePresentedKey(): string
{
    $header = trim((string)($_SERVER['HTTP_X_CSPRICE_KEY'] ?? ''));
    if ($header !== '') {
        return $header;
    }
    $post = is_array($_POST) ? trim((string)($_POST['access_key'] ?? '')) : '';
    if ($post !== '') {
        return $post;
    }
    return trim((string)($_GET['access_key'] ?? ''));
}

/**
 * @return array{allowed:bool, device:?array, reason:string}
 */
function cspriceGateEvaluate(): array
{
    if (!cspriceGateEnabled()) {
        return ['allowed' => true, 'device' => null, 'reason' => 'gate_disabled'];
    }

    $config = cspriceGateConfig();

    // The master key opens the gate as well as the admin API. Deploy tooling
    // (deploy\upload_item_urls.ps1 -> extract_item_urls.php) runs from a
    // machine with no device cookie, and the alternative - listing more
    // scripts as public - would widen the hole instead of using the key we
    // already have. No cookie is issued for it.
    $adminKey = trim((string)($config['admin_key'] ?? ''));
    if ($adminKey !== '') {
        $presentedAdmin = trim((string)(
            $_SERVER['HTTP_X_CSPRICE_ADMIN']
            ?? $_POST['admin_key']
            ?? $_GET['admin_key']
            ?? ''
        ));
        if ($presentedAdmin !== '' && hash_equals($adminKey, $presentedAdmin)) {
            return ['allowed' => true, 'device' => null, 'reason' => 'admin_key'];
        }
    }

    $allowIps = array_filter(array_map('trim', (array)($config['allow_ips'] ?? [])));
    if ($allowIps && in_array(cspriceGateClientIp(), $allowIps, true)) {
        return ['allowed' => true, 'device' => null, 'reason' => 'ip_allowed'];
    }

    $cookie = (string)($_COOKIE[CSPRICE_GATE_COOKIE] ?? '');
    if ($cookie !== '') {
        $deviceId = cspriceGateVerifyCookie($cookie);
        if ($deviceId !== null) {
            cspriceGateTouchDevice($deviceId);
            return ['allowed' => true, 'device' => cspriceGateFindDeviceById($deviceId), 'reason' => 'cookie'];
        }
        // Revoked or expired: drop it so the browser stops sending it.
        cspriceGateClearCookie();
    }

    $key = cspriceGatePresentedKey();
    if ($key !== '') {
        $device = cspriceGateFindDeviceByKey($key);
        if ($device !== null) {
            cspriceGateIssueCookie((string)$device['id']);
            cspriceGateTouchDevice((string)$device['id']);
            return ['allowed' => true, 'device' => $device, 'reason' => 'key'];
        }
        return ['allowed' => false, 'device' => null, 'reason' => 'bad_key'];
    }

    return ['allowed' => false, 'device' => null, 'reason' => 'no_device'];
}

function cspriceGateCurrentScript(): string
{
    $name = (string)($_SERVER['SCRIPT_NAME'] ?? $_SERVER['PHP_SELF'] ?? '');
    return strtolower(basename($name));
}

function cspriceGateWantsHtml(): bool
{
    $accept = strtolower((string)($_SERVER['HTTP_ACCEPT'] ?? ''));
    if ($accept !== '' && str_contains($accept, 'text/html')) {
        return true;
    }
    // A bare curl with no Accept header on item_page.php is still a page view.
    return $accept === '' && cspriceGateCurrentScript() === 'item_page.php';
}

function cspriceGateDeny(string $reason): never
{
    header('Cache-Control: no-store, private');
    header('X-Robots-Tag: noindex, nofollow');

    if (cspriceGateWantsHtml()) {
        $from = (string)($_SERVER['REQUEST_URI'] ?? '/');
        http_response_code(302);
        header('Location: /gate.php?from=' . rawurlencode($from));
        exit;
    }

    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'access_denied',
        'gate' => 'csprice',
        'reason' => $reason,
        'unlock_url' => '/gate.php',
    ]);
    exit;
}

// ---------------------------------------------------------------------- run
if (!in_array(cspriceGateCurrentScript(), CSPRICE_GATE_PUBLIC_SCRIPTS, true)) {
    $verdict = cspriceGateEvaluate();
    if (!$verdict['allowed']) {
        cspriceGateDeny((string)$verdict['reason']);
    }
}
