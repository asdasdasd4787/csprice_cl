<?php
declare(strict_types=1);
/**
 * Email + password accounts.
 * =============================================================================
 *   POST auth_email.php  action=signup|signin|logout & email & password
 *
 * On success the user is written to $_SESSION['auth_user'] through
 * storeOAuthSessionUser(), the same slot Google and Discord use, so
 * get_steam_session.php and every logged-in part of the UI pick it up with no
 * further changes.
 *
 * Reads the 'db' section of config.local.php (MariaDB on 127.0.0.1). That is a
 * different database from 'market_data_db', which is the Supabase Postgres
 * holding price history - do not point this at that one.
 *
 * Schema: see users_table.sql next to this file.
 */

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/oauth_auth_helpers.php';
require_once __DIR__ . '/verify_helpers.php';

const AUTH_EMAIL_MIN_PASSWORD = 10;
const AUTH_EMAIL_MAX_FAILURES = 5;
const AUTH_EMAIL_LOCKOUT_SECONDS = 900;

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    respondJson(['ok' => false, 'error' => 'POST required.'], 405);
}

$action = strtolower(trim((string)($_POST['action'] ?? '')));

if ($action === 'logout') {
    clearSteamSessionUser();
    respondJson(['ok' => true]);
}

if ($action !== 'signup' && $action !== 'signin') {
    respondJson(['ok' => false, 'error' => 'Unknown action.'], 400);
}

$email = strtolower(trim((string)($_POST['email'] ?? '')));
$password = (string)($_POST['password'] ?? '');

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
    respondJson(['ok' => false, 'error' => 'Enter a valid email address.'], 422);
}
if (strlen($password) < AUTH_EMAIL_MIN_PASSWORD) {
    respondJson([
        'ok' => false,
        'error' => 'Use at least ' . AUTH_EMAIL_MIN_PASSWORD . ' characters.',
    ], 422);
}
// password_hash() silently truncates past 72 bytes with bcrypt; reject instead
// of quietly accepting a password whose tail does not matter.
if (strlen($password) > 72) {
    respondJson(['ok' => false, 'error' => 'Password is too long (72 characters max).'], 422);
}

ensureSessionStarted();

/**
 * Failure counter, per email, in the caller's own session. Enough to stop a
 * browser grinding one account; it is not a global limiter, because a shared
 * host gives us nowhere cheap to keep one.
 */
$throttleKey = 'auth_email_fails_' . hash('sha256', $email);
$fails = is_array($_SESSION[$throttleKey] ?? null)
    ? $_SESSION[$throttleKey]
    : ['count' => 0, 'at' => 0];

if (
    (int)$fails['count'] >= AUTH_EMAIL_MAX_FAILURES
    && (time() - (int)$fails['at']) < AUTH_EMAIL_LOCKOUT_SECONDS
) {
    respondJson(['ok' => false, 'error' => 'Too many attempts. Try again in 15 minutes.'], 429);
}

try {
    $pdo = dbPdoConnection('accounts_db', 'db');
} catch (Throwable $exception) {
    error_log('auth_email: database unavailable - ' . $exception->getMessage());
    respondJson(['ok' => false, 'error' => 'Accounts are temporarily unavailable.'], 503);
}

$registerFailure = static function () use (&$fails, $throttleKey): void {
    $_SESSION[$throttleKey] = ['count' => (int)$fails['count'] + 1, 'at' => time()];
};

try {
    $avatarUrl = '';
    $steamId = '';
    $verificationSent = false;

    if ($action === 'signup') {
        $displayName = substr(explode('@', $email)[0], 0, 80);

        try {
            $userId = dbInsertReturningId(
                $pdo,
                'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)',
                [$email, password_hash($password, PASSWORD_DEFAULT), $displayName]
            );
        } catch (PDOException $exception) {
            // 23000 (MySQL) / 23505 (Postgres) is the unique-key violation on
            // uniq_email. The database decides this, not a SELECT first, so
            // two simultaneous signups cannot both succeed.
            if (in_array((string)($exception->errorInfo[0] ?? ''), ['23000', '23505'], true)) {
                respondJson(['ok' => false, 'error' => 'That email is already registered.'], 409);
            }
            throw $exception;
        }

        // Confirmation mail. A failure here is not a failed signup - the
        // account exists either way - so it is reported separately and the
        // profile panel offers a resend.
        $verificationSent = verifySendEmail(
            $email,
            $displayName,
            verifyIssueToken($pdo, $userId)
        );
    } else {
        $select = $pdo->prepare(
            'SELECT id, password_hash, display_name, avatar_url, steam_id, email_verified_at
               FROM users WHERE email = ? LIMIT 1'
        );
        $select->execute([$email]);
        $row = $select->fetch(PDO::FETCH_ASSOC);

        // Hash even when the row is missing, so a wrong email and a wrong
        // password take the same time and cannot be told apart by timing.
        $hash = is_array($row) ? (string)$row['password_hash'] : '$2y$10$'
            . str_repeat('x', 53);

        if (!password_verify($password, $hash) || !is_array($row)) {
            $registerFailure();
            respondJson(['ok' => false, 'error' => 'Email or password is incorrect.'], 401);
        }

        if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
            $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                ->execute([password_hash($password, PASSWORD_DEFAULT), (int)$row['id']]);
        }

        $userId = (int)$row['id'];
        $displayName = (string)$row['display_name'] !== ''
            ? (string)$row['display_name']
            : substr(explode('@', $email)[0], 0, 80);
        $avatarUrl = (string)($row['avatar_url'] ?? '');
        // A picture still stored as a file on one host moves into the shared
        // database at sign-in, so this host's navbar shows it too.
        if (str_starts_with($avatarUrl, 'assets/avatars/')) {
            require_once __DIR__ . '/profile_helpers.php';
            $moved = profileMigrateAvatarToDb($pdo, $userId, $avatarUrl);
            if ($moved !== '') {
                $avatarUrl = $moved;
            }
        }
        $steamId = (string)($row['steam_id'] ?? '');

        // Hard gating only (VERIFY_REQUIRED). Under the soft default an
        // unconfirmed account signs in normally and is nagged in the profile.
        if (VERIFY_REQUIRED && ($row['email_verified_at'] ?? null) === null) {
            respondJson([
                'ok' => false,
                'error' => 'Confirm your email address first. Check your inbox for the link.',
                'needs_verification' => true,
            ], 403);
        }

        $pdo->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')->execute([$userId]);
    }
} catch (Throwable $exception) {
    error_log('auth_email: ' . $exception->getMessage());
    respondJson(['ok' => false, 'error' => 'Something went wrong. Try again.'], 500);
}

unset($_SESSION[$throttleKey]);
// New session id on privilege change, so a session id captured before login
// cannot be reused after it.
session_regenerate_id(true);

storeOAuthSessionUser([
    'provider' => 'email',
    'id' => (string)$userId,
    'email' => $email,
    'display_name' => $displayName,
    // Empty on a fresh signup; set on sign-in so the navbar shows the saved
    // avatar and the profile panel knows Steam is already connected.
    'avatar' => $avatarUrl ?? '',
    'steamid' => $steamId ?? '',
]);

respondJson([
    'ok' => true,
    'user' => steamSessionUser(),
    // Signup only. false means the account was created but the MTA refused the
    // message, which the caller should say out loud rather than leave the
    // visitor waiting for mail that is not coming.
    'verification_sent' => $action === 'signup' ? $verificationSent : null,
]);
