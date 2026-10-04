<?php
declare(strict_types=1);
/**
 * Puts the theme boot into every page.
 *
 * Three things go into <head>, before anything paints:
 *   1. styles/css/theme.css  — the tokens
 *   2. <meta name="theme-color"> and color-scheme, so the browser chrome,
 *      native controls and scrollbars match
 *   3. a tiny inline script that resolves the theme (saved choice, else the OS
 *      setting) and sets data-theme on <html>. Inline and synchronous on
 *      purpose: an external file would paint the wrong theme first.
 *
 * Pages whose own stylesheet has not been converted to the tokens yet also get
 * data-legacy-dark, which pins them to the dark palette. Move a page into
 * THEME_LIGHT_PAGES once its sheet reads from the tokens.
 *
 * Usage:
 *   C:\xampp\php\php.exe scripts/inject_theme.php          (all root pages)
 *   C:\xampp\php\php.exe scripts/inject_theme.php --check  (report only)
 *
 * Re-running is safe: the block is replaced, not stacked.
 */

const THEME_VERSION = '20260930-1755-light-wordmark';

/**
 * Cache tag for the mobile shell pair (styles/css/mobile-shell.css and
 * react/mobile-shell.js). Separate from THEME_VERSION so a shell change does not
 * force every visitor to refetch theme.css, and vice versa. Bump on every edit
 * to either file - never reuse a value that has been served.
 */
const SHELL_VERSION = '20261004-font-inherit';

/**
 * Pages whose stylesheets all carry a light layer, so they follow the theme
 * instead of being pinned dark.
 *
 * A page belongs here only once every sheet it loads either reads the tokens
 * natively or ends in an additive `html[data-theme="light"]` block. The audit
 * that proves it lives in the scratchpad (audit_light.php): it walks each
 * page's <link> list and asserts that every selector inside a light block is
 * scoped, so no light rule can reach the dark rendering.
 *
 * Nothing is pinned any more: every root page's sheets carry a light layer, so
 * the list below is simply every page this script touches. Note that the loop
 * also processes item_page.php, and basename() gives 'item_page.php' — the
 * entry must use the .php name or the 28,870 live item pages stay dark.
 */
const THEME_LIGHT_PAGES = [
    'index.html',
    'Revolution.html',
    'about.html',
    'agents.html',
    'ak47.html',
    'armory.html',
    'carepackage.html',
    'cases.html',
    'catalog-items.html',
    'charms.html',
    'collections.html',
    'contact.html',
    'data.html',
    'deals.html',
    'detail.html',
    'fracture.html',
    'gloves.html',
    'graffiti.html',
    'heavy.html',
    'item_page.html',
    'item_page.php',
    'knives.html',
    'lmgs.html',
    'login.html',
    'mark.html',
    'music.html',
    'other.html',
    'patches.html',
    'pins.html',
    'pistols.html',
    'rare.html',
    'rifles.html',
    'roi.html',
    'shotguns.html',
    'signup.html',
    'skin-crafter.html',
    'skins.html',
    'smgs.html',
    'stats-db.html',
    'stickers.html',
    'tf2-deals.html',
    'tf2-drops.html',
    'tf2-item.html',
    'tf2-market.html',
    'tf2.html',
    'tools.html',
    'viewer3d.html',
    'watchlist.html',
];

$root = dirname(__DIR__);
$checkOnly = in_array('--check', $argv, true);

$begin = '<!-- theme:begin -->';
$end = '<!-- theme:end -->';

/**
 * Build stamp for the stale-HTML refresh below. It must change on every run, so
 * it is the clock rather than a constant anyone has to remember to bump. The
 * same value is written to assets/data/build.json at the end of this script.
 */
define('BUILD_STAMP', date('Ymd-His'));

/** The whole injected block for one page. */
function themeBlock(string $page): string
{
    $legacy = in_array($page, THEME_LIGHT_PAGES, true) ? 'false' : 'true';
    $version = THEME_VERSION;
    $shell = SHELL_VERSION;
    $stamp = BUILD_STAMP;

    // Kept deliberately small and dependency-free: it runs before the stylesheets
    // finish loading, so anything heavier would be paid for on every page view.
    $boot = <<<JS
(function(){var d=document.documentElement;var l=$legacy;var t="system";try{t=localStorage.getItem("csprice-theme")||"system";}catch(e){}
var m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)");var r=t==="system"?((m&&m.matches)?"dark":"light"):t;
if(l){d.setAttribute("data-legacy-dark","1");r="dark";}
d.setAttribute("data-theme",r);d.setAttribute("data-theme-ready","1");d.style.colorScheme=r;
var c=document.querySelector('meta[name="theme-color"]');if(c){c.setAttribute("content",r==="dark"?"#0a0f24":"#f3f6fc");}
window.__cspriceTheme={choice:t,resolved:r,legacy:l};
if(m&&m.addEventListener){m.addEventListener("change",function(){if((window.__cspriceTheme||{}).choice!=="system")return;window.dispatchEvent(new CustomEvent("csprice:system-theme-change"));});}})();
JS;

    // Stale-HTML refresh. nginx serves every page with Cache-Control: max-age=7200
    // and it is not ours to change, so for up to two hours after a deploy a
    // returning visitor keeps the old page AND its old ?v= asset tags. That is
    // what made /tf2/ show the previous explorer page two hours after it was
    // replaced, and it is the same cache that made a correct roi.css deploy look
    // like it had not applied.
    //
    // On a stamp mismatch this refreshes the cached HTML entry and reloads from
    // it. Deliberately NOT `location.replace(href + "?b=" + stamp)`: that would
    // put a query string on every visitor's URL, leak into shared links, and
    // create unlimited crawlable duplicates across 28,870 item pages.
    //
    // Four guards, each for a failure seen or reasoned through:
    //   * localhost is skipped, so XAMPP never reloads itself;
    //   * at most one reload EVER per (page stamp -> live stamp) pair, in
    //     localStorage. This is deliberately not "once per session on the live
    //     stamp": the 28,870 item pages are regenerated by a separate tool on a
    //     separate cadence, so after a restamp they can legitimately sit on an old
    //     stamp for a while - and a reload cannot fix that, because the copy on
    //     the server still carries the old stamp. Keyed per session on the live
    //     stamp alone, every new session would pay one useless reload on every
    //     item page, indefinitely. Keyed on the pair and persisted, a visitor pays
    //     at most one, once, and never again for that pair;
    //   * no reload once the visitor has typed or tapped - yanking the page out
    //     from under someone mid-sentence in Mark's chat is worse than stale CSS;
    //   * every failure path is silent: no fetch, a 404 before the first deploy,
    //     a PHP stall, blocked sessionStorage - all just leave the page alone.
    //
    // assets/data is served at max-age=30 and the fetch is no-store, so the stamp
    // read is never itself stale. build.json should still be uploaded after the
    // HTML, but the comparison is `j.stamp > P`, not `!==`, so the reverse case is
    // harmless: a page NEWER than the manifest - which is every page for the few
    // minutes between pushing the HTML and pushing the manifest - does nothing at
    // all. Stamps are Ymd-His, so a string compare is a chronological one.
    $fresh = <<<JS
(function(){var P="$stamp";try{var h=location.hostname;if(h==="localhost"||h==="127.0.0.1"||h==="::1"||h.indexOf("192.168.")===0)return;}catch(e){return;}
if(!window.fetch)return;var touched=false;
try{var t=function(){touched=true;};addEventListener("keydown",t,{once:true,capture:true});addEventListener("pointerdown",t,{once:true,capture:true});}catch(e){}
function store(){try{if(window.localStorage){localStorage.setItem("csprice-b-probe","1");localStorage.removeItem("csprice-b-probe");return localStorage;}}catch(e){}try{return window.sessionStorage||null;}catch(e){return null;}}
fetch("assets/data/build.json",{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).then(function(j){
if(!j||!j.stamp||!(j.stamp>P)||touched)return;var s=store();if(!s)return;var k="csprice-b-"+P+"-"+j.stamp;
try{if(s.getItem(k))return;for(var i=s.length-1;i>=0;i--){var o=s.key(i);if(o&&o.indexOf("csprice-b-")===0)s.removeItem(o);}s.setItem(k,"1");}catch(e){return;}
fetch(location.href,{cache:"reload"}).then(function(){if(!touched)location.reload();}).catch(function(){});
}).catch(function(){});})();
JS;

    return implode("\n", [
        '<!-- theme:begin -->',
        '<meta name="theme-color" content="#f3f6fc">',
        '<meta name="color-scheme" content="light dark">',
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap">',
        '<link rel="stylesheet" href="styles/css/theme.css?v=' . $version . '">',
        // Mobile shell: the bottom tab bar and More sheet, below 768px only.
        // Injected here rather than added to shared-components.build.js because
        // that bundle is on 40 of the 46 root pages - six pages would have had no
        // mobile navigation at all - and because this reaches item_page.php and
        // the 28,870 generated item pages for free. `defer` so it never blocks
        // the first paint; it builds its own DOM and needs no React.
        '<link rel="stylesheet" href="styles/css/mobile-shell.css?v=' . $shell . '">',
        '<script src="react/mobile-shell.js?v=' . $shell . '" defer></script>',
        '<script>' . $boot . '</script>',
        '<script>' . $fresh . '</script>',
        '<!-- theme:end -->',
    ]);
}

$files = array_merge(glob($root . '/*.html') ?: [], [$root . '/item_page.php']);
$changed = 0;
$skipped = 0;

foreach ($files as $file) {
    $page = basename($file);
    if (str_starts_with($page, 'tmp') || str_starts_with($page, '_tmp')) {
        $skipped++;
        continue;
    }
    $html = @file_get_contents($file);
    if ($html === false || stripos($html, '</head>') === false) {
        $skipped++;
        continue;
    }

    $block = themeBlock($page);
    $pattern = '/' . preg_quote($begin, '/') . '.*?' . preg_quote($end, '/') . '/s';

    if (preg_match($pattern, $html)) {
        $next = preg_replace($pattern, str_replace('$', '\$', $block), $html);
    } else {
        // Last thing in <head>: the tokens must beat the page sheet, and the
        // boot script must run before the body exists.
        $next = preg_replace('/<\/head>/i', $block . "\n</head>", $html, 1);
    }

    if ($next !== null && $next !== $html) {
        if (!$checkOnly) {
            file_put_contents($file, $next);
        }
        $changed++;
        echo ($checkOnly ? 'would update ' : 'updated ') . $page . "\n";
    }
}

printf("%s %d page(s), skipped %d\n", $checkOnly ? 'Would update' : 'Updated', $changed, $skipped);

// The stamp the pages just received, written where the refresh script reads it.
// Same run, same value, so page and manifest cannot disagree.
//
// DEPLOY ORDER: this file must reach the server AFTER every page. If it goes
// first, a visitor on old HTML sees a new stamp, reloads into markup that is
// still old, and the loop guard then pins that stale page under the new stamp for
// two hours - worse than the problem being solved. push_changed.ps1 uploads it as
// the very last step for this reason.
if (!$checkOnly) {
    $manifest = $root . '/assets/data/build.json';
    $payload = json_encode([
        'stamp' => BUILD_STAMP,
        'theme' => THEME_VERSION,
        'generated' => date('c'),
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";

    if (!is_dir(dirname($manifest))) {
        fwrite(STDERR, "assets/data is missing - build.json NOT written\n");
    } elseif (file_put_contents($manifest, $payload) === false) {
        fwrite(STDERR, "could not write build.json\n");
    } else {
        printf("build stamp %s written to assets/data/build.json\n", BUILD_STAMP);
    }
} else {
    printf("(check only: build.json not written; stamp would be %s)\n", BUILD_STAMP);
}

