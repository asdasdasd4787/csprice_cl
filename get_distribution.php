<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

if (PHP_SAPI !== 'cli') {
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
}

try {
    $lookupName = trim((string)($_GET['lookup_name'] ?? ''));
    $requestedItemId = isset($_GET['item_id']) ? (int)$_GET['item_id'] : 1;
    $range = strtoupper((string)($_GET['range'] ?? '1M'));

    $days = match ($range) {
        '6M' => 180,
        '1Y' => 365,
        default => 30,
    };

    /** @var array<string, array{marketplace:string,volume:int,avg_price:float}> $byMarket */
    $byMarket = [];

    $upsert = static function (array &$byMarket, string $marketplace, int $volume, mixed $avgPrice, bool $preferIncoming = false): void {
        $name = trim($marketplace);
        if ($name === '' || $volume <= 0) {
            return;
        }
        $avg = is_numeric($avgPrice) && (float)$avgPrice > 0 ? (float)$avgPrice : 0.0;
        if (!isset($byMarket[$name])) {
            $byMarket[$name] = [
                'marketplace' => $name,
                'volume' => $volume,
                'avg_price' => $avg,
            ];
            return;
        }
        if ($preferIncoming || $volume >= (int)$byMarket[$name]['volume']) {
            $byMarket[$name]['volume'] = $volume;
            if ($avg > 0) {
                $byMarket[$name]['avg_price'] = $avg;
            }
        } elseif ($byMarket[$name]['avg_price'] <= 0 && $avg > 0) {
            $byMarket[$name]['avg_price'] = $avg;
        }
    };

    // Historical price_history SUM (optional; often incomplete / Skinport-only).
    // Only for an item that really exists in the history DB: resolveDataDbItemId()
    // falls back to item 1 for unknown names, and item 1's Skinport history
    // (722 sales) then showed up on every patch, sticker and case that had no
    // row of its own.
    try {
        $connection = marketHistoryPdoConnection();
        $driver = pdoDriverName($connection);
        $historyItemId = 0;
        if ($lookupName === '') {
            $historyItemId = $requestedItemId;
        } elseif (dbTableExists($connection, 'items')) {
            [$historyBaseName] = splitSteamWear($lookupName);
            $lookupStatement = $connection->prepare('SELECT id FROM items WHERE name = :name ORDER BY id ASC');
            foreach (array_unique(array_filter([$lookupName, $historyBaseName])) as $candidate) {
                $lookupStatement->execute([':name' => $candidate]);
                $resolved = $lookupStatement->fetchColumn();
                if ($resolved !== false) {
                    $historyItemId = (int)$resolved;
                    break;
                }
            }
        }
        if ($historyItemId > 0 && dbColumnExists($connection, 'price_history', 'source')) {
            $itemId = $historyItemId;
            $where = implode(' AND ', [
                'item_id = :item_id',
                'recorded_at >= ' . dbDaysAgoSql($days, $driver),
            ]);
            $statement = $connection->prepare(
                "SELECT
                    source AS marketplace,
                    COALESCE(SUM(volume), 0) AS volume,
                    ROUND(AVG(price), 2) AS avg_price
                 FROM price_history
                 WHERE {$where}
                 GROUP BY source
                 ORDER BY volume DESC"
            );
            $statement->execute([':item_id' => $itemId]);
            foreach ($statement->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
                $marketplace = (string)($row['marketplace'] ?? '');
                if (strcasecmp(trim($marketplace), 'Steam') === 0 || strcasecmp(trim($marketplace), 'steam') === 0) {
                    continue;
                }
                $upsert(
                    $byMarket,
                    $marketplace,
                    (int)($row['volume'] ?? 0),
                    $row['avg_price'] ?? 0,
                    false
                );
            }
        }
    } catch (Throwable) {
        // History DB is optional when live caches have stock.
    }

    // Live listing stock for every tracked marketplace (same source as AI charts).
    // Steam uses Market search/listings total_count, never priceoverview 24h volume.
    // Painted skins: query every wear (+ StatTrak) and merge. Skinport catalog
    // stamps are already all-wear — take that count once. Steam is per-hash, so sum.
    if ($lookupName !== '') {
        try {
            $helpers = __DIR__ . '/ai_chat_helpers.php';
            if (is_file($helpers)) {
                require_once $helpers;
            }
            if (function_exists('aiChatEnsureSteamListingHelpers')) {
                aiChatEnsureSteamListingHelpers();
            }

            $familyNames = function_exists('cachedSteamFamilyMarketNames')
                ? cachedSteamFamilyMarketNames($lookupName)
                : [$lookupName];
            if (!$familyNames) {
                $familyNames = [$lookupName];
            }

            $steamFamily = null;
            if (function_exists('cachedRefreshSteamFamilyListingCounts') && count($familyNames) > 1) {
                try {
                    $steamFamily = cachedRefreshSteamFamilyListingCounts($lookupName, 12 * 3600);
                } catch (Throwable) {
                    $steamFamily = null;
                }
            }

            // Single-hash items (agents, cases, stickers, capsules, charms, music kits)
            // have no wear family, so the family refresh above never runs for them and
            // Steam sat at 0. Read the cached total; live-fetch when missing or stale.
            $steamSingle = 0;
            if (count($familyNames) === 1 && function_exists('cachedReadSteamListingCount')) {
                try {
                    $singleName = (string)$familyNames[0];
                    $steamSingle = cachedReadSteamListingCount($singleName);
                    $singleFetchedAt = 0;
                    $singleIndexPath = function_exists('cachedSteamListingCountsIndexPath') ? cachedSteamListingCountsIndexPath() : '';
                    if ($singleIndexPath !== '' && is_file($singleIndexPath)) {
                        $singleIndex = json_decode((string)@file_get_contents($singleIndexPath), true);
                        $singleFetchedAt = (int)($singleIndex['map'][$singleName]['fetched_at'] ?? 0);
                    }
                    $singleStale = $steamSingle <= 0 || $singleFetchedAt <= 0 || (time() - $singleFetchedAt) >= 12 * 3600;
                    if ($singleStale && function_exists('cachedLiveFetchSteamListingTotalCount')) {
                        $live = cachedLiveFetchSteamListingTotalCount($singleName);
                        $liveCount = is_array($live) ? (int)($live['count'] ?? 0) : 0;
                        if ($liveCount > 0) {
                            $steamSingle = $liveCount;
                            if (function_exists('cachedPersistSteamListingCount')) {
                                cachedPersistSteamListingCount($singleName, $liveCount, (string)($live['source'] ?? 'steam_total_count'));
                            }
                        }
                    }
                } catch (Throwable) {
                    $steamSingle = 0;
                }
            }

            $volumesByMarket = [];
            $record = static function (array &$volumesByMarket, string $familyName, string $marketplace, int $volume, mixed $avg = 0, string $source = ''): void {
                if ($marketplace === '' || $volume <= 0) {
                    return;
                }
                $volumesByMarket[$marketplace][$familyName] = [
                    'volume' => $volume,
                    'avg_price' => $avg,
                    'source' => $source,
                ];
            };

            $readJson = static function (string $path): ?array {
                if (!is_file($path)) {
                    return null;
                }
                $decoded = json_decode((string)@file_get_contents($path), true);
                return is_array($decoded) ? $decoded : null;
            };
            $spCounts = $readJson(__DIR__ . '/assets/skinport-cache/listing_counts.json');
            $spIndex = null;
            $csfloat = $readJson(__DIR__ . '/assets/csfloat-cache/_price_list_index.json');
            $csfloatMap = is_array($csfloat['map'] ?? null) ? $csfloat['map'] : [];
            $wmPath = __DIR__ . '/assets/white-market-cache/prices_730.json';
            $wmExport = $readJson($wmPath);
            $wmRows = [];
            if (is_array($wmExport)) {
                $raw = is_array($wmExport['items'] ?? null)
                    ? $wmExport['items']
                    : (is_array($wmExport['data'] ?? null) ? $wmExport['data'] : $wmExport);
                foreach ((array)$raw as $wmRow) {
                    if (!is_array($wmRow)) {
                        continue;
                    }
                    $wmName = trim((string)($wmRow['market_hash_name'] ?? $wmRow['name'] ?? ''));
                    if ($wmName !== '') {
                        $wmRows[$wmName] = $wmRow;
                    }
                }
            }
            $priceIndexes = [
                'Waxpeer' => __DIR__ . '/assets/waxpeer-cache/prices_csgo.json',
                'Mannco.store' => __DIR__ . '/assets/mannco-cache/prices_csgo.json',
                'ShadowPay' => __DIR__ . '/assets/shadowpay-cache/prices_eur.json',
                'Market.CSGO' => __DIR__ . '/assets/market-csgo-cache/prices_eur.json',
            ];
            $priceMaps = [];
            foreach ($priceIndexes as $label => $path) {
                $decoded = $readJson($path);
                $priceMaps[$label] = is_array($decoded['index'] ?? null) ? $decoded['index'] : [];
            }

            foreach ($familyNames as $familyName) {
                $hash = md5($familyName);
                $spRow = is_array($spCounts['map'][$familyName] ?? null) ? $spCounts['map'][$familyName] : null;
                $spListings = is_array($spRow) ? (int)($spRow['listings'] ?? 0) : 0;
                $spSource = 'skinport_listing_index';
                if ($spListings <= 0) {
                    if ($spIndex === null) {
                        $spIndex = $readJson(__DIR__ . '/assets/skinport-cache/items_index.json');
                    }
                    if (is_array($spIndex['items'][$familyName] ?? null) && function_exists('aiChatSkinportListingCountFromSnapshot')) {
                        $spListings = aiChatSkinportListingCountFromSnapshot($spIndex['items'][$familyName]);
                    }
                    // No catalog stamp for this name: the /v1/items offer count is
                    // per hash, so it is summed across wears below instead of
                    // taken once like a stamp.
                    if ($spListings <= 0 && is_numeric($spIndex['items'][$familyName]['quantity'] ?? null)) {
                        $spListings = (int)$spIndex['items'][$familyName]['quantity'];
                        $spSource = 'skinport_quantity';
                    }
                }
                $record($volumesByMarket, $familyName, 'Skinport', $spListings, is_array($spIndex['items'][$familyName] ?? null) ? ($spIndex['items'][$familyName]['min_price'] ?? null) : null, $spSource);
                if (isset($csfloatMap[$familyName]) && is_numeric($csfloatMap[$familyName]['quantity'] ?? null)) {
                    $record($volumesByMarket, $familyName, 'CSFloat', (int)$csfloatMap[$familyName]['quantity'], null, 'csfloat_index');
                }
                if (isset($wmRows[$familyName])) {
                    $wmVol = 0;
                    foreach (['market_product_count', 'similarQty', 'similar_qty', 'quantity', 'listings'] as $key) {
                        if (isset($wmRows[$familyName][$key]) && is_numeric($wmRows[$familyName][$key]) && (int)$wmRows[$familyName][$key] > 0) {
                            $wmVol = (int)$wmRows[$familyName][$key];
                            break;
                        }
                    }
                    $record(
                        $volumesByMarket,
                        $familyName,
                        'White.Market',
                        $wmVol,
                        $wmRows[$familyName]['min_price'] ?? $wmRows[$familyName]['price'] ?? null,
                        'white_market_export'
                    );
                }
                foreach ($priceMaps as $label => $index) {
                    $entry = is_array($index[$familyName] ?? null) ? $index[$familyName] : null;
                    if (!$entry) {
                        continue;
                    }
                    $vol = 0;
                    if (function_exists('aiChatSnapshotListingCount')) {
                        $vol = aiChatSnapshotListingCount($entry);
                    } else {
                        foreach (['listings', 'quantity', 'qty', 'volume', 'sell_orders'] as $key) {
                            if (isset($entry[$key]) && is_numeric($entry[$key]) && (int)$entry[$key] > 0) {
                                $vol = (int)$entry[$key];
                                break;
                            }
                        }
                    }
                    $record($volumesByMarket, $familyName, $label, $vol, $entry['price'] ?? null, 'price_index');
                }
                foreach ([
                    ['DMarket', __DIR__ . '/assets/dmarket-cache/' . $hash . '.json'],
                    ['HaloSkins', __DIR__ . '/assets/haloskins-cache/' . $hash . '_quote.json'],
                ] as [$label, $path]) {
                    $snap = $readJson($path);
                    if (!is_array($snap) || !empty($snap['_no_listing'])) {
                        continue;
                    }
                    $vol = function_exists('aiChatSnapshotListingCount')
                        ? aiChatSnapshotListingCount($snap)
                        : 0;
                    if ($vol <= 0) {
                        foreach (['listings', 'quantity', 'qty', 'volume', 'sell_orders'] as $key) {
                            if (isset($snap[$key]) && is_numeric($snap[$key]) && (int)$snap[$key] > 0) {
                                $vol = (int)$snap[$key];
                                break;
                            }
                        }
                    }
                    $record($volumesByMarket, $familyName, $label, $vol, $snap['current_price'] ?? $snap['price'] ?? null, 'quote_file');
                }
            }

            foreach ($volumesByMarket as $marketplace => $perName) {
                $volumes = array_map(static fn(array $row): int => (int)$row['volume'], $perName);
                $positive = array_values(array_filter($volumes, static fn(int $n): bool => $n > 0));
                if (!$positive) {
                    continue;
                }
                $unique = array_values(array_unique($positive));
                $isSteam = strcasecmp($marketplace, 'Steam') === 0;
                $isSkinport = strcasecmp($marketplace, 'Skinport') === 0;
                $alreadyAllWear = !$isSteam
                    && count($positive) >= 2
                    && count($unique) === 1;
                // Skinport catalog stamps are all-wear (take once); per-hash offer
                // counts from /v1/items add up like every other marketplace.
                $skinportStamps = $isSkinport
                    ? array_values(array_filter($perName, static fn(array $row): bool => (int)$row['volume'] > 0 && $row['source'] !== 'skinport_quantity'))
                    : [];
                if ($isSkinport && !$skinportStamps) {
                    $merged = array_sum($positive);
                } elseif ($isSkinport) {
                    $merged = (int)$skinportStamps[0]['volume'];
                } else {
                    $merged = $alreadyAllWear ? (int)$unique[0] : array_sum($positive);
                }
                $avg = 0.0;
                foreach ($perName as $row) {
                    if (is_numeric($row['avg_price']) && (float)$row['avg_price'] > 0) {
                        $avg = (float)$row['avg_price'];
                        break;
                    }
                }
                $upsert($byMarket, $marketplace, $merged, $avg, true);
            }

            if (is_array($steamFamily) && (int)($steamFamily['total'] ?? 0) > 0) {
                $upsert($byMarket, 'Steam', (int)$steamFamily['total'], $byMarket['Steam']['avg_price'] ?? 0, true);
            } elseif ($steamSingle > 0) {
                $upsert($byMarket, 'Steam', $steamSingle, $byMarket['Steam']['avg_price'] ?? 0, true);
            }
        } catch (Throwable) {
            // Live cache overlay is best-effort.
        }
    }

    if (!$byMarket) {
        respondJson(['total' => 0, 'data' => []]);
    }

    $data = array_values($byMarket);
    usort($data, static fn(array $a, array $b): int => ((int)$b['volume'] <=> (int)$a['volume']));
    $total = array_sum(array_map(static fn(array $row): int => (int)$row['volume'], $data));

    $out = [];
    foreach ($data as $row) {
        $volume = (int)$row['volume'];
        if ($volume <= 0 || $total <= 0) {
            continue;
        }
        $out[] = [
            'marketplace' => (string)$row['marketplace'],
            'volume' => $volume,
            'pct' => round(($volume / $total) * 100, 2),
            'avg_price' => (float)$row['avg_price'],
        ];
    }

    respondJson([
        'total' => $total,
        'data' => $out,
        'updated_at' => gmdate('c'),
        'source' => 'live_listing_caches',
        'wear_scope' => 'all',
    ]);
} catch (Throwable $exception) {
    respondJson(['error' => $exception->getMessage()], 500);
}
