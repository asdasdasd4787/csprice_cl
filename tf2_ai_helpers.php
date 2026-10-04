<?php
declare(strict_types=1);

// How many item cards an answer shows. The shared card list (parseChatItems
// in react/shared-components.jsx) renders the first 8 and no more, so every
// list the text makes - picks, portfolio holdings - stops here too, or the
// answer names items that have no card (user, 2026-10-04: "only showcase the
// items that are on the cards").
const TF2_AI_CARD_MAX = 8;

/**
 * Mark answering Team Fortress 2 questions.
 *
 * A turn is a TF2 turn when the game switcher says TF2 (context.game) or when
 * the conversation plainly talks TF2. It is answered from the TF2 price index
 * built by scripts/tf2_import.php (assets/data/tf2/ai-index.json: every priced
 * TF2 item with its Mannco and Steam price), never from the CS2 catalog, in
 * the CS2 answer format: Item metrics / AI SENTIMENT / Key factors strips,
 * item cards (items[] with the TF2 page URL) and the TF2 markets overview
 * (assets/data/tf2/market-snapshot.json, written by scripts/tf2_import.php).
 */

require_once __DIR__ . '/scripts/tf2_url_helpers.php';

const TF2_AI_INDEX = __DIR__ . '/assets/data/tf2/ai-index.json';
const TF2_MARKET_SNAPSHOT = __DIR__ . '/assets/data/tf2/market-snapshot.json';

/** The TF2 markets-overview strip (CS2 snapshot shape, game "tf2"), or null. */
function tf2MarketSnapshot(): ?array
{
    $data = is_file(TF2_MARKET_SNAPSHOT) ? json_decode((string)file_get_contents(TF2_MARKET_SNAPSHOT), true) : null;
    if (!is_array($data) || !isset($data['market_cap'])) {
        return null;
    }
    $data['game'] = 'tf2';
    $data['app_id'] = 440;
    return $data;
}

function tf2AiLooksLikeTf2(string $text): bool
{
    return (bool)preg_match(
        '/\b(tf2|team\s*fortress|mann\s*co\.?|mannco|australium|unusual\s+(?:hat|cosmetic|effect|taunt)s?|burning\s+flames|scorching\s+flames|sunbeams|refined\s+metal|reclaimed\s+metal|scrap\s+metal|killstreak\s+kit|strangifier|war\s+paint|earbuds|max\'?s\s+severed\s+head|team\s+captain|crate\s+series)\b/iu',
        $text
    );
}

function tf2AiIsRequest(array $messages, array $pageContext): bool
{
    if (strtolower((string)($pageContext['game'] ?? '')) === 'tf2') {
        return true;
    }
    // The latest user message, or an earlier one in the same thread (a
    // follow-up like "which one is cheapest?" stays in TF2).
    $userTurns = array_values(array_filter($messages, static fn($m) => ($m['role'] ?? '') === 'user'));
    foreach (array_slice(array_reverse($userTurns), 0, 3) as $m) {
        if (tf2AiLooksLikeTf2((string)($m['content'] ?? ''))) {
            return true;
        }
    }
    return false;
}

/** @return list<array{0:string,1:string,2:string,3:?float,4:?float,5:int}> */
function tf2AiItems(): array
{
    static $items = null;
    if (is_array($items)) {
        return $items;
    }
    $data = is_file(TF2_AI_INDEX) ? json_decode((string)file_get_contents(TF2_AI_INDEX), true) : null;
    $items = is_array($data['items'] ?? null) ? $data['items'] : [];
    return $items;
}

/**
 * Index row for an exact item name (+ unusual effect), or null. With no
 * effect given, "<effect> <name>" ("Burning Flames Team Captain", the way
 * the answer writes unusuals) also resolves.
 */
function tf2AiRow(string $name, string $effect = ''): ?array
{
    static $map = null;
    static $byFull = null;
    if ($map === null) {
        $map = [];
        $byFull = [];
        foreach (tf2AiItems() as $i => $row) {
            $n = mb_strtolower((string)$row[0]);
            $e = mb_strtolower(preg_replace('/^★\s*/u', '', (string)$row[1]));
            $map[$n . '|' . $e] = $i;
            if ($e !== '') {
                $byFull[$e . ' ' . $n] = $i;
            }
        }
    }
    // "Unusual Team Captain (effect: Burning Flames)", the data's own form.
    if ($effect === '' && preg_match('/^(.+?)\s*\(effect:\s*(.+?)\)\s*$/iu', $name, $m)) {
        $name = $m[1];
        $effect = $m[2];
    }
    $n = mb_strtolower(trim($name));
    $e = mb_strtolower(preg_replace('/^★\s*/u', '', trim($effect)));
    $i = $map[$n . '|' . $e] ?? ($e === '' ? ($byFull[$n] ?? null) : null);
    return $i === null ? null : tf2AiItems()[$i];
}

/**
 * The item's image from its shard (assets/data/tf2/items/<key>.json.gz, the
 * files tf2-item.html reads; key as tf2ShardKey() in scripts/tf2_import.php):
 * the Steam icon, else the schema image of its base. "" when unknown.
 */
function tf2AiImage(string $name, string $effect, int $base): string
{
    static $shards = [];
    if ($base >= 0) {
        $key = 'b' . ($base % 256);
    } else {
        $h = 5381;
        $len = strlen($name);
        for ($i = 0; $i < $len; $i++) {
            $h = (($h << 5) + $h + ord($name[$i])) & 0xFFFFFFFF;
        }
        $key = 'n' . ($h % 64);
    }
    if (!array_key_exists($key, $shards)) {
        $file = __DIR__ . '/assets/data/tf2/items/' . $key . '.json.gz';
        $shards[$key] = is_file($file) ? (json_decode((string)gzdecode((string)file_get_contents($file)), true) ?: []) : [];
    }
    $shard = $shards[$key];
    foreach ((array)($shard['items'] ?? []) as $r) {
        if (($r['n'] ?? '') === $name && ($r['e'] ?? '') === $effect) {
            if (($r['i'] ?? '') !== '') {
                return (string)($shard['icon_base'] ?? 'https://community.akamai.steamstatic.com/economy/image/') . $r['i'] . '/128fx128f';
            }
            break;
        }
    }
    $schemaImg = $base >= 0 ? (string)($shard['bases'][$base][1] ?? '') : '';
    return $schemaImg !== '' ? preg_replace('/^http:/', 'https:', $schemaImg) : '';
}

/**
 * One chat item card (the shape parseChatItems() in shared-components.jsx
 * reads) for an index row. cheapest_* is the lowest of the four markets;
 * page_url opens the item on tf2-item.html with its effect and base index.
 */
function tf2AiCard(array $row, int $qty = 1): array
{
    $name = (string)$row[0];
    $effect = (string)($row[1] ?? '');
    $base = (int)($row[6] ?? -1);
    $img = tf2AiImage($name, $effect, $base);
    $prices = [
        'Mannco' => is_numeric($row[3] ?? null) && $row[3] > 0 ? (float)$row[3] : null,
        'Steam' => is_numeric($row[4] ?? null) && $row[4] > 0 ? (float)$row[4] : null,
        'Skinport' => is_numeric($row[8] ?? null) && $row[8] > 0 ? (float)$row[8] : null,
        'DMarket' => is_numeric($row[9] ?? null) && $row[9] > 0 ? (float)$row[9] : null,
    ];
    $cheapest = null;
    foreach ($prices as $market => $price) {
        if ($price !== null && ($cheapest === null || $price < $cheapest[1])) {
            $cheapest = [$market, $price];
        }
    }
    $query = ['item' => $name];
    if ($effect !== '') {
        $query['e'] = $effect;
    }
    if ($base >= 0) {
        $query['b'] = (string)$base;
    }
    // The item's clean page (tf2/<category>/<slug>/) once the index carries
    // its market category; the query URL otherwise.
    $g = (string)($row[11] ?? '');
    $pageUrl = $g !== '' ? tf2ItemHref($name, $effect, $g, $base) : 'tf2-item.html?' . http_build_query($query);
    // Mannco's own item page when the importer has its slug; the TF2 search
    // otherwise ("/?search=" is the front page and ignores the query).
    $mu = (string)($row[10] ?? '');
    $manncoUrl = $mu !== '' ? 'https://mannco.store/item/' . rawurlencode($mu) : 'https://mannco.store/tf2?search=' . rawurlencode($name);
    return [
        'market_hash_name' => $name,
        'display_name' => $effect !== '' ? preg_replace('/^★\s*/u', '', $effect) . ' ' . $name : $name,
        'image' => $img,
        'name_color' => (string)($row[7] ?? '') !== '' ? (string)$row[7] : 'B0C3D9',
        'category' => (string)($row[2] ?? ''),
        'seed_sell_price' => $prices['Steam'] ?? $cheapest[1] ?? null,
        'cheapest_marketplace' => $cheapest[0] ?? '',
        'cheapest_price' => $cheapest[1] ?? null,
        'cheapest_url' => ($cheapest[0] ?? '') === 'Mannco' ? $manncoUrl : $pageUrl,
        'market_url' => 'https://steamcommunity.com/market/listings/440/' . rawurlencode($name),
        'mannco_url' => $manncoUrl,
        'page_url' => $pageUrl,
        'app_id' => 440,
        'effect' => $effect,
        'base_index' => $base >= 0 ? $base : null,
        'quantity' => max(1, $qty),
        'line_total' => $cheapest !== null ? round($cheapest[1] * max(1, $qty), 2) : null,
    ];
}

/**
 * Cards for an answer: the portfolio's holdings in order, else every
 * **bold** name in the reply that is an item of the index. At most 8.
 */
function tf2AiCards(string $reply, ?array $portfolio): array
{
    $cards = [];
    $seen = [];
    // The portfolio builder and the pick enforcer stop at the same count, so
    // the cards always equal the list.
    $max = TF2_AI_CARD_MAX;
    $add = static function (?array $row, int $qty) use (&$cards, &$seen, $max): void {
        if ($row === null || count($cards) >= $max) {
            return;
        }
        $key = mb_strtolower((string)$row[0]) . '|' . mb_strtolower((string)$row[1]);
        if (isset($seen[$key])) {
            return;
        }
        $seen[$key] = true;
        $cards[] = tf2AiCard($row, $qty);
    };
    if ($portfolio) {
        foreach ($portfolio['buckets'] as $list) {
            foreach ($list as $e) {
                $add(tf2AiRow((string)$e['name'], (string)$e['effect']), (int)$e['qty']);
            }
        }
        return $cards;
    }
    preg_match_all('/\*\*([^*\n]{3,90})\*\*/u', $reply, $m);
    foreach ($m[1] as $bold) {
        $add(tf2AiRow(trim($bold, " \t:—–-")), 1);
    }
    return $cards;
}

function tf2AiPrice(array $row): ?float
{
    $prices = array_filter([$row[3] ?? null, $row[4] ?? null], static fn($p) => is_numeric($p) && $p > 0);
    return $prices ? (float)min($prices) : null;
}

function tf2AiLine(array $row): string
{
    $name = (string)$row[0] . ((string)$row[1] !== '' ? ' (effect: ' . preg_replace('/^★\s*/u', '', (string)$row[1]) . ')' : '');
    $parts = [];
    if (is_numeric($row[3] ?? null)) {
        $parts[] = sprintf('Mannco €%.2f', (float)$row[3]);
    }
    if (is_numeric($row[4] ?? null)) {
        $parts[] = sprintf('Steam €%.2f', (float)$row[4]);
    }
    if ((int)($row[5] ?? 0) > 0) {
        $parts[] = number_format((int)$row[5]) . ' listed on Steam';
    }
    return '- ' . $name . ' [' . (string)$row[2] . ']: ' . implode(', ', $parts);
}

/**
 * The slice of the TF2 index relevant to the question: items whose names
 * share words with it, plus fixed market anchors (keys, metal) and, when the
 * question is broad, the most listed and most valuable items per category.
 */
function tf2AiContext(string $question): string
{
    $items = tf2AiItems();
    if (!$items) {
        return 'TF2 price data is not available right now.';
    }
    $q = mb_strtolower($question);
    $stop = array_flip(['the', 'and', 'for', 'what', 'which', 'with', 'are', 'is', 'best', 'buy', 'sell', 'worth', 'price', 'prices',
        'cheap', 'cheapest', 'most', 'expensive', 'tf2', 'fortress', 'item', 'items', 'should', 'how', 'much', 'now',
        'invest', 'good', 'top', 'can', 'you', 'this', 'that', 'from', 'about', 'give', 'show', 'some', 'list', 'under', 'over',
        'hat', 'hats', 'cosmetic', 'cosmetics', 'unusual', 'unusuals', 'right', 'budget', 'low', 'high', 'value', 'valuable', 'costs', 'cost',
        'weapon', 'weapons', 'taunt', 'taunts', 'case', 'cases', 'crate', 'crates', 'tool', 'tools', 'war', 'paint', 'paints', 'skin', 'skins',
        'there', 'does', 'have', 'get', 'any', 'many', 'keys', 'key', 'ref', 'refs', 'metal', 'euro', 'euros', 'eur', 'dollars', 'cheaper', 'pricier', 'all', 'one', 'ones', 'thing', 'things', 'game', 'market', 'rare', 'rarest', 'popular', 'traded']);
    preg_match_all('/[a-z0-9\'\.]{3,}/u', $q, $m);
    $tokens = array_values(array_unique(array_filter($m[0], static fn($t) => !isset($stop[$t]))));
    $cheapAsk = (bool)preg_match('/\b(cheap|cheapest|budget|under|low|affordable)\b/u', $q);

    // Category words, matched as whole words ("what" is not "hat").
    $cats = [];
    foreach ([
        'unusual' => '/\bunusuals?\b/u', 'cosmetics' => '/\b(?:hats?|cosmetics?|miscs?)\b/u', 'weapons' => '/\bweapons?\b/u',
        'warpaints' => '/\b(?:war\s*paints?|skins?)\b/u', 'taunts' => '/\btaunts?\b/u', 'keys' => '/\bkeys?\b/u',
        'cases' => '/\b(?:cases?|crates?)\b/u', 'tools' => '/\b(?:tools?|paint\s*cans?|strange\s*parts?)\b/u',
    ] as $cat => $re) {
        if (preg_match($re, $q)) {
            $cats[$cat] = true;
        }
    }
    // "Unusual hats" are the unusual category: effect items only, not the
    // unusualifiers and strange parts that carry the word in their name.
    $hatsOnly = isset($cats['unusual'], $cats['cosmetics']) && !isset($cats['taunts']);
    if (isset($cats['unusual'])) {
        unset($cats['cosmetics']);
    }
    $inCats = static function (array $r) use ($cats, $hatsOnly): bool {
        if (!$cats) {
            return true;
        }
        if (isset($cats['unusual']) && (string)$r[1] !== '' && (string)$r[2] === 'unusual') {
            // Hats only: no taunts, and no crates / cases / keys that happen
            // to carry an effect line.
            return !$hatsOnly || !preg_match('/\bTaunt:|\b(?:Case|Crate|Key)\s*$/u', (string)$r[0]);
        }
        return isset($cats[(string)$r[2]]) && (string)$r[2] !== 'unusual';
    };

    $scored = [];
    if ($tokens) {
        $scoreAll = [];
        $scoreIn = [];
        foreach ($items as $i => $row) {
            $hay = mb_strtolower((string)$row[0] . ' ' . (string)$row[1]);
            $s = 0;
            foreach ($tokens as $t) {
                if (str_contains($hay, $t)) {
                    $s++;
                }
            }
            if ($s > 0) {
                $scoreAll[$i] = $s;
                if ($inCats($row)) {
                    $scoreIn[$i] = $s;
                }
            }
        }
        // The category words narrow the matches only when the narrowed set
        // matches as well: in "how many keys is a Team Captain", keys is the
        // unit, not the item.
        $score = ($scoreIn && max($scoreIn) >= max($scoreAll)) ? $scoreIn : $scoreAll;
        // Best word overlap first; within a tier, the cheapest for budget
        // questions, else the most listed / most valuable.
        $keys = array_keys($score);
        usort($keys, static function ($a, $b) use ($score, $items, $cheapAsk) {
            if ($score[$a] !== $score[$b]) {
                return $score[$b] <=> $score[$a];
            }
            $pa = tf2AiPrice($items[$a]) ?? 0;
            $pb = tf2AiPrice($items[$b]) ?? 0;
            if ($cheapAsk) {
                return $pa <=> $pb;
            }
            return [(int)$items[$b][5], $pb] <=> [(int)$items[$a][5], $pa];
        });
        $scored = array_flip($keys);
    }

    $lines = [];
    $anchors = ['Mann Co. Supply Crate Key', 'Refined Metal', 'Reclaimed Metal', 'Scrap Metal', 'Tour of Duty Ticket'];
    $anchorLines = [];
    foreach ($items as $row) {
        if ((string)$row[1] === '' && in_array((string)$row[0], $anchors, true)) {
            $anchorLines[(string)$row[0]] = tf2AiLine($row);
        }
    }
    if ($anchorLines) {
        $lines[] = 'TF2 market anchors (TF2 trades are often priced in keys and refined metal):';
        foreach ($anchors as $a) {
            if (isset($anchorLines[$a])) {
                $lines[] = $anchorLines[$a];
            }
        }
    }

    if ($scored) {
        $lines[] = 'TF2 items matching the question (name [category]: prices):';
        // A cheap ask lists each item name once here too, or the matched
        // block is forty effects of one hat and the answer repeats it.
        $seenMatched = [];
        foreach (array_keys($scored) as $i) {
            $n = mb_strtolower((string)$items[$i][0]);
            if ($cheapAsk && isset($seenMatched[$n])) {
                continue;
            }
            $seenMatched[$n] = true;
            $lines[] = tf2AiLine($items[$i]);
            if (count($seenMatched) >= 40) {
                break;
            }
        }
    }

    // Broad questions (or few matches): the most listed and the priciest
    // items of the categories the question names, else overall.
    if (count($scored) < 8) {
        $pool = $cats ? array_filter($items, $inCats) : $items;
        $byListed = $pool;
        usort($byListed, static fn($a, $b) => ((int)$b[5]) <=> ((int)$a[5]));
        $listed = array_slice(array_values(array_filter($byListed, static fn($r) => (int)$r[5] > 0)), 0, 15);
        if ($listed) {
            $lines[] = 'Most listed on Steam' . ($cats ? ' (' . implode(', ', array_keys($cats)) . ')' : '') . ':';
            foreach ($listed as $row) {
                $lines[] = tf2AiLine($row);
            }
        }
        $byPrice = $pool;
        usort($byPrice, static fn($a, $b) => (tf2AiPrice($b) ?? 0) <=> (tf2AiPrice($a) ?? 0));
        $lines[] = 'Highest priced' . ($cats ? ' (' . implode(', ', array_keys($cats)) . ')' : '') . ':';
        foreach (array_slice($byPrice, 0, 12) as $row) {
            $lines[] = tf2AiLine($row);
        }
        if ($cheapAsk) {
            $cheap = array_values(array_filter($pool, static fn($r) => (tf2AiPrice($r) ?? 0) > 0));
            usort($cheap, static fn($a, $b) => (tf2AiPrice($a) ?? 0) <=> (tf2AiPrice($b) ?? 0));
            // One row per item name: the cheapest effect of each hat, so the
            // list spans different hats instead of twelve effects of one
            // (user, 2026-10-03: "I want to see multiple items, not the same one").
            $seenName = [];
            $distinct = [];
            foreach ($cheap as $row) {
                $n = mb_strtolower((string)$row[0]);
                if (isset($seenName[$n])) {
                    continue;
                }
                $seenName[$n] = true;
                $distinct[] = $row;
                if (count($distinct) >= 12) {
                    break;
                }
            }
            $lines[] = 'Cheapest priced (one per item, its cheapest effect; name DIFFERENT items, never several effects of the same hat):';
            foreach ($distinct as $row) {
                $lines[] = tf2AiLine($row);
            }
        }
    }
    $lines[] = sprintf('(%s priced TF2 items in the CS Price TF2 index; Mannco prices are in-stock asks, Steam prices are the lowest Steam listing.)', number_format(count($items)));
    return implode("\n", $lines);
}

/** @return array{0:?float,1:?float} [key €, refined €] from the index. */
function tf2AiCurrencyRates(): array
{
    $key = null;
    $ref = null;
    foreach (tf2AiItems() as $row) {
        if ((string)$row[1] !== '') {
            continue;
        }
        if ((string)$row[0] === 'Mann Co. Supply Crate Key') {
            $key = tf2AiPrice($row);
        } elseif ((string)$row[0] === 'Refined Metal') {
            $ref = tf2AiPrice($row);
        }
    }
    return [$key, $ref];
}

function tf2AiLooksLikePortfolio(string $q): bool
{
    return (bool)preg_match('/\b(portfolio|diversif\w*|allocat\w*|invest(?:ment)?\s+plan|spread\s+(?:my|the)\s+(?:money|budget)|what\s+(?:should|can|would)\s+i\s+(?:buy|invest)\s+(?:with|for)|(?:build|make|create|give)\s+(?:me\s+)?(?:a|an|my)\s+(?:\w+\s+){0,3}(?:portfolio|investment|setup|bundle|basket))\b/iu', $q);
}

function tf2AiLooksLikeTrading(string $q): bool
{
    return (bool)preg_match('/\b(flip\w*|arbitrage|profit\w*|trad(?:e|es|ing|er)|margin\w*|spread\w*|sell\w*|resell|cash\s*out|undervalued|overpriced|deal|deals|cheapest\s+place|where\s+(?:to|should\s+i)\s+(?:buy|sell)|keys?\s+(?:to|for|vs|or)\s+ref|ref\s+(?:to|for|vs|or)\s+keys?)\b/iu', $q);
}

/**
 * Budget in € from "€100", "$50", "100 euro", "20 keys", "300 ref"; null when
 * the question names none.
 */
function tf2AiBudget(string $q, ?float $keyEur, ?float $refEur): ?float
{
    $q = str_replace(',', '.', mb_strtolower($q));
    if (preg_match('/(\d+(?:\.\d+)?)\s*(?:k\b|keys?\b)/u', $q, $m) && $keyEur) {
        return (float)$m[1] * $keyEur;
    }
    if (preg_match('/(\d+(?:\.\d+)?)\s*(?:ref\b|refined\b)/u', $q, $m) && $refEur) {
        return (float)$m[1] * $refEur;
    }
    if (preg_match('/[€$£]\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:€|\$|£|eur\b|euros?\b|usd\b|dollars?\b|bucks\b)/u', $q, $m)) {
        $v = (float)($m[1] !== '' ? $m[1] : $m[2]);
        return $v > 0 ? $v : null;
    }
    return null;
}

/**
 * A concrete TF2 portfolio for a € budget, built from the index so every
 * item, quantity and price is real. Mark only explains it.
 *
 * Buckets: keys (the TF2 reserve currency, most liquid), an unusual when the
 * budget allows one, strange/australium/killstreak weapons, cosmetics, and a
 * small speculative slice (taunts, war paints, cases). Within a bucket the
 * most listed items win: liquidity is what lets a TF2 holding be sold again.
 *
 * @return array{budget:float, buckets:array<string, list<array{name:string, effect:string, qty:int, each:float, source:string, listings:int}>>, total:float, cash:float}
 */
function tf2AiBuildPortfolio(float $budget, ?float $keyEur): array
{
    $budget = max(1.0, min(100000.0, $budget));
    $rows = tf2AiItems();
    $buyPrice = static function (array $r): array {
        $m = is_numeric($r[3] ?? null) && $r[3] > 0 ? (float)$r[3] : null;
        $s = is_numeric($r[4] ?? null) && $r[4] > 0 ? (float)$r[4] : null;
        if ($m !== null && ($s === null || $m <= $s)) {
            return [$m, 'Mannco'];
        }
        return $s !== null ? [$s, 'Steam'] : [0.0, ''];
    };

    $pools = ['unusual' => [], 'weapons' => [], 'cosmetics' => [], 'speculative' => []];
    foreach ($rows as $r) {
        [$p] = $buyPrice($r);
        if ($p <= 0.05) {
            continue;
        }
        $name = (string)$r[0];
        $cat = (string)$r[2];
        $listings = (int)($r[5] ?? 0);
        if ($cat === 'unusual' && (string)$r[1] !== '' && !str_contains($name, 'Taunt:')) {
            $pools['unusual'][] = $r;
        } elseif ($cat === 'weapons' && $listings >= 15 && preg_match('/\b(Strange|Australium|Killstreak|Festivized)\b/u', $name)) {
            $pools['weapons'][] = $r;
        } elseif ($cat === 'cosmetics' && $listings >= 15) {
            $pools['cosmetics'][] = $r;
        } elseif (in_array($cat, ['taunts', 'warpaints', 'cases'], true) && $listings >= 40) {
            $pools['speculative'][] = $r;
        }
    }
    foreach (['weapons', 'cosmetics', 'speculative'] as $k) {
        usort($pools[$k], static fn($a, $b) => (int)$b[5] <=> (int)$a[5]);
    }

    $hasKeys = $keyEur !== null && $keyEur > 0 && $budget >= $keyEur * 3;
    $shares = $budget >= 60
        ? ['keys' => 0.25, 'unusual' => 0.35, 'weapons' => 0.2, 'cosmetics' => 0.12, 'speculative' => 0.08]
        : ['keys' => 0.35, 'unusual' => 0.0, 'weapons' => 0.3, 'cosmetics' => 0.2, 'speculative' => 0.15];
    if (!$hasKeys) {
        $shares['weapons'] += $shares['keys'];
        $shares['keys'] = 0.0;
    }

    $buckets = [];
    $spent = 0.0;
    // Each slot aims at an even share of its bucket (cap / max): the most
    // listed item priced 40-120% of that share, so the bucket actually gets
    // spent instead of filling up with the cheapest liquid items.
    $pick = static function (array $pool, float $cap, int $max) use ($buyPrice): array {
        $out = [];
        $used = [];
        $left = $cap;
        for ($slot = 0; $slot < $max; $slot++) {
            $target = $left / ($max - $slot);
            foreach ($pool as $i => $r) {
                if (isset($used[$i])) {
                    continue;
                }
                [$p, $src] = $buyPrice($r);
                if ($p > $left || $p < $target * 0.4 || $p > $target * 1.2) {
                    continue;
                }
                $used[$i] = true;
                $out[] = ['name' => (string)$r[0], 'effect' => (string)$r[1], 'qty' => 1, 'each' => round($p, 2), 'source' => $src, 'listings' => (int)$r[5]];
                $left -= $p;
                break;
            }
        }
        return $out;
    };

    // Unusual: the priciest liquid-ish effect hat that fits the slice (a
    // Steam price means it trades on the market, so prefer those).
    if ($shares['unusual'] > 0) {
        $cap = $budget * $shares['unusual'];
        $best = null;
        foreach ($pools['unusual'] as $r) {
            [$p, $src] = $buyPrice($r);
            if ($p > $cap || $p < $cap * 0.5) {
                continue;
            }
            $score = ((is_numeric($r[4]) ? 1 : 0) * 1000000) + (int)$r[5] * 1000 + $p;
            if ($best === null || $score > $best[0]) {
                $best = [$score, $r, $p, $src];
            }
        }
        if ($best) {
            $buckets['Unusual'] = [['name' => (string)$best[1][0], 'effect' => (string)$best[1][1], 'qty' => 1, 'each' => round($best[2], 2), 'source' => $best[3], 'listings' => (int)$best[1][5]]];
        } else {
            $shares['weapons'] += $shares['unusual'];
        }
    }
    foreach (['weapons' => 'Strange & australium weapons', 'cosmetics' => 'Cosmetics', 'speculative' => 'Speculative (taunts, war paints, cases)'] as $k => $label) {
        // 1 unusual + 1 keys + 3 + 2 + 1 = the card limit; the fill loop below
        // adds units, not holdings, once that many are held.
        $got = $pick($pools[$k], $budget * $shares[$k], $k === 'weapons' ? 3 : ($k === 'cosmetics' ? 2 : 1));
        if ($got) {
            $buckets[$label] = $got;
        }
    }
    foreach ($buckets as $list) {
        foreach ($list as $e) {
            $spent += $e['each'] * $e['qty'];
        }
    }
    // Whatever is left (plus the keys slice) goes into keys: the TF2 reserve.
    if ($hasKeys) {
        $qty = (int)floor(($budget - $spent) / $keyEur);
        if ($qty > 0) {
            $buckets = ['Keys (reserve currency)' => [['name' => 'Mann Co. Supply Crate Key', 'effect' => '', 'qty' => $qty, 'each' => round($keyEur, 2), 'source' => 'Mannco', 'listings' => 0]]] + $buckets;
            $spent += $qty * $keyEur;
        }
    }
    // Fill the budget (user, 2026-09-30: "always fill the budget"): the change
    // buys another unit of the priciest holding that still fits, else the
    // most listed liquid item that fits, until under 5 cents or nothing fits.
    $left = $budget - $spent;
    $held = [];
    foreach ($buckets as $list) {
        foreach ($list as $e) {
            $held[mb_strtolower($e['name'] . '|' . $e['effect'])] = true;
        }
    }
    $poolLabels = ['weapons' => 'Strange & australium weapons', 'cosmetics' => 'Cosmetics', 'speculative' => 'Speculative (taunts, war paints, cases)'];
    for ($guard = 0; $left > 0.05 && $guard < 200; $guard++) {
        // 1. A new, distinct holding: the priciest item that fits among the
        //    40 most listed of each pool, so the change buys one decent item
        //    rather than eight copies of a 10-cent one. Only while there is a
        //    card left for it: the text lists exactly the carded holdings.
        $cand = null;
        foreach (count($held) < TF2_AI_CARD_MAX ? $poolLabels : [] as $k => $label) {
            foreach (array_slice($pools[$k], 0, 40) as $r) {
                [$p, $src] = $buyPrice($r);
                $key = mb_strtolower((string)$r[0] . '|' . (string)$r[1]);
                if ($p <= 0.05 || $p > $left || isset($held[$key])) {
                    continue;
                }
                if ($cand === null || $p > $cand[0]) {
                    $cand = [$p, $src, $r, $label, $key];
                }
            }
        }
        if ($cand !== null) {
            [$p, $src, $r, $label, $key] = $cand;
            $held[$key] = true;
            $buckets[$label][] = ['name' => (string)$r[0], 'effect' => (string)$r[1], 'qty' => 1, 'each' => round($p, 2), 'source' => $src, 'listings' => (int)$r[5]];
            $spent += $p;
            $left = $budget - $spent;
            continue;
        }
        // 2. Else another unit of the priciest holding that still fits.
        $bestLabel = null;
        $bestIdx = null;
        foreach ($buckets as $label => $list) {
            if (str_starts_with($label, 'Unusual')) {
                continue;
            }
            foreach ($list as $i => $e) {
                if ($e['each'] <= $left && ($bestLabel === null || $e['each'] > $buckets[$bestLabel][$bestIdx]['each'])) {
                    $bestLabel = $label;
                    $bestIdx = $i;
                }
            }
        }
        if ($bestLabel !== null) {
            $buckets[$bestLabel][$bestIdx]['qty']++;
            $spent += $buckets[$bestLabel][$bestIdx]['each'];
            $left = $budget - $spent;
            continue;
        }
        break;
    }
    return ['budget' => round($budget, 2), 'buckets' => $buckets, 'total' => round($spent, 2), 'cash' => round($budget - $spent, 2)];
}

/** "Burning Flames Team Captain" / "Strange Jag": the holding's name as the answer writes it. */
function tf2AiHoldingName(array $e): string
{
    $effect = preg_replace('/^★\s*/u', '', (string)($e['effect'] ?? ''));
    return ($effect !== '' ? $effect . ' ' : '') . (string)$e['name'];
}

/**
 * Makes a portfolio answer say exactly what the cards show. The model was
 * asked to present the portfolio verbatim but drops and swaps holdings when
 * the list is long (user, 2026-09-30: "the ai shows different items than
 * those in the items to buy"), so `### Items to buy` and `### Why these
 * picks` are rebuilt here from the portfolio, keeping the model's own
 * one-line reasons for the holdings it did write about.
 */
function tf2AiPortfolioEnforce(string $raw, array $pf): string
{
    $lines = preg_split('/\r\n|\n|\r/', $raw) ?: [];
    $kept = [];
    $section = '';
    $reasons = [];   // lowercase holding name => model's reason
    foreach ($lines as $line) {
        if (preg_match('/^\s*#{1,6}\s*(.+?)\s*$/u', $line, $h)) {
            $section = strtolower(trim($h[1], " *:"));
            if ($section === 'items to buy' || $section === 'why these picks') {
                continue;
            }
        } elseif ($section === 'items to buy' || $section === 'why these picks') {
            if (preg_match('/\*\*([^*\n]{2,90})\*\*(.*)$/u', $line, $m)) {
                $rest = trim($m[2], " \t:—–-");
                $parts = preg_split('/\s+[—–-]\s+/u', $rest) ?: [];
                $why = trim((string)end($parts));
                $why = trim((string)preg_replace('/[.\s]+$/u', '', $why));
                if ($why !== '' && !preg_match('/€|\bon (Mannco|Steam)\b|^\d/iu', $why)) {
                    $reasons[mb_strtolower(trim($m[1], " :—–-"))] = $why;
                }
            }
            continue;
        }
        // Nothing before the first strip: the model's opening sentence (budget
        // recap, meme-mode asides) goes (user, 2026-10-04: "remove this").
        if ($section === '') {
            continue;
        }
        // ...and the same recap when the model parks it after a strip
        // ("Budget EUR100 - total EUR99.95, unspent EUR0.05. Meme mode: ...").
        if (preg_match('/\bbudget\b.*(?:\x{20AC}|\btotal\b|\bunspent\b)|\bmeme mode\b/iu', $line)) {
            continue;
        }
        $kept[] = $line;
    }
    $generic = static function (string $label, array $e): string {
        if (str_starts_with($label, 'Keys')) {
            return 'reserve currency, instant liquidity, holds value';
        }
        if (str_starts_with($label, 'Unusual')) {
            return 'effect hat, priced by its effect and hat demand';
        }
        if (str_starts_with($label, 'Strange')) {
            return 'strange weapon with steady demand and quick resale';
        }
        if (str_starts_with($label, 'Cosmetics')) {
            return 'liquid cosmetic with regular bids';
        }
        return 'speculative pick, event-driven upside';
    };
    $buy = ['### Items to buy'];
    $why = ['### Why these picks'];
    foreach ($pf['buckets'] as $label => $list) {
        foreach ($list as $e) {
            $name = tf2AiHoldingName($e);
            $reason = $reasons[mb_strtolower($name)] ?? $reasons[mb_strtolower((string)$e['name'])] ?? $generic($label, $e);
            $buy[] = sprintf('• **%s** — **€%.2f** × %d on %s — %s', $name, $e['each'], $e['qty'], $e['source'], $reason);
            $why[] = sprintf('**%s** — %s', $name, $reason);
        }
    }
    $body = trim(implode("\n", $kept));
    return trim($body . "\n\n" . implode("\n", $buy) . "\n\n" . implode("\n", $why));
}

function tf2AiPortfolioText(array $pf): string
{
    $lines = [sprintf('PORTFOLIO (built by CS Price from live prices; budget €%.2f, total €%.2f, unspent €%.2f):', $pf['budget'], $pf['total'], $pf['cash'])];
    foreach ($pf['buckets'] as $label => $list) {
        $lines[] = $label . ':';
        foreach ($list as $e) {
            $name = $e['name'] . ($e['effect'] !== '' ? ' (effect: ' . preg_replace('/^★\s*/u', '', $e['effect']) . ')' : '');
            $lines[] = sprintf('- %s × %d — €%.2f each on %s%s', $name, $e['qty'], $e['each'], $e['source'], $e['listings'] > 0 ? ', ' . number_format($e['listings']) . ' listed on Steam' : '');
        }
    }
    return implode("\n", $lines);
}

/**
 * Buy-on-Mannco / sell-on-Steam gaps. A Steam sale pays the seller the
 * listed price minus ~13% (Valve 5% + TF2 10%), so the net is price / 1.15.
 */
function tf2AiFlipsText(int $limit = 12): string
{
    $flips = [];
    foreach (tf2AiItems() as $r) {
        $m = is_numeric($r[3] ?? null) ? (float)$r[3] : 0.0;
        $s = is_numeric($r[4] ?? null) ? (float)$r[4] : 0.0;
        $listings = (int)($r[5] ?? 0);
        if ($m < 0.2 || $s <= 0 || $listings < 20) {
            continue;
        }
        $net = $s / 1.15;
        $gain = $net - $m;
        if ($gain <= 0.05 || $gain / $m < 0.08) {
            continue;
        }
        $flips[] = [$r, $net, $gain, $gain / $m];
    }
    usort($flips, static fn($a, $b) => ($b[2] * min(1, $b[0][5] / 200)) <=> ($a[2] * min(1, $a[0][5] / 200)));
    if (!$flips) {
        return 'No Mannco→Steam flips clear the Steam fee right now.';
    }
    $lines = ['Mannco→Steam flips after the Steam fee (buy on Mannco, list on Steam; seller receives Steam price / 1.15):'];
    foreach (array_slice($flips, 0, $limit) as [$r, $net, $gain, $pct]) {
        $lines[] = sprintf('- %s: Mannco €%.2f, Steam €%.2f (you get ~€%.2f) → ~€%.2f / %d%% per item, %s listed on Steam', $r[0], $r[3], $r[4], $net, $gain, (int)round($pct * 100), number_format((int)$r[5]));
    }
    return implode("\n", $lines);
}

/**
 * @return array{reply:string, followups:list<string>, items:array, plain:bool}
 */
function tf2AiRespond(array $messages, array $pageContext): array
{
    $cfg = aiChatConfig();
    $apiKey = trim((string)($cfg['api_key'] ?? ''));
    if ($apiKey === '') {
        throw new RuntimeException('AI chat is not configured on this server.');
    }
    $model = trim((string)($cfg['model'] ?? 'gpt-5-nano'));
    $baseUrl = rtrim(trim((string)($cfg['base_url'] ?? 'https://api.openai.com/v1')), '/');
    $timeout = max(10, (int)($cfg['timeout_seconds'] ?? 30));

    $lastUser = '';
    foreach (array_reverse($messages) as $m) {
        if (($m['role'] ?? '') === 'user') {
            $lastUser = (string)($m['content'] ?? '');
            break;
        }
    }

    $context = tf2AiContext($lastUser);
    [$keyEur, $refEur] = tf2AiCurrencyRates();
    if ($keyEur && $refEur) {
        $context = sprintf('Exchange rate: 1 key ≈ %.1f ref (key €%.2f, refined €%.2f).', $keyEur / $refEur, $keyEur, $refEur) . "\n" . $context;
    }

    // Portfolio: built here from the index (real items, prices, quantities);
    // the model presents and explains it and may not change it.
    $modeRules = [];
    $portfolio = null;
    // A follow-up in a portfolio thread ("make it cheaper", "swap the hat")
    // keeps the portfolio mode, with the budget from any earlier message.
    $threadText = '';
    foreach (array_slice($messages, -6) as $m) {
        $threadText .= ' ' . (string)($m['content'] ?? '');
    }
    $portfolioTurn = tf2AiLooksLikePortfolio($lastUser)
        || (preg_match('/\b(cheaper|bigger|smaller|swap|replace|rebalance|adjust|more|less|safer|riskier)\b/iu', $lastUser) && tf2AiLooksLikePortfolio($threadText));
    if ($portfolioTurn) {
        $budget = tf2AiBudget($lastUser, $keyEur, $refEur);
        if ($budget === null) {
            $userOnly = '';
            foreach ($messages as $m) {
                if (($m['role'] ?? '') === 'user') {
                    $userOnly .= ' ' . (string)($m['content'] ?? '');
                }
            }
            $budget = tf2AiBudget($userOnly, $keyEur, $refEur);
        }
        $budgetGiven = $budget !== null;
        if (preg_match('/\bcheaper|smaller|less\b/iu', $lastUser) && $budget) {
            $budget *= 0.6;
        } elseif (preg_match('/\bbigger|more\b/iu', $lastUser) && $budget) {
            $budget *= 1.6;
        }
        $portfolio = tf2AiBuildPortfolio($budget ?? 50.0, $keyEur);
        $context = tf2AiPortfolioText($portfolio) . "\n\n" . $context;
        $modeRules[] = 'PORTFOLIO REQUEST: after the three strips, `### Items to buy` presents EXACTLY the PORTFOLIO above - same items, quantities and € prices, nothing added, dropped or repriced - one bullet per holding: `• **<item>** — **€<each>** × <qty> on <source> — short why` (for an unusual, write the effect before the item name, e.g. **Burning Flames Team Captain**). Start the answer directly with `### Item metrics` - no opening sentence, no budget recap, no asides'
            . ($budgetGiven ? '' : ' (the budget was assumed to be €50 because none was given; say so in one clause inside `### Why these picks`)')
            . '. NO list of the holdings before the three strips or anywhere outside `### Items to buy`. Then `### Why these picks` — one line per holding, `**<item>** — <8–14 words on liquidity / thesis / event timing>`, no prices. The body has exactly these two sections, `### Items to buy` and `### Why these picks` - no other section (no hold plan, no summary). Cover EVERY holding of the PORTFOLIO in both sections, however many there are (a missing holding is an error); no word limit applies to a portfolio answer.';
    }
    if (tf2AiLooksLikeTrading($lastUser) || $portfolioTurn === false && preg_match('/\b(advice|tips?|how\s+(?:do|to|can)\s+i|strategy|beginner|start)\b/iu', $lastUser)) {
        $context .= "\n\n" . tf2AiFlipsText();
        $modeRules[] = 'TRADING ADVICE: give practical TF2 trading advice grounded in the data - key/ref conversion, buying on Mannco vs Steam (Steam keeps ~13% of a sale, so a Steam listing must beat the Mannco price by ~15% to profit), the flips listed above with their exact numbers, and liquidity (listing counts) as the risk check. Mention trade holds, scam safety (never trade outside Steam trade offers, check the partner\'s backpack.tf/rep) and that bot shops quote in keys+ref when relevant.';
    }

    // A plain question ("what is TF2?", "how do unusual effects work?") gets a
    // prose answer: no overview strip, no metrics / sentiment / key factors,
    // no cards, and more room to actually explain (user, 2026-10-02: "just
    // answer the question and make the answers a bit longer"). Pick, price,
    // portfolio and trading-advice asks keep the terminal layout.
    $plainTurn = !$portfolioTurn && $lastUser !== ''
        && function_exists('aiChatLooksLikeExplainerQuestion') && aiChatLooksLikeExplainerQuestion($lastUser);
    if ($plainTurn) {
        // "How do I start trading?" is a question too: the flips stay in the
        // context as material, the terminal layout rule goes.
        $modeRules = [];
    }
    $formatRules = $plainTurn
        ? [
            'ANSWER FORMAT (plain question): answer it directly, in Dell\'s voice, as 2–4 short paragraphs of prose, 150–260 words. **Bold** exact item names and **€prices** when you cite the data. NO headings, NO `### Item metrics`, NO `### AI SENTIMENT`, NO `### Key factors`, no bullet lists unless you are listing steps, no tables, no links, no disclaimers, no closing offer.',
        ]
        : [
            'ANSWER FORMAT (financial-terminal style, Markdown, the same layout as the CS2 answers). EVERY answer - follow-ups too ("make it cheaper", "what about hats?") - carries ### Item metrics, ### AI SENTIMENT and ### Key factors; never skip them:',
            'Line 1: a direct 1–2 sentence answer with **bold** item names and **€prices**.',
            '### Item metrics — exactly three chip lines: `**Scarcity:** <Extreme|High|Moderate|Low> — <short why>`, `**Liquidity:** <High|Medium|Low> — <short why>`, `**Volatility:** <High|Medium|Low> — <short why>`. Each why under ~10 words, grounded in the listing counts and prices in the data (for a portfolio: about the mix as a whole).',
            '### AI SENTIMENT — one line `BULLISH|NEUTRAL|BEARISH — <one short clause why>` right after Item metrics (never omit the why).',
            '### Key factors — 2–3 lines starting with `+ ` (positives) and 2–3 lines starting with `- ` (negatives / risks); short clauses, no € or % in them.',
            'Then the body: `### <title>` sections with `• ` bullets, one item per bullet like `• **<exact item name>** — **Mannco €X** / Steam €Y — short why`. Keep ### headings in English. 120–280 words in total. No tables, no links, no disclaimers, no closing offer.',
        ];
    $system = implode("\n", array_filter([
        function_exists('aiPersonaPromptBlock') ? aiPersonaPromptBlock() : '',
        'You are Dell, the TF2 trading assistant of CS Price (Mark\'s Team Fortress 2 counterpart), answering a TEAM FORTRESS 2 (TF2) question. Everything in this answer is about TF2 items and the TF2 economy, never Counter-Strike 2. If asked your name, it is Dell.',
        function_exists('aiChatLanguageInstruction') ? aiChatLanguageInstruction($pageContext) : '',
        'Personality: chill, funny and knowledgeable, like a TF2 trader friend. Light TF2 slang is fine (keys, ref, unusual effects, strange quality, australiums).',
        'Use ONLY the TF2 price data below for any item, price or listing count. Name exact items with their prices (Mannco and/or Steam, in €). Never invent an item, an effect or a price; if the data does not cover something, say so briefly.',
        'TF2 trading context you may use: prices are often quoted in Mann Co. Supply Crate Keys and Refined Metal (use the anchors below to convert when helpful); unusual hats are valued by their effect; strange, festivized and killstreak versions carry premiums; Steam prices include Valve\'s fee, Mannco asks usually sit below Steam.',
        ...$formatRules,
        'After the answer, append ---FOLLOWUPS--- then exactly four short TF2 follow-up questions separated by | (3–6 words each), written in the same language as the answer and in its script only - never mix in characters from another script.',
        'Most items only have a Mannco price. Quote a Steam price ONLY when that exact line of the data shows one; otherwise write just the Mannco price. Never write "Steam €?" or a guessed price.',
        implode("\n", $modeRules),
        'TF2 price data (CS Price TF2 index):',
        $context,
    ]));

    $payload = [['role' => 'system', 'content' => $system]];
    foreach (array_slice($messages, -8) as $m) {
        $role = ($m['role'] ?? '') === 'assistant' ? 'assistant' : 'user';
        $content = trim((string)($m['content'] ?? ''));
        if ($content !== '') {
            $payload[] = ['role' => $role, 'content' => mb_substr($content, 0, 4000)];
        }
    }

    // A reasoning model can spend the whole ceiling thinking and return an
    // empty reply (the long portfolio prompts did, 2026-09-29), so the budget
    // is roomy and an empty reply is retried once with double the ceiling -
    // the same guard the CS2 path has.
    $ask = static function (int $maxTokens) use ($baseUrl, $model, $payload, $apiKey, $timeout): string {
        $response = aiHttpPostJson(
            $baseUrl . '/chat/completions',
            array_merge(['model' => $model, 'messages' => $payload], aiChatModelRequestParams($model, $maxTokens, 0.6)),
            ['Authorization: Bearer ' . $apiKey, 'Accept: application/json'],
            $timeout
        );
        if (($response['status'] ?? 0) < 200 || ($response['status'] ?? 0) >= 300) {
            // Pass the provider's own reason on (e.g. the account's spend
            // limit), the way the CS2 path does, instead of a bare status.
            $reason = trim((string)($response['json']['error']['message'] ?? ''));
            throw new RuntimeException($reason !== '' ? $reason : 'AI provider returned HTTP ' . ($response['status'] ?? '?'));
        }
        return trim((string)($response['json']['choices'][0]['message']['content'] ?? ''));
    };
    $raw = $ask(2600);
    if ($raw === '') {
        error_log('[tf2-ai] empty completion; retrying with a larger ceiling');
        $raw = $ask(5200);
    }
    $followups = [];
    if (preg_match('/-{3}\s*FOLLOWUPS\s*-{3}(.*)$/su', $raw, $fm)) {
        $raw = trim(substr($raw, 0, strpos($raw, $fm[0])));
        // A chip in another script than the answer ("What's your寶?") is a
        // model slip; drop it and top up from the fixed list below.
        $latinAnswer = !preg_match('/\p{Han}|\p{Hiragana}|\p{Katakana}|\p{Hangul}|\p{Cyrillic}|\p{Arabic}|\p{Thai}/u', mb_substr($raw, 0, 600));
        foreach (explode('|', $fm[1]) as $f) {
            $f = trim($f, " \t\n\r\"'•-");
            if ($f === '' || mb_strlen($f) > 60) {
                continue;
            }
            if ($latinAnswer && preg_match('/[^\p{Latin}\p{Common}\p{Inherited}]/u', $f)) {
                continue;
            }
            $followups[] = $f;
        }
    }
    // A Steam price the data does not contain is a made-up one: drop it
    // (" / Steam €11.76", ", Steam €?"), keep the rest of the line.
    preg_match_all('/Steam €([0-9]+(?:\.[0-9]+)?)/u', $context, $known);
    $knownSteam = array_flip(array_map(static fn($v) => sprintf('%.2f', (float)$v), $known[1] ?? []));
    $raw = (string)preg_replace_callback(
        '/\s*[\/,|]\s*Steam\s*€\s*([0-9][0-9,]*(?:\.[0-9]+)?|\?|n\/a|—|-)/iu',
        static function (array $m) use ($knownSteam): string {
            $v = str_replace(',', '', $m[1]);
            return is_numeric($v) && isset($knownSteam[sprintf('%.2f', (float)$v)]) ? $m[0] : '';
        },
        $raw
    );
    // "- " bullets become "• " everywhere except under ### Key factors, where
    // the leading "+ " / "- " IS the chip sign the chat parses.
    $lines = preg_split('/\r\n|\n|\r/', $raw) ?: [];
    $inFactors = false;
    foreach ($lines as $i => $line) {
        if (preg_match('/^\s*#{1,6}\s*(.+?)\s*:?\s*$/u', $line, $h)) {
            $inFactors = (bool)preg_match('/^(?:\*\*)?key factors(?:\*\*)?$/iu', trim($h[1]));
            continue;
        }
        if (!$inFactors) {
            // A line the model already bulleted keeps its one "• ".
            $lines[$i] = (string)preg_replace('/^([ \t]*)(?:[-*•]\s+)+(?=\S)/u', '$1• ', $line);
        }
    }
    $raw = implode("\n", $lines);
    // "### ### Items to buy" - a doubled heading marker the model sometimes
    // emits - would not be recognised as the pick list.
    $raw = (string)preg_replace('/^(#{1,6})\s+(?:#{1,6}\s+)+/mu', '$1 ', $raw);
    if ($portfolio !== null) {
        // A portfolio answer lists its holdings once, under ### Items to buy.
        // A bullet list the model put before the first heading repeats it
        // (user, 2026-09-29: "the stuff ... can be deleted its useless"), and
        // a section other than the strips and the two pick sections is dropped.
        $kept = [];
        $seenHeading = false;
        $skipSection = false;
        foreach (preg_split('/\r\n|\n|\r/', $raw) ?: [] as $line) {
            if (preg_match('/^\s*#{1,6}\s*(.+?)\s*$/u', $line, $h)) {
                $seenHeading = true;
                $title = strtolower(trim($h[1], " *:"));
                $skipSection = !preg_match('/^(item metrics|ai sentiment|key factors|items to buy|why these picks)$/', $title);
                if ($skipSection) {
                    continue;
                }
            } elseif ($skipSection || (!$seenHeading && preg_match('/^\s*(?:[•*-]|\d+[.)])\s+/u', $line))) {
                continue;
            }
            $kept[] = $line;
        }
        $raw = tf2AiPortfolioEnforce(trim(implode("\n", $kept)), $portfolio);
    }
    if ($raw === '') {
        $raw = 'I could not put a TF2 answer together just now. Try asking about a specific item, like "Burning Flames Team Captain" or "key price".';
    }
    foreach (['Current TF2 key price?', 'Cheapest unusual hats?', 'Most expensive TF2 items?', 'Best australium weapons?'] as $fallback) {
        if (count($followups) >= 4) {
            break;
        }
        if (!in_array($fallback, $followups, true)) {
            $followups[] = $fallback;
        }
    }
    if ($portfolio === null && !$plainTurn) {
        $raw = tf2AiEnforcePicks($raw);
    }
    if ($plainTurn) {
        $raw = tf2AiPlainProse($raw);
    }
    return [
        'reply' => $raw,
        'followups' => array_slice($followups, 0, 4),
        'items' => $plainTurn ? [] : tf2AiCards($raw, $portfolio),
        'plain' => $plainTurn,
    ];
}

/**
 * A pick answer says exactly what its cards show (user, 2026-10-03: "only
 * type the items that are in the cards", "one item is missing the circle
 * point"): every body line naming an index item is a `• ` bullet, an item
 * named twice keeps its fuller line, and the list stops at the ten items
 * that get cards. The three strips are left alone.
 */
function tf2AiEnforcePicks(string $raw): string
{
    $lines = preg_split('/\r\n|\n|\r/', $raw) ?: [];
    $strip = false;
    $itemLine = [];     // item key => index in $out
    $out = [];
    $keep = TF2_AI_CARD_MAX;
    foreach ($lines as $line) {
        if (preg_match('/^\s*#{1,6}\s*(.+?)\s*:?\s*$/u', $line, $h)) {
            $strip = (bool)preg_match('/^(item metrics|ai sentiment|key factors)$/', strtolower(trim($h[1], " *:")));
            $out[] = $line;
            continue;
        }
        if ($strip || trim($line) === '') {
            $out[] = $line;
            continue;
        }
        $row = null;
        if (preg_match('/\*\*([^*\n]{3,90})\*\*/u', $line, $m)) {
            $row = tf2AiRow(trim($m[1], " \t:—–-"));
        }
        if ($row === null) {
            // A bold "item" the index does not know (the model's own
            // invention, e.g. an effect on the wrong hat) gets no card, so
            // its line goes too; ordinary bold prose stays.
            if (preg_match('/\(effect:|€|^\s*[-*•]\s+/u', $line)) {
                continue;
            }
            $out[] = $line;
            continue;
        }
        $key = mb_strtolower((string)$row[0]) . '|' . mb_strtolower((string)$row[1]);
        $bulleted = (string)preg_replace('/^([ \t]*)(?:[-*•]\s+)*(?=\S)/u', '$1• ', $line);
        if (isset($itemLine[$key])) {
            // Same item again: keep whichever line says more.
            if (mb_strlen($bulleted) > mb_strlen((string)$out[$itemLine[$key]])) {
                $out[$itemLine[$key]] = $bulleted;
            }
            continue;
        }
        if (count($itemLine) >= $keep) {
            continue;
        }
        $itemLine[$key] = count($out);
        $out[] = $bulleted;
    }
    $text = trim(implode("\n", $out));
    return (string)preg_replace("/\n{3,}/", "\n\n", $text);
}

/**
 * Prose for a plain question: the metric / sentiment / key-factor strips are
 * dropped if the model wrote them anyway, any other heading becomes a bold
 * lead-in, and the lines are joined into paragraphs.
 */
function tf2AiPlainProse(string $raw): string
{
    $out = [];
    $skipping = false;
    foreach (preg_split('/\r\n|\n|\r/', $raw) ?: [] as $line) {
        if (preg_match('/^\s*#{1,6}\s*(.+?)\s*:?\s*$/u', $line, $h)) {
            $title = strtolower(trim($h[1], " *:"));
            $skipping = (bool)preg_match('/^(item metrics|ai sentiment|key factors|market overview)$/', $title);
            if (!$skipping) {
                $out[] = '**' . trim($h[1], " *:") . '**';
            }
            continue;
        }
        if ($skipping) {
            continue;
        }
        // Strip chip lines the model may still emit outside a heading.
        if (preg_match('/^\s*\*\*(scarcity|liquidity|volatility):\*\*/iu', $line) || preg_match('/^\s*(bullish|neutral|bearish)\s+[—–-]/iu', $line)) {
            continue;
        }
        $out[] = rtrim($line);
    }
    $text = trim(implode("\n", $out));
    return (string)preg_replace("/\n{3,}/", "\n\n", $text);
}
