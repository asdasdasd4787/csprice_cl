<?php
/**
 * SEO helpers shared by item_page.php and the sitemap / index builders.
 * Deliberately dependency-free: item_page.php must stay fast and boot without
 * the database.
 */
declare(strict_types=1);

const SEO_SITE_URL = 'https://csprice.eu';
const SEO_SITE_NAME = 'CSPRICE';
const SEO_DEFAULT_IMAGE = 'https://csprice.eu/assets/og-csai.png';

function seoStripWear(string $name): string
{
    return trim((string)preg_replace('/\s*\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu', '', $name));
}

function seoItemKey(string $name): string
{
    $key = mb_strtolower(trim($name));
    return (string)preg_replace('/\s+/u', ' ', $key);
}

function seoShardName(string $key): string
{
    $first = mb_substr($key, 0, 1);
    if ($first === '' || !preg_match('/^[a-z0-9]$/u', $first)) {
        return '_';
    }
    return $first;
}

/**
 * @return array{n:string,d:string,i:string,c:string,k:string,t:string,r:string,col:string}|null
 */
function seoItemLookup(string $name): ?array
{
    static $cache = [];
    $name = trim($name);
    if ($name === '') {
        return null;
    }
    foreach ([seoItemKey($name), seoItemKey(seoStripWear($name))] as $key) {
        if ($key === '') {
            continue;
        }
        $shard = seoShardName($key);
        if (!array_key_exists($shard, $cache)) {
            $path = __DIR__ . '/assets/seo/idx/' . $shard . '.json';
            $decoded = is_file($path) ? json_decode((string)file_get_contents($path), true) : null;
            $cache[$shard] = is_array($decoded) ? $decoded : [];
        }
        if (isset($cache[$shard][$key]) && is_array($cache[$shard][$key])) {
            return $cache[$shard][$key];
        }
    }
    return null;
}

require_once __DIR__ . '/scripts/item_url_slug.php';

/**
 * The URL an item should be known by: the generated pretty page when it has
 * one (/skins/awp-dragon-lore/), else the query-string page. Canonicals and
 * structured data use this, so crawlers index the clean address.
 */
function seoItemUrl(string $name, string $category = ''): string
{
    $pretty = itemUrlPrettyPath(seoStripWear($name), $category);
    if ($pretty !== '') {
        return SEO_SITE_URL . '/' . $pretty . '/';
    }
    return SEO_SITE_URL . '/item_page.php?display_name=' . rawurlencode($name);
}

function seoWearLabel(string $name): string
{
    return preg_match('/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu', $name, $m) ? $m[1] : '';
}

/**
 * Title / description for an item page. Works from the name alone when the
 * catalog index has no entry.
 *
 * @return array{title:string,description:string,canonical:string,image:string,name:string,category:string,breadcrumb:list<array{name:string,url:string}>}
 */
function seoItemMeta(string $requestedName): array
{
    $base = seoStripWear($requestedName);
    $item = seoItemLookup($requestedName);
    $name = $base !== '' ? $base : 'CS2 item';
    $category = $item ? (string)($item['c'] ?? '') : '';
    $type = $item ? (string)($item['t'] ?? '') : '';
    $image = $item && (string)($item['i'] ?? '') !== '' ? (string)$item['i'] : SEO_DEFAULT_IMAGE;
    if ($image !== '' && !preg_match('#^https?://#i', $image)) {
        $image = SEO_SITE_URL . '/' . ltrim($image, '/');
    }

    $kind = $category !== '' ? $category : 'CS2 item';
    $title = $name . ' Price – CS2 ' . $kind . ' Market Price & History | ' . SEO_SITE_NAME;
    $bits = [];
    $bits[] = 'Current ' . $name . ' price in EUR';
    $bits[] = 'price history and 24h/7d/30d trends';
    $bits[] = 'listings on Steam, Skinport, CSFloat, White.Market, DMarket and more';
    if (str_contains($name, '|') && $category !== '' && !in_array(strtolower($category), ['stickers', 'cases', 'agents', 'charms', 'patches', 'music kits', 'graffiti', 'pins', 'capsules'], true)) {
        $bits[] = 'all wear conditions and StatTrak';
    }
    $bits[] = 'AI market analysis';
    $description = implode(', ', $bits) . '.';
    if ($type !== '') {
        $description = $type . ' — ' . $description;
    }
    if (mb_strlen($description) > 300) {
        $description = mb_substr($description, 0, 297) . '...';
    }

    $breadcrumb = [['name' => 'Home', 'url' => SEO_SITE_URL . '/']];
    $categoryKey = $item ? strtolower((string)($item['k'] ?? '')) : '';
    // Folder form: every one of these pages also exists at /cases/ etc.
    // (scripts/build_clean_urls.php), and that is the address the site shows.
    $categoryPages = [
        'cases' => 'cases', 'stickers' => 'stickers', 'agents' => 'agents', 'charms' => 'charms',
        'patches' => 'patches', 'music' => 'music', 'music_kits' => 'music', 'graffiti' => 'graffiti',
        'pins' => 'pins', 'knives' => 'knives', 'gloves' => 'gloves', 'pistols' => 'pistols',
        'smgs' => 'smgs', 'rifles' => 'rifles', 'heavy' => 'heavy', 'collections' => 'collections',
    ];
    if ($category !== '') {
        $page = $categoryPages[$categoryKey] ?? 'roi';
        $breadcrumb[] = ['name' => $category, 'url' => SEO_SITE_URL . '/' . $page . '/'];
    }
    $breadcrumb[] = ['name' => $name, 'url' => seoItemUrl($name, $categoryKey)];

    return [
        'title' => $title,
        'description' => $description,
        'canonical' => seoItemUrl($name, $categoryKey),
        'image' => $image,
        'name' => $name,
        'category' => $category,
        'breadcrumb' => $breadcrumb,
    ];
}

function seoEscape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * Head tags for an item page (title, description, canonical, OG, Twitter, JSON-LD).
 */
function seoItemHeadHtml(string $requestedName): string
{
    $meta = seoItemMeta($requestedName);
    $product = [
        '@context' => 'https://schema.org',
        '@type' => 'Product',
        'name' => $meta['name'],
        'image' => $meta['image'],
        'description' => $meta['description'],
        'brand' => ['@type' => 'Brand', 'name' => 'Counter-Strike 2'],
        'url' => $meta['canonical'],
    ];
    if ($meta['category'] !== '') {
        $product['category'] = $meta['category'];
    }
    $crumbs = [];
    foreach ($meta['breadcrumb'] as $index => $crumb) {
        $crumbs[] = [
            '@type' => 'ListItem',
            'position' => $index + 1,
            'name' => $crumb['name'],
            'item' => $crumb['url'],
        ];
    }
    $breadcrumb = ['@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => $crumbs];
    $json = static fn(array $data): string => json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP);

    $lines = [
        '<title>' . seoEscape($meta['title']) . '</title>',
        '<meta name="description" content="' . seoEscape($meta['description']) . '">',
        '<link rel="canonical" href="' . seoEscape($meta['canonical']) . '">',
        '<meta property="og:type" content="product">',
        '<meta property="og:site_name" content="' . SEO_SITE_NAME . '">',
        '<meta property="og:title" content="' . seoEscape($meta['title']) . '">',
        '<meta property="og:description" content="' . seoEscape($meta['description']) . '">',
        '<meta property="og:url" content="' . seoEscape($meta['canonical']) . '">',
        '<meta property="og:image" content="' . seoEscape($meta['image']) . '">',
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="twitter:title" content="' . seoEscape($meta['title']) . '">',
        '<meta name="twitter:description" content="' . seoEscape($meta['description']) . '">',
        '<meta name="twitter:image" content="' . seoEscape($meta['image']) . '">',
        '<script type="application/ld+json">' . $json($product) . '</script>',
        '<script type="application/ld+json">' . $json($breadcrumb) . '</script>',
    ];
    return implode("\n  ", $lines);
}

/**
 * The item name an item page request is about, from any of the query params
 * the app uses.
 */
function seoRequestedItemName(array $query): string
{
    foreach (['display_name', 'lookup_name', 'market_hash_name', 'name'] as $key) {
        $value = trim((string)($query[$key] ?? ''));
        if ($value !== '') {
            return $value;
        }
    }
    return '';
}
