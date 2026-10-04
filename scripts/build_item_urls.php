<?php
/**
 * Pretty item URLs without server rewrites.
 *
 * The host serves static files straight from nginx and ignores .htaccess, so a
 * URL only exists if a file sits at that path. This writes one small page per
 * catalog item:
 *
 *   /skins/awp-dragon-lore/index.html
 *   /stickers/apex-gold-paris-2023/index.html
 *   /cases/kilowatt-case/index.html
 *
 * Each page is item_page.html with the production <base>, the same local-base
 * guard the clean-URL folders use, its own SEO title/description/canonical, and
 * a window.__ITEM_ROUTE__ object that tells react/item-page.tsx which item to
 * show. No query string, so the address bar stays clean.
 *
 *   C:\xampp\php\php.exe scripts\build_item_urls.php            (write pages)
 *   C:\xampp\php\php.exe scripts\build_item_urls.php --dry-run  (count only)
 */
declare(strict_types=1);

ini_set('memory_limit', '2048M');
@set_time_limit(0);

require_once __DIR__ . '/item_url_slug.php';

$root = dirname(__DIR__);
$dryRun = in_array('--dry-run', $argv, true);
$shellPath = $root . '/item_page.html';
$catalogPath = $root . '/assets/steam-market-cache/roi_catalog.json';

foreach ([$shellPath, $catalogPath] as $needed) {
    if (!is_file($needed)) {
        fwrite(STDERR, "missing $needed\n");
        exit(1);
    }
}

$shell = (string)file_get_contents($shellPath);
$localBase = preg_match('#[\\\\/]htdocs[\\\\/]#i', $root . DIRECTORY_SEPARATOR)
    ? '/' . basename($root) . '/'
    : '/';

$data = json_decode((string)file_get_contents($catalogPath), true);
$items = is_array($data['items'] ?? null) ? $data['items'] : (is_array($data) ? $data : []);
if (!$items) {
    fwrite(STDERR, "empty catalog\n");
    exit(1);
}

$stripWear = static fn(string $n): string => trim((string)preg_replace(
    '/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu',
    '',
    $n
));

// One page per item, wear collapsed. Keep the cheapest-listed row of each
// group so the generated description has a sensible price to quote.
$pages = [];
foreach ($items as $item) {
    if (!is_array($item)) {
        continue;
    }
    $name = trim((string)($item['market_hash_name'] ?? ''));
    if ($name === '') {
        continue;
    }
    $base = $stripWear($name);
    $section = itemUrlSection((string)($item['category'] ?? ''), (string)($item['sub_filter'] ?? ''));
    $slug = itemUrlSlug($base);
    $key = $section . '/' . $slug;
    $price = is_numeric($item['seed_sell_price'] ?? null) ? (float)$item['seed_sell_price'] : 0.0;

    if (!isset($pages[$key])) {
        $pages[$key] = [
            'section' => $section,
            'slug' => $slug,
            'name' => $base,
            'display' => trim((string)($item['display_name'] ?? $base)),
            'type' => trim((string)($item['type_note'] ?? '')),
            'category' => (string)($item['category'] ?? ''),
            'color' => trim((string)($item['name_color'] ?? '')),
            // Without this the page has no picture until the catalogue loads,
            // and item-page.tsx fills the gap with its M4A1-S | Vaporwave
            // template image - so every skin flashed an M4A1 first.
            'image' => trim((string)($item['image'] ?? $item['steam_image_url'] ?? '')),
            'price' => $price,
        ];
        continue;
    }
    if ($price > 0 && ($pages[$key]['price'] <= 0 || $price < $pages[$key]['price'])) {
        $pages[$key]['price'] = $price;
    }
}

printf("catalog rows: %d -> %d pretty pages\n", count($items), count($pages));
if ($dryRun) {
    $bySection = [];
    foreach ($pages as $p) {
        $bySection[$p['section']] = ($bySection[$p['section']] ?? 0) + 1;
    }
    ksort($bySection);
    foreach ($bySection as $section => $n) {
        printf("  %-14s %6d\n", $section, $n);
    }
    exit(0);
}

$baseBlock = '<base href="/">'
    . "\n  " . '<script>/* csprice-base-guard */(function(){try{var h=location.hostname,'
    . 'local=(h==="localhost"||h==="127.0.0.1"||h==="[::1]"||h.indexOf("192.168.")===0),'
    . 'want=local?' . json_encode($localBase, JSON_UNESCAPED_SLASHES) . ':"/",'
    . 'b=document.getElementsByTagName("base")[0];'
    . 'if(b&&b.getAttribute("href")!==want){b.setAttribute("href",want);}}catch(e){}})();</script>';

$written = 0;
$unchanged = 0;
$index = [];
foreach ($pages as $key => $page) {
    $title = $page['display'] . ' Price – CS2 Market Price & History | CSPRICE';
    $priceText = $page['price'] > 0 ? ' Current price from €' . number_format($page['price'], 2, '.', '') . '.' : '';
    $description = 'Live ' . $page['display'] . ' prices across Steam, Skinport, CSFloat, White.Market and DMarket, with full price history and wear comparison.' . $priceText;
    $canonical = 'https://csprice.eu/' . $key . '/';

    // First-paint data (item_bootstrap.php) starts from <head>, before any
    // script. The URL has to match react/item-page.tsx byte for byte or the
    // browser will not hand the preloaded response to the page's fetch: same
    // parameter order, http_build_query's "+" for spaces, wear only for items
    // that have wears, range ALL (the page's default).
    $bootstrapQuery = http_build_query([
        'lookup_name' => $page['name'],
        'wear' => $page['section'] === 'skins' ? 'Factory New' : '',
        'range' => 'ALL',
    ]);

    $head = $baseBlock
        . "\n  " . '<link rel="preload" as="fetch" crossorigin="anonymous" href="item_bootstrap.php?' . htmlspecialchars($bootstrapQuery, ENT_QUOTES) . '">'
        . "\n  " . '<script>window.__ITEM_ROUTE__=' . json_encode(array_filter([
            'lookup_name' => $page['name'],
            'display_name' => $page['display'],
            'market_hash_name' => $page['name'],
            'type' => $page['type'],
            'category' => $page['category'],
            'color' => $page['color'],
            'image' => $page['image'],
        ], static fn($value): bool => $value !== ''), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . ';</script>';

    $html = preg_replace('/<head([^>]*)>/i', '<head$1>' . "\n  " . $head, $shell, 1, $hits);
    if ($hits !== 1 || !is_string($html)) {
        fwrite(STDERR, "skip $key: no <head> in shell\n");
        continue;
    }

    // Per-item SEO, replacing the shell's generic tags.
    $html = preg_replace('#<title>.*?</title>#is', '<title>' . htmlspecialchars($title, ENT_QUOTES) . '</title>', $html, 1);
    $html = preg_replace(
        '#<meta name="description" content="[^"]*">#i',
        '<meta name="description" content="' . htmlspecialchars($description, ENT_QUOTES) . '">',
        $html,
        1
    );
    foreach ([
        ['#<link rel="canonical" href="[^"]*">#i', '<link rel="canonical" href="' . $canonical . '">'],
        ['#<meta property="og:url" content="[^"]*">#i', '<meta property="og:url" content="' . $canonical . '">'],
        ['#<meta property="og:title" content="[^"]*">#i', '<meta property="og:title" content="' . htmlspecialchars($title, ENT_QUOTES) . '">'],
        ['#<meta property="og:description" content="[^"]*">#i', '<meta property="og:description" content="' . htmlspecialchars($description, ENT_QUOTES) . '">'],
        ['#<meta name="twitter:title" content="[^"]*">#i', '<meta name="twitter:title" content="' . htmlspecialchars($title, ENT_QUOTES) . '">'],
        ['#<meta name="twitter:description" content="[^"]*">#i', '<meta name="twitter:description" content="' . htmlspecialchars($description, ENT_QUOTES) . '">'],
    ] as [$pattern, $replacement]) {
        $html = preg_replace($pattern, $replacement, $html, 1) ?? $html;
    }

    $dir = $root . '/' . $key;
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        fwrite(STDERR, "mkdir failed: $dir\n");
        continue;
    }
    $target = $dir . '/index.html';
    if (is_file($target) && file_get_contents($target) === $html) {
        $unchanged++;
    } else {
        file_put_contents($target, $html);
        $written++;
    }
    $index[] = $key;
}

// Section roots. Six of them (agents/, cases/, stickers/, ...) already get a
// real page from build_clean_urls.php because a top-level <section>.html
// exists; the rest would be a bare directory, which nginx answers with 403.
// Give those a small redirect stub pointing at the closest real page.
$sectionHome = [
    'skins' => '/',
    'music-kits' => '/music/',
    'collectibles' => '/pins/',
    'misc' => '/other/',
];
$stubs = 0;
foreach (array_unique(array_map(static fn(array $p): string => $p['section'], $pages)) as $section) {
    if (is_file($root . '/' . $section . '.html')) {
        continue; // build_clean_urls.php owns this folder's index.html
    }
    $target = $sectionHome[$section] ?? '/';
    $dir = $root . '/' . $section;
    if (!is_dir($dir)) {
        continue;
    }
    $stub = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
        . '<title>CSPRICE</title>' . "\n"
        . '<meta name="robots" content="noindex,follow">' . "\n"
        . '<link rel="canonical" href="https://csprice.eu' . $target . '">' . "\n"
        . '<meta http-equiv="refresh" content="0; url=' . $target . '">' . "\n"
        . '<script>location.replace(' . json_encode($target, JSON_UNESCAPED_SLASHES) . ');</script>' . "\n"
        . "</head>\n<body><a href=\"$target\">Continue to CSPRICE</a></body>\n</html>\n";
    $file = $dir . '/index.html';
    if (!is_file($file) || file_get_contents($file) !== $stub) {
        file_put_contents($file, $stub);
        $stubs++;
    }
}

sort($index);
file_put_contents($root . '/assets/data/item-url-index.json', json_encode([
    'generated' => gmdate('c'),
    'count' => count($index),
    // Every generated page is a copy of item_page.html, so when the shell
    // changes (a cache-tag bump is enough) all 28k pages are stale. The deploy
    // compares this against what upload_item_urls.ps1 last published.
    'shell_sha1' => sha1($shell),
    'paths' => $index,
], JSON_UNESCAPED_SLASHES));

printf("%d written, %d unchanged, %d section stubs, index has %d paths\n", $written, $unchanged, $stubs, count($index));
