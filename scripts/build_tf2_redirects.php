<?php
declare(strict_types=1);

/**
 * Builds the csprice.eu side of the TF2 move: every TF2 page csprice.eu
 * still serves (tf2.html, tf2-*.html, their clean folders, tf2/ and the
 * tf2/<category>/ section pages) becomes a tiny page that sends the visitor
 * to the same address on https://tf2price.eu, keeping the query and hash.
 *
 *   php scripts/build_tf2_redirects.php [outDir]     (default ../csprice_tf2_redirects)
 *
 * The real TF2 pages stay in this repository - they are the source of the
 * tf2price.eu build (scripts/build_tf2price_site.php) - so the redirects are
 * written OUTSIDE it and uploaded by deploy/upload_tf2_redirects.ps1; the
 * csprice.eu deploy skips the real TF2 pages (deploy/deploy_to_csprice.ps1).
 *
 * The host ignores .htaccess, so this is an HTML redirect: location.replace
 * first (no history entry, query and hash kept), a meta refresh for
 * browsers without script, and a canonical link for search engines.
 */

$src = dirname(__DIR__);
$out = rtrim(str_replace(chr(92), '/', (string)($argv[1] ?? dirname($src) . '/csprice_tf2_redirects')), '/');
const TF2_TARGET = 'https://tf2price.eu';

function redirectPage(string $targetPath): string
{
    $url = TF2_TARGET . $targetPath;
    $u = htmlspecialchars($url, ENT_QUOTES);
    $js = json_encode($url, JSON_UNESCAPED_SLASHES);
    return "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
        . "<title>TFPRICE - TF2 prices moved to tf2price.eu</title>\n"
        . "<meta name=\"robots\" content=\"noindex\">\n"
        . "<link rel=\"canonical\" href=\"$u\">\n"
        . "<script>location.replace($js + location.search + location.hash);</script>\n"
        . "<meta http-equiv=\"refresh\" content=\"0;url=$u\">\n"
        . "<style>html,body{margin:0;background:#0b1220;color:#cbd5e1;font:15px/1.5 system-ui,sans-serif}p{margin:40vh auto 0;text-align:center}a{color:#60a5fa}</style>\n"
        . "</head>\n<body>\n<p>TF2 prices moved to <a href=\"$u\">tf2price.eu</a>.</p>\n</body>\n</html>\n";
}

$pages = [
    // csprice.eu path => tf2price.eu path
    'tf2.html' => '/',
    'tf2/index.html' => '/',
];
foreach (['tf2-market', 'tf2-deals', 'tf2-drops', 'tf2-item'] as $page) {
    $pages["$page.html"] = "/$page.html";
    $pages["$page/index.html"] = "/$page/";
}
foreach (glob("$src/tf2/*/index.html") ?: [] as $file) {
    $seg = basename(dirname($file));
    $pages["tf2/$seg/index.html"] = "/tf2/$seg/";
}

$written = 0;
foreach ($pages as $path => $target) {
    $file = "$out/$path";
    if (!is_dir(dirname($file))) {
        mkdir(dirname($file), 0755, true);
    }
    $html = redirectPage($target);
    if (!is_file($file) || file_get_contents($file) !== $html) {
        file_put_contents($file, $html);
        $written++;
    }
}
echo "redirects: $written of " . count($pages) . " pages written to $out\n";
