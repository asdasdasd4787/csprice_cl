<?php
/**
 * Device allow-list API.
 * =============================================================================
 * Authenticated with the master admin key from access_config.local.php, passed
 * either as the X-CSPrice-Admin header or an admin_key parameter. It is the
 * only way in if you ever lose every device key, so it deliberately does NOT
 * require a device cookie.
 *
 *   list     GET  /access_devices.php?admin_key=...&action=list
 *   create   GET  /access_devices.php?admin_key=...&action=create&label=Phone
 *            -> returns the device key ONCE; only its HMAC is stored, so it
 *               cannot be read back later. Losing it means minting a new one.
 *   revoke   GET  /access_devices.php?admin_key=...&action=revoke&id=<device id>
 *   delete   GET  /access_devices.php?admin_key=...&action=delete&id=<device id>
 *
 * The enrolment link for a new key is https://csprice.eu/gate.php?key=<key>.
 */
declare(strict_types=1);

require_once __DIR__ . '/access_gate.php';

header('Content-Type: application/json');
header('Cache-Control: no-store, private');
header('X-Robots-Tag: noindex, nofollow');

function cspriceAdminFail(int $status, string $message): never
{
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message]);
    exit;
}

$config = cspriceGateConfig();
$expected = trim((string)($config['admin_key'] ?? ''));
if ($expected === '') {
    cspriceAdminFail(503, 'No admin_key is configured in access_config.local.php.');
}

$provided = trim((string)(
    $_SERVER['HTTP_X_CSPRICE_ADMIN']
    ?? $_POST['admin_key']
    ?? $_GET['admin_key']
    ?? ''
));
if ($provided === '' || !hash_equals($expected, $provided)) {
    // Slow a guessing loop down without holding a shared-host worker for long.
    usleep(250000);
    cspriceAdminFail(403, 'Bad admin key.');
}

$action = strtolower(trim((string)($_REQUEST['action'] ?? 'list')));
$devices = cspriceGateReadDevices();

/** Public view of a device: never includes the key or its hash. */
$present = static function (array $device): array {
    return [
        'id' => (string)($device['id'] ?? ''),
        'label' => (string)($device['label'] ?? ''),
        'revoked' => (bool)($device['revoked'] ?? false),
        'created' => (int)($device['created'] ?? 0),
        'created_utc' => ($device['created'] ?? 0) ? gmdate('Y-m-d H:i', (int)$device['created']) : '',
        'last_seen' => (int)($device['last_seen'] ?? 0),
        'last_seen_utc' => ($device['last_seen'] ?? 0) ? gmdate('Y-m-d H:i', (int)$device['last_seen']) : 'never',
    ];
};

if ($action === 'list') {
    echo json_encode([
        'ok' => true,
        'gate_enabled' => cspriceGateEnabled(),
        'devices' => array_map($present, $devices),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($action === 'create') {
    $label = trim((string)($_REQUEST['label'] ?? ''));
    if ($label === '') {
        $label = 'Device ' . (count($devices) + 1);
    }
    $key = bin2hex(random_bytes(24));
    $device = [
        'id' => bin2hex(random_bytes(8)),
        'label' => mb_substr($label, 0, 60),
        'key_hash' => cspriceGateHashKey($key),
        'created' => time(),
        'last_seen' => 0,
        'revoked' => false,
    ];
    $devices[] = $device;
    if (!cspriceGateWriteDevices($devices)) {
        cspriceAdminFail(500, 'Could not write data/access/devices.php - check folder permissions.');
    }
    echo json_encode([
        'ok' => true,
        'device' => $present($device),
        // Shown once. Only the HMAC is kept, so this cannot be recovered later.
        'key' => $key,
        'enroll_url' => 'https://csprice.eu/gate.php?key=' . $key,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($action === 'revoke' || $action === 'delete' || $action === 'restore') {
    $id = trim((string)($_REQUEST['id'] ?? ''));
    if ($id === '') {
        cspriceAdminFail(400, 'id is required.');
    }
    $found = false;
    foreach ($devices as $index => $device) {
        if ((string)($device['id'] ?? '') !== $id) {
            continue;
        }
        $found = true;
        if ($action === 'delete') {
            unset($devices[$index]);
        } else {
            $devices[$index]['revoked'] = $action === 'revoke';
        }
        break;
    }
    if (!$found) {
        cspriceAdminFail(404, 'No device with that id.');
    }
    if (!cspriceGateWriteDevices($devices)) {
        cspriceAdminFail(500, 'Could not write the device store.');
    }
    echo json_encode([
        'ok' => true,
        'action' => $action,
        'id' => $id,
        'devices' => array_map($present, cspriceGateReadDevices()),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

cspriceAdminFail(400, 'Unknown action. Use list, create, revoke, restore or delete.');
