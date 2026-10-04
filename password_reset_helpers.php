<?php
declare(strict_types=1);
/**
 * Password change by email confirmation.
 *
 * The profile page asks for a reset link (profile_api.php action
 * password_reset_request); the message goes to the account's confirmed
 * address and carries a one-time token whose SHA-256 sits in
 * users.reset_token_hash with users.reset_sent_at. reset_password.php checks
 * the token, takes the new password and clears the token. Nothing about the
 * current password is needed, because opening the link proves the mailbox.
 *
 * Columns are added on first use; the statement is in profile_schema.sql too.
 */

require_once __DIR__ . '/verify_helpers.php';

const PASSWORD_RESET_TOKEN_TTL_HOURS = 2;
const PASSWORD_RESET_RESEND_SECONDS = 300;
const PASSWORD_RESET_MIN_LENGTH = 10;

function passwordResetColumnsExist(PDO $pdo): bool
{
    static $known = null;
    if ($known !== null) {
        return $known;
    }
    try {
        $known = dbColumnExists($pdo, 'users', 'reset_token_hash')
            && dbColumnExists($pdo, 'users', 'reset_sent_at');
    } catch (Throwable) {
        $known = false;
    }
    return $known;
}

function passwordResetColumnsEnsure(PDO $pdo): bool
{
    if (passwordResetColumnsExist($pdo)) {
        return true;
    }
    foreach ([
        ['reset_token_hash', 'CHAR(64) NULL'],
        ['reset_sent_at', 'DATETIME NULL'],
    ] as [$column, $definition]) {
        try {
            if (!dbColumnExists($pdo, 'users', $column)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN $column $definition");
            }
        } catch (Throwable $exception) {
            error_log('password_reset: could not add users.' . $column . ' - ' . $exception->getMessage());
            return false;
        }
    }
    try {
        return dbColumnExists($pdo, 'users', 'reset_token_hash')
            && dbColumnExists($pdo, 'users', 'reset_sent_at');
    } catch (Throwable) {
        return false;
    }
}

function passwordResetResendTooSoon(?string $sentAt): bool
{
    if ($sentAt === null || $sentAt === '') {
        return false;
    }
    $stamp = strtotime($sentAt);
    return $stamp !== false && (time() - $stamp) < PASSWORD_RESET_RESEND_SECONDS;
}

/** Stores a fresh token's hash and returns the raw token. */
function passwordResetIssue(PDO $pdo, int $userId): string
{
    $raw = bin2hex(random_bytes(32));
    $pdo->prepare('UPDATE users SET reset_token_hash = ?, reset_sent_at = NOW() WHERE id = ?')
        ->execute([hash('sha256', $raw), $userId]);
    return $raw;
}

function passwordResetClear(PDO $pdo, int $userId): void
{
    $pdo->prepare('UPDATE users SET reset_token_hash = NULL, reset_sent_at = NULL WHERE id = ?')
        ->execute([$userId]);
}

function passwordResetLinkFor(string $rawToken): string
{
    return absoluteAppUrl('reset_password.php?token=' . urlencode($rawToken));
}

/** "" when the password is acceptable, else the reason. */
function passwordResetProblem(string $password, string $confirm): string
{
    if (strlen($password) < PASSWORD_RESET_MIN_LENGTH) {
        return 'Use at least ' . PASSWORD_RESET_MIN_LENGTH . ' characters.';
    }
    if (strlen($password) > 72) {
        return 'Password is too long (72 characters max).';
    }
    if ($password !== $confirm) {
        return 'Those passwords do not match.';
    }
    return '';
}

function passwordResetSendMail(string $to, string $displayName, string $rawToken): bool
{
    $link = passwordResetLinkFor($rawToken);
    $name = $displayName !== '' ? $displayName : 'there';
    $from = verifyMailFrom();
    $fromName = verifyMailFromName();
    $hours = PASSWORD_RESET_TOKEN_TTL_HOURS;

    $subject = 'Change your CSPRICE password';

    $text = "Hi $name,\n\n"
        . "You asked to change the password on your CSPRICE account. Open the link to set a new one:\n\n"
        . "$link\n\n"
        . "The link works for $hours hours and can be used once. If you did not ask for this, "
        . "ignore this message - your password stays as it is.\n\n"
        . "- CSPRICE\n";

    $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
    $safeLink = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');
    $html = '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#0b1120;'
        . 'font-family:Arial,Helvetica,sans-serif;color:#e2e8f0">'
        . '<div style="max-width:520px;margin:0 auto;background:#0f172a;border-radius:16px;'
        . 'border:1px solid rgba(100,120,160,0.22);padding:28px">'
        . '<h1 style="margin:0 0 16px;font-size:22px;color:#f8fafc">Change your password</h1>'
        . '<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#cbd5e1">Hi '
        . $safeName . ', you asked to change the password on your CSPRICE account. '
        . 'Open the link to set a new one.</p>'
        . '<p style="margin:0 0 24px"><a href="' . $safeLink . '" '
        . 'style="display:inline-block;padding:12px 22px;border-radius:12px;background:#4b69ff;'
        . 'color:#fff;font-weight:700;text-decoration:none">Set a new password</a></p>'
        . '<p style="margin:0 0 8px;font-size:13px;color:#94a3b8">Or paste this into your browser:</p>'
        . '<p style="margin:0 0 20px;font-size:13px;word-break:break-all;color:#94a3b8">'
        . $safeLink . '</p>'
        . '<p style="margin:0;font-size:13px;color:#64748b">The link works for ' . $hours
        . ' hours and can be used once. If you did not ask for this, ignore this message; '
        . 'your password stays as it is.</p>'
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
        error_log('password_reset: mail() refused the message for ' . $to);
    }
    return (bool)$sent;
}
