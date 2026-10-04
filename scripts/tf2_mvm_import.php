<?php
declare(strict_types=1);
/**
 * Builds assets/data/tf2/mvm.json for the Mann Up (MvM) tour simulator on
 * tf2-drops.html: the five Tours of Duty with their missions (Official TF2
 * Wiki, "Mann vs. Machine (game mode)" and "Botkiller weapons"), the loot
 * pools with today's prices from the TF2 catalog, and the ticket price.
 *
 *   php scripts/tf2_mvm_import.php
 *
 * What the wiki states: a Tour of Duty Ticket is consumed per completed
 * mission; a mission rewards an item, a finished tour a bigger one; Oil Spill
 * gives Rust Botkillers (rarely Blood), Steel Trap and Mecha Engine Silver
 * (rarely Gold; Mecha Engine's are Mk.II), Gear Grinder Carbonado (rarely
 * Diamond); Two Cities gives Killstreak Kit Fabricators; Advanced and Expert
 * tours can yield Australium weapons; the Golden Frying Pan is "exceedingly
 * rare". The wiki publishes no odds: the percentages in "odds" below are
 * community estimates and the page labels them as such.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
@ini_set('memory_limit', '1024M');
$root = dirname(__DIR__);
$dir = $root . '/assets/data/tf2';
$catalog = json_decode((string)file_get_contents($dir . '/catalog.json'), true);
$drops = json_decode((string)file_get_contents($dir . '/drops.json'), true);
$iconBase = (string)($catalog['icon_base'] ?? '');
$bases = $catalog['bases'] ?? [];

$best = static function (array $r): ?float {
    $p = array_filter([$r['s'] ?? null, $r['k'] ?? null, $r['m'] ?? null, $r['d'] ?? null], static fn($v) => is_numeric($v) && $v > 0);
    return $p ? round((float)min($p), 2) : null;
};
$entry = static function (array $r) use ($best, $iconBase, $bases): array {
    $img = ($r['i'] ?? '') !== '' ? $iconBase . $r['i'] . '/128fx128f' : ((($r['b'] ?? -1) >= 0 && isset($bases[$r['b']][1])) ? (string)$bases[$r['b']][1] : '');
    // g = market category, for the item's clean page link (tf2/<g>/<slug>/).
    return ['n' => (string)$r['n'], 'p' => $best($r), 'i' => $img, 'b' => (int)($r['b'] ?? -1), 'g' => (string)($r['g'] ?? '')];
};

// The cosmetics only Mann Up drops (wiki "Mann Up"), one per class.
const MVM_COSMETICS = ['Robot Running Man', 'Tin Pot', 'Pyrobotics Pack', 'Battery Bandolier', 'U-clank-a', 'Tin-1000', 'Medic Mech-bag', 'Bolted Bushman', 'Stealth Steeler'];

$pools = [];
$add = static function (string $pool, array $e) use (&$pools): void { $pools[$pool][] = $e; };
$ticket = null;
$voucher = null;
foreach ($catalog['items'] as $r) {
    if ($r['e'] !== '') {
        continue;
    }
    $n = (string)$r['n'];
    if ($n === 'Tour of Duty Ticket') {
        $ticket = $best($r);
    } elseif ($n === 'Squad Surplus Voucher') {
        $voucher = $best($r);
    } elseif (preg_match('/^Strange (Rust|Blood|Silver|Gold|Carbonado|Diamond) Botkiller .+ Mk\.(I|II)$/', $n, $m)) {
        $add(strtolower($m[1]) . '_mk' . strtolower($m[2]), $entry($r));
    } elseif (preg_match('/^Strange Australium (?!Gold$).+/', $n)) {
        // Mannco spells "Force-a-Nature" two ways; one entry per weapon.
        if (!in_array(strtolower($n), array_map(static fn($e) => strtolower($e['n']), $pools['australium'] ?? []), true)) {
            $add('australium', $entry($r));
        }
    } elseif (in_array(strtolower(preg_replace('/^The /', '', $n)), array_map('strtolower', MVM_COSMETICS), true)) {
        // The nine class cosmetics "obtainable only in Mann Up" (wiki).
        $add('mvm_item', $entry($r));
    } elseif (preg_match('/^(Battle-Worn|Reinforced|Pristine) Robot /i', $n, $m)) {
        // Robot Parts: "at least 5" per Two Cities mission, Pristine rare
        // (wiki "Operation Two Cities").
        $add(strtolower(str_replace('-', '_', $m[1])) . '_part', $entry($r));
    } elseif (preg_match('/^Killstreak (.+) Kit$/', $n)) {
        // A regular Killstreak Kit is guaranteed on finishing Two Cities.
        $add('killstreak_kit', $entry($r));
    } elseif (preg_match('/^(Specialized|Professional) Killstreak (.+) Kit Fabricator$/', $n, $m)) {
        $add(strtolower($m[1]) . '_fabricator', $entry($r));
    } elseif ($n === 'Killstreak Kit Fabricator' || preg_match('/^Killstreak (.+) Kit Fabricator$/', $n)) {
        $add('basic_fabricator', $entry($r));
    } elseif (preg_match('/^(Strange )?(Professional Killstreak )?Golden Frying Pan$/', $n)) {
        $add('golden_pan', $entry($r));
    } elseif (preg_match('/^Strange /', $n) && in_array($r['g'] ?? '', ['primary', 'secondary', 'melee'], true)
        && ($r['l'] ?? 0) >= 20 && !preg_match('/Botkiller|Australium|Killstreak|Festivized|\(/', $n)) {
        $p = $best($r);
        if ($p !== null && $p <= 15) {
            $add('strange_weapon', $entry($r));
        }
    }
}
// Fabricators barely trade, so they carry no market price; the page shows
// them as "—" rather than a made-up value. Make sure the pools exist.
foreach (['basic_fabricator' => 'Killstreak Kit Fabricator', 'specialized_fabricator' => 'Specialized Killstreak Kit Fabricator', 'professional_fabricator' => 'Professional Killstreak Kit Fabricator'] as $pool => $name) {
    if (empty($pools[$pool])) {
        $pools[$pool] = [['n' => $name, 'p' => null, 'i' => '', 'b' => -1]];
    }
}
// Golden Pan: it drops Strange with a Professional Killstreak kit applied
// (wiki "Golden Frying Pan"); price it at the cheapest priced variant.
usort($pools['golden_pan'], static fn($a, $b) => ($a['p'] ?? INF) <=> ($b['p'] ?? INF));
$pools['golden_pan'] = [array_merge($pools['golden_pan'][0], ['n' => 'Strange Professional Killstreak Golden Frying Pan'])];
if (empty($pools['mvm_item'])) {
    $pools['mvm_item'] = array_map(static fn($n) => ['n' => $n, 'p' => null, 'i' => '', 'b' => -1], MVM_COSMETICS);
}

// Mission loot: the regular drop pools (scripts/tf2_drops_import.php).
// Mission drops: "a random item from the random drop pool" (wiki
// "Operation Two Cities"; the Mann Up page says the same for every
// operation) - regular weapons and cosmetics, never Strange. Craft tokens,
// kits and the like slipped into the wiki's weapon template and are left out.
// Only tradable, marketable items: an entry without a market price (e.g.
// "Reissued Iron Curtain", untradable) is left out (user, 2026-09-28).
$isLoot = static fn(array $e): bool => $e['p'] !== null && (float)$e['p'] > 0
    && !preg_match('/\b(Token|Fabricator|Strangifier|Unusualifier|Kit|Voucher|Ticket|Golden Frying Pan)\b/i', (string)$e['n']);
// Base index and market category from the catalog, for the clean page links.
$rowByName = [];
foreach ($catalog['items'] as $r) {
    if (($r['e'] ?? '') === '' && !isset($rowByName[$r['n']])) {
        $rowByName[$r['n']] = ['b' => (int)($r['b'] ?? -1), 'g' => (string)($r['g'] ?? '')];
    }
}
$fromDrops = static fn($e) => ['n' => $e['n'], 'p' => $e['p'], 'i' => (string)$e['i'], 'b' => $rowByName[$e['n']]['b'] ?? -1, 'g' => $rowByName[$e['n']]['g'] ?? ''];
$pools['mission_weapon'] = array_values(array_map($fromDrops, array_filter($drops['pools']['weapon'] ?? [], $isLoot)));
$pools['mission_cosmetic'] = array_values(array_map($fromDrops, array_filter($drops['pools']['cosmetic'] ?? [], $isLoot)));
$pools['strange_weapon'] = [];

// Tours as the wiki's "Tour of Duty" table lists them: difficulty, missions
// with their maps, and the loot rules. Australium weapons and the Golden
// Frying Pan can come from any Advanced or Expert tour (wiki "Golden Frying
// Pan", Dec 22 2014 patch note), never from Oil Spill (Intermediate). Badge:
// the operation's emblem (assets/icons/tf2-operations, navbar session).
$badge = static fn(string $id) => 'assets/icons/tf2-operations/' . str_replace('_', '-', $id) . '.png?v=20260928-0015-op-badges-1';
// loot: botkiller common/rare pools (Botkiller weapons "are always in
// Strange quality"; "small chance" of the Blood / Gold / Diamond variant);
// guaranteed = pools always paid on top when the tour ends; rare_extra = an
// extra with a "small chance" (a fabricator one REPLACES the guaranteed
// fabricator - Two Cities pays one fabricator at the end, sometimes
// Professional); australium / pan = the Advanced-and-Expert extras;
// mission_parts = "at least 5 Robot Parts" per mission and
// mission_fabricator = the "chance to obtain a Specialized Killstreak Kit
// Fabricator" per mission, at most one per tour (both Two Cities only; the
// page applies these caps - react/tf2-drops-page.jsx).
$tours = [
    ['id' => 'oil_spill', 'name' => 'Operation Oil Spill', 'difficulty' => 'Intermediate',
        'missions' => ["Doe's Doom", 'Day of Wreckening', 'Cave-in', 'Quarry', 'Mean Machines', 'Mannhunt'],
        'maps' => ['Decoy', 'Decoy', 'Coal Town', 'Coal Town', 'Mannworks', 'Mannworks'],
        'loot' => ['common' => 'rust_mki', 'rare' => 'blood_mki', 'australium' => false, 'pan' => false]],
    ['id' => 'steel_trap', 'name' => 'Operation Steel Trap', 'difficulty' => 'Advanced',
        'missions' => ['Disk Deletion', 'Data Demolition', 'Ctrl+Alt+Destruction', 'CPU Slaughter', 'Machine Massacre', 'Mech Mutilation'],
        'maps' => ['Decoy', 'Decoy', 'Coal Town', 'Coal Town', 'Mannworks', 'Mannworks'],
        'loot' => ['common' => 'silver_mki', 'rare' => 'gold_mki', 'australium' => true, 'pan' => true]],
    ['id' => 'mecha_engine', 'name' => 'Operation Mecha Engine', 'difficulty' => 'Advanced',
        'missions' => ['Disintegration', 'Broken Parts', 'Bone Shaker'],
        'maps' => ['Decoy', 'Bigrock', 'Bigrock'],
        'loot' => ['common' => 'silver_mkii', 'rare' => 'gold_mkii', 'australium' => true, 'pan' => true]],
    ['id' => 'two_cities', 'name' => 'Operation Two Cities', 'difficulty' => 'Advanced',
        'missions' => ['Empire Escalation', 'Metro Malice', 'Hamlet Hostility', 'Bavarian Botbash'],
        'maps' => ['Mannhattan', 'Mannhattan', 'Rottenburg', 'Rottenburg'],
        // "a regular Killstreak Kit and a Specialized Killstreak Kit
        // Fabricator", "small chance ... a Professional Killstreak Kit
        // Fabricator and/or an Australium weapon (up to 4 loot items)".
        'loot' => ['common' => null, 'rare' => null, 'guaranteed' => ['killstreak_kit', 'specialized_fabricator'], 'rare_extra' => 'professional_fabricator',
            'australium' => true, 'pan' => true, 'mission_parts' => true, 'mission_fabricator' => 'specialized_fabricator']],
    ['id' => 'gear_grinder', 'name' => 'Operation Gear Grinder', 'difficulty' => 'Expert',
        'missions' => ['Desperation', 'Cataclysm', 'Mannslaughter'],
        'maps' => ['Decoy', 'Coal Town', 'Mannworks'],
        'loot' => ['common' => 'carbonado_mki', 'rare' => 'diamond_mki', 'australium' => true, 'pan' => true]],
];
foreach ($tours as &$t) {
    $t['badge'] = $badge($t['id']);
}
unset($t);

$out = [
    'generated_at' => gmdate(DATE_ATOM),
    'sources' => ['https://wiki.teamfortress.com/wiki/Mann_Up', 'https://wiki.teamfortress.com/wiki/Tour_of_Duty', 'https://wiki.teamfortress.com/wiki/Botkiller_weapons', 'https://wiki.teamfortress.com/wiki/Golden_Frying_Pan'],
    'ticket_eur' => $ticket,
    'voucher_eur' => $voucher,
    // Community estimates, not wiki figures (the wiki only says "small
    // chance" / "exceedingly rare"). mvm = the Mann Up-only cosmetics and
    // Robot Parts among the mission drops.
    // Golden Frying Pan ~0.0051 % (about 1 in 19,600) and any Australium
    // ~0.39 % per completed tour: the community figures the user supplied
    // (2026-09-28), still unofficial.
    // mission: the random drop pool split (weapon / cosmetic) with a small
    // slice for the Mann Up-only class cosmetics; mission_fabricator and
    // pristine_part are the Two Cities per-mission extras; rare_extra is
    // the "small chance" Professional Fabricator on finishing Two Cities.
    // Per completed Two Cities mission (wiki "Rare loot" row): a Specialized
    // Killstreak Kit Fabricator ~20 % and a Pristine (rare) Robot Part ~10 %,
    // each its own roll on top of the guaranteed drop and five common parts.
    'odds' => ['rare_variant' => 0.08, 'australium' => 0.0039, 'golden_pan' => 0.000051, 'rare_extra' => 0.08, 'mission_fabricator' => 0.2, 'pristine_part' => 0.1,
        'mission' => ['weapon' => 0.72, 'cosmetic' => 0.23, 'strange' => 0.0, 'mvm' => 0.05]],
    'tours' => $tours,
    'pools' => $pools,
];
file_put_contents($dir . '/mvm.json', json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
foreach ($pools as $k => $list) {
    printf("%-24s %4d items, %d priced\n", $k, count($list), count(array_filter($list, static fn($e) => $e['p'] !== null)));
}
printf("ticket €%s, voucher €%s -> %s (%.1f KB)\n", $ticket, $voucher, $dir . '/mvm.json', filesize($dir . '/mvm.json') / 1024);
