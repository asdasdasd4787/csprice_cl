<?php
declare(strict_types=1);

/**
 * Builds the tf2price.eu copy of the TF2 part of the site into a folder
 * OUTSIDE this site (default: ../tf2price_dist), so no csprice.eu deploy can
 * ever pick it up.
 *
 *   php scripts/build_tf2price_site.php [outDir]
 *
 * tf2price.eu is its own hosting (its own 200,000-file limit) and serves only
 * the TF2 part, with the same folder layout as csprice.eu (tf2/market/,
 * tf2/<category>/<slug>/, tf2-item.html ...), the same code, data and key
 * gate. Its root (/) is the TF2 home. Links that leave the TF2 part (CS2
 * pages, profile, login) go to csprice.eu - see TF2PRICE_LINKS below.
 *
 * Secrets are NOT copied from this machine: config.local.php,
 * access_config.local.php and data/access/devices.php are taken from the
 * live csprice.eu server by deploy/deploy_to_tf2price.ps1.
 */

@ini_set('memory_limit', '2048M');
$src = dirname(__DIR__);
$out = rtrim(str_replace(chr(92), '/', (string)($argv[1] ?? dirname($src) . '/tf2price_dist')), '/');
const TF2PRICE_ORIGIN = 'https://tf2price.eu';
const CSPRICE_ORIGIN = 'https://csprice.eu';

// Runs first in every page head: a click on a same-site link outside the TF2
// part (CS2 pages, profile, the CS2 home at / or index.html) is sent to
// csprice.eu instead of a page this host does not have. Window capture, so
// it runs before the navbar's soft-navigation handler.
const TF2PRICE_LINKS = '<script>/* tf2price.eu serves only the TF2 part; every other page is on csprice.eu. */'
    . '(function(){var C="' . CSPRICE_ORIGIN . '";'
    . 'function tf2(p){return p==="/tf2"||p.indexOf("/tf2/")===0||p.indexOf("/tf2.")===0||p.indexOf("/tf2-")===0||p==="/login.html"||p==="/login"||p.indexOf("/login/")===0;}'
    . 'window.addEventListener("click",function(e){if(e.defaultPrevented||e.button!==0)return;'
    . 'var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;'
    . 'var u;try{u=new URL(a.getAttribute("href"),document.baseURI);}catch(_){return;}'
    // The account panels (index.html?panel=profile|watchlist|charts) render on this host's home too.
    // The front page itself ("/" or index.html with no query, where the wordmark
    // and the game switcher point) is this host's TF2 home, not csprice.eu's
    // (user, 2026-10-03: the TFPRICE logo led to the CS2 index).
    . 'function own(u){return (u.pathname==="/"||u.pathname==="/index.html")&&(u.search===""||/(^|[?&])panel=(profile|watchlist|charts)(&|$)/.test(u.search));}'
    . 'if(u.origin!==location.origin||tf2(u.pathname)||own(u)||/\.(php|json|js|css|png|webp|svg|ico|jpe?g|gz)$/i.test(u.pathname))return;'
    . 'e.preventDefault();e.stopImmediatePropagation();var d=C+u.pathname+u.search+u.hash;'
    . 'if(a.target==="_blank"||e.ctrlKey||e.metaKey||e.shiftKey)window.open(d,"_blank","noopener");else location.href=d;},true);})();</script>';

$stats = ['copied' => 0, 'same' => 0];

function outWrite(string $file, string $content): bool
{
    global $stats;
    if (is_file($file) && filesize($file) === strlen($content) && file_get_contents($file) === $content) {
        $stats['same']++;
        return false;
    }
    if (!is_dir(dirname($file))) {
        mkdir(dirname($file), 0755, true);
    }
    file_put_contents($file, $content);
    $stats['copied']++;
    return true;
}

function outCopy(string $from, string $to): void
{
    global $stats;
    if (is_file($to) && filesize($to) === filesize($from) && filemtime($to) >= filemtime($from)) {
        $stats['same']++;
        return;
    }
    if (!is_dir(dirname($to))) {
        mkdir(dirname($to), 0755, true);
    }
    copy($from, $to);
    touch($to, filemtime($from));
    $stats['copied']++;
}

/** Scratch, test and probe files never ship. */
function isScratch(string $base): bool
{
    return (bool)preg_match('/^(_|tmp|test|probe|zz_)|[-_](probe|test)\d*\.php$/i', $base);
}

function copyTree(string $src, string $out, string $rel, callable $keep): void
{
    $dir = "$src/$rel";
    if (!is_dir($dir)) {
        return;
    }
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        $path = str_replace(chr(92), '/', $f->getPathname());
        $r = substr($path, strlen($src) + 1);
        if ($f->isFile() && $keep($r, $f->getFilename())) {
            outCopy($path, "$out/$r");
        }
    }
}

/** A TF2 page for tf2price.eu: its own address in the SEO tags, and the link guard first in <head>. */
function tf2priceHtml(string $html): string
{
    $html = str_replace(CSPRICE_ORIGIN . '/', TF2PRICE_ORIGIN . '/', $html);
    // Every page here is a TF2 page: login.html has no data-game of its own,
    // and the navbar, the inventory dashboard and the stylesheets key off it.
    if (!str_contains($html, 'data-game=')) {
        $html = (string)preg_replace('/<html([^>]*)>/i', '<html$1 data-game="tf2">', $html, 1);
    }
    if (!str_contains($html, 'tf2price.eu serves only the TF2 part')) {
        $html = (string)preg_replace('/<head([^>]*)>/i', '<head$1>' . "\n" . TF2PRICE_LINKS, $html, 1);
    }
    return $html;
}

if (!is_dir($out)) {
    mkdir($out, 0755, true);
}

// ---------------------------------------------------------------- code
foreach (glob("$src/*.php") ?: [] as $f) {
    $b = basename($f);
    if (isScratch($b) || in_array($b, ['config.local.php', 'access_config.local.php'], true)) {
        continue;
    }
    outCopy($f, "$out/$b");
}
copyTree($src, $out, 'lib', fn($r, $b) => str_ends_with($b, '.php') && !isScratch($b));
copyTree($src, $out, 'scripts', fn($r, $b) => str_ends_with($b, '.php') && !isScratch($b) && !str_starts_with($b, 'test-'));
copyTree($src, $out, 'react', fn($r, $b) => str_ends_with($b, '.js') && !str_starts_with($b, 'tf2-boot-'));
copyTree($src, $out, 'styles/css', fn($r, $b) => str_ends_with($b, '.css'));
outCopy("$src/data/index.html", "$out/data/index.html");

// ---------------------------------------------------------------- assets
foreach (glob("$src/assets/*") ?: [] as $f) {
    if (is_file($f)) {
        if (!isScratch(basename($f))) {
            outCopy($f, "$out/assets/" . basename($f));
        }
    }
}
foreach (['data', 'markets', 'icons', 'nav', 'ai', 'other', 'weapons', 'stickers', 'cases', 'collections', 'static-gz', 'seo'] as $d) {
    copyTree($src, $out, "assets/$d", fn($r, $b) => !isScratch($b));
}
foreach (glob("$src/*.{png,webp,ico,svg,jpg,webmanifest}", GLOB_BRACE) ?: [] as $f) {
    if (!isScratch(basename($f)) && !preg_match('/^tmp[-_]/i', basename($f))) {
        outCopy($f, "$out/" . basename($f));
    }
}

// ---------------------------------------------------------------- pages
foreach (['tf2.html', 'tf2-market.html', 'tf2-deals.html', 'tf2-drops.html', 'tf2-item.html', 'login.html'] as $page) {
    outWrite("$out/$page", tf2priceHtml((string)file_get_contents("$src/$page")));
}
// The TF2 home is this host's front page.
// The front page is its own canonical, not tf2.html's (which is a noindexed
// stub here); the navbar session caught the inherited one on 2026-09-30.
$home = tf2priceHtml((string)file_get_contents("$src/tf2.html"));
$home = (string)preg_replace('#<link rel="canonical" href="[^"]*">#', '<link rel="canonical" href="' . TF2PRICE_ORIGIN . '/">', $home, 1);
$home = (string)preg_replace('#<meta property="og:url" content="[^"]*">#', '<meta property="og:url" content="' . TF2PRICE_ORIGIN . '/">', $home, 1);
outWrite("$out/index.html", $home);
foreach (['tf2', 'tf2-market', 'tf2-deals', 'tf2-drops', 'tf2-item', 'login'] as $folder) {
    if (is_file("$src/$folder/index.html")) {
        outWrite("$out/$folder/index.html", tf2priceHtml((string)file_get_contents("$src/$folder/index.html")));
    }
}
// On this host the TF2 home IS the front page, so /tf2.html and /tf2/ send
// the visitor to "/" instead of showing the same page under a second address
// (user, 2026-09-30: "always make me land on the index, not on some other page").
$homeStub = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
    . "<title>TFPRICE</title>\n<meta name=\"robots\" content=\"noindex\">\n"
    . "<link rel=\"canonical\" href=\"" . TF2PRICE_ORIGIN . "/\">\n"
    . "<script>location.replace('/' + location.search + location.hash);</script>\n"
    . "<meta http-equiv=\"refresh\" content=\"0;url=/\">\n"
    . "</head>\n<body></body>\n</html>\n";
outWrite("$out/tf2.html", $homeStub);
outWrite("$out/tf2/index.html", $homeStub);
outWrite("$out/robots.txt", "User-agent: *\nDisallow:\n");
// tf2price.eu's own build manifest. The copied assets/data/build.json is
// csprice.eu's: its stamp is newer than the `var P` baked into the TF2 pages,
// so the stale-page script would reload every first visit here. This host's
// stamp is the pages' own P, so nothing reloads until a page build moves it.
if (preg_match('/var P="(\d{8}-\d{6})"/', (string)file_get_contents("$src/tf2.html"), $pm)) {
    $manifest = json_decode((string)file_get_contents("$src/assets/data/build.json"), true) ?: [];
    $manifest['stamp'] = $pm[1];
    $manifest['host'] = 'tf2price.eu';
    outWrite("$out/assets/data/build.json", json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
}
// The key gate, loaded before every PHP request as on csprice.eu. The path
// follows the host's layout (/home/www/<domain>/www/<domain>/); the deploy
// checks it against the server's real document root after the first upload.
outWrite("$out/.user.ini", "; tf2price.eu: the access gate runs before every PHP request (see access_gate.php).\n"
    . "auto_prepend_file = /home/www/tf2price.eu/www/tf2price.eu/access_gate.php\n");
echo "files: {$stats['copied']} written, {$stats['same']} unchanged\n";

// ---------------------------------------------------------------- TF2 boot, section and item pages
// Generated straight into the output with tf2price.eu addresses; the stub
// shell is read from the output's tf2-item/index.html (link guard included).
$php = PHP_BINARY;
passthru(escapeshellarg($php) . ' ' . escapeshellarg("$src/scripts/build_tf2_urls.php") . ' all '
    . escapeshellarg("--out=$out") . ' ' . escapeshellarg('--origin=' . TF2PRICE_ORIGIN), $code);
if ($code !== 0) {
    exit($code);
}

// ---------------------------------------------------------------- cache tags
// Every styles/css/*.css?v= and react/*.js?v= reference in the pages and boot
// files gets "-h<content hash>" appended, so a changed file always gets a new
// URL on this host - including theme.css, whose tag (THEME_VERSION in
// scripts/inject_theme.php) does not move with every edit. Unchanged files
// keep their URL, so browsers keep their cached copy.
$hashes = [];
$hashOf = static function (string $rel) use (&$hashes, $out): ?string {
    if (!array_key_exists($rel, $hashes)) {
        $file = "$out/$rel";
        $hashes[$rel] = is_file($file) ? substr(md5_file($file), 0, 8) : null;
    }
    return $hashes[$rel];
};
$tag = static function (string $text) use ($hashOf): string {
    return (string)preg_replace_callback(
        // The boot files carry the head as JSON, where "/" is written "\/".
        '#((?:static\.php\\\\?/)?((?:styles\\\\?/css|react)\\\\?/[A-Za-z0-9_.-]+\.(?:css|js)))\?v=([A-Za-z0-9_.-]+?)(?:-h[0-9a-f]{8})?(?=["\'\\\\&])#',
        static function (array $m) use ($hashOf): string {
            $h = $hashOf(str_replace(chr(92), '', $m[2]));
            return $h === null ? $m[0] : $m[1] . '?v=' . $m[3] . '-h' . $h;
        },
        $text
    );
};
$tagged = 0;
$targets = array_merge(
    glob("$out/*.html") ?: [],
    glob("$out/{tf2,tf2-market,tf2-deals,tf2-drops,tf2-item}/index.html", GLOB_BRACE) ?: [],
    glob("$out/tf2/*/index.html") ?: [],
    glob("$out/react/tf2-boot-*.js") ?: []
);
foreach ($targets as $file) {
    $before = (string)file_get_contents($file);
    $after = $tag($before);
    if ($after !== $before) {
        file_put_contents($file, $after);
        $tagged++;
    }
}
echo "cache tags: $tagged files re-tagged with content hashes\n";
exit(0);
