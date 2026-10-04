<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

function ensureSkinportSnapshotTable(mysqli $connection): void
{
    $connection->query(
        'CREATE TABLE IF NOT EXISTS skinport_item_snapshots (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            batch_id CHAR(32) NOT NULL,
            item_id INT NOT NULL,
            market_hash_name VARCHAR(255) NOT NULL,
            wear VARCHAR(30) NOT NULL,
            currency VARCHAR(10) NOT NULL,
            suggested_price DECIMAL(10,2) DEFAULT NULL,
            min_price DECIMAL(10,2) DEFAULT NULL,
            max_price DECIMAL(10,2) DEFAULT NULL,
            mean_price DECIMAL(10,2) DEFAULT NULL,
            median_price DECIMAL(10,2) DEFAULT NULL,
            quantity INT NOT NULL DEFAULT 0,
            item_page VARCHAR(255) DEFAULT NULL,
            market_page VARCHAR(255) DEFAULT NULL,
            created_at_epoch BIGINT DEFAULT NULL,
            updated_at_epoch BIGINT DEFAULT NULL,
            raw_json LONGTEXT NOT NULL,
            recorded_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_item_recorded (item_id, recorded_at),
            INDEX idx_item_batch (item_id, batch_id),
            INDEX idx_market_hash_name (market_hash_name(191)),
            CONSTRAINT skinport_item_snapshots_ibfk_1 FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function loadTrackedSkinportItem(mysqli $connection, int $itemId): array
{
    $statement = $connection->prepare('SELECT id, name FROM items WHERE id = ? LIMIT 1');
    $statement->bind_param('i', $itemId);
    $statement->execute();
    $result = $statement->get_result();
    $item = $result->fetch_assoc();

    if (!$item) {
        throw new RuntimeException('Tracked item was not found.');
    }

    return [
        'id' => (int)$item['id'],
        'name' => (string)$item['name'],
    ];
}

function resolvePythonExecutable(): string
{
    $override = trim((string)getenv('PYTHON_BIN'));
    if ($override !== '') {
        return $override;
    }

    $localAppData = getenv('LOCALAPPDATA');
    if (is_string($localAppData) && $localAppData !== '') {
        $matches = glob($localAppData . DIRECTORY_SEPARATOR . 'Python' . DIRECTORY_SEPARATOR . 'pythoncore-*' . DIRECTORY_SEPARATOR . 'python.exe');
        if (is_array($matches) && $matches) {
            rsort($matches);
            return $matches[0];
        }
    }

    return 'python';
}

function fetchSkinportItems(array $config): array
{
    $url = sprintf(
        '%s/v1/items?%s',
        rtrim((string)($config['base_url'] ?? 'https://api.skinport.com'), '/'),
        http_build_query([
            'app_id' => (int)($config['app_id'] ?? 730),
            'currency' => (string)($config['currency'] ?? 'EUR'),
            'tradable' => (int)($config['tradable'] ?? 1),
        ], '', '&', PHP_QUERY_RFC3986)
    );

    $timeoutSeconds = max(5, (int)($config['timeout_seconds'] ?? 30));
    $clientId = trim((string)($config['client_id'] ?? ''));
    $clientSecret = trim((string)($config['client_secret'] ?? ''));
    $authHeader = ($clientId !== '' && $clientSecret !== '')
        ? base64_encode($clientId . ':' . $clientSecret)
        : '';

    $pythonScript = <<<'PY'
import json
import sys

import requests

url = sys.argv[1]
timeout = int(sys.argv[2])
auth_b64 = sys.argv[3] if len(sys.argv) > 3 else ''
headers = {'Accept-Encoding': 'br', 'Accept': 'application/json'}
if auth_b64:
    headers['Authorization'] = 'Basic ' + auth_b64
response = requests.get(url, headers=headers, timeout=timeout)
print(json.dumps({
    'status': response.status_code,
    'body': response.json() if response.content else None,
}))
PY;

    $command = sprintf(
        '%s - %s %s %s',
        escapeshellarg(resolvePythonExecutable()),
        escapeshellarg($url),
        escapeshellarg((string)$timeoutSeconds),
        escapeshellarg($authHeader)
    );

    $descriptorSpec = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $process = proc_open($command, $descriptorSpec, $pipes);
    if (!is_resource($process)) {
        throw new RuntimeException('Could not start Python process for Skinport request.');
    }

    fwrite($pipes[0], $pythonScript);
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);

    if ($exitCode !== 0) {
        throw new RuntimeException('Skinport request failed: ' . trim($stderr ?: $stdout));
    }

    $decoded = json_decode($stdout, true);
    if (!is_array($decoded) || !isset($decoded['status'])) {
        throw new RuntimeException('Skinport returned invalid JSON.');
    }

    if ((int)$decoded['status'] >= 400) {
        $errorBody = $decoded['body'] ?? [];
        $messages = [];
        if (is_array($errorBody['errors'] ?? null)) {
            foreach ($errorBody['errors'] as $error) {
                if (is_array($error) && isset($error['message'])) {
                    $messages[] = (string)$error['message'];
                }
            }
        }

        throw new RuntimeException('Skinport returned an error: ' . implode(' ', $messages));
    }

    $body = $decoded['body'] ?? null;
    if (!is_array($body)) {
        throw new RuntimeException('Skinport response body was malformed.');
    }

    if (isset($body['errors']) && is_array($body['errors'])) {
        $messages = [];
        foreach ($body['errors'] as $error) {
            if (is_array($error) && isset($error['message'])) {
                $messages[] = (string)$error['message'];
            }
        }

        throw new RuntimeException('Skinport returned an error: ' . implode(' ', $messages));
    }

    return $body;
}

function filterSkinportRows(array $items, string $baseName, array $wears): array
{
    $expectedNames = [];
    $base = trim($baseName);
    if ($base !== '') {
        // Containers / non-wear commodities match the bare market hash name.
        $expectedNames[$base] = 'Standard';
    }
    foreach ($wears as $wear) {
        $wearLabel = trim((string)$wear);
        if ($wearLabel === '') {
            continue;
        }
        $expectedNames[sprintf('%s (%s)', $baseName, $wearLabel)] = $wearLabel;
    }

    $rows = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }

        $marketHashName = trim((string)($item['market_hash_name'] ?? ''));
        if ($marketHashName === '' || !array_key_exists($marketHashName, $expectedNames)) {
            continue;
        }

        $wear = $expectedNames[$marketHashName];
        $rawJson = json_encode($item, JSON_UNESCAPED_SLASHES);

        $rows[] = [
            'market_hash_name' => $marketHashName,
            'wear' => $wear,
            'currency' => (string)($item['currency'] ?? 'EUR'),
            'suggested_price' => isset($item['suggested_price']) ? (float)$item['suggested_price'] : null,
            'min_price' => isset($item['min_price']) ? (float)$item['min_price'] : null,
            'max_price' => isset($item['max_price']) ? (float)$item['max_price'] : null,
            'mean_price' => isset($item['mean_price']) ? (float)$item['mean_price'] : null,
            'median_price' => isset($item['median_price']) ? (float)$item['median_price'] : null,
            'quantity' => (int)($item['quantity'] ?? 0),
            'item_page' => isset($item['item_page']) ? (string)$item['item_page'] : null,
            'market_page' => isset($item['market_page']) ? (string)$item['market_page'] : null,
            'created_at_epoch' => isset($item['created_at']) ? (int)$item['created_at'] : null,
            'updated_at_epoch' => isset($item['updated_at']) ? (int)$item['updated_at'] : null,
            'raw_json' => $rawJson !== false ? $rawJson : '{}',
        ];
    }

    return $rows;
}

function insertSkinportRows(mysqli $connection, int $itemId, string $batchId, string $recordedAt, array $rows): int
{
    if (!$rows) {
        return 0;
    }

    $statement = $connection->prepare(
        'INSERT INTO skinport_item_snapshots (
            batch_id,
            item_id,
            market_hash_name,
            wear,
            currency,
            suggested_price,
            min_price,
            max_price,
            mean_price,
            median_price,
            quantity,
            item_page,
            market_page,
            created_at_epoch,
            updated_at_epoch,
            raw_json,
            recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    $inserted = 0;
    foreach ($rows as $row) {
        $marketHashName = (string)$row['market_hash_name'];
        $wear = (string)$row['wear'];
        $currency = (string)$row['currency'];
        $suggestedPrice = $row['suggested_price'] !== null ? (float)$row['suggested_price'] : null;
        $minPrice = $row['min_price'] !== null ? (float)$row['min_price'] : null;
        $maxPrice = $row['max_price'] !== null ? (float)$row['max_price'] : null;
        $meanPrice = $row['mean_price'] !== null ? (float)$row['mean_price'] : null;
        $medianPrice = $row['median_price'] !== null ? (float)$row['median_price'] : null;
        $quantity = (int)$row['quantity'];
        $itemPage = $row['item_page'] !== null ? (string)$row['item_page'] : null;
        $marketPage = $row['market_page'] !== null ? (string)$row['market_page'] : null;
        $createdAtEpoch = $row['created_at_epoch'] !== null ? (int)$row['created_at_epoch'] : null;
        $updatedAtEpoch = $row['updated_at_epoch'] !== null ? (int)$row['updated_at_epoch'] : null;
        $rawJson = (string)$row['raw_json'];

        $statement->bind_param(
            'sisssdddddissiiss',
            $batchId,
            $itemId,
            $marketHashName,
            $wear,
            $currency,
            $suggestedPrice,
            $minPrice,
            $maxPrice,
            $meanPrice,
            $medianPrice,
            $quantity,
            $itemPage,
            $marketPage,
            $createdAtEpoch,
            $updatedAtEpoch,
            $rawJson,
            $recordedAt
        );
        $statement->execute();
        $inserted++;
    }

    return $inserted;
}

$isCli = PHP_SAPI === 'cli';
$options = $isCli ? getopt('', ['item-id::']) : [];
$itemId = $isCli
    ? (isset($options['item-id']) ? (int)$options['item-id'] : 1)
    : (isset($_GET['item_id']) ? (int)$_GET['item_id'] : 1);

try {
    $config = appConfig()['skinport'] ?? [];
    $connection = dbConnection();
    ensureSkinportSnapshotTable($connection);
    $item = loadTrackedSkinportItem($connection, $itemId);
    $rows = filterSkinportRows(
        fetchSkinportItems($config),
        $item['name'],
        $config['wears'] ?? []
    );

    if (!$rows) {
        throw new RuntimeException('Skinport did not return any rows for the tracked item.');
    }

    $batchId = bin2hex(random_bytes(16));
    $recordedAt = date('Y-m-d H:i:s');
    $inserted = insertSkinportRows($connection, $item['id'], $batchId, $recordedAt, $rows);

    respondJson([
        'success' => true,
        'item_id' => $item['id'],
        'item_name' => $item['name'],
        'batch_id' => $batchId,
        'recorded_at' => $recordedAt,
        'rows_inserted' => $inserted,
    ]);
} catch (Throwable $exception) {
    respondJson([
        'success' => false,
        'error' => $exception->getMessage(),
    ], 500);
}
