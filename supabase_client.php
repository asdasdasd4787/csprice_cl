<?php
declare(strict_types=1);

class SupabaseClient
{
    private string $baseUrl;
    private string $serviceKey;

    public function __construct(string $projectUrl, string $serviceKey)
    {
        $this->baseUrl  = rtrim($projectUrl, '/') . '/rest/v1';
        $this->serviceKey = $serviceKey;
    }

    /** SELECT rows from a table. $filters uses PostgREST syntax, e.g. ['item_id' => 'eq.1']. */
    public function select(string $table, array $filters = [], string $select = '*', int $limit = 5000): array
    {
        $params = array_merge(['select' => $select, 'limit' => $limit], $filters);
        $url    = $this->baseUrl . '/' . urlencode($table) . '?' . http_build_query($params);
        return $this->request('GET', $url);
    }

    /** INSERT an array of rows (associative arrays). Returns the number of rows inserted. */
    public function insert(string $table, array $rows): int
    {
        if (!$rows) {
            return 0;
        }
        $url = $this->baseUrl . '/' . urlencode($table);
        $this->request('POST', $url, $rows, ['Prefer: return=minimal', 'Prefer: resolution=ignore-duplicates']);
        return count($rows);
    }

    /** PATCH matching rows. $filters uses PostgREST syntax, e.g. ['source' => 'eq.steam']. */
    public function patch(string $table, array $filters, array $fields): void
    {
        if ($fields === []) {
            return;
        }
        $url = $this->baseUrl . '/' . urlencode($table) . '?' . http_build_query($filters);
        $this->request('PATCH', $url, $fields, ['Prefer: return=minimal']);
    }

    /** Call a stored function via RPC. */
    public function rpc(string $function, array $params = []): mixed
    {
        $url = $this->baseUrl . '/rpc/' . urlencode($function);
        return $this->request('POST', $url, $params);
    }

    /** Check if a table exists by doing a HEAD request and seeing if we get 200 or 404. */
    public function tableExists(string $table): bool
    {
        try {
            $url = $this->baseUrl . '/' . urlencode($table) . '?limit=0';
            $this->request('HEAD', $url);
            return true;
        } catch (Throwable) {
            return false;
        }
    }

    private function request(string $method, string $url, mixed $body = null, array $extraHeaders = []): mixed
    {
        $curl = curl_init($url);
        $headers = array_merge([
            'apikey: ' . $this->serviceKey,
            'Authorization: Bearer ' . $this->serviceKey,
            'Content-Type: application/json',
            'Accept: application/json',
        ], $extraHeaders);

        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_HTTPHEADER     => $headers,
            // Keep Supabase as a fallback, but don't let it stall page loads.
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_SSL_VERIFYPEER => true,
        ];

        if ($body !== null) {
            $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE);
        }

        if ($method === 'HEAD') {
            $opts[CURLOPT_NOBODY] = true;
        }

        curl_setopt_array($curl, $opts);

        $response = curl_exec($curl);
        $status   = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $curlErr  = curl_error($curl);
        curl_close($curl);

        if ($curlErr !== '') {
            throw new RuntimeException("Supabase curl error: $curlErr");
        }

        if ($status >= 400) {
            throw new RuntimeException("Supabase API $status: " . substr((string)$response, 0, 300));
        }

        if ($method === 'HEAD' || $response === '' || $response === false) {
            return [];
        }

        return json_decode((string)$response, true) ?? [];
    }
}

// ── Singleton accessor ─────────────────────────────────────────────────────────
function supabaseClient(): ?SupabaseClient
{
    static $client = false;

    if ($client === false) {
        $cfg = appConfig()['supabase'] ?? [];
        $url = trim((string)($cfg['url'] ?? ''));
        $key = trim((string)($cfg['service_key'] ?? ''));
        $client = ($url !== '' && $key !== '') ? new SupabaseClient($url, $key) : null;
    }

    return $client;
}

// ── Query helpers used by get_market_chart_bundle.php ────────────────────────

/**
 * Load price series from Supabase, grouped by calendar day.
 * Returns [] if Supabase is not configured or data is empty.
 */
function supabasePriceSeries(int $itemId, string $wear, string $source, int $days): array
{
    $client = supabaseClient();
    if ($client === null) {
        return [];
    }

    try {
        $dbSource = match ($source) {
            'skinport'     => 'Skinport',
            'csfloat'      => 'CSFloat',
            'white_market' => 'White.Market',
            'dmarket'      => 'DMarket',
            default        => 'Steam',
        };
        $cutoff = (new DateTimeImmutable("today -{$days} days", new DateTimeZone('UTC')))->format('Y-m-d');

        $rows = $client->select('price_history', [
            'item_id'     => "eq.{$itemId}",
            'source'      => "eq.{$dbSource}",
            'wear'        => "eq.{$wear}",
            'recorded_at' => "gte.{$cutoff}",
            'order'       => 'recorded_at.asc',
        ], 'recorded_at,price,volume', 10000);

        if (!$rows) {
            return [];
        }

        // Aggregate to daily points
        $byDate = [];
        foreach ($rows as $row) {
            $date = substr((string)($row['recorded_at'] ?? ''), 0, 10);
            if ($date === '') {
                continue;
            }
            if (!isset($byDate[$date])) {
                $byDate[$date] = ['date' => $date, 'sum' => 0.0, 'cnt' => 0, 'volume' => 0];
            }
            $byDate[$date]['sum']    += (float)($row['price'] ?? 0);
            $byDate[$date]['cnt']++;
            $byDate[$date]['volume'] += (int)($row['volume'] ?? 0);
        }

        ksort($byDate);

        return array_values(array_map(fn($b) => [
            'date'   => $b['date'],
            'price'  => round($b['sum'] / max(1, $b['cnt']), 2),
            'volume' => $b['volume'],
        ], $byDate));
    } catch (Throwable) {
        return [];
    }
}

/**
 * Load the latest price per wear for a given source from Supabase.
 */
function supabaseLatestWearPrices(int $itemId, string $source): array
{
    $client = supabaseClient();
    if ($client === null) {
        return [];
    }

    try {
        $dbSource = match ($source) {
            'skinport'     => 'Skinport',
            'csfloat'      => 'CSFloat',
            'white_market' => 'White.Market',
            'dmarket'      => 'DMarket',
            default        => 'Steam',
        };

        $rows = $client->select('price_history', [
            'item_id' => "eq.{$itemId}",
            'source'  => "eq.{$dbSource}",
            'order'   => 'recorded_at.desc',
        ], 'wear,price,volume,recorded_at', 500);

        $latest = [];
        foreach ($rows as $row) {
            $wear = (string)($row['wear'] ?? '');
            if ($wear === '' || isset($latest[$wear])) {
                continue;
            }
            $price = (float)($row['price'] ?? 0);
            if ($price <= 0) {
                continue;
            }
            $latest[$wear] = [
                'price'      => round($price, 2),
                'volume'     => (int)($row['volume'] ?? 0),
                'updated_at' => (string)($row['recorded_at'] ?? ''),
            ];
        }

        return $latest;
    } catch (Throwable) {
        return [];
    }
}

/**
 * Resolve item_id from Supabase items table by name. Returns $fallback if not found.
 */
function supabaseResolveItemId(string $name, int $fallback): int
{
    $client = supabaseClient();
    if ($client === null || $name === '') {
        return $fallback;
    }

    try {
        $rows = $client->select('items', ['name' => 'eq.' . $name, 'limit' => 1], 'id', 1);
        if ($rows && isset($rows[0]['id'])) {
            return (int)$rows[0]['id'];
        }
    } catch (Throwable) {}

    return $fallback;
}
