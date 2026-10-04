<?php
declare(strict_types=1);
/**
 * Consumes an email-change link: verify_email_change.php?token=<raw token>
 *
 * Moves users.pending_email into users.email, marks it confirmed and clears
 * the token, then lands on the profile panel with a result flag:
 *   ok | invalid | expired | taken | error
 */

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/email_change_helpers.php';
require_once __DIR__ . '/profile_helpers.php';

function emailChangeFinish(string $status): never
{
    header('Location: ' . absoluteAppUrl('index.html?panel=profile&email=' . $status), true, 302);
    exit;
}

$raw = trim((string)($_GET['token'] ?? ''));
if ($raw === '' || !preg_match('/^[a-f0-9]{64}$/', $raw)) {
    emailChangeFinish('invalid');
}

try {
    $pdo = dbPdoConnection('accounts_db', 'db');
    if (!emailChangeColumnsExist($pdo)) {
        emailChangeFinish('invalid');
    }

    $stmt = $pdo->prepare(
        'SELECT id, email, pending_email, pending_email_sent_at
           FROM users WHERE pending_email_token_hash = ? LIMIT 1'
    );
    $stmt->execute([hash('sha256', $raw)]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!is_array($row) || (string)($row['pending_email'] ?? '') === '') {
        emailChangeFinish('invalid');
    }

    $sentAt = (string)($row['pending_email_sent_at'] ?? '');
    $sentStamp = $sentAt !== '' ? strtotime($sentAt) : false;
    if ($sentStamp === false || (time() - $sentStamp) > EMAIL_CHANGE_TOKEN_TTL_HOURS * 3600) {
        emailChangeClear($pdo, (int)$row['id']);
        emailChangeFinish('expired');
    }

    $newEmail = (string)$row['pending_email'];
    if (emailChangeTaken($pdo, $newEmail, (int)$row['id'])) {
        emailChangeClear($pdo, (int)$row['id']);
        emailChangeFinish('taken');
    }

    try {
        $pdo->prepare(
            'UPDATE users
                SET email = ?, email_verified_at = NOW(), verify_token_hash = NULL,
                    pending_email = NULL, pending_email_token_hash = NULL, pending_email_sent_at = NULL
              WHERE id = ?'
        )->execute([$newEmail, (int)$row['id']]);
    } catch (PDOException $exception) {
        // uniq_email lost a race with another signup for the same address.
        if (($exception->errorInfo[0] ?? '') === '23000') {
            emailChangeClear($pdo, (int)$row['id']);
            emailChangeFinish('taken');
        }
        throw $exception;
    }

    // The signed-in visitor sees the new address at once, no re-login needed.
    $sessionUser = steamSessionUser();
    if (profileUserIdFromSession($sessionUser) === (int)$row['id']) {
        profileRefreshSession(profileLoad($pdo, (int)$row['id']));
    }
} catch (Throwable $exception) {
    error_log('verify_email_change.php: ' . $exception->getMessage());
    emailChangeFinish('error');
}

emailChangeFinish('ok');
