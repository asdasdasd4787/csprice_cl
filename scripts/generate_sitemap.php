<?php
/**
 * Writes sitemap.xml (index) + sitemap-pages.xml + sitemap-items-N.xml into the
 * site root from the static pages and the SEO item index.
 *
 * Run after the catalog or the page list changes:  php scripts/generate_sitemap.php
 * The deploy script uploads the resulting files like any other site file.
 */
declare(strict_types=1);

$root = dirname(__DIR__);
require_once $root . '/seo_helpers.php';

$today = gmdate('Y-m-d');
$pages = [
    ['index.html', '1.0', 'daily'],
    ['deals.html', '0.9', 'hourly'],
    ['roi.html', '0.9', 'hourly'],
    ['skin-crafter.html', '0.7', 'weekly'],
    ['carepackage.html', '0.6', 'weekly'],
    ['collections.html', '0.8', 'weekly'],
    ['cases.html', '0.8', 'weekly'],
    ['stickers.html', '0.8', 'weekly'],
    ['other.html', '0.6', 'weekly'],
    ['pistols.html', '0.7', 'weekly'],
    ['smgs.html', '0.7', 'weekly'],
    ['heavy.html', '0.7', 'weekly'],
    ['rifles.html', '0.7', 'weekly'],
    ['rare.html', '0.7', 'weekly'],
    ['knives.html', '0.7', 'weekly'],
    ['gloves.html', '0.7', 'weekly'],
    ['agents.html', '0.6', 'weekly'],
    ['charms.html', '0.6', 'weekly'],
    ['graffiti.html', '0.5', 'weekly'],
    ['patches.html', '0.5', 'weekly'],
    ['pins.html', '0.5', 'weekly'],
    ['music.html', '0.5', 'weekly'],
    ['shotguns.html', '0.6', 'weekly'],
    ['lmgs.html', '0.6', 'weekly'],
    ['ak47.html', '0.6', 'weekly'],
    ['armory.html', '0.6', 'weekly'],
    ['data.html', '0.5', 'weekly'],
    ['stats-db.html', '0.4', 'weekly'],
    ['mark.html', '0.6', 'weekly'],
    ['about.html', '0.3', 'monthly'],
    ['contact.html', '0.3', 'monthly'],
];

$xmlHead = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
$urlset = static function (array $urls) use ($xmlHead): string {
    $out = $xmlHead . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    foreach ($urls as [$loc, $lastmod, $freq, $prio]) {
        $out .= "  <url><loc>" . htmlspecialchars($loc, ENT_XML1) . "</loc>"
            . "<lastmod>{$lastmod}</lastmod><changefreq>{$freq}</changefreq><priority>{$prio}</priority></url>\n";
    }
    return $out . "</urlset>\n";
};

$pageUrls = [];
foreach ($pages as [$file, $prio, $freq]) {
    $loc = $file === 'index.html' ? SEO_SITE_URL . '/' : SEO_SITE_URL . '/' . $file;
    $pageUrls[] = [$loc, $today, $freq, $prio];
}
file_put_contents($root . '/sitemap-pages.xml', $urlset($pageUrls));

// Items: one URL per catalog entry (wear-less base name; the page shows every wear).
$seen = [];
$itemUrls = [];
foreach (glob($root . '/assets/seo/idx/*.json') ?: [] as $shard) {
    $entries = json_decode((string)file_get_contents($shard), true);
    if (!is_array($entries)) {
        continue;
    }
    foreach ($entries as $entry) {
        $base = seoStripWear((string)($entry['n'] ?? ''));
        if ($base === '') {
            continue;
        }
        $key = seoItemKey($base);
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $itemUrls[] = [seoItemUrl($base), $today, 'daily', '0.6'];
    }
}
usort($itemUrls, static fn(array $a, array $b): int => strcmp($a[0], $b[0]));

foreach (glob($root . '/sitemap-items-*.xml') ?: [] as $old) {
    unlink($old);
}
$chunks = array_chunk($itemUrls, 10000);
$sitemapFiles = ['sitemap-pages.xml'];
foreach ($chunks as $index => $chunk) {
    $file = 'sitemap-items-' . ($index + 1) . '.xml';
    file_put_contents($root . '/' . $file, $urlset($chunk));
    $sitemapFiles[] = $file;
}

$index = $xmlHead . '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($sitemapFiles as $file) {
    $index .= "  <sitemap><loc>" . SEO_SITE_URL . '/' . $file . "</loc><lastmod>{$today}</lastmod></sitemap>\n";
}
$index .= "</sitemapindex>\n";
file_put_contents($root . '/sitemap.xml', $index);

printf("sitemap.xml: %d page URLs, %d item URLs in %d files\n", count($pageUrls), count($itemUrls), count($chunks));
