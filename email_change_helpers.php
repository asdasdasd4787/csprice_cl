<?php
declare(strict_types=1);
/**
 * Changing the email address on an account, with confirmation.
 *
 * The new address is not written to users.email until a link sent to that
 * address is opened (verify_email_change.php). Until then it waits in
 * users.pending_email with the SHA-256 of the one-time token and the time the
 * message went out, so the profile can show "confirmation sent", resend it,
 * or cancel it. The old address keeps working the whole time.
 *
 * Columns are added on first use (the site's DB user may ALTER); the same
 * statement is in profile_schema.sql for running by hand.
 */

require_once __DIR__ . '/verify_helpers.php';

const EMAIL_CHANGE_TOKEN_TTL_HOURS = 24;
const EMAIL_CHANGE_RESEND_SECONDS = 300;

function emailChangeColumnsExist(PDO $pdo): bool
{
    static $known = null;
    if ($known !== null) {
        return $known;
    }
    try {
        $known = dbColumnExists($pdo, 'users', 'pending_email')
            && dbColumnExists($pdo, 'users', 'pending_email_token_hash')
            && dbColumnExists($pdo, 'users', 'pending_email_sent_at');
    } catch (Throwable) {
        $known = false;
    }
    return $known;
}

function emailChangeColumnsEnsure(PDO $pdo): bool
{
    if (emailChangeColumnsExist($pdo)) {
        return true;
    }
    foreach ([
        ['pending_email', 'VARCHAR(190) NULL'],
        ['pending_email_token_hash', 'CHAR(64) NULL'],
        ['pending_email_sent_at', 'DATETIME NULL'],
    ] as [$column, $definition]) {
        try {
            if (!dbColumnExists($pdo, 'users', $column)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN $column $definition");
            }
        } catch (Throwable $exception) {
            error_log('email_change: could not add users.' . $column . ' - ' . $exception->getMessage());
            return false;
        }
    }
    try {
        return dbColumnExists($pdo, 'users', 'pending_email')
            && dbColumnExists($pdo, 'users', 'pending_email_token_hash')
            && dbColumnExists($pdo, 'users', 'pending_email_sent_at');
    } catch (Throwable) {
        return false;
    }
}

/** Lower-cased, trimmed, validated address or "" when it is not one. */
function emailChangeNormalize(string $raw): string
{
    $email = strtolower(trim($raw));
    if ($email === '' || strlen($email) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return '';
    }
    return $email;
}

/** True when another account already signs in with this address. */
function emailChangeTaken(PDO $pdo, string $email, int $exceptUserId): bool
{
    $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1');
    $stmt->execute([$email, $exceptUserId]);
    return $stmt->fetchColumn() !== false;
}

function emailChangeResendTooSoon(?string $sentAt): bool
{
    if ($sentAt === null || $sentAt === '') {
        return false;
    }
    $stamp = strtotime($sentAt);
    return $stamp !== false && (time() - $stamp) < EMAIL_CHANGE_RESEND_SECONDS;
}

/**
 * Stores the pending address with a fresh token and returns the raw token.
 */
function emailChangeIssue(PDO $pdo, int $userId, string $newEmail): string
{
    $raw = bin2hex(random_bytes(32));
    $pdo->prepare(
        'UPDATE users
            SET pending_email = ?, pending_email_token_hash = ?, pending_email_sent_at = NOW()
          WHERE id = ?'
    )->execute([$newEmail, hash('sha256', $raw), $userId]);
    return $raw;
}

function emailChangeClear(PDO $pdo, int $userId): void
{
    $pdo->prepare(
        'UPDATE users
            SET pending_email = NULL, pending_email_token_hash = NULL, pending_email_sent_at = NULL
          WHERE id = ?'
    )->execute([$userId]);
}

function emailChangeLinkFor(string $rawToken): string
{
    return absoluteAppUrl('verify_email_change.php?token=' . urlencode($rawToken));
}

/**
 * The confirmation message, sent to the NEW address. Returns false when the
 * MTA refuses it so the caller can say so instead of claiming it went out.
 */
function emailChangeSendMail(string $to, string $displayName, string $rawToken, string $oldEmail): bool
{
    $link = emailChangeLinkFor($rawToken);
    $name = $displayName !== '' ? $displayName : 'there';
    $from = verifyMailFrom();
    $fromName = verifyMailFromName();
    $hours = EMAIL_CHANGE_TOKEN_TTL_HOURS;
    $oldNote = $oldEmail !== '' ? " (currently $oldEmail)" : '';

    $subject = 'Confirm your new CSPRICE email address';

    $text = "Hi $name,\n\n"
        . "You asked to change the email address on your CSPRICE account$oldNote to this one. "
        . "Open the link to confirm:\n\n"
        . "$link\n\n"
        . "The link works for $hours hours. If you did not ask for this, ignore this message - "
        . "the address on the account stays as it is until the link is opened.\n\n"
        . "- CSPRICE\n";

    $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
    $safeLink = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');
    $safeOld = htmlspecialchars($oldNote, ENT_QUOTES, 'UTF-8');
    $html = '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#0b1120;'
        . 'font-family:Arial,Helvetica,sans-serif;color:#e2e8f0">'
        . '<div style="max-width:520px;margin:0 auto;background:#0f172a;border-radius:16px;'
        . 'border:1px solid rgba(100,120,160,0.22);padding:28px">'
        . '<h1 style="margin:0 0 16px;font-size:22px;color:#f8fafc">Confirm your new email</h1>'
        . '<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#cbd5e1">Hi '
        . $safeName . ', you asked to change the email address on your CSPRICE account' . $safeOld
        . ' to this one. Confirm to make the switch.</p>'
        . '<p style="margin:0 0 24px"><a href="' . $safeLink . '" '
        . 'style="display:inline-block;padding:12px 22px;border-radius:12px;background:#4b69ff;'
        . 'color:#fff;font-weight:700;text-decoration:none">Confirm new email</a></p>'
        . '<p style="margin:0 0 8px;font-size:13px;color:#94a3b8">Or paste this into your browser:</p>'
        . '<p style="margin:0 0 20px;font-size:13px;word-break:break-all;color:#94a3b8">'
        . $safeLink . '</p>'
        . '<p style="margin:0;font-size:13px;color:#64748b">The link works for ' . $hours
        . ' hours. If you did not ask for this, ignore this message; the address on the account '
        . 'stays as it is.</p>'
        . '</div></body></html>';

    $boundary = 'cspx' . bin2hex(random_bytes(12));
    $headers = implode("\r\n", [
        'From: ' . sprintf('=?UTF-8?B?%s?= <%s>', base64_encode($fromName), $from),
        'Reply-To: ' . $from,
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        'X-Mailer: CSPRICE',
    ]);
    $body = "--$boundary\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n"
        . "Content-Transfer-Encoding: 8bit\r\n\r\n"
        . $text . "\r\n"
        . "--$boundary\r\n"
        . "Content-Type: text/html; charset=UTF-8\r\n"
        . "Content-Transfer-Encoding: 8bit\r\n\r\n"
        . $html . "\r\n"
        . "--$boundary--\r\n";
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';

    $sent = verifyDeliverMail($to, $subject, $body, $headers, $from);
    if (!$sent) {
        error_log('email_change: mail() refused the message for ' . $to);
    }
    return (bool)$sent;
}
