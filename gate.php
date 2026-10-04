<?php
/**
 * Device enrolment and lock screen for the access gate.
 *
 * Open https://csprice.eu/gate.php?key=<device key> once on a device and it
 * stays allowed until the key is revoked (a signed, HttpOnly, one-year cookie).
 * Without a key it renders the lock screen, which posts back here.
 *
 * Listed in CSPRICE_GATE_PUBLIC_SCRIPTS, so it answers even while the rest of
 * the site is closed - see access_gate.php.
 */
declare(strict_types=1);

require_once __DIR__ . '/access_gate.php';

// The in-page lock overlay asks for JSON explicitly. The <form> below posts as
// a normal browser navigation and must get the redirect, so "is a POST" is not
// the test here.
$wantsJson = str_contains(strtolower((string)($_SERVER['HTTP_ACCEPT'] ?? '')), 'application/json')
    || (string)($_REQUEST['format'] ?? '') === 'json';

$key = trim((string)($_POST['key'] ?? $_GET['key'] ?? $_GET['access_key'] ?? ''));
$from = (string)($_POST['from'] ?? $_GET['from'] ?? '/');
// Only ever bounce back to our own site.
if ($from === '' || $from[0] !== '/' || str_starts_with($from, '//')) {
    $from = '/';
}

header('Cache-Control: no-store, private');
header('X-Robots-Tag: noindex, nofollow');

// Already enrolled, or the gate is off: nothing to do here.
$current = cspriceGateEvaluate();
if ($key === '' && $current['allowed']) {
    if ($wantsJson) {
        header('Content-Type: application/json');
        echo json_encode(['allowed' => true, 'reason' => $current['reason']]);
        exit;
    }
    http_response_code(302);
    header('Location: ' . $from);
    exit;
}

$error = '';
if ($key !== '') {
    $device = cspriceGateFindDeviceByKey($key);
    if ($device !== null) {
        cspriceGateIssueCookie((string)$device['id']);
        cspriceGateTouchDevice((string)$device['id']);
        if ($wantsJson) {
            header('Content-Type: application/json');
            echo json_encode(['allowed' => true, 'device' => $device['label'] ?? '', 'redirect' => $from]);
            exit;
        }
        http_response_code(302);
        header('Location: ' . $from);
        exit;
    }
    $error = 'That key is not valid, or it has been revoked.';
    if ($wantsJson) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['allowed' => false, 'error' => $error]);
        exit;
    }
}

http_response_code($error === '' ? 401 : 403);
header('Content-Type: text/html; charset=utf-8');
$safeFrom = htmlspecialchars($from, ENT_QUOTES, 'UTF-8');
$safeError = htmlspecialchars($error, ENT_QUOTES, 'UTF-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>CS.PRICE — private</title>
<link rel="icon" href="/favicon.ico">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background: radial-gradient(circle at 50% 0%, #16203a 0%, #0b0f1a 60%);
    color: #e2e8f0;
    font: 15px/1.5 'Segoe UI', Inter, system-ui, sans-serif;
  }
  .card {
    width: min(420px, 100%);
    padding: 32px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 18px;
    background: rgba(15, 23, 42, 0.82);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
    text-align: center;
  }
  .logo { height: 34px; margin-bottom: 18px; }
  h1 { margin: 0 0 6px; font-size: 19px; letter-spacing: 0.01em; }
  p { margin: 0 0 20px; color: #94a3b8; font-size: 13.5px; }
  form { display: flex; flex-direction: column; gap: 10px; }
  input {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 10px;
    background: rgba(2, 6, 23, 0.7);
    color: #e2e8f0;
    font: inherit;
    letter-spacing: 0.04em;
  }
  input:focus { outline: none; border-color: #38bdf8; }
  button {
    padding: 12px 14px;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #38bdf8, #6366f1);
    color: #04121f;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  button:hover { filter: brightness(1.08); }
  .err {
    margin: 0 0 16px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: #fca5a5;
    font-size: 13px;
  }
  .foot { margin: 18px 0 0; font-size: 12px; color: #64748b; }
</style>
</head>
<body>
  <div class="card">
    <img class="logo" src="/logo_csprice.png" alt="CS.PRICE" onerror="this.style.display='none'">
    <h1>This site is private</h1>
    <p>Enter your device key to unlock it on this browser. You only have to do this once.</p>
    <?php if ($safeError !== ''): ?><div class="err"><?= $safeError ?></div><?php endif; ?>
    <form method="post" action="/gate.php">
      <input type="password" name="key" placeholder="Device key" autocomplete="off" autofocus spellcheck="false">
      <input type="hidden" name="from" value="<?= $safeFrom ?>">
      <button type="submit">Unlock</button>
    </form>
    <p class="foot">Keys are issued from the admin API and can be revoked at any time.</p>
  </div>
</body>
</html>
