<?php
declare(strict_types=1);
/**
 * Profile read / update for email accounts.
 * =============================================================================
 *   GET  profile_api.php                      -> the signed-in user's profile
 *   POST profile_api.php  action=save         & display_name
 *   POST profile_api.php  action=avatar       & avatar (multipart file)
 *   POST profile_api.php  action=avatar_clear
 *   POST profile_api.php  action=unlink_steam
 *
 * Steam LINKING is not here - that needs the OpenID round trip, so it lives in
 * steam_link.php and steam_auth_callback.php.
 *
 * Every write re-reads the row afterwards and refreshes the session copy, so
 * the navbar avatar and name update without the caller guessing what changed.
 */

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/oauth_auth_helpers.php';
require_once __DIR__ . '/profile_helpers.php';
require_once __DIR__ . '/verify_helpers.php';
require_once __DIR__ . '/ai_persona_helpers.php';
require_once __DIR__ . '/email_change_helpers.php';
require_once __DIR__ . '/password_reset_helpers.php';
require_once __DIR__ . '/discord_link_helpers.php';

$user = steamSessionUser();
if ($user === null) {
    respondJson(['ok' => false, 'error' => 'Not signed in.'], 401);
}

try {
    $pdo = dbPdoConnection('accounts_db', 'db');
} catch (Throwable $exception) {
    error_log('profile_api: database unavailable - ' . $exception->getMessage());
    respondJson(['ok' => false, 'error' => 'Profiles are temporarily unavailable.'], 503);
}

// The AI personality column is newer than the rest of the schema; add it on
// first use where the database user may (quiet where it may not).
aiPersonaColumnEnsure($pdo);
emailChangeColumnsEnsure($pdo);
passwordResetColumnsEnsure($pdo);
discordLinkColumnsEnsure($pdo);

// Creates the row on first visit for a Steam session, which has never had one.
try {
    $userId = profileResolveUserId($pdo, $user);
} catch (PDOException $exception) {
    if (($exception->errorInfo[0] ?? '') === '42S22' || ($exception->errorInfo[0] ?? '') === '23000') {
        respondJson([
            'ok' => false,
            'error' => 'The profile columns are missing. Run profile_schema.sql on the database.',
        ], 503);
    }
    error_log('profile_api resolve: ' . $exception->getMessage());
    respondJson(['ok' => false, 'error' => 'Could not open your profile.'], 500);
}

if ($userId <= 0) {
    respondJson(['ok' => false, 'error' => 'Not signed in.'], 401);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    try {
        $profile = profileLoad($pdo, $userId);
    } catch (PDOException $exception) {
        // 42S22 = unknown column. Almost always profile_schema.sql not run yet,
        // so say that rather than a generic failure.
        if (($exception->errorInfo[0] ?? '') === '42S22') {
            respondJson([
                'ok' => false,
                'error' => 'The profile columns are missing. Run profile_schema.sql on the database.',
            ], 503);
        }
        error_log('profile_api GET: ' . $exception->getMessage());
        respondJson(['ok' => false, 'error' => 'Could not read your profile.'], 500);
    }

    if (!$profile) {
        respondJson(['ok' => false, 'error' => 'Your account row was not found.'], 404);
    }

    // A file-based picture from before moves into the shared database here,
    // so the other host shows it as well.
    $storedAvatar = (string)($profile['avatar_url'] ?? '');
    if (str_starts_with($storedAvatar, PROFILE_AVATAR_DIR . '/') && profileMigrateAvatarToDb($pdo, $userId, $storedAvatar) !== '') {
        $profile = profileLoad($pdo, $userId) ?: $profile;
        profileRefreshSession($profile);
    }
    $profile['signed_in_with'] = strtolower((string)($user['provider'] ?? ''));
    respondJson(['ok' => true, 'profile' => $profile]);
}

if ($method !== 'POST') {
    respondJson(['ok' => false, 'error' => 'POST required.'], 405);
}

$action = strtolower(trim((string)($_POST['action'] ?? '')));

try {
    switch ($action) {
        case 'save':
            $name = trim((string)($_POST['display_name'] ?? ''));
            if ($name === '') {
                respondJson(['ok' => false, 'error' => 'Enter a username.'], 422);
            }
            if (mb_strlen($name) > 40) {
                respondJson(['ok' => false, 'error' => 'Usernames are limited to 40 characters.'], 422);
            }
            // Control characters would let a name break the layout it is
            // rendered into; everything printable is allowed.
            if (preg_match('/[\x00-\x1F\x7F]/u', $name)) {
                respondJson(['ok' => false, 'error' => 'That username contains invalid characters.'], 422);
            }
            $pdo->prepare('UPDATE users SET display_name = ? WHERE id = ?')->execute([$name, $userId]);
            break;

        // Theme choice, so it follows the account between devices. The column
        // is added on first use: the site is deployed by file copy, so a
        // migration nobody runs would leave this broken on production. The
        // browser's own localStorage stays the source of truth for guests and
        // for the pre-paint boot script.
        case 'theme':
            $theme = strtolower(trim((string)($_POST['theme'] ?? '')));
            if (!in_array($theme, ['light', 'dark', 'system'], true)) {
                respondJson(['ok' => false, 'error' => 'Unknown theme.'], 422);
            }
            try {
                $pdo->prepare('UPDATE users SET theme = ? WHERE id = ?')->execute([$theme, $userId]);
            } catch (PDOException $exception) {
                if (($exception->errorInfo[0] ?? '') !== '42S22') {
                    throw $exception;
                }
                $pdo->exec("ALTER TABLE users ADD COLUMN theme VARCHAR(10) NOT NULL DEFAULT 'system'");
                $pdo->prepare('UPDATE users SET theme = ? WHERE id = ?')->execute([$theme, $userId]);
            }
            break;

        case 'avatar':
            $file = $_FILES['avatar'] ?? null;
            $stored = profileStoreAvatar($file, $userId);
            if ($stored['ok'] !== true) {
                respondJson(['ok' => false, 'error' => $stored['error']], 422);
            }
            $previous = (string)(profileLoad($pdo, $userId)['avatar_url'] ?? '');
            // The picture goes into the shared database (served by avatar.php on
            // both hosts); the file stays as a fallback for this host.
            $png = (string)@file_get_contents(__DIR__ . '/' . $stored['path']);
            if (profileSaveAvatarBlob($pdo, $userId, $png) === '') {
                $pdo->prepare('UPDATE users SET avatar_url = ? WHERE id = ?')
                    ->execute([$stored['path'], $userId]);
            }
            profileDeleteAvatarFile($previous);
            break;

        case 'avatar_clear':
            $previous = (string)(profileLoad($pdo, $userId)['avatar_url'] ?? '');
            if (profileAvatarBlobColumnEnsure($pdo)) {
                $pdo->prepare("UPDATE users SET avatar_url = '', avatar_b64 = NULL WHERE id = ?")->execute([$userId]);
            } else {
                $pdo->prepare("UPDATE users SET avatar_url = '' WHERE id = ?")->execute([$userId]);
            }
            profileDeleteAvatarFile($previous);
            break;

        case 'resend_verification':
            $current = profileLoad($pdo, $userId);
            $address = (string)($current['email'] ?? '');
            if ($address === '') {
                respondJson(['ok' => false, 'error' => 'This account has no email address.'], 409);
            }
            if (($current['email_verified_at'] ?? null) !== null) {
                respondJson(['ok' => false, 'error' => 'That address is already confirmed.'], 409);
            }
            if (verifyResendTooSoon((string)($current['verify_sent_at'] ?? ''))) {
                respondJson([
                    'ok' => false,
                    'error' => 'A message just went out. Wait a few minutes before asking for another.',
                ], 429);
            }
            $sent = verifySendEmail(
                $address,
                (string)($current['display_name'] ?? ''),
                verifyIssueToken($pdo, $userId)
            );
            if (!$sent) {
                respondJson([
                    'ok' => false,
                    'error' => 'The server could not send the email. Check the mail setup.',
                ], 502);
            }
            break;

        // ── Email change: request, resend, cancel ─────────────────────────
        // The address only changes once the link sent to the NEW address is
        // opened (verify_email_change.php). An account that has a password
        // must give it here, so a borrowed session cannot re-home the account.
        case 'change_email':
            if (!emailChangeColumnsExist($pdo)) {
                respondJson([
                    'ok' => false,
                    'error' => 'The email-change columns are missing. Run the pending_email statements from profile_schema.sql.',
                ], 503);
            }
            $current = profileLoad($pdo, $userId);
            $newEmail = emailChangeNormalize((string)($_POST['new_email'] ?? ''));
            if ($newEmail === '') {
                respondJson(['ok' => false, 'error' => 'Enter a valid email address.'], 422);
            }
            if (strtolower((string)($current['email'] ?? '')) === $newEmail) {
                respondJson(['ok' => false, 'error' => 'That is already the address on this account.'], 422);
            }
            if (!empty($current['has_password'])) {
                $password = (string)($_POST['password'] ?? '');
                $hashRow = $pdo->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
                $hashRow->execute([$userId]);
                $hash = (string)($hashRow->fetchColumn() ?: '');
                if ($password === '' || $hash === '' || !password_verify($password, $hash)) {
                    respondJson(['ok' => false, 'error' => 'Your current password is not right.'], 401);
                }
            }
            if (emailChangeTaken($pdo, $newEmail, $userId)) {
                respondJson(['ok' => false, 'error' => 'That email is already used by another account.'], 409);
            }
            if (
                (string)($current['pending_email'] ?? '') === $newEmail
                && emailChangeResendTooSoon((string)($current['pending_email_sent_at'] ?? ''))
            ) {
                respondJson([
                    'ok' => false,
                    'error' => 'A confirmation just went out to that address. Wait a few minutes before asking for another.',
                ], 429);
            }
            $token = emailChangeIssue($pdo, $userId, $newEmail);
            if (!emailChangeSendMail($newEmail, (string)($current['display_name'] ?? ''), $token, (string)($current['email'] ?? ''))) {
                emailChangeClear($pdo, $userId);
                respondJson([
                    'ok' => false,
                    'error' => 'The server could not send the confirmation email. Check the mail setup.',
                ], 502);
            }
            break;

        case 'change_email_resend':
            $current = profileLoad($pdo, $userId);
            $pending = (string)($current['pending_email'] ?? '');
            if ($pending === '') {
                respondJson(['ok' => false, 'error' => 'There is no email change waiting for confirmation.'], 409);
            }
            if (emailChangeResendTooSoon((string)($current['pending_email_sent_at'] ?? ''))) {
                respondJson([
                    'ok' => false,
                    'error' => 'A message just went out. Wait a few minutes before asking for another.',
                ], 429);
            }
            if (emailChangeTaken($pdo, $pending, $userId)) {
                emailChangeClear($pdo, $userId);
                respondJson(['ok' => false, 'error' => 'That email is now used by another account.'], 409);
            }
            $token = emailChangeIssue($pdo, $userId, $pending);
            if (!emailChangeSendMail($pending, (string)($current['display_name'] ?? ''), $token, (string)($current['email'] ?? ''))) {
                respondJson([
                    'ok' => false,
                    'error' => 'The server could not send the confirmation email. Check the mail setup.',
                ], 502);
            }
            break;

        // ── Password change by emailed link ────────────────────────────────
        case 'password_reset_request':
            if (!passwordResetColumnsExist($pdo)) {
                respondJson([
                    'ok' => false,
                    'error' => 'The password-reset columns are missing. Run the reset_token statements from profile_schema.sql.',
                ], 503);
            }
            $current = profileLoad($pdo, $userId);
            $address = (string)($current['email'] ?? '');
            if ($address === '') {
                respondJson(['ok' => false, 'error' => 'Add an email address to the account first; the link goes there.'], 409);
            }
            $resetSentAt = null;
            try {
                $sentStmt = $pdo->prepare('SELECT reset_sent_at FROM users WHERE id = ? LIMIT 1');
                $sentStmt->execute([$userId]);
                $resetSentAt = $sentStmt->fetchColumn();
            } catch (Throwable) {
                $resetSentAt = null;
            }
            if (passwordResetResendTooSoon(is_string($resetSentAt) ? $resetSentAt : null)) {
                respondJson([
                    'ok' => false,
                    'error' => 'A link just went out. Wait a few minutes before asking for another.',
                ], 429);
            }
            $token = passwordResetIssue($pdo, $userId);
            if (!passwordResetSendMail($address, (string)($current['display_name'] ?? ''), $token)) {
                passwordResetClear($pdo, $userId);
                respondJson([
                    'ok' => false,
                    'error' => 'The server could not send the email. Check the mail setup.',
                ], 502);
            }
            break;

        case 'change_email_cancel':
            if (emailChangeColumnsExist($pdo)) {
                emailChangeClear($pdo, $userId);
            }
            break;

        case 'save_ai':
            if (!aiPersonaColumnExists($pdo)) {
                respondJson([
                    'ok' => false,
                    'error' => 'The AI personality column is missing. Run the ai_instructions statement from profile_schema.sql.',
                ], 503);
            }
            $instructions = aiPersonaClean((string)($_POST['ai_instructions'] ?? ''));
            $pdo->prepare('UPDATE users SET ai_instructions = ? WHERE id = ?')
                ->execute([$instructions === '' ? null : $instructions, $userId]);
            break;

        case 'unlink_steam':
            // Refuse when Steam is the account's only way back in - unlinking
            // would leave a row nobody can ever sign into again.
            if (profileIsSteamOnly(profileLoad($pdo, $userId))) {
                respondJson([
                    'ok' => false,
                    'error' => 'Steam is how you sign in, so it cannot be disconnected.',
                ], 409);
            }
            $pdo->prepare("UPDATE users SET steam_id = '', steam_persona = '' WHERE id = ?")
                ->execute([$userId]);
            break;

        case 'unlink_discord':
            // Refuse when Discord is the account's only way in (signed up with
            // Discord, no e-mail, no Steam): the row could never be opened again.
            $current = profileLoad($pdo, $userId);
            if (($current['email'] ?? null) === null
                && (string)($current['steam_id'] ?? '') === ''
                && (string)($current['google_id'] ?? '') === '') {
                respondJson([
                    'ok' => false,
                    'error' => 'Discord is how you sign in, so it cannot be disconnected.',
                ], 409);
            }
            if (discordLinkColumnsExist($pdo)) {
                discordLinkDetach($pdo, $userId);
            }
            break;

        default:
            respondJson(['ok' => false, 'error' => 'Unknown action.'], 400);
    }
} catch (Throwable $exception) {
    error_log('profile_api(' . $action . '): ' . $exception->getMessage());
    respondJson(['ok' => false, 'error' => 'Could not save that. Try again.'], 500);
}

$profile = profileLoad($pdo, $userId);
profileRefreshSession($profile);
$profile['signed_in_with'] = strtolower((string)(steamSessionUser()['provider'] ?? ''));

respondJson([
    'ok' => true,
    'profile' => $profile,
    'user' => steamSessionUser(),
]);
