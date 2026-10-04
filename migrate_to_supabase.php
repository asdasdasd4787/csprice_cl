<?php
declare(strict_types=1);
set_time_limit(0);
ini_set('memory_limit', '256M');

$isCli = PHP_SAPI === 'cli';
if (!$isCli) { header('Content-Type: text/plain; charset=utf-8'); }
function out(string $m): void { echo $m . "\n"; flush(); }
function elapsed(float $s): string { return round(microtime(true) - $s, 1) . 's'; }

out('=== Supabase Sync (incremental) ===');
out('Started: ' . date('Y-m-d H:i:s'));

$mysql = new PDO('mysql:host=localhost;dbname=csgo_price_tracker;charset=utf8mb4', 'root', '', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
out('[OK] MySQL');

$pg = new PDO(
    'pgsql:host=aws-0-eu-west-3.pooler.supabase.com;port=6543;dbname=postgres;sslmode=require',
    'postgres.jysfzbjgsjfmesqklfay', 'Olishek123.',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => true]
);
out('[OK] Supabase');

// ── Sync items ──────────────────────────────────────────────────────
out('');
out('Syncing items...');
$t = microtime(true);
$items = $mysql->query('SELECT id, name, created_at FROM items ORDER BY id')->fetchAll();
$ins = $pg->prepare('INSERT INTO items (id, name, created_at) VALUES (:id,:name,:ca) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name');
$done = 0;
foreach ($items as $r) {
    $ins->execute([':id' => (int)$r['id'], ':name' => $r['name'], ':ca' => $r['created_at'] ?? date('Y-m-d H:i:s')]);
    $done++;
}
out("[OK] {$done} items upserted (" . elapsed($t) . ')');

// ── Sync price_history (only rows missing from Supabase) ────────────
out('');
out('Syncing price_history (ON CONFLICT DO NOTHING)...');
$t = microtime(true);

$totalMysql = (int)$mysql->query('SELECT COUNT(*) FROM price_history')->fetchColumn();
$totalPg    = (int)$pg->query('SELECT COUNT(*) FROM price_history')->fetchColumn();
out("  MySQL: {$totalMysql}  Supabase: {$totalPg}");

$pgItemIds = $pg->query('SELECT id FROM items')->fetchAll(PDO::FETCH_COLUMN);
$pgItemSet = array_flip(array_map('intval', $pgItemIds));

$ins = $pg->prepare(
    'INSERT INTO price_history (item_id,price,volume,source,wear,recorded_at)
     VALUES (:iid,:price,:vol,:src,:wear,:rat)
     ON CONFLICT ON CONSTRAINT uq_price_history_snapshot DO NOTHING'
);

$batchSize = 500;
$offset = 0;
$inserted = 0;
$skipped  = 0;

while (true) {
    $rows = $mysql->query(
        "SELECT item_id,price,volume,source,wear,recorded_at FROM price_history ORDER BY id ASC LIMIT {$batchSize} OFFSET {$offset}"
    )->fetchAll();
    if (!$rows) break;

    foreach ($rows as $r) {
        if (!isset($pgItemSet[(int)$r['item_id']])) { $skipped++; continue; }
        $ins->execute([':iid' => (int)$r['item_id'], ':price' => $r['price'], ':vol' => (int)($r['volume'] ?? 0),
                       ':src' => $r['source'] ?? 'Steam', ':wear' => $r['wear'] ?? 'Factory New', ':rat' => $r['recorded_at']]);
        $inserted++;
    }
    $offset += $batchSize;
}

out("[OK] {$inserted} new rows inserted, {$skipped} skipped (" . elapsed($t) . ')');
out('');
out('=== Done ===');
out('Supabase items:  ' . $pg->query('SELECT COUNT(*) FROM items')->fetchColumn());
out('Supabase prices: ' . $pg->query('SELECT COUNT(*) FROM price_history')->fetchColumn());
