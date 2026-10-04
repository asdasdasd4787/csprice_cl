<?php
/**
 * Pretty URLs for the skin crafter.
 *
 * The crafter used to keep its state in the query string:
 *
 *   /viewer3d/?skin=AK-47+%7C+Ice+Coaled&wear=Field-Tested
 *
 * The host serves static files straight from nginx and ignores .htaccess, so a
 * URL only exists if a file sits at that path. This writes one small page per
 * craftable skin, and one per wear of it:
 *
 *   /skin-crafter/ak-47-ice-coaled/index.html
 *   /skin-crafter/ak-47-ice-coaled/field-tested/index.html
 *
 * Only skins with a baked 3D model can be crafted (assets/models/skins/
 * manifest.json - 129 of them), so this stays small next to the item pages.
 *
 * Each page is skin-crafter.html with the production <base>, the local-base
 * guard the other generated pages use, its own SEO title/canonical, and a
 * window.__CRAFTER_ROUTE__ object telling react/viewer3d-page.jsx what to load.
 *
 *   C:\xampp\php\php.exe scripts\build_crafter_urls.php
 *   C:\xampp\php\php.exe scripts\build_crafter_urls.php --dry-run
 */
declare(strict_types=1);

require_once __DIR__ . '/item_url_slug.php';

$root = dirname(__DIR__);
$dryRun = in_array('--dry-run', $argv, true);
$shellPath = $root . '/skin-crafter.html';
if (!is_file($shellPath)) {
    fwrite(STDERR, "missing $shellPath\n");
    exit(1);
}

$shell = (string)file_get_contents($shellPath);
$localBase = preg_match('#[\\\\/]htdocs[\\\\/]#i', $root . DIRECTORY_SEPARATOR)
    ? '/' . basename($root) . '/'
    : '/';

// Two sources feed the crafter: the baked-model manifest and the batch map
// behind get_crafter_batch_library.php (what the skin picker actually lists).
// Take the union - a page for a skin the picker never shows costs 4 KB, a
// missing page for one it does show is a 404 in the address bar.
$skins = [];
$sources = [
    $root . '/assets/models/skins/manifest.json',
    $root . '/assets/models/crafter/batch-map.json',
];
foreach ($sources as $path) {
    if (!is_file($path)) {
        fwrite(STDERR, "note: $path missing, skipped\n");
        continue;
    }
    $decoded = json_decode((string)file_get_contents($path), true);
    $items = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];
    foreach ($items as $entry) {
        $name = trim((string)($entry['market_name'] ?? ''));
        if ($name === '') {
            continue;
        }
        $slug = catalogGroupSlug($name);
        if ($slug === '' || isset($skins[$slug])) {
            continue;
        }
        $skins[$slug] = $name;
    }
}
if (!$skins) {
    fwrite(STDERR, "no craftable skins found\n");
    exit(1);
}
ksort($skins);

$wears = crafterWearSlugs();
printf("%d craftable skins -> %d pages\n", count($skins), count($skins) * (1 + count($wears)));
if ($dryRun) {
    foreach (array_keys($skins) as $slug) {
        echo "  skin-crafter/$slug/\n";
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

$writePage = static function (string $path, string $skinName, string $wear) use (
    $root, $shell, $baseBlock, &$written, &$unchanged, &$index
): void {
    $wearSuffix = $wear !== '' ? ' (' . $wear . ')' : '';
    $title = $skinName . $wearSuffix . ' – 3D Skin Crafter | CSPRICE';
    $description = 'Preview ' . $skinName . $wearSuffix
        . ' in 3D, place stickers and charms on it, change the wear and see what the craft costs before you buy.';
    $canonical = 'https://csprice.eu/' . $path . '/';

    $head = $baseBlock
        . "\n  " . '<script>window.__CRAFTER_ROUTE__=' . json_encode([
            'skin' => $skinName,
            'wear' => $wear,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . ';</script>';

    $hits = 0;
    $html = preg_replace('/<head([^>]*)>/i', '<head$1>' . "\n  " . $head, $shell, 1, $hits);
    if ($hits !== 1 || !is_string($html)) {
        fwrite(STDERR, "skip $path: no <head> in shell\n");
        return;
    }

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

    $dir = $root . '/' . $path;
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        fwrite(STDERR, "mkdir failed: $dir\n");
        return;
    }
    $target = $dir . '/index.html';
    if (is_file($target) && file_get_contents($target) === $html) {
        $unchanged++;
    } else {
        file_put_contents($target, $html);
        $written++;
    }
    $index[] = $path;
};

foreach ($skins as $slug => $name) {
    // Bare skin: the crafter's own default wear, whatever that is.
    $writePage('skin-crafter/' . $slug, $name, '');
    foreach ($wears as $wear => $wearSlug) {
        $writePage('skin-crafter/' . $slug . '/' . $wearSlug, $name, $wear);
    }
}

sort($index);
file_put_contents($root . '/assets/data/crafter-url-index.json', json_encode([
    'generated' => gmdate('c'),
    'count' => count($index),
    'shell_sha1' => sha1($shell),
    'paths' => $index,
], JSON_UNESCAPED_SLASHES));

printf("%d written, %d unchanged, index has %d paths\n", $written, $unchanged, count($index));
