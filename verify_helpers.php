<?php
declare(strict_types=1);
/**
 * Email confirmation: issuing tokens and sending the message.
 *
 * GATING
 * ------
 * VERIFY_REQUIRED = false is "soft": people sign in straight away and the
 * profile panel nags until they confirm. Flip it to true for "hard" - sign-in
 * then fails until the address is confirmed.
 *
 * Soft is the default on purpose. Mail from a domain without DKIM and SPF gets
 * filtered aggressively, and with hard gating a message that lands in spam is
 * an account nobody can ever get into. Turn it on once you have seen the mail
 * arrive reliably.
 */

require_once __DIR__ . '/steam_auth_helpers.php';

const VERIFY_REQUIRED = false;
const VERIFY_TOKEN_TTL_HOURS = 24;
const VERIFY_RESEND_SECONDS = 300;   // one message per five minutes

/** The site's name for the host that is sending: TFPRICE on tf2price.eu, else CSPRICE. */
function verifySiteName(): string
{
    return str_contains(strtolower((string)($_SERVER['HTTP_HOST'] ?? '')), 'tf2price') ? 'TFPRICE' : 'CSPRICE';
}

/**
 * Sender address. Override with a 'mail' => ['from' => ...] config section.
 * The host's mail wrapper only accepts a From on the domain the script runs
 * on (Český hosting, "PHP skripty"), so tf2price.eu sends as
 * enquiries@tf2price.eu and csprice.eu as enquiries@csprice.eu.
 */
function verifyMailFrom(): string
{
    $config = function_exists('appConfig') ? appConfig() : [];
    $from = trim((string)($config['mail']['from'] ?? ''));
    if ($from !== '') {
        return $from;
    }
    return verifySiteName() === 'TFPRICE' ? 'enquiries@tf2price.eu' : 'enquiries@csprice.eu';
}

function verifyMailFromName(): string
{
    $config = function_exists('appConfig') ? appConfig() : [];
    $name = trim((string)($config['mail']['from_name'] ?? ''));
    return $name !== '' ? $name : verifySiteName();
}

/**
 * Hands a composed message to mail() the way this host's wrapper wants it:
 * header lines and body lines separated by LF (CRLF is rejected or doubled,
 * per the hosting's PHP notes), a Return-Path matching the envelope sender,
 * and "CSPRICE" rebranded for the TF2 host. Returns mail()'s own verdict.
 */
function verifyDeliverMail(string $to, string $subject, string $body, string $headers, string $from): bool
{
    $site = verifySiteName();
    if ($site !== 'CSPRICE') {
        $subject = str_replace('CSPRICE', $site, $subject);
        $body = str_replace('CSPRICE', $site, $body);
    }
    $headers = str_replace("\r\n", "\n", $headers);
    if (stripos($headers, 'Return-Path:') === false) {
        $headers .= "\nReturn-Path: <" . $from . '>';
    }
    $body = str_replace("\r\n", "\n", $body);
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    return (bool)@mail($to, $encodedSubject, $body, $headers, '-f' . $from);
}

/**
 * Creates a fresh token for a user and stores only its hash.
 *
 * @return string the raw token, which is never persisted anywhere
 */
function verifyIssueToken(PDO $pdo, int $userId): string
{
    $raw = bin2hex(random_bytes(32));
    $pdo->prepare(
        'UPDATE users SET verify_token_hash = ?, verify_sent_at = NOW() WHERE id = ?'
    )->execute([hash('sha256', $raw), $userId]);

    return $raw;
}

/** True when the last message went out too recently to send another. */
function verifyResendTooSoon(?string $sentAt): bool
{
    if ($sentAt === null || $sentAt === '') {
        return false;
    }
    $stamp = strtotime($sentAt);
    return $stamp !== false && (time() - $stamp) < VERIFY_RESEND_SECONDS;
}

function verifyLinkFor(string $rawToken): string
{
    return absoluteAppUrl('verify.php?token=' . urlencode($rawToken));
}

/**
 * Sends the confirmation message. Returns false when the MTA refuses it, so
 * the caller can tell the visitor rather than claiming a mail was sent.
 */
function verifySendEmail(string $to, string $displayName, string $rawToken): bool
{
    $link = verifyLinkFor($rawToken);
    $name = $displayName !== '' ? $displayName : 'there';
    $from = verifyMailFrom();
    $fromName = verifyMailFromName();
    $hours = VERIFY_TOKEN_TTL_HOURS;

    $subject = 'Confirm your CSPRICE email address';

    $text = "Hi $name,\n\n"
        . "Confirm this address to finish setting up your CSPRICE account:\n\n"
        . "$link\n\n"
        . "The link works for $hours hours. If you did not create an account, "
        . "ignore this message - nothing happens until the link is opened.\n\n"
        . "- CSPRICE\n";

    $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
    $safeLink = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');
    $html = '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#0b1120;'
        . 'font-family:Arial,Helvetica,sans-serif;color:#e2e8f0">'
        . '<div style="max-width:520px;margin:0 auto;background:#0f172a;border-radius:16px;'
        . 'border:1px solid rgba(100,120,160,0.22);padding:28px">'
        . '<h1 style="margin:0 0 16px;font-size:22px;color:#f8fafc">Confirm your email</h1>'
        . '<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#cbd5e1">Hi '
        . $safeName . ', confirm this address to finish setting up your CSPRICE account.</p>'
        . '<p style="margin:0 0 24px"><a href="' . $safeLink . '" '
        . 'style="display:inline-block;padding:12px 22px;border-radius:12px;background:#4b69ff;'
        . 'color:#fff;font-weight:700;text-decoration:none">Confirm email</a></p>'
        . '<p style="margin:0 0 8px;font-size:13px;color:#94a3b8">Or paste this into your browser:</p>'
        . '<p style="margin:0 0 20px;font-size:13px;word-break:break-all;color:#94a3b8">'
        . $safeLink . '</p>'
        . '<p style="margin:0;font-size:13px;color:#64748b">The link works for ' . $hours
        . ' hours. If you did not create an account, ignore this message.</p>'
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

    // -f sets the envelope sender, which is what SPF is checked against. On a
    // shared host this is usually required for the message to pass at all.
    $sent = verifyDeliverMail($to, $subject, $body, $headers, $from);
    if (!$sent) {
        error_log('verify: mail() refused the message for ' . $to);
    }

    return (bool)$sent;
}
