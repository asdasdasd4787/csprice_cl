<?php
declare(strict_types=1);
/**
 * Sets a new password from an emailed link: reset_password.php?token=<raw>
 *
 * GET renders a small form (the token stays in a hidden field); POST checks
 * the token again, validates the password, stores its hash and clears the
 * token. A signed-in visitor lands back on the profile panel; anyone else
 * gets a "done, sign in" page. The token is single-use and expires.
 */

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/password_reset_helpers.php';
require_once __DIR__ . '/profile_helpers.php';

/** The site's name for the host serving this page: TFPRICE on tf2price.eu, CSPRICE elsewhere. */
function resetSiteName(): string
{
    return str_contains(strtolower((string)($_SERVER['HTTP_HOST'] ?? '')), 'tf2price') ? 'TFPRICE' : 'CSPRICE';
}

function resetPage(string $title, string $bodyHtml, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    $safeTitle = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    $home = htmlspecialchars(absoluteAppUrl('index.html'), ENT_QUOTES, 'UTF-8');
    echo '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<meta name="robots" content="noindex">'
        . '<title>' . $safeTitle . ' | ' . resetSiteName() . '</title>'
        . '<style>'
        . 'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;'
        . 'background:#070b1c;color:#e2e8f0;font-family:Inter,Arial,sans-serif}'
        . '.card{width:min(440px,calc(100vw - 32px));padding:28px 30px;border-radius:18px;'
        . 'border:1px solid rgba(100,120,160,.22);background:#0f172a;box-shadow:0 28px 80px rgba(0,0,0,.55)}'
        . 'h1{margin:0 0 8px;font-size:22px;color:#f8fafc}'
        . 'p{margin:0 0 16px;font-size:14px;line-height:1.55;color:#94a3b8}'
        . 'label{display:block;margin:14px 0 6px;font-size:11px;font-weight:700;letter-spacing:.08em;'
        . 'text-transform:uppercase;color:#94a3b8}'
        . 'input{width:100%;height:46px;box-sizing:border-box;padding:0 14px;border-radius:10px;'
        . 'border:1px solid rgba(100,120,160,.28);background:#0b1120;color:#e2e8f0;font:inherit;font-size:14px}'
        . 'input:focus{outline:none;border-color:rgba(75,105,255,.55);box-shadow:0 0 0 3px rgba(75,105,255,.16)}'
        . '.btn{display:inline-flex;align-items:center;justify-content:center;width:100%;height:40px;'
        . 'margin-top:18px;border:0;border-radius:8px;cursor:pointer;color:#fff;font:inherit;font-size:13.5px;font-weight:600;'
        . 'background:linear-gradient(180deg,rgba(75,105,255,.34),rgba(75,105,255,.18));'
        . 'box-shadow:inset 0 0 0 1px rgba(75,105,255,.45),0 10px 24px rgba(0,0,0,.28);text-decoration:none}'
        . '.err{margin:0 0 10px;padding:10px 12px;border-radius:10px;border:1px solid rgba(239,68,68,.28);'
        . 'background:rgba(239,68,68,.12);color:#fecaca;font-size:13px}'
        . 'a.link{color:#93c5fd}'
        . '</style></head><body><div class="card">' . $bodyHtml
        . '<p style="margin:18px 0 0;font-size:12px"><a class="link" href="' . $home . '">Back to ' . resetSiteName() . '</a></p>'
        . '</div></body></html>';
    exit;
}

$raw = trim((string)($_REQUEST['token'] ?? ''));
if ($raw === '' || !preg_match('/^[a-f0-9]{64}$/', $raw)) {
    resetPage('Link not valid', '<h1>This link is not valid</h1><p>Ask for a new one from your profile page.</p>', 400);
}

try {
    $pdo = dbPdoConnection('accounts_db', 'db');
    if (!passwordResetColumnsExist($pdo)) {
        resetPage('Link not valid', '<h1>This link is not valid</h1><p>Ask for a new one from your profile page.</p>', 400);
    }
    $stmt = $pdo->prepare('SELECT id, email, display_name, reset_sent_at FROM users WHERE reset_token_hash = ? LIMIT 1');
    $stmt->execute([hash('sha256', $raw)]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!is_array($row)) {
        resetPage('Link not valid', '<h1>This link is not valid</h1><p>It may have been used already. Ask for a new one from your profile page.</p>', 400);
    }
    $sentAt = (string)($row['reset_sent_at'] ?? '');
    $sentStamp = $sentAt !== '' ? strtotime($sentAt) : false;
    if ($sentStamp === false || (time() - $sentStamp) > PASSWORD_RESET_TOKEN_TTL_HOURS * 3600) {
        passwordResetClear($pdo, (int)$row['id']);
        resetPage('Link expired', '<h1>This link has expired</h1><p>Links work for ' . PASSWORD_RESET_TOKEN_TTL_HOURS . ' hours. Ask for a new one from your profile page.</p>', 410);
    }

    $safeToken = htmlspecialchars($raw, ENT_QUOTES, 'UTF-8');
    $who = htmlspecialchars((string)($row['email'] ?? ''), ENT_QUOTES, 'UTF-8');
    $form = static function (string $error) use ($safeToken, $who): string {
        return '<h1>Set a new password</h1>'
            . '<p>For the ' . resetSiteName() . ' account ' . $who . '. At least ' . PASSWORD_RESET_MIN_LENGTH . ' characters.</p>'
            . ($error !== '' ? '<div class="err">' . htmlspecialchars($error, ENT_QUOTES, 'UTF-8') . '</div>' : '')
            . '<form method="post" action="reset_password.php" autocomplete="off">'
            . '<input type="hidden" name="token" value="' . $safeToken . '">'
            . '<label for="pw">New password</label>'
            . '<input id="pw" type="password" name="password" autocomplete="new-password" required minlength="' . PASSWORD_RESET_MIN_LENGTH . '" maxlength="72">'
            . '<label for="pw2">Repeat it</label>'
            . '<input id="pw2" type="password" name="confirm" autocomplete="new-password" required minlength="' . PASSWORD_RESET_MIN_LENGTH . '" maxlength="72">'
            . '<button class="btn" type="submit">Save new password</button>'
            . '</form>';
    };

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        resetPage('Set a new password', $form(''));
    }

    $password = (string)($_POST['password'] ?? '');
    $confirm = (string)($_POST['confirm'] ?? '');
    $problem = passwordResetProblem($password, $confirm);
    if ($problem !== '') {
        resetPage('Set a new password', $form($problem), 422);
    }

    $pdo->prepare('UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_sent_at = NULL WHERE id = ?')
        ->execute([password_hash($password, PASSWORD_DEFAULT), (int)$row['id']]);

    $sessionUser = steamSessionUser();
    if (profileUserIdFromSession($sessionUser) === (int)$row['id']) {
        session_regenerate_id(true);
        header('Location: ' . absoluteAppUrl('index.html?panel=profile&password=ok'), true, 302);
        exit;
    }
} catch (Throwable $exception) {
    error_log('reset_password.php: ' . $exception->getMessage());
    resetPage('Something went wrong', '<h1>Something went wrong</h1><p>Try the link again in a moment, or ask for a new one from your profile page.</p>', 500);
}

resetPage(
    'Password changed',
    '<h1>Password changed</h1><p>Sign in with your new password.</p>'
    . '<a class="btn" href="' . htmlspecialchars(absoluteAppUrl('index.html'), ENT_QUOTES, 'UTF-8') . '">Go to ' . resetSiteName() . '</a>'
);
