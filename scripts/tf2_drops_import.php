<?php
declare(strict_types=1);
/**
 * Builds assets/data/tf2/drops.json for the TF2 Drop Package page from the
 * Official TF2 Wiki's "Item drop system" article (the wikitext of its
 * sections "Cosmetics / Paints / Tools obtainable through drops" and
 * "Non-dropping items") plus the TF2 price index for each item's price.
 *
 *   php scripts/tf2_drops_import.php
 *
 * Droppable weapons are every Unique primary/secondary/melee base in the
 * schema minus the wiki's non-dropping list (achievement-free promos,
 * festives, botkillers, australiums, ...).
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$root = dirname(__DIR__);
$dir = $root . '/assets/data/tf2';

function dropsGet(string $url): string
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_ENCODING => '',
        CURLOPT_TIMEOUT => 60,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER => ['User-Agent: CSPrice/1.0 (csprice.eu; TF2 drop simulator)', 'Accept: application/json'],
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($body === false || $status !== 200) {
        fwrite(STDERR, "wiki HTTP $status\n");
        exit(1);
    }
    return (string)$body;
}

$api = 'https://wiki.teamfortress.com/w/api.php?' . http_build_query([
    'action' => 'parse', 'page' => 'Item drop system', 'prop' => 'wikitext', 'format' => 'json', 'formatversion' => 2,
]);
$json = json_decode(dropsGet($api), true);
$wikitext = (string)($json['parse']['wikitext'] ?? '');
if ($wikitext === '') {
    fwrite(STDERR, "no wikitext\n");
    exit(1);
}
file_put_contents($dir . '/wiki_item_drop_system.txt', $wikitext);

/** The body of a "== Heading ==" section (any level), up to the next heading of the same or higher level. */
function dropsSection(string $text, string $heading): string
{
    if (!preg_match('/^(=+)\s*' . preg_quote($heading, '/') . '\s*\1\s*$/mi', $text, $m, PREG_OFFSET_CAPTURE)) {
        return '';
    }
    $level = strlen($m[1][0]);
    $start = $m[0][1] + strlen($m[0][0]);
    $rest = substr($text, $start);
    if (preg_match('/^={1,' . $level . '}[^=].*?={1,' . $level . '}\s*$/m', $rest, $n, PREG_OFFSET_CAPTURE)) {
        $rest = substr($rest, 0, $n[0][1]);
    }
    return $rest;
}

/** Item names linked in a section: [[Name]], [[Name|label]], {{item link|Name}}, {{Item icon|Name}}. */
function dropsNames(string $section): array
{
    $names = [];
    preg_match_all('/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/u', $section, $m);
    foreach ($m[1] as $n) {
        $names[] = $n;
    }
    preg_match_all('/\{\{\s*(?:item\s*link|item\s*icon|icon\s*item|item\s*name|backpack\s*item|table\s*icon)\s*\|\s*([^}|]+)/iu', $section, $m);
    foreach ($m[1] as $n) {
        $names[] = $n;
    }
    $out = [];
    foreach ($names as $n) {
        $n = trim(str_replace('_', ' ', html_entity_decode($n, ENT_QUOTES)));
        if ($n === '' || preg_match('/^(File|Image|Category|w|wikipedia|Template|Scout|Soldier|Pyro|Demoman|Heavy|Engineer|Medic|Sniper|Spy|Paint|Tools?|Cosmetic items?|Weapons?|Mann Co\. Store|Crafting|Trading|Premium|Free-to-Play)$/i', $n) || str_contains($n, ':')) {
            continue;
        }
        $out[mb_strtolower($n)] = $n;
    }
    return array_values($out);
}

// Each section is a template ({{Cosmetic can drop list}} ...): read the item
// pages it links to (prop=links of the rendered template).
function dropsTemplateLinks(string $template): array
{
    $url = 'https://wiki.teamfortress.com/w/api.php?' . http_build_query([
        'action' => 'parse', 'page' => 'Template:' . $template, 'prop' => 'links|wikitext', 'format' => 'json', 'formatversion' => 2,
    ]);
    $json = json_decode(dropsGet($url), true);
    // {{item link|X}} / {{icon item|X}} / {{Paint Can|...|X}} in the table
    // source, plus the plain page links.
    $names = [(string)($json['parse']['wikitext'] ?? '')];
    foreach ($json['parse']['links'] ?? [] as $link) {
        if ((int)($link['ns'] ?? 0) !== 0) {
            continue;
        }
        $names[] = '[[' . (string)$link['title'] . ']]';
    }
    usleep(500000);
    return dropsNames(implode(' ', $names));
}

$templateOf = static function (string $heading) use ($wikitext): string {
    $body = dropsSection($wikitext, $heading);
    return preg_match('/\{\{\s*([^}|]+?)\s*\}\}/u', $body, $m) ? trim(str_replace("\u{200E}", '', $m[1])) : '';
};
$sections = [];
foreach ([
    'cosmetic' => 'Cosmetics obtainable through drops',
    'paint' => 'Paints obtainable through drops',
    'tool' => 'Tools obtainable through drops',
    'nodrop' => 'Non-dropping items',
] as $key => $heading) {
    $tpl = $templateOf($heading);
    $sections[$key] = $tpl !== '' ? dropsTemplateLinks($tpl) : dropsNames(dropsSection($wikitext, $heading));
    printf("template %s: %s\n", $key, $tpl);
}
foreach ($sections as $k => $list) {
    printf("wiki %s: %d names\n", $k, count($list));
}

// Prices and images from the TF2 catalog (unique = base name, no quality prefix).
$catalog = json_decode((string)file_get_contents($dir . '/catalog.json'), true);
$bases = $catalog['bases'] ?? [];
$byName = [];
foreach ($catalog['items'] ?? [] as $row) {
    if (($row['e'] ?? '') === '') {
        $byName[mb_strtolower((string)$row['n'])] = $row;
    }
}
$iconBase = (string)($catalog['icon_base'] ?? '');
$entry = static function (string $name) use ($byName, $bases, $iconBase): ?array {
    $lower = mb_strtolower(preg_replace('/\s*\(taunt\)$/iu', '', $name));
    $row = $byName[$lower] ?? $byName['the ' . $lower] ?? $byName['taunt: ' . $lower] ?? $byName['taunt: the ' . $lower] ?? null;
    $baseIdx = -1;
    foreach ($bases as $i => $b) {
        if (mb_strtolower((string)$b[0]) === $lower || mb_strtolower((string)$b[0]) === 'the ' . $lower) {
            $baseIdx = $i;
            break;
        }
    }
    $image = '';
    if ($row && ($row['i'] ?? '') !== '') {
        $image = $iconBase . $row['i'] . '/128fx128f';
    } elseif ($baseIdx >= 0) {
        $image = (string)$bases[$baseIdx][1];
    }
    if (!$row && $baseIdx < 0) {
        return null;
    }
    $prices = array_filter([$row['m'] ?? null, $row['s'] ?? null, $row['k'] ?? null, $row['d'] ?? null], static fn($p) => is_numeric($p) && $p > 0);
    return [
        // The catalog's spelling ("Indubitably Green", "Taunt: Conga"), not
        // the wiki's lowercase template argument.
        'n' => $row ? (string)$row['n'] : ($baseIdx >= 0 ? (string)$bases[$baseIdx][0] : $name),
        'i' => $image,
        'p' => $prices ? round((float)min($prices), 2) : null,
    ];
};

$pools = ['weapon' => [], 'cosmetic' => [], 'paint' => [], 'tool' => [], 'crate' => []];
foreach (['cosmetic', 'paint', 'tool'] as $k) {
    foreach ($sections[$k] as $name) {
        $e = $entry($name);
        // A drop is a plain Unique copy; a €100+ ask is a rare listing
        // (event or craft-number items), not what the drop is worth.
        if ($e && ($e['p'] === null || $e['p'] <= 25)) {
            $pools[$k][] = $e;
        }
    }
}

// Weapons: Unique primary/secondary/melee (and PDA) bases from the schema,
// minus the non-dropping list and whole families the wiki excludes.
$noDrop = array_flip(array_map('mb_strtolower', $sections['nodrop']));
// Stock (default) weapons every class owns never drop either.
foreach (['Scattergun', 'Pistol', 'Bat', 'Rocket Launcher', 'Shotgun', 'Shovel', 'Flame Thrower', 'Fire Axe', 'Grenade Launcher',
    'Stickybomb Launcher', 'Bottle', 'Minigun', 'Fists', 'Wrench', 'Construction PDA', 'Destruction PDA', 'PDA', 'Toolbox',
    'Syringe Gun', 'Medi Gun', 'Bonesaw', 'Sniper Rifle', 'SMG', 'Kukri', 'Revolver', 'Knife', 'Sapper', 'Disguise Kit',
    'Invis Watch', 'Builder', 'Spellbook Magazine', 'Grappling Hook'] as $stock) {
    $noDrop[mb_strtolower($stock)] = true;
}
foreach ($bases as $b) {
    $slot = (string)($b[3] ?? '');
    $name = (string)$b[0];
    if (!in_array($slot, ['primary', 'secondary', 'melee', 'pda', 'pda2', 'building'], true)) {
        continue;
    }
    $lower = mb_strtolower(preg_replace('/^The /u', '', $name));
    if (isset($noDrop[$lower]) || isset($noDrop[mb_strtolower($name)])
        || preg_match('/\b(Festive|Botkiller|Australium|Upgradeable|Promo|Prototype|Silver|Gold|Rust|Blood|Carbonado|Diamond)\b/u', $name)
        || preg_match('/^(TF_WEAPON|Weapon_)/u', $name)) {
        continue;
    }
    $e = $entry($name);
    if ($e) {
        $pools['weapon'][$lower] = $e;
    }
}
$pools['weapon'] = array_values($pools['weapon']);

// End-of-match case drops: the current cosmetic / war paint cases.
foreach ($catalog['items'] ?? [] as $row) {
    if (($row['e'] ?? '') === '' && preg_match('/^(Winter|Summer|Scream Fortress|Spectral|Abominable|Unleash|Violet Vermin|Wicked Windfall|Crimson Cache|Gargoyle|Mayflower|Blue Moon|Creepy Crawly|Rainy Day|Confidential|Quarantined|Gourd|Infernal|Gargantuan|Decorated War Hero|Contract Campaigner).*\b(Case|Cache)\b/u', (string)$row['n'])
        && isset($row['l']) && (int)$row['l'] >= 500) {
        $pools['crate'][] = [
            'n' => (string)$row['n'],
            'i' => ($row['i'] ?? '') !== '' ? $iconBase . $row['i'] . '/128fx128f' : '',
            'p' => isset($row['m']) || isset($row['s']) ? round((float)min(array_filter([$row['m'] ?? INF, $row['s'] ?? INF])), 2) : null,
        ];
    }
}

$out = [
    'generated_at' => gmdate(DATE_ATOM),
    'source' => 'https://wiki.teamfortress.com/wiki/Item_drop_system',
    'rules' => [
        'interval_min' => 30, 'interval_max' => 70, 'interval_avg' => 50,
        'weekly_cap_hours' => 10, 'carryover_cap_hours' => 20,
        'reset' => 'Thursday 00:00 GMT',
        'f2p' => 'Free-to-Play accounts get limited drops: no cosmetics or rare items.',
        'separate_timer' => 'Crates, cases and other usable items drop on a separate timer.',
    ],
    'pools' => $pools,
];
file_put_contents($dir . '/drops.json', json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
foreach ($pools as $k => $list) {
    printf("pool %s: %d items (%d priced)\n", $k, count($list), count(array_filter($list, static fn($e) => $e['p'] !== null)));
}
