<?php
declare(strict_types=1);
/**
 * Consumes a confirmation link: verify.php?token=<raw token>
 *
 * Redirects to the profile panel with a result flag rather than rendering a
 * page of its own, so the outcome is shown in the site's own UI.
 *
 * The token is matched by its SHA-256, because only the hash was stored. It is
 * cleared on success, which makes the link single-use.
 */

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/verify_helpers.php';
require_once __DIR__ . '/profile_helpers.php';

function verifyFinish(string $status): never
{
    header('Location: ' . absoluteAppUrl('index.html?panel=profile&verify=' . $status), true, 302);
    exit;
}

$raw = trim((string)($_GET['token'] ?? ''));
if ($raw === '' || !preg_match('/^[a-f0-9]{64}$/', $raw)) {
    verifyFinish('invalid');
}

try {
    $pdo = dbPdoConnection('accounts_db', 'db');

    $stmt = $pdo->prepare(
        'SELECT id, email, email_verified_at, verify_sent_at
           FROM users WHERE verify_token_hash = ? LIMIT 1'
    );
    $stmt->execute([hash('sha256', $raw)]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!is_array($row)) {
        // Either never valid, or already used - the token is cleared on
        // success, so a second click on the same link lands here.
        verifyFinish('invalid');
    }

    if (($row['email_verified_at'] ?? null) !== null) {
        verifyFinish('already');
    }

    $sentAt = (string)($row['verify_sent_at'] ?? '');
    $sentStamp = $sentAt !== '' ? strtotime($sentAt) : false;
    if ($sentStamp === false || (time() - $sentStamp) > VERIFY_TOKEN_TTL_HOURS * 3600) {
        verifyFinish('expired');
    }

    $pdo->prepare(
        'UPDATE users
            SET email_verified_at = NOW(), verify_token_hash = NULL
          WHERE id = ?'
    )->execute([(int)$row['id']]);

    // If this is the signed-in visitor, refresh their session so the UI stops
    // showing the unconfirmed notice without needing a re-login.
    $sessionUser = steamSessionUser();
    if (profileUserIdFromSession($sessionUser) === (int)$row['id']) {
        profileRefreshSession(profileLoad($pdo, (int)$row['id']));
    }
} catch (Throwable $exception) {
    error_log('verify.php: ' . $exception->getMessage());
    verifyFinish('error');
}

verifyFinish('ok');
