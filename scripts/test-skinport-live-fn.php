<?php
require __DIR__ . '/../app_bootstrap.php';

$cfg = appConfig()['skinport'] ?? [];
$clientId = trim((string)($cfg['client_id'] ?? ''));
$clientSecret = trim((string)($cfg['client_secret'] ?? ''));
$authHeader = ($clientId !== '' && $clientSecret !== '') ? base64_encode($clientId . ':' . $clientSecret) : '';
$names = ['★ Navaja Knife | Doppler (Factory New)'];

$pythonScript = <<<'PY'
import base64, json, sys, requests
names = json.loads(base64.b64decode(sys.argv[1]).decode('utf-8'))
auth_b64 = sys.argv[2] if len(sys.argv) > 2 else ''
headers = {'Accept-Encoding': 'br', 'Accept': 'application/json'}
if auth_b64:
    headers['Authorization'] = 'Basic ' + auth_b64
hist = requests.get('https://api.skinport.com/v1/sales/history',
    params={'app_id': 730, 'currency': 'EUR', 'market_hash_name': ','.join(names)},
    headers=headers, timeout=60)
print('hist', hist.status_code)
hist.raise_for_status()
items = requests.get('https://api.skinport.com/v1/items',
    params={'app_id': 730, 'currency': 'EUR', 'tradable': 0},
    headers=headers, timeout=60)
print('items', items.status_code, 'count', len(items.json()) if items.ok else 0)
items.raise_for_status()
wanted = set(names)
h = {r['market_hash_name']: r for r in hist.json() if isinstance(r,dict) and r.get('market_hash_name') in wanted}
i = {r['market_hash_name']: r for r in items.json() if isinstance(r,dict) and r.get('market_hash_name') in wanted}
print('matched hist', list(h.keys()))
print('matched items', list(i.keys()))
for k,v in i.items():
    print(k, 'min', v.get('min_price'), 'median', v.get('median_price'))
print(json.dumps({'history': h, 'items': i}))
PY;

$command = sprintf('%s - %s %s',
    escapeshellarg('python'),
    escapeshellarg(base64_encode(json_encode($names, JSON_UNESCAPED_UNICODE))),
    escapeshellarg($authHeader)
);
$pipes = [];
$proc = proc_open($command, [0 => ['pipe','r'], 1 => ['pipe','w'], 2 => ['pipe','w']], $pipes);
fwrite($pipes[0], $pythonScript);
fclose($pipes[0]);
$stdout = stream_get_contents($pipes[1]);
$stderr = stream_get_contents($pipes[2]);
fclose($pipes[1]);
fclose($pipes[2]);
$exit = proc_close($proc);
echo "exit=$exit\nstderr=$stderr\nstdout:\n$stdout\n";
