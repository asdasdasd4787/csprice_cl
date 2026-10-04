<?php
/**
 * One definition of the pretty item URL, shared by the generator and any other
 * server-side code. The JS twin lives in react/catalog-helpers.js
 * (itemUrlSection / itemUrlSlug) and must produce identical output.
 */
declare(strict_types=1);

/** Catalog category -> first path segment of the pretty URL. */
function itemUrlSection(string $category, string $subFilter = ''): string
{
    $category = strtolower(trim($category));
    $map = [
        'skins' => 'skins',
        'knives' => 'skins',
        'gloves' => 'skins',
        'stickers' => 'stickers',
        'cases' => 'cases',
        'charms' => 'charms',
        'agents' => 'agents',
        'patches' => 'patches',
        'music' => 'music-kits',
        'graffiti' => 'graffiti',
        'collectibles' => 'collectibles',
        // Not "tools": that folder already exists locally and holds the Blender
        // installs the skin crafter uses, and it is excluded from deploys.
        'tools' => 'misc',
    ];
    return $map[$category] ?? 'items';
}

/**
 * Slug for one market hash name. Wear is dropped (one page covers all five and
 * the page switches between them), but StatTrak™ / Souvenir / ★ stay in the
 * slug because they are genuinely different items with different prices.
 */
function itemUrlSlug(string $marketHashName): string
{
    $name = trim($marketHashName);
    $name = (string)preg_replace('/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu', '', $name);

    $prefix = '';
    if (preg_match('/\bStatTrak\b/iu', $name)) {
        $prefix .= 'stattrak-';
    }
    if (preg_match('/^\s*Souvenir\b/iu', $name)) {
        $prefix .= 'souvenir-';
    }
    if (mb_strpos($name, '★') !== false) {
        $prefix .= 'star-';
    }

    $body = (string)preg_replace('/\bStatTrak™?\b/iu', '', $name);
    $body = (string)preg_replace('/^\s*Souvenir\b/iu', '', $body);
    $body = str_replace(['★', '™', '|'], ' ', $body);
    // Transliterate the few accented names so slugs stay ASCII.
    if (function_exists('iconv')) {
        $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT', $body);
        if (is_string($ascii) && $ascii !== '') {
            $body = $ascii;
        }
    }
    $body = strtolower($body);
    $body = (string)preg_replace('/[^a-z0-9]+/', '-', $body);
    $slug = trim($prefix . trim($body, '-'), '-');
    $slug = (string)preg_replace('/-+/', '-', $slug);

    return $slug !== '' ? $slug : 'item';
}

/**
 * Weapon classes that get a generated listing folder: /smgs/mac-10/ instead of
 * catalog-items.html?section=weapons&group=MAC-10&weapon_class=smgs. Each one
 * is also a real page of its own (smgs.html), so the folder already exists.
 * Mirrors weaponCategories in react/shared-data.js.
 */
function catalogUrlWeapons(): array
{
    return [
        'pistols' => ['Zeus x27', 'CZ75-Auto', 'Desert Eagle', 'Dual Berettas', 'Five-SeveN', 'Glock-18',
                      'P2000', 'P250', 'R8 Revolver', 'Tec-9', 'USP-S'],
        'smgs' => ['MAC-10', 'MP5-SD', 'MP7', 'MP9', 'PP-Bizon', 'P90', 'UMP-45'],
        'shotguns' => ['MAG-7', 'Nova', 'Sawed-Off', 'XM1014'],
        'lmgs' => ['M249', 'Negev'],
        'rifles' => ['AK-47', 'AUG', 'AWP', 'FAMAS', 'G3SG1', 'Galil AR', 'M4A1-S', 'M4A4',
                     'SCAR-20', 'SG 553', 'SSG 08'],
        'knives' => ['Bayonet', 'Bowie Knife', 'Butterfly Knife', 'Classic Knife', 'Falchion Knife',
                     'Flip Knife', 'Gut Knife', 'Huntsman Knife', 'Karambit', 'Kukri Knife', 'M9 Bayonet',
                     'Navaja Knife', 'Nomad Knife', 'Paracord Knife', 'Shadow Daggers', 'Skeleton Knife',
                     'Stiletto Knife', 'Survival Knife', 'Talon Knife', 'Ursus Knife'],
        'gloves' => ['Bloodhound Gloves', 'Broken Fang Gloves', 'Driver Gloves', 'Hand Wraps',
                     'Hydra Gloves', 'Moto Gloves', 'Specialist Gloves', 'Sport Gloves'],
    ];
}

/** The five exteriors as URL segments, for the skin crafter's pretty paths. */
function crafterWearSlugs(): array
{
    return [
        'Factory New' => 'factory-new',
        'Minimal Wear' => 'minimal-wear',
        'Field-Tested' => 'field-tested',
        'Well-Worn' => 'well-worn',
        'Battle-Scarred' => 'battle-scarred',
    ];
}

/** "MAC-10" -> "mac-10", "Sawed-Off" -> "sawed-off", "Zeus x27" -> "zeus-x27". */
function catalogGroupSlug(string $name): string
{
    $body = trim($name);
    if (function_exists('iconv')) {
        $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT', $body);
        if (is_string($ascii) && $ascii !== '') {
            $body = $ascii;
        }
    }
    $body = strtolower($body);
    $body = (string)preg_replace('/[^a-z0-9]+/', '-', $body);
    $body = trim((string)preg_replace('/-+/', '-', $body), '-');
    return $body;
}

/**
 * "skins/awp-dragon-lore" for a name that has a generated page, "" otherwise.
 *
 * Slugs keep the item's own prefix ("sticker-", "charm-", "sealed-graffiti-"),
 * so checking the ten sections for a matching folder is unambiguous, and the
 * folder check means a name with no page (StatTrak variants, anything added
 * since the last build) falls back to the query-string URL instead of linking
 * to a 404.
 */
function itemUrlPrettyPath(string $marketHashName, string $category = ''): string
{
    static $cache = [];

    $name = trim($marketHashName);
    if ($name === '') {
        return '';
    }
    $key = $category . "\0" . $name;
    if (isset($cache[$key])) {
        return $cache[$key];
    }

    $slug = itemUrlSlug($name);
    $sections = ['skins', 'stickers', 'cases', 'charms', 'agents', 'patches', 'music-kits', 'graffiti', 'collectibles', 'misc'];
    if ($category !== '') {
        $hint = itemUrlSection($category);
        if (in_array($hint, $sections, true)) {
            array_unshift($sections, $hint);
        }
    }

    $root = dirname(__DIR__);
    foreach ($sections as $section) {
        if (is_file($root . '/' . $section . '/' . $slug . '/index.html')) {
            return $cache[$key] = $section . '/' . $slug;
        }
    }
    return $cache[$key] = '';
}
