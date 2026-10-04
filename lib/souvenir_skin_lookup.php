<?php
declare(strict_types=1);

function souvenirSkinLookupPath(): string
{
    return __DIR__ . '/../assets/data/souvenir-skin-lookup.json';
}

/**
 * @return array{version?:int,bases?:array<int,string>,count?:int}
 */
function loadSouvenirSkinLookup(): array
{
    static $cache = null;
    if (is_array($cache)) {
        return $cache;
    }

    $path = souvenirSkinLookupPath();
    if (!is_file($path)) {
        $cache = ['bases' => []];
        return $cache;
    }

    $decoded = json_decode((string)file_get_contents($path), true);
    $cache = is_array($decoded) ? $decoded : ['bases' => []];
    return $cache;
}

function souvenirSkinLookupKey(string $baseName): string
{
    $name = trim($baseName);
    $name = preg_replace('/^Souvenir\s+/iu', '', $name) ?? $name;
    $name = preg_replace('/^StatTrak™\s+/iu', '', $name) ?? $name;
    $name = preg_replace('/^★\s*/u', '', $name) ?? $name;
    $name = preg_replace('/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu', '', $name) ?? $name;
    return mb_strtolower(trim($name));
}

function skinSupportsSouvenirVariant(string $baseName): bool
{
    $key = souvenirSkinLookupKey($baseName);
    if ($key === '') {
        return false;
    }

    $lookup = loadSouvenirSkinLookup();
    $bases = is_array($lookup['bases'] ?? null) ? $lookup['bases'] : [];
    return in_array($key, $bases, true);
}
