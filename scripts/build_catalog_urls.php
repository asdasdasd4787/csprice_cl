<?php
/**
 * Pretty URLs for the weapon listing pages.
 *
 * "Show me every MAC-10 skin" was catalog-items.html?section=weapons&group=
 * MAC-10&weapon_class=smgs. The host serves static files straight from nginx
 * and ignores .htaccess, so a URL only exists if a file sits at that path:
 * this writes one small page per weapon,
 *
 *   /smgs/mac-10/index.html
 *   /pistols/dual-berettas/index.html
 *   /knives/karambit/index.html
 *
 * Each page is catalog-items.html with the production <base>, the local-base
 * guard the other generated pages use, its own SEO title/canonical, and a
 * window.__CATALOG_ROUTE__ object telling react/catalog-items-page.jsx what to
 * list. The weapon-class folders (smgs/, pistols/, ...) already exist because
 * each one is a page in its own right - scripts/build_clean_urls.php owns
 * their index.html, this only adds folders beside it.
 *
 *   C:\xampp\php\php.exe scripts\build_catalog_urls.php
 *   C:\xampp\php\php.exe scripts\build_catalog_urls.php --dry-run
 */
declare(strict_types=1);

require_once __DIR__ . '/item_url_slug.php';

$root = dirname(__DIR__);
$dryRun = in_array('--dry-run', $argv, true);
$shellPath = $root . '/catalog-items.html';
if (!is_file($shellPath)) {
    fwrite(STDERR, "missing $shellPath\n");
    exit(1);
}
$shell = (string)file_get_contents($shellPath);
$localBase = preg_match('#[\\\\/]htdocs[\\\\/]#i', $root . DIRECTORY_SEPARATOR)
    ? '/' . basename($root) . '/'
    : '/';

// Skin counts per weapon, for the description. Missing file is not fatal.
$counts = [];
$countsPath = $root . '/assets/data/catalog-counts.json';
if (is_file($countsPath)) {
    $decoded = json_decode((string)file_get_contents($countsPath), true);
    $counts = is_array($decoded['weapons'] ?? null) ? $decoded['weapons'] : [];
}

$classLabels = [
    'pistols' => 'Pistol',
    'smgs' => 'SMG',
    'shotguns' => 'Shotgun',
    'lmgs' => 'LMG',
    'rifles' => 'Rifle',
    'knives' => 'Knife',
    'gloves' => 'Glove',
];

$baseBlock = '<base href="/">'
    . "\n  " . '<script>/* csprice-base-guard */(function(){try{var h=location.hostname,'
    . 'local=(h==="localhost"||h==="127.0.0.1"||h==="[::1]"||h.indexOf("192.168.")===0),'
    . 'want=local?' . json_encode($localBase, JSON_UNESCAPED_SLASHES) . ':"/",'
    . 'b=document.getElementsByTagName("base")[0];'
    . 'if(b&&b.getAttribute("href")!==want){b.setAttribute("href",want);}}catch(e){}})();</script>';

$pages = [];
foreach (catalogUrlWeapons() as $weaponClass => $weapons) {
    foreach ($weapons as $weapon) {
        $pages[$weaponClass . '/' . catalogGroupSlug($weapon)] = [
            'class' => $weaponClass,
            'weapon' => $weapon,
        ];
    }
}

printf("%d weapon pages across %d classes\n", count($pages), count(catalogUrlWeapons()));
if ($dryRun) {
    foreach (array_keys($pages) as $path) {
        echo "  $path/\n";
    }
    exit(0);
}

$written = 0;
$unchanged = 0;
$skipped = 0;
$index = [];
foreach ($pages as $path => $page) {
    $weapon = $page['weapon'];
    $kind = $classLabels[$page['class']] ?? 'Weapon';
    $count = (int)($counts[$weapon] ?? 0);
    $title = $weapon . ' Skins – Prices & Market Data | CSPRICE';
    $description = $count > 0
        ? 'All ' . $count . ' ' . $weapon . ' skins with live prices from Steam, Skinport, CSFloat, White.Market and DMarket, sorted by rarity, price or release.'
        : 'Every ' . $weapon . ' ' . strtolower($kind) . ' skin with live prices from Steam, Skinport, CSFloat, White.Market and DMarket, sorted by rarity, price or release.';
    $canonical = 'https://csprice.eu/' . $path . '/';

    $head = $baseBlock
        . "\n  " . '<script>window.__CATALOG_ROUTE__=' . json_encode([
            'section' => 'weapons',
            'group' => $weapon,
            'weapon' => $weapon,
            'weapon_class' => $page['class'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . ';</script>';

    $hits = 0;
    $html = preg_replace('/<head([^>]*)>/i', '<head$1>' . "\n  " . $head, $shell, 1, $hits);
    if ($hits !== 1 || !is_string($html)) {
        fwrite(STDERR, "skip $path: no <head> in shell\n");
        continue;
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

    // Never shadow a generated item page - those own their folder and the
    // catalog listing would replace a real item's page if a slug ever matched.
    $dir = $root . '/' . $path;
    if (is_file($dir . '/index.html') && str_contains((string)file_get_contents($dir . '/index.html'), '__ITEM_ROUTE__')) {
        fwrite(STDERR, "skip $path: an item page already lives there\n");
        $skipped++;
        continue;
    }
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
    $index[] = $path;
}

sort($index);
file_put_contents($root . '/assets/data/catalog-url-index.json', json_encode([
    'generated' => gmdate('c'),
    'count' => count($index),
    'shell_sha1' => sha1($shell),
    'paths' => $index,
], JSON_UNESCAPED_SLASHES));

printf("%d written, %d unchanged, %d skipped, index has %d paths\n", $written, $unchanged, $skipped, count($index));
