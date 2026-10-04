<?php
/**
 * Puts <meta name="robots" content="noindex, nofollow"> on every source page in
 * the site root, so the generated pages built from them inherit it too.
 *
 * The site is private (see access_gate.php), and a private site should not be
 * in anyone's index. robots.txt alone does not remove what is already indexed;
 * this tag does.
 *
 * Usage: php scripts/set_noindex.php [on|off]
 *   on  -> noindex, nofollow everywhere
 *   off -> restores the two states the site had before going private: the
 *          pages that were deliberately hidden keep "noindex, follow",
 *          everything else loses the tag entirely.
 *
 * After running it, rebuild the generated pages so they carry the change:
 *   php scripts/build_item_urls.php    (then deploy\upload_item_urls.ps1)
 *   the catalog/crafter/clean-URL folders are rebuilt by the deploy script.
 */
$root = dirname(__DIR__);
$mode = strtolower($argv[1] ?? 'on');

// The pages that carried a robots tag before the site went private.
$wasHidden = ['catalog-items.html', 'item_page.html', 'login.html', 'signup.html', 'viewer3d.html', 'watchlist.html'];

$tag = '<meta name="robots" content="noindex, nofollow">';
$changed = 0;
$skipped = 0;

foreach (glob($root . '/*.html') ?: [] as $file) {
    $base = basename($file);
    if (str_starts_with($base, 'tmp') || str_starts_with($base, '_tmp') || str_starts_with($base, '.tmp')) {
        continue;
    }
    $html = file_get_contents($file);
    if ($html === false) {
        continue;
    }
    $before = $html;

    if ($mode === 'off') {
        if (in_array($base, $wasHidden, true)) {
            $html = preg_replace(
                '/<meta\s+name="robots"[^>]*>/i',
                '<meta name="robots" content="noindex, follow">',
                $html,
                1
            );
        } else {
            $html = preg_replace('/\s*<meta\s+name="robots"[^>]*>/i', '', $html, 1);
        }
    } elseif (preg_match('/<meta\s+name="robots"[^>]*>/i', $html)) {
        $html = preg_replace('/<meta\s+name="robots"[^>]*>/i', $tag, $html, 1);
    } elseif (preg_match('/<head[^>]*>/i', $html, $m, PREG_OFFSET_CAPTURE)) {
        $at = $m[0][1] + strlen($m[0][0]);
        $html = substr($html, 0, $at) . "\n  " . $tag . substr($html, $at);
    } else {
        echo "  no <head>: $base\n";
        $skipped++;
        continue;
    }

    if ($html !== $before) {
        file_put_contents($file, $html);
        $changed++;
    }
}

echo "mode=$mode  changed=$changed  skipped=$skipped\n";
