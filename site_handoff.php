<?php
declare(strict_types=1);

/**
 * Carries a sign-in from csprice.eu to tf2price.eu (or back) when the visitor
 * switches games with the navbar's game switcher - and only then. Sessions are
 * per host (a cookie for csprice.eu is never sent to tf2price.eu), so the
 * switcher goes through here instead of linking straight across:
 *
 *   site_handoff.php?to=<absolute URL on the other host>     issuing side
 *       Signed in: stores the session user under a one-time token in the
 *       shared accounts database (90 s) and redirects to the other host's
 *       site_handoff.php with it. Signed out: plain redirect to `to`.
 *   site_handoff.php?t=<token>&to=<path on this host>        receiving side
 *       Redeems the token (once), starts the same session here, redirects
 *       to `to`.
 *
 * The token is never logged and the row is deleted on first use, expired or
 * not. Only the two site hosts are accepted on either side.
 * (user, 2026-09-30: "if he logs in on csprice with an email account, the same
 * account transfers to tf2price - but only if he redirects through that button")
 */

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/oauth_auth_helpers.php';

const HANDOFF_TTL_SECONDS = 90;
const HANDOFF_HOSTS = ['csprice.eu', 'tf2price.eu'];

function handoffHostAllowed(string $host): bool
{
    $host = strtolower(trim($host));
    foreach (HANDOFF_HOSTS as $allowed) {
        if ($host === $allowed || str_ends_with($host, '.' . $allowed)) {
            return true;
        }
    }
    return false;
}

function handoffRedirect(string $url): never
{
    header('Cache-Control: no-store');
    header('Location: ' . $url, true, 302);
    exit;
}

function handoffPdo(): PDO
{
    $pdo = dbPdoConnection('accounts_db', 'db');
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS site_handoffs ('
        . 'token_hash VARCHAR(64) NOT NULL PRIMARY KEY, '
        . 'payload TEXT NOT NULL, '
        . 'expires_at BIGINT NOT NULL)'
    );
    return $pdo;
}

$token = trim((string)($_GET['t'] ?? ''));
$to = trim((string)($_GET['to'] ?? ''));
$thisHost = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));

if ($token === '') {
    // ---- issuing side --------------------------------------------------
    $target = is_string($to) ? parse_url($to) : false;
    $targetHost = strtolower((string)($target['host'] ?? ''));
    if (
        !is_array($target)
        || strtolower((string)($target['scheme'] ?? '')) !== 'https'
        || !handoffHostAllowed($targetHost)
        || $targetHost === $thisHost
    ) {
        handoffRedirect(absoluteAppUrl(''));
    }

    ensureSessionStarted();
    $slot = is_array($_SESSION['steam_user'] ?? null) ? 'steam_user'
        : (is_array($_SESSION['auth_user'] ?? null) ? 'auth_user' : '');
    if ($slot === '') {
        handoffRedirect($to);
    }

    $path = (string)($target['path'] ?? '/');
    if ($path === '' || $path[0] !== '/') {
        $path = '/' . $path;
    }
    if (isset($target['query']) && $target['query'] !== '') {
        $path .= '?' . $target['query'];
    }

    $raw = bin2hex(random_bytes(32));
    try {
        $pdo = handoffPdo();
        $pdo->prepare('DELETE FROM site_handoffs WHERE expires_at < ?')->execute([time()]);
        $pdo->prepare('INSERT INTO site_handoffs (token_hash, payload, expires_at) VALUES (?, ?, ?)')
            ->execute([
                hash('sha256', $raw),
                json_encode(['slot' => $slot, 'user' => $_SESSION[$slot]], JSON_UNESCAPED_UNICODE),
                time() + HANDOFF_TTL_SECONDS,
            ]);
    } catch (Throwable $exception) {
        error_log('site_handoff: could not store token - ' . $exception->getMessage());
        handoffRedirect($to);
    }

    handoffRedirect('https://' . $targetHost . '/site_handoff.php?t=' . $raw . '&to=' . rawurlencode($path));
}

// ---- receiving side ------------------------------------------------------
$path = ($to !== '' && $to[0] === '/' && !str_starts_with($to, '//')) ? $to : '/';

try {
    $pdo = handoffPdo();
    $hash = hash('sha256', $token);
    $select = $pdo->prepare('SELECT payload, expires_at FROM site_handoffs WHERE token_hash = ?');
    $select->execute([$hash]);
    $row = $select->fetch(PDO::FETCH_ASSOC);
    // One use only, whatever the outcome.
    $pdo->prepare('DELETE FROM site_handoffs WHERE token_hash = ?')->execute([$hash]);

    if (is_array($row) && (int)$row['expires_at'] >= time()) {
        $payload = json_decode((string)$row['payload'], true);
        $slot = (string)($payload['slot'] ?? '');
        $user = $payload['user'] ?? null;
        if (is_array($user) && in_array($slot, ['steam_user', 'auth_user'], true)) {
            ensureSessionStarted();
            session_regenerate_id(true);
            if ($slot === 'steam_user') {
                storeSteamSessionUser($user);
            } else {
                storeOAuthSessionUser($user);
            }
        }
    }
} catch (Throwable $exception) {
    error_log('site_handoff: could not redeem token - ' . $exception->getMessage());
}

handoffRedirect(absoluteAppUrl(ltrim($path, '/')));
