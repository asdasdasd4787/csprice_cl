<?php
$sharedVer = '20260813-charts-all-1';
$caseCatalogVer = '20260801-nav-taller-1';
$itemVer = '20260915-i18n-pages-1';
$skinViewerCoreVer = '20260916-bake-skinned-1';
$inspectLaunchVer = '20260801-nav-taller-1';
$craftInspectVer = '20260911-item-inspect-customize-1';
$chartDrawVer = '20260827-draw-select-1';
$stickerGroupVer = '20260801-nav-taller-1';
$indexCssVer = '20260922-ask-ai-1';
$itemCssVer = '20260915-multiwear-1';
$navbarCssVer = '20260930-avatar-chip-fab';
$caseSimVer = '20260926-capsule-links-1';
$patchGroupVer = '20260801-nav-taller-1';
$musicGroupVer = '20260801-nav-taller-1';
$graffitiGroupVer = '20260801-nav-taller-1';
$charmGroupVer = '20260801-nav-taller-1';
$pinGroupVer = '20260801-nav-taller-1';

require_once __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/seo_helpers.php';
require_once __DIR__ . '/scripts/item_url_slug.php';

// Every item that has a generated pretty page (/skins/awp-dragon-lore/) is
// served from there, so the query-string URL never stays in the address bar.
// Links all over the app still build "item_page.php?..." and this keeps them
// working - itemUrlPrettyPath() only returns a path whose file really exists,
// so an item without a generated page just renders here as before.
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $prettyName = seoStripWear(trim((string)($_GET['lookup_name'] ?? $_GET['market_hash_name'] ?? $_GET['display_name'] ?? '')));
    $prettyPath = $prettyName !== ''
        ? itemUrlPrettyPath($prettyName, (string)($_GET['category'] ?? $_GET['type_filter'] ?? ''))
        : '';
    if ($prettyPath !== '') {
        // The item's identity is baked into the target page; anything else the
        // link carried (wear, where the visitor came from, inventory context)
        // still has to travel, so it stays in the query.
        $identity = ['lookup_name', 'display_name', 'market_hash_name', 'name', 'type', 'category',
                     'type_filter', 'color', 'image', 'market_url', 'item_id'];
        $extras = array_diff_key($_GET, array_flip($identity));
        $base = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
        $target = $base . '/' . $prettyPath . '/' . ($extras ? '?' . http_build_query($extras) : '');
        header('Location: ' . $target, true, 301);
        header('Cache-Control: public, max-age=600');
        exit;
    }
}
// Server-rendered SEO head for the requested item (crawlers see a real title,
// description, canonical, Open Graph and Product/Breadcrumb structured data
// before React mounts). Falls back to a generic head when no item is named.
$seoItemName = seoRequestedItemName($_GET);
$seoHead = $seoItemName !== ''
    ? seoItemHeadHtml($seoItemName)
    : '<title>CS2 Item Prices – Skins, Cases & Stickers | CSPRICE</title>' . "\n  "
      . '<meta name="description" content="Live CS2 item prices, price history and marketplace comparison across Steam, Skinport, CSFloat, White.Market and DMarket.">' . "\n  "
      . '<meta name="robots" content="noindex, follow">';
// Start the two chart-data requests from the HTML head, ahead of the ~150
// price calls React fires on mount — otherwise the chart waits in the PHP
// worker queue behind the slow marketplace quotes. URLs must match the
// client's fetch() strings byte for byte (same parameter order/encoding) so
// the browser reuses the preloaded response.
$chartPreloadLinks = '';
$chartWearNames = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];
$chartLookupRaw = trim((string)($_GET['lookup_name'] ?? $_GET['market_hash_name'] ?? ''));
$chartTitle = trim((string)($_GET['display_name'] ?? ''));
$chartWear = trim((string)($_GET['selected_wear'] ?? ''));
foreach ($chartWearNames as $chartWearName) {
    if ($chartLookupRaw !== '' && str_ends_with($chartLookupRaw, " ($chartWearName)")) {
        if ($chartWear === '') {
            $chartWear = $chartWearName;
        }
        if ($chartTitle === '') {
            $chartTitle = trim(substr($chartLookupRaw, 0, -strlen(" ($chartWearName)")));
        }
        break;
    }
}
if ($chartTitle === '') {
    $chartTitle = $chartLookupRaw;
}
if ($chartTitle !== '') {
    // item_bootstrap.php carries both chart bundles, the wear lines and the
    // Steam wear table in one gzipped answer, so it is the only preload now;
    // a second, direct bundle preload would just be the same work twice.
    $chartPreloadLinks .= '<link rel="preload" as="fetch" crossorigin="anonymous" href="item_bootstrap.php?'
        . htmlspecialchars(http_build_query(['lookup_name' => $chartTitle, 'wear' => $chartWear, 'range' => 'ALL']), ENT_QUOTES) . '">' . "\n  ";
}
$_cfg = appConfig();
$marketIntegrations = [
    'skinport' => !empty(trim((string)($_cfg['skinport']['client_id'] ?? '')))
        && !empty(trim((string)($_cfg['skinport']['client_secret'] ?? ''))),
    'csfloat' => !empty(trim((string)($_cfg['csfloat']['api_key'] ?? ''))),
    'white_market' => true,
    'dmarket' => !empty(trim((string)($_cfg['dmarket']['public_key'] ?? '')))
        && !empty(trim((string)($_cfg['dmarket']['secret_key'] ?? ''))),
    'market_csgo' => !empty(trim((string)($_cfg['market_csgo']['api_key'] ?? ''))),
    'shadowpay' => !empty(trim((string)($_cfg['shadowpay']['api_token'] ?? ''))),
    'waxpeer' => !empty(trim((string)($_cfg['waxpeer']['api_key'] ?? ''))),
    'mannco' => !empty(trim((string)($_cfg['mannco']['api_key'] ?? ''))),
    'haloskins' => !empty(trim((string)($_cfg['haloskins']['api_key'] ?? '')))
        || !empty(trim((string)($_cfg['haloskins']['access_token'] ?? ''))),
    'rapidskins' => !empty(trim((string)($_cfg['rapidskins']['api_key'] ?? ''))),
];
$marketIntegrationsJson = json_encode($marketIntegrations, JSON_THROW_ON_ERROR);
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- The host answers plain http:// with 200 and ignores .htaccess, so this is the
       only place a redirect to https can live. Must stay first in <head>. -->
  <script>/* csprice-https-guard */(function(){var h=location.hostname;if(location.protocol==="http:"&&h!=="localhost"&&h!=="127.0.0.1"&&h!=="[::1]"&&h.indexOf("192.168.")!==0){location.replace("https://"+location.host+location.pathname+location.search+location.hash);}})();</script>

  <link rel="icon" href="favicon.ico" sizes="any">
  <link rel="icon" type="image/png" href="favicon.png?v=20260815-csai-full-1">
  <link rel="apple-touch-icon" href="apple-touch-icon.png?v=20260815-csai-full-1">
  <meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <script>if (history.scrollRestoration) history.scrollRestoration = "manual";</script>
  <?= $seoHead ?>
  <?= $chartPreloadLinks ?>

  <link rel="stylesheet" crossorigin="anonymous"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />

  <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin="anonymous">
  <link rel="stylesheet" crossorigin="anonymous"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">

  <link rel="stylesheet" href="styles/css/index.css?v=<?= htmlspecialchars($indexCssVer) ?>">
  <!-- Only navbar.css moves to the 1200 tag: it changed (93,151 -> 99,195 bytes).
       item_page.css and wide-screens.css are byte-identical between the two tags,
       and every other page still names them at 0100, so restamping them here
       would only invent a disagreement and force a needless re-download. -->
  <link rel="stylesheet" href="styles/css/item_page.css?v=20261003-mitem-css-1">
  <link rel="stylesheet" href="styles/css/navbar.css?v=20260930-avatar-chip-fab">
  <link rel="stylesheet" href="styles/css/wide-screens.css?v=20260927-0100-navbar-switcher">

  <!-- Language switcher flags: LangFlag renders `fi fi-<code>` spans, which need
       this sheet. Every other page loads it; item_page.php was missing it, so the
       flags rendered as empty spans here (.htaccess serves this for item_page.html). -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flag-icons@7/css/flag-icons.min.css">
<!-- theme:begin -->
<meta name="theme-color" content="#f3f6fc">
<meta name="color-scheme" content="light dark">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap">
<link rel="stylesheet" href="styles/css/theme.css?v=20260930-1755-light-wordmark">
<link rel="stylesheet" href="styles/css/mobile-shell.css?v=20261004-font-inherit">
<script src="react/mobile-shell.js?v=20261004-font-inherit" defer></script>
<script>(function(){var d=document.documentElement;var l=false;var t="system";try{t=localStorage.getItem("csprice-theme")||"system";}catch(e){}
var m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)");var r=t==="system"?((m&&m.matches)?"dark":"light"):t;
if(l){d.setAttribute("data-legacy-dark","1");r="dark";}
d.setAttribute("data-theme",r);d.setAttribute("data-theme-ready","1");d.style.colorScheme=r;
var c=document.querySelector('meta[name="theme-color"]');if(c){c.setAttribute("content",r==="dark"?"#0a0f24":"#f3f6fc");}
window.__cspriceTheme={choice:t,resolved:r,legacy:l};
if(m&&m.addEventListener){m.addEventListener("change",function(){if((window.__cspriceTheme||{}).choice!=="system")return;window.dispatchEvent(new CustomEvent("csprice:system-theme-change"));});}})();</script>
<script>(function(){var P="20261004-151956";try{var h=location.hostname;if(h==="localhost"||h==="127.0.0.1"||h==="::1"||h.indexOf("192.168.")===0)return;}catch(e){return;}
if(!window.fetch)return;var touched=false;
try{var t=function(){touched=true;};addEventListener("keydown",t,{once:true,capture:true});addEventListener("pointerdown",t,{once:true,capture:true});}catch(e){}
function store(){try{if(window.localStorage){localStorage.setItem("csprice-b-probe","1");localStorage.removeItem("csprice-b-probe");return localStorage;}}catch(e){}try{return window.sessionStorage||null;}catch(e){return null;}}
fetch("assets/data/build.json",{cache:"no-store"}).then(function(r){return r.ok?r.json():null;}).then(function(j){
if(!j||!j.stamp||!(j.stamp>P)||touched)return;var s=store();if(!s)return;var k="csprice-b-"+P+"-"+j.stamp;
try{if(s.getItem(k))return;for(var i=s.length-1;i>=0;i--){var o=s.key(i);if(o&&o.indexOf("csprice-b-")===0)s.removeItem(o);}s.setItem(k,"1");}catch(e){return;}
fetch(location.href,{cache:"reload"}).then(function(){if(!touched)location.reload();}).catch(function(){});
}).catch(function(){});})();</script>
<!-- theme:end -->
</head>
<body>
<div id="root"></div>

<script crossorigin="anonymous" src="https://unpkg.com/lightweight-charts@3.8.0/dist/lightweight-charts.standalone.production.js"></script>
<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/npm/hammerjs@2.0.8/hammer.min.js"></script>
<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js"></script>

<script crossorigin="anonymous" src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>

<script crossorigin="anonymous" src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin="anonymous" src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

<script src="static.php/react/catalog-helpers.js?v=20260925-instant-items-1"></script>
<script src="static.php/react/collection-catalog.js?v=20260914-collection-souvenir-1"></script>
<script src="static.php/react/shared-data.js?v=20260927-1845-no-cologne26"></script>
<script>window.__MARKET_INTEGRATIONS__ = <?= $marketIntegrationsJson ?>;</script>
<script src="static.php/react/sticker-group-map.js?v=<?= htmlspecialchars($stickerGroupVer) ?>"></script>
<script src="static.php/react/patch-group-map.js?v=<?= htmlspecialchars($patchGroupVer) ?>"></script>
<script src="static.php/react/music-group-map.js?v=<?= htmlspecialchars($musicGroupVer) ?>"></script>
<script src="static.php/react/graffiti-group-map.js?v=<?= htmlspecialchars($graffitiGroupVer) ?>"></script>
<script src="static.php/react/charm-group-map.js?v=<?= htmlspecialchars($charmGroupVer) ?>"></script>
<script src="static.php/react/pin-group-map.js?v=<?= htmlspecialchars($pinGroupVer) ?>"></script>
<script src="static.php/react/case-catalog.js?v=<?= htmlspecialchars($caseCatalogVer) ?>"></script>
<script src="static.php/react/i18n.js?v=20261004-1540-collectibles"></script>
<script src="static.php/react/shared-components.build.js?v=20261003-0220-hash-fix"></script>
<script src="static.php/react/inspect-launch.js?v=<?= htmlspecialchars($inspectLaunchVer) ?>"></script>
<script src="static.php/react/chart-draw-tools.js?v=<?= htmlspecialchars($chartDrawVer) ?>"></script>
<script src="static.php/react/case-simulator.build.js?v=20260926-capsule-links-1"></script>
<script src="static.php/react/skin-viewer-core.js?v=<?= htmlspecialchars($skinViewerCoreVer) ?>"></script>
<script src="static.php/react/craft-inspect.build.js?v=<?= htmlspecialchars($craftInspectVer) ?>"></script>
<script src="static.php/react/item-page.build.js?v=20261004-1510-inv-origin"></script>
</body>
</html>
