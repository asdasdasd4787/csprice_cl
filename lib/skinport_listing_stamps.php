<?php
declare(strict_types=1);

/**
 * Catalog "X items" stamps on Skinport items_index rows.
 * /v1/items `quantity` is a per-hash offer stack and must not overwrite these.
 */

function skinportListingStampKeys(): array
{
    return ['listings', 'items', 'total', 'count', 'filter_total'];
}

function skinportListingCountFromRow(?array $row): ?int
{
    if (!is_array($row)) {
        return null;
    }
    $source = strtolower(trim((string)($row['listings_source'] ?? $row['skinport_listings_source'] ?? '')));
    if ($source === 'quantity') {
        return null;
    }
    foreach (skinportListingStampKeys() as $key) {
        if (!isset($row[$key]) || !is_numeric($row[$key])) {
            continue;
        }
        $count = (int)$row[$key];
        if ($count > 0) {
            return $count;
        }
    }
    return null;
}

function skinportLoadItemsIndexMap(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $decoded = json_decode((string)@file_get_contents($path), true);
    return is_array($decoded['items'] ?? null) ? $decoded['items'] : [];
}

function skinportLoadItemsIndexMeta(string $path): array
{
    if (!is_file($path)) {
        return [];
    }
    $decoded = json_decode((string)@file_get_contents($path), true);
    return is_array($decoded) ? $decoded : [];
}

/**
 * Copy trusted catalog listing stamps onto a freshly pulled /v1/items map.
 *
 * @param array<string, array<string, mixed>> $newItems
 * @param array<string, array<string, mixed>> $oldItems
 * @return array<string, array<string, mixed>>
 */
function skinportMergeListingStamps(array $newItems, array $oldItems): array
{
    if (!$oldItems) {
        return $newItems;
    }
    foreach ($newItems as $name => $row) {
        if (!is_string($name) || !is_array($row)) {
            continue;
        }
        $incoming = skinportListingCountFromRow($row);
        if ($incoming !== null && $incoming > 0) {
            continue;
        }
        $prev = is_array($oldItems[$name] ?? null) ? $oldItems[$name] : null;
        $prevCount = skinportListingCountFromRow($prev);
        if ($prevCount === null || $prevCount <= 0) {
            continue;
        }
        $row['listings'] = $prevCount;
        $row['items'] = $prevCount;
        $row['listings_source'] = (string)($prev['listings_source'] ?? 'item_menus_listings');
        if (isset($prev['listings_fetched_at'])) {
            $row['listings_fetched_at'] = $prev['listings_fetched_at'];
        }
        $newItems[$name] = $row;
    }
    return $newItems;
}
