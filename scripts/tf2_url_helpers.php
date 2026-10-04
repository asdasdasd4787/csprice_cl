<?php
declare(strict_types=1);
/**
 * Clean TF2 URLs, the CS2 way (one static folder per page, no rewrites):
 *
 *   /tf2/market/                    Market Explorer
 *   /tf2/<category>/                one category of it (melee, war-paint, unusual, ...)
 *   /tf2/<category>/<item-slug>/    an item page
 *   /tf2/deals/  /tf2/mann-up/      Deals, Mann Up calculator
 *
 * An item with an unusual effect lives under /tf2/unusual/, its slug led by
 * the effect ("burning-flames-unusual-team-captain"). Only priced items get
 * a page (the ones every list on the site links to); the rest keep
 * tf2-item.html?item=. The JS twin is tf2Slug()/tf2ItemHref() in the TF2
 * bundles - both sides must produce the same path, so neither uses locale
 * or ICU transliteration: a fixed table folds the accented Latin letters.
 */

const TF2_URL_FOLD = [
    'À' => 'a', 'Á' => 'a', 'Â' => 'a', 'Ã' => 'a', 'Ä' => 'a', 'Å' => 'a', 'à' => 'a', 'á' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'å' => 'a',
    'Ç' => 'c', 'ç' => 'c',
    'È' => 'e', 'É' => 'e', 'Ê' => 'e', 'Ë' => 'e', 'è' => 'e', 'é' => 'e', 'ê' => 'e', 'ë' => 'e',
    'Ì' => 'i', 'Í' => 'i', 'Î' => 'i', 'Ï' => 'i', 'ì' => 'i', 'í' => 'i', 'î' => 'i', 'ï' => 'i',
    'Ñ' => 'n', 'ñ' => 'n',
    'Ò' => 'o', 'Ó' => 'o', 'Ô' => 'o', 'Õ' => 'o', 'Ö' => 'o', 'Ø' => 'o', 'ò' => 'o', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ö' => 'o', 'ø' => 'o',
    'Ù' => 'u', 'Ú' => 'u', 'Û' => 'u', 'Ü' => 'u', 'ù' => 'u', 'ú' => 'u', 'û' => 'u', 'ü' => 'u',
    'Ý' => 'y', 'ý' => 'y', 'ÿ' => 'y',
];

/** Path segment for a catalog row: "unusual" for effect rows, else the category id with hyphens. */
function tf2UrlSegment(string $category, string $effect): string
{
    if (trim($effect) !== '') {
        return 'unusual';
    }
    $seg = str_replace('_', '-', strtolower(trim($category)));
    return $seg !== '' ? $seg : 'cosmetic';
}

/** Slug for an item name (+ effect): fold accents, drop other non-ASCII, lowercase, runs of anything else become "-". */
function tf2UrlSlug(string $name, string $effect = ''): string
{
    $effect = (string)preg_replace('/^★\s*/u', '', trim($effect));
    $text = ($effect !== '' ? $effect . ' ' : '') . trim($name);
    $text = strtr($text, TF2_URL_FOLD);
    $text = (string)preg_replace('/[^\x00-\x7F]/', '', $text);
    $text = strtolower($text);
    $text = trim((string)preg_replace('/[^a-z0-9]+/', '-', $text), '-');
    return $text !== '' ? $text : 'item';
}

/** Does this catalog row get a clean page (priced on any market)? */
function tf2UrlPriced(array $row): bool
{
    foreach (['s', 'k', 'm', 'd'] as $k) {
        if (is_numeric($row[$k] ?? null) && (float)$row[$k] > 0) {
            return true;
        }
    }
    return false;
}

/** Site-relative link to an item's page: the clean folder when it has one, else the query URL. */
function tf2ItemHref(string $name, string $effect, string $category, int $base, bool $priced = true): string
{
    if ($priced) {
        return 'tf2/' . tf2UrlSegment($category, $effect) . '/' . tf2UrlSlug($name, $effect) . '/';
    }
    $q = ['item' => $name];
    if ($effect !== '') {
        $q['e'] = $effect;
    }
    if ($base >= 0) {
        $q['b'] = $base;
    }
    return 'tf2-item.html?' . http_build_query($q);
}
