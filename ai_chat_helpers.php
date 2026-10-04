<?php
declare(strict_types=1);

require_once __DIR__ . '/price_cache_service.php';
require_once __DIR__ . '/ai_arima.php';
function aiChatConfig(): array
{
    $cfg = appConfig()['ai'] ?? [];
    return is_array($cfg) ? $cfg : [];
}

function aiChatEnabled(): bool
{
    $cfg = aiChatConfig();
    return trim((string)($cfg['api_key'] ?? '')) !== '';
}

function aiChatNormalizeMedia(mixed $raw): array
{
    if (!is_array($raw)) {
        return [];
    }

    $media = [];
    foreach (array_slice($raw, 0, 2) as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $kind = strtolower(trim((string)($entry['kind'] ?? $entry['type'] ?? '')));
        if ($kind !== 'image' && $kind !== 'video') {
            continue;
        }

        $name = mb_substr(trim((string)($entry['name'] ?? 'attachment')), 0, 160);
        $dataUrl = trim((string)($entry['data_url'] ?? $entry['url'] ?? ''));
        $item = [
            'kind' => $kind,
            'name' => $name !== '' ? $name : ($kind === 'image' ? 'image' : 'video'),
        ];

        if ($kind === 'image') {
            if ($dataUrl === '' || !preg_match('#^data:image/(jpeg|jpg|png|gif|webp);base64,#i', $dataUrl)) {
                continue;
            }
            if (strlen($dataUrl) > 4_500_000) {
                continue;
            }
            $item['data_url'] = $dataUrl;
        } else {
            // Videos are UI attachments only; the model gets a filename note.
            $item['data_url'] = '';
        }

        $media[] = $item;
    }

    return $media;
}

function aiChatNormalizeMessages(mixed $raw): array
{
    if (!is_array($raw)) {
        return [];
    }

    $allowed = ['user', 'assistant', 'system'];
    $messages = [];

    foreach ($raw as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $role = strtolower(trim((string)($entry['role'] ?? '')));
        $content = trim((string)($entry['content'] ?? ''));
        $media = $role === 'user' ? aiChatNormalizeMedia($entry['media'] ?? []) : [];
        if (!in_array($role, $allowed, true)) {
            continue;
        }
        if ($content === '' && !$media) {
            continue;
        }
        if ($content === '' && $media) {
            $hasImage = false;
            foreach ($media as $item) {
                if (($item['kind'] ?? '') === 'image') {
                    $hasImage = true;
                    break;
                }
            }
            $content = $hasImage
                ? 'Please look at the attached image and help with anything relevant to CS2 skins or prices.'
                : 'I attached a video. Please help based on my question or describe what you can do with it.';
        }

        $message = [
            'role' => $role,
            'content' => mb_substr($content, 0, 4000),
        ];
        if ($media) {
            $message['media'] = $media;
        }
        if ($role === 'assistant') {
            $charts = is_array($entry['charts'] ?? null) ? $entry['charts'] : [];
            $chartMeta = [
                'forecast' => !empty($charts['forecast']) || !empty($entry['forecast']),
                'distribution' => !empty($charts['distribution']) || !empty($entry['distribution']),
                'price_history' => !empty($charts['price_history']) || !empty($entry['price_history']),
                'item' => trim((string)(
                    $charts['item']
                    ?? ($entry['forecast']['item_name'] ?? null)
                    ?? ($entry['forecast']['item'] ?? null)
                    ?? ($entry['distribution']['item_name'] ?? null)
                    ?? ($entry['price_history']['item_name'] ?? null)
                    ?? ''
                )),
            ];
            if ($chartMeta['forecast'] || $chartMeta['distribution'] || $chartMeta['price_history'] || $chartMeta['item'] !== '') {
                $message['charts'] = $chartMeta;
            }
        }
        $messages[] = $message;
    }

    return array_slice($messages, -20);
}

function aiChatApiMessage(array $entry): array
{
    $role = (string)($entry['role'] ?? 'user');
    $content = trim((string)($entry['content'] ?? ''));
    $media = is_array($entry['media'] ?? null) ? $entry['media'] : [];

    $images = [];
    $videoNames = [];
    foreach ($media as $item) {
        if (!is_array($item)) {
            continue;
        }
        $kind = (string)($item['kind'] ?? '');
        if ($kind === 'image' && !empty($item['data_url'])) {
            $images[] = $item;
        } elseif ($kind === 'video') {
            $videoNames[] = (string)($item['name'] ?? 'video');
        }
    }

    if ($videoNames) {
        $content = trim($content . "\n\n[Attached video file: " . implode(', ', $videoNames) . "]");
    }

    if (!$images) {
        return [
            'role' => $role,
            'content' => $content,
        ];
    }

    $parts = [
        ['type' => 'text', 'text' => $content !== '' ? $content : 'Please review the attached image.'],
    ];
    foreach ($images as $image) {
        $parts[] = [
            'type' => 'image_url',
            'image_url' => [
                'url' => (string)$image['data_url'],
            ],
        ];
    }

    return [
        'role' => $role,
        'content' => $parts,
    ];
}

/**
 * The site's language picker is the source of truth for the reply language —
 * not language detection on the user's message. Only codes the UI can actually
 * be set to are accepted; anything else falls back to English.
 *
 * @return array{code:string,name:string}|null
 */
function aiChatNormalizeLanguage(mixed $raw): ?array
{
    static $supported = [
        'en'    => 'English',
        'es'    => 'Spanish (Español)',
        'pt-br' => 'Brazilian Portuguese (Português do Brasil)',
        'de'    => 'German (Deutsch)',
        'fr'    => 'French (Français)',
        'ru'    => 'Russian (Русский)',
        'zh-cn' => 'Simplified Chinese (简体中文)',
        'ja'    => 'Japanese (日本語)',
        'ko'    => 'Korean (한국어)',
        'it'    => 'Italian (Italiano)',
        'tr'    => 'Turkish (Türkçe)',
        'pl'    => 'Polish (Polski)',
        'cs'    => 'Czech (Čeština)',
    ];

    $code = strtolower(trim((string)$raw));
    if ($code === '' || !isset($supported[$code])) {
        return null;
    }

    return ['code' => $code, 'name' => $supported[$code]];
}

function aiChatPageContext(mixed $raw): array
{
    if (!is_array($raw)) {
        return [];
    }

    $inventory = $raw['inventory'] ?? null;
    if (!is_array($inventory)) {
        $inventory = [];
    }

    return [
        'lang' => aiChatNormalizeLanguage($raw['lang'] ?? ''),
        'path' => mb_substr(trim((string)($raw['path'] ?? '')), 0, 200),
        'title' => mb_substr(trim((string)($raw['title'] ?? '')), 0, 200),
        'item_name' => mb_substr(trim((string)($raw['item_name'] ?? '')), 0, 200),
        'lookup_name' => mb_substr(trim((string)($raw['lookup_name'] ?? '')), 0, 200),
        'wear' => mb_substr(trim((string)($raw['wear'] ?? '')), 0, 40),
        'page_type' => mb_substr(trim((string)($raw['page_type'] ?? '')), 0, 80),
        'mode' => mb_substr(trim((string)($raw['mode'] ?? '')), 0, 80),
        // Set when the visitor tapped one of the assistant's own follow-up
        // chips: those want a short read on what happens next, not another
        // pick list with cards and metric strips.
        'follow_up' => !empty($raw['follow_up']),
        // Game switcher (cs2 | tf2): TF2 turns go to tf2_ai_helpers.php.
        'game' => strtolower(trim((string)($raw['game'] ?? ''))) === 'tf2' ? 'tf2' : 'cs2',
        'inventory' => [
            'total_value' => is_numeric($inventory['total_value'] ?? null) ? round((float)$inventory['total_value'], 2) : null,
            'item_count' => is_numeric($inventory['item_count'] ?? null) ? (int)$inventory['item_count'] : null,
            'priced_count' => is_numeric($inventory['priced_count'] ?? null) ? (int)$inventory['priced_count'] : null,
            'valuation_mode' => mb_substr(trim((string)($inventory['valuation_mode'] ?? '')), 0, 120),
            'top_holdings' => aiChatNormalizeInventoryHoldings($inventory['top_holdings'] ?? []),
        ],
    ];
}

function aiChatNormalizeInventoryHoldings(mixed $raw): array
{
    if (!is_array($raw)) {
        return [];
    }

    $rows = [];
    foreach ($raw as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $name = trim((string)($entry['name'] ?? $entry['display_name'] ?? $entry['market_hash_name'] ?? ''));
        if ($name === '') {
            continue;
        }

        $rows[] = [
            'name' => mb_substr($name, 0, 160),
            'quantity' => max(1, (int)($entry['quantity'] ?? $entry['qty'] ?? 1)),
            'unit_value' => is_numeric($entry['unit_value'] ?? null) ? round((float)$entry['unit_value'], 2) : null,
            'total_value' => is_numeric($entry['total_value'] ?? null) ? round((float)$entry['total_value'], 2) : null,
        ];

        if (count($rows) >= 12) {
            break;
        }
    }

    return $rows;
}

function aiChatBuildMarketPulseContext(): string
{
    if (!is_file(__DIR__ . '/mark_daily_pulse_helpers.php')) {
        return '';
    }

    require_once __DIR__ . '/mark_daily_pulse_helpers.php';
    $home = markDailyPulseLoadHomeRoi();
    if (!$home['trending'] && !$home['declining']) {
        return '';
    }

    $lines = markDailyPulseContextLines($home['trending'], $home['declining']);
    $cached = markDailySummaryRead();
    if (is_array($cached) && ($cached['summary'] ?? '') !== '') {
        $lines[] = 'Latest daily pulse summary:';
        $lines[] = (string)$cached['summary'];
    }

    return implode("\n", $lines);
}

function aiChatBuildInventoryContext(array $pageContext): string
{
    $inventory = is_array($pageContext['inventory'] ?? null) ? $pageContext['inventory'] : [];
    $holdings = is_array($inventory['top_holdings'] ?? null) ? $inventory['top_holdings'] : [];
    if (!$holdings && !is_numeric($inventory['total_value'] ?? null)) {
        return '';
    }

    $lines = ['Steam inventory context from CS Price (user-provided snapshot):'];
    if (is_numeric($inventory['total_value'] ?? null)) {
        $lines[] = '- Estimated total value: €' . number_format((float)$inventory['total_value'], 2);
    }
    if (is_numeric($inventory['item_count'] ?? null)) {
        $lines[] = '- Item stacks loaded: ' . (int)$inventory['item_count'];
    }
    if (is_numeric($inventory['priced_count'] ?? null)) {
        $lines[] = '- Priced stacks: ' . (int)$inventory['priced_count'];
    }
    if (trim((string)($inventory['valuation_mode'] ?? '')) !== '') {
        $lines[] = '- Valuation mode: ' . trim((string)$inventory['valuation_mode']);
    }

    foreach ($holdings as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $name = trim((string)($entry['name'] ?? ''));
        if ($name === '') {
            continue;
        }
        $qty = max(1, (int)($entry['quantity'] ?? 1));
        $total = is_numeric($entry['total_value'] ?? null) ? '€' . number_format((float)$entry['total_value'], 2) : 'unknown value';
        $lines[] = sprintf('- %s x%d (%s)', $name, $qty, $total);
    }

    $lines[] = 'When reviewing this inventory, talk about the money already in the stash: current € value, top holdings, and the future of THOSE holdings (what may rise, stall, stay liquid, and the main risks). Do NOT recommend new items to buy. Do not invent item values beyond this snapshot.';

    return implode("\n", $lines);
}

function aiChatLoadRoiCatalogItems(): array
{
    static $items = null;
    if (is_array($items)) {
        return $items;
    }

    $items = [];
    $catalogFile = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
    if (!is_file($catalogFile)) {
        return $items;
    }

    $data = json_decode((string)file_get_contents($catalogFile), true);
    $items = is_array($data['items'] ?? null) ? $data['items'] : [];
    return $items;
}

function aiChatRoiCatalogByName(): array
{
    static $byName = null;
    if (is_array($byName)) {
        return $byName;
    }

    $byName = [];
    foreach (aiChatLoadRoiCatalogItems() as $item) {
        if (!is_array($item)) {
            continue;
        }
        $name = trim((string)($item['market_hash_name'] ?? ''));
        if ($name !== '' && !isset($byName[$name])) {
            $byName[$name] = $item;
        }
    }

    return $byName;
}

function aiChatSearchCatalog(string $query, int $limit = 6): array
{
    $query = trim($query);
    if ($query === '' || mb_strlen($query) < 2) {
        return [];
    }

    $all = aiChatLoadRoiCatalogItems();
    if (!$all) {
        return [];
    }
    $needle = mb_strtolower($query);
    $needle = (string)preg_replace('/\bak47\b/u', 'ak-47', $needle);
    $needle = (string)preg_replace('/\s+/u', ' ', $needle);
    $wantWeapon = aiChatCatalogNameWeapon($query);
    $wantWeaponLower = mb_strtolower($wantWeapon);
    $tokens = array_values(array_filter(
        preg_split('/[\s|]+/u', $needle) ?: [],
        static fn(string $t): bool => mb_strlen($t) >= 2
            && !in_array($t, ['the', 'a', 'an', 'of', 'for', 'on', 'in', 'to', 'and', 'or'], true)
    ));

    $scored = [];
    foreach ($all as $item) {
        $name = mb_strtolower((string)($item['market_hash_name'] ?? ''));
        $display = mb_strtolower((string)($item['display_name'] ?? ''));
        $hay = trim($name . ' ' . $display);
        if ($hay === '') {
            continue;
        }
        if ($wantWeaponLower !== '') {
            $weaponNeedles = array_unique(array_filter([
                $wantWeaponLower,
                str_replace('-', '', $wantWeaponLower),
            ]));
            $hitWeapon = false;
            foreach ($weaponNeedles as $weaponNeedle) {
                if (str_contains($hay, $weaponNeedle)) {
                    $hitWeapon = true;
                    break;
                }
            }
            if (!$hitWeapon) {
                continue;
            }
        }

        $score = 0;
        if (mb_strpos($name, $needle) !== false || mb_strpos($display, $needle) !== false) {
            $score += 100;
        }
        if ($tokens) {
            $hitTokens = 0;
            foreach ($tokens as $token) {
                if (mb_strpos($hay, $token) !== false) {
                    $hitTokens++;
                    $score += 12;
                }
            }
            // Require most tokens to match for multi-word fuzzy lookups.
            if (count($tokens) >= 2 && $hitTokens < max(1, (int)ceil(count($tokens) * 0.6))) {
                if ($score < 100) {
                    continue;
                }
            }
            if ($hitTokens === 0 && $score < 100) {
                continue;
            }
        } elseif ($score < 100) {
            continue;
        }

        if ($wantWeaponLower !== '') {
            $score += 40;
        }

        // Prefer Field-Tested / exact weapon skins over keys/coins when relevant.
        if (str_contains($name, 'field-tested')) {
            $score += 8;
        }
        if (str_contains($name, ' key') || str_contains($name, 'map coin')) {
            $score -= 20;
        }

        $scored[] = [
            'score' => $score,
            'hit' => [
                'name' => (string)($item['display_name'] ?? $item['market_hash_name'] ?? ''),
                'market_hash_name' => (string)($item['market_hash_name'] ?? ''),
                'category' => (string)($item['category'] ?? ''),
                'seed_price' => is_numeric($item['seed_sell_price'] ?? null) ? (float)$item['seed_sell_price'] : null,
            ],
        ];
    }

    usort($scored, static function (array $a, array $b): int {
        if ($a['score'] !== $b['score']) {
            return $b['score'] <=> $a['score'];
        }
        return mb_strlen((string)$a['hit']['market_hash_name']) <=> mb_strlen((string)$b['hit']['market_hash_name']);
    });

    $results = [];
    foreach ($scored as $row) {
        $results[] = $row['hit'];
        if (count($results) >= $limit) {
            break;
        }
    }

    return $results;
}

function aiChatSkinFamilyKey(string $name): string
{
    $name = trim($name);
    $name = (string)preg_replace('/\s*\([^)]*\)/u', '', $name);
    $name = (string)preg_replace('/^(?:★\s*)?(?:stattrak™|stattrak|souvenir)\s+/iu', '', $name);
    $name = (string)preg_replace('/^★\s*/u', '', $name);
    $name = (string)preg_replace('/\s*-\s*(phase\s*\d+|emerald|ruby|sapphire|black pearl)\b.*$/iu', '', $name);
    $name = trim((string)preg_replace('/\s+/u', ' ', $name));
    return mb_strtolower($name);
}

/**
 * Finish / collection family (right of "|"), so Elite Build on AK+P90+AWP counts as one family.
 */
function aiChatFinishFamilyKey(string $name): string
{
    $stripped = aiChatStripItemNamePrefixes(aiChatStripWear($name));
    if ($stripped === '') {
        return '';
    }
    if (str_contains($stripped, '|')) {
        return mb_strtolower(trim((string)explode('|', $stripped, 2)[1]));
    }
    return mb_strtolower($stripped);
}

function aiChatCandidateSeedPrice(string $name): float
{
    $item = aiChatRoiCatalogByName()[$name] ?? null;
    if (is_array($item) && is_numeric($item['seed_sell_price'] ?? null)) {
        return (float)$item['seed_sell_price'];
    }
    return 0.0;
}

function aiChatPriceBandKey(float $price): string
{
    if ($price <= 0) {
        return 'unknown';
    }
    if ($price < 8) {
        return 'low';
    }
    if ($price < 50) {
        return 'mid';
    }
    return 'high';
}

function aiChatStripItemNamePrefixes(string $name): string
{
    $name = trim($name);
    for ($i = 0; $i < 4; $i++) {
        $next = trim((string)preg_replace('/^★\s*/u', '', $name));
        $next = trim((string)preg_replace('/^(?:StatTrak™|StatTrak|Souvenir)\s+/iu', '', $next));
        if ($next === $name) {
            break;
        }
        $name = $next;
    }
    return $name;
}

/**
 * Weapon family on a catalog item (left of "|"), or empty for cases/other.
 */
function aiChatCatalogNameWeapon(string $name): string
{
    $stripped = aiChatStripItemNamePrefixes(aiChatStripWear($name));
    if ($stripped === '') {
        return '';
    }
    if (str_contains($stripped, '|')) {
        $left = trim((string)explode('|', $stripped, 2)[0]);
        return aiChatExtractWeaponFamily($left);
    }
    return aiChatExtractWeaponFamily($stripped);
}

/**
 * Coarse catalog kind: skin, case, or other.
 */
function aiChatCatalogItemKind(string $name): string
{
    $stripped = aiChatStripItemNamePrefixes(aiChatStripWear($name));
    $lower = mb_strtolower($stripped);
    if ($lower === '') {
        return 'other';
    }
    if (preg_match('/^(sticker|patch|graffiti|music kit|pin|charm|keychain)\b/u', $lower)) {
        return 'other';
    }
    if (str_contains($stripped, '|')) {
        return 'skin';
    }
    if (preg_match('/\b(case|capsule|package)\s*$/u', $lower)) {
        return 'case';
    }
    return 'other';
}

/**
 * Weapon cases only — not sticker/autograph capsules or souvenir packages.
 */
function aiChatIsWeaponCaseItem(string $name): bool
{
    $stripped = aiChatStripItemNamePrefixes(aiChatStripWear($name));
    if ($stripped === '') {
        return false;
    }
    if (preg_match('/\bSouvenir Package\b/iu', $stripped)) {
        return false;
    }
    if (aiChatIsStickerCapsuleItem($stripped)) {
        return false;
    }
    return (bool)preg_match('/\bCase\s*$/iu', $stripped);
}

/**
 * Sticker / autograph capsules (including EMS Katowice sets without "Capsule" in the market name).
 */
function aiChatIsStickerCapsuleItem(string $name): bool
{
    $stripped = aiChatStripItemNamePrefixes(aiChatStripWear($name));
    if ($stripped === '') {
        return false;
    }
    if (preg_match('/\bSouvenir Package\b/iu', $stripped)) {
        return false;
    }
    if (preg_match('/\b(sticker|autograph)\s+capsule\b/iu', $stripped)) {
        return true;
    }
    if (preg_match('/^EMS Katowice 2014 (?:Legends|Challengers)$/iu', $stripped)) {
        return true;
    }
    if (preg_match('/\bCapsule\s*$/iu', $stripped) && !preg_match('/\bCase\s*$/iu', $stripped)) {
        return true;
    }
    return false;
}

/**
 * Paper CS2 stickers (Sticker | Bomb Doge). Not slabs, charms, gun skins, or weapon cases.
 */
function aiChatIsPaperStickerItem(string $name): bool
{
    $name = trim($name);
    if ($name === '') {
        return false;
    }
    if (preg_match('/^Sticker Slab\s*\|/iu', $name)) {
        return false;
    }
    return (bool)preg_match('/^(?:Souvenir\s+)?Sticker\s*\|/iu', $name);
}

/**
 * Weapon skins (AK-47 | Redline, Glock-18 | Moonrise). Not paper stickers, charms, or capsules.
 */
function aiChatLooksLikeGunSkinName(string $name): bool
{
    $name = trim($name);
    if ($name === '') {
        return false;
    }
    if (aiChatIsPaperStickerItem($name) || aiChatIsCharmItem($name) || aiChatIsStickerCapsuleItem($name)) {
        return false;
    }
    if (aiChatIsWeaponCaseItem($name)) {
        return false;
    }
    if (aiChatCatalogItemKind($name) === 'skin') {
        return true;
    }
    $stripped = aiChatStripItemNamePrefixes(aiChatStripWear($name));
    if ($stripped === '' || !str_contains($stripped, '|')) {
        return false;
    }
    return aiChatCatalogNameWeapon($stripped) !== '';
}

/**
 * Paper stickers and/or sticker capsules — never weapon cases, gun skins, or charms.
 */
function aiChatIsStickerScopedItem(string $name, bool $capsulesOnly = false): bool
{
    if (aiChatIsWeaponCaseItem($name) || aiChatIsCharmItem($name) || aiChatLooksLikeGunSkinName($name)) {
        return false;
    }
    if ($capsulesOnly) {
        return aiChatIsStickerCapsuleItem($name);
    }
    return aiChatIsPaperStickerItem($name) || aiChatIsStickerCapsuleItem($name);
}

function aiChatIsStickerCardScope(string $itemType): bool
{
    return $itemType === 'sticker' || $itemType === 'sticker_capsule';
}

/**
 * User asked for sticker capsules / capsules (not weapon cases).
 * "Best capsules" and "sticker capsules" win; "best cases" must stay cases.
 */
function aiChatWantsStickerCapsules(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }
    if (preg_match('/\bsticker(?:s)?\s+capsules?\b/u', $message)) {
        return true;
    }
    if (preg_match('/\bcapsules?\s+(?:with\s+)?stickers?\b/u', $message)) {
        return true;
    }
    if (preg_match('/\b(sticker|autograph)\s+capsules?\b/u', $message)) {
        return true;
    }
    // Bare "capsules" (Best capsules) — never steal charms, cases, or skins-invest.
    if (preg_match('/\b(charms?|keychains?)\b/u', $message)) {
        return false;
    }

    $wantsCapsules = (bool)preg_match('/\bcapsules?\b/u', $message);
    $wantsCases = (bool)preg_match('/\bcases?\b/u', $message);
    $wantsSkins = (bool)preg_match('/\b(skins?|finishes?)\b/u', $message);
    if (!$wantsCapsules || $wantsCases || $wantsSkins) {
        return false;
    }
    if (preg_match('/\bcollections?\b/u', $message) && !preg_match('/\bcapsules?\b/u', $message)) {
        return false;
    }
    return true;
}

/**
 * User asked for stickers (paper and/or capsules). Must not steal capsule-only,
 * charm, souvenir, case, collection, cheapest-AK, or mixed skins-invest asks.
 */
function aiChatWantsStickerItems(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }
    if (aiChatWantsStickerCapsules($message)) {
        return false;
    }
    if (aiChatWantsCharmItems($message)) {
        return false;
    }
    if (!preg_match('/\bstickers?\b/u', $message)) {
        return false;
    }
    $wantsSkins = (bool)preg_match('/\b(skins?|finishes?)\b/u', $message);
    $wantsCases = (bool)preg_match('/\bcases?\b/u', $message);
    if ($wantsSkins || $wantsCases) {
        return false;
    }
    if (preg_match('/\bcollections?\b/u', $message) && !preg_match('/\bsticker/u', $message)) {
        return false;
    }
    return true;
}

/**
 * Paper sticker + capsule display names from stickers.html (sticker-group-map)
 * plus ROI catalog Sticker | / capsule rows.
 *
 * @return list<string>
 */
function aiChatStickerCatalogNames(bool $capsulesOnly = false): array
{
    static $paper = null;
    static $capsules = null;
    if (!is_array($paper) || !is_array($capsules)) {
        $paper = [];
        $capsules = [];
        $seenPaper = [];
        $seenCapsules = [];
        $addPaper = static function (string $name) use (&$paper, &$seenPaper): void {
            $name = trim($name);
            if ($name === '' || !aiChatIsPaperStickerItem($name)) {
                return;
            }
            $key = mb_strtolower($name);
            if (isset($seenPaper[$key])) {
                return;
            }
            $seenPaper[$key] = true;
            $paper[] = $name;
        };
        $addCapsule = static function (string $name) use (&$capsules, &$seenCapsules): void {
            $name = trim($name);
            if ($name === '' || !aiChatIsStickerCapsuleItem($name) || aiChatIsWeaponCaseItem($name)) {
                return;
            }
            $key = mb_strtolower($name);
            if (isset($seenCapsules[$key])) {
                return;
            }
            $seenCapsules[$key] = true;
            $capsules[] = $name;
        };

        $mapFile = __DIR__ . '/react/sticker-group-map.js';
        if (is_file($mapFile)) {
            $src = (string)file_get_contents($mapFile);
            if ($src !== '') {
                if (preg_match_all('/"(Sticker \| [^"]+)"/u', $src, $matches)) {
                    foreach ($matches[1] as $raw) {
                        $addPaper((string)$raw);
                    }
                }
                if (preg_match_all('/^\s+"([^"]+)":\s*\[/um', $src, $groupMatches)) {
                    foreach ($groupMatches[1] as $group) {
                        $group = trim((string)$group);
                        if ($group === '' || !preg_match('/\bcapsule\b/iu', $group)) {
                            continue;
                        }
                        $tries = [
                            $group,
                            preg_replace('/\bCapsule\b/iu', 'Sticker Capsule', $group) ?? $group,
                            $group . ' Sticker Capsule',
                        ];
                        foreach ($tries as $try) {
                            $addCapsule((string)$try);
                        }
                    }
                }
            }
        }

        foreach (aiChatDefaultStickerCapsuleNames() as $name) {
            $addCapsule($name);
        }
        foreach (aiChatDefaultPaperStickerNames() as $name) {
            $addPaper($name);
        }

        foreach (aiChatLoadRoiCatalogItems() as $item) {
            if (!is_array($item)) {
                continue;
            }
            $name = trim((string)($item['market_hash_name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $addPaper($name);
            $addCapsule($name);
        }
    }

    return $capsulesOnly ? $capsules : array_merge($paper, $capsules);
}

/**
 * Well-known paper stickers from this site's sticker catalog for candidate seeding.
 *
 * @return list<string>
 */
function aiChatDefaultPaperStickerNames(): array
{
    return [
        'Sticker | Bomb Doge',
        'Sticker | Banana',
        'Sticker | Chicken Lover',
        'Sticker | Welcome to the Clutch',
        'Sticker | Crown (Foil)',
        'Sticker | Headhunter (Foil)',
        'Sticker | Teamwork (Holo)',
        'Sticker | Speedy T',
        'Sticker | Howling Dawn',
        'Sticker | Titan (Holo) | Katowice 2014',
        'Sticker | iBUYPOWER (Holo) | Katowice 2014',
        'Sticker | Reason Gaming (Holo) | Katowice 2014',
        'Sticker | Natus Vincere (Holo) | Katowice 2015',
        'Sticker | Team Liquid (Holo) | Cologne 2016',
        'Sticker | Cloud9 (Holo) | Cologne 2015',
        'Sticker | Fnatic (Holo) | Katowice 2015',
    ];
}

/**
 * Map AI shorthand / gun-mislabel picks onto real Sticker | or capsule catalog names.
 * Drops weapon skins even when the model appends "Sticker".
 */
/**
 * Fuzzy sticker/capsule resolution must not swap the event, year, or tier the
 * model actually named (Budapest 2025 Contenders → Paris 2023 Challengers would
 * card a different item and then get a made-up why line).
 */
/**
 * The resolved catalog skin must be the finish the model named (wear may differ).
 */
function aiChatSkinResolutionKeepsFinish(string $requested, string $resolved): bool
{
    $finish = static function (string $name): string {
        $parts = explode('|', $name, 2);
        $tail = trim((string)($parts[1] ?? ''));
        $tail = (string)preg_replace('/\s*\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu', '', $tail);
        return (string)preg_replace('/[^a-z0-9]+/u', '', mb_strtolower($tail));
    };
    $weapon = static function (string $name): string {
        $head = trim((string)explode('|', $name, 2)[0]);
        $head = (string)preg_replace('/^(?:★\s*)?(?:StatTrak™?\s*|Souvenir\s*)?/iu', '', $head);
        return (string)preg_replace('/[^a-z0-9]+/u', '', mb_strtolower($head));
    };
    $wantWeapon = $weapon($requested);
    $haveWeapon = $weapon($resolved);
    if ($wantWeapon !== '' && $haveWeapon !== '' && $wantWeapon !== $haveWeapon
        && !str_contains($haveWeapon, $wantWeapon) && !str_contains($wantWeapon, $haveWeapon)) {
        return false; // Paracord Knife | Fade must not card as Gut Knife | Fade
    }
    $want = $finish($requested);
    $have = $finish($resolved);
    if ($want === '' || $have === '') {
        return true;
    }
    return $want === $have || str_contains($have, $want) || str_contains($want, $have);
}

function aiChatStickerResolutionKeepsIdentity(string $requested, string $resolved): bool
{
    $tokens = static function (string $text): array {
        preg_match_all(
            '/\b(?:19|20)\d{2}\b|\b(?:legends|challengers|contenders|autograph|katowice|cologne|paris|budapest|austin|shanghai|copenhagen|rio|antwerp|stockholm|berlin|london|boston|krakow|atlanta|columbus|dreamhack|mlg|eleague|faceit|pgl|iem|esl|blast)\b/u',
            mb_strtolower($text),
            $matches
        );
        return array_values(array_unique($matches[0] ?? []));
    };
    $needed = $tokens($requested);
    $have = $tokens($resolved);
    foreach ($needed as $token) {
        if (!in_array($token, $have, true)) {
            return false;
        }
    }
    // The team / player segment must survive too: "Sticker | G2 | Paris 2023" may
    // resolve to "Sticker | G2 Esports | Paris 2023" but never to "Sticker | iM | Paris 2023".
    $segment = static function (string $text): string {
        $parts = array_map('trim', explode('|', $text));
        if (count($parts) < 2) {
            return '';
        }
        // The team/player segment is whichever one carries no event/year token
        // ("Sticker | Katowice 2014 | Team Dignitas" is written back to front).
        foreach (array_slice($parts, 1) as $part) {
            $clean = (string)preg_replace('/\s*\((?:holo|foil|gold|glitter|lenticular|champion)\)\s*/iu', '', $part);
            if (preg_match('/\b(?:19|20)\d{2}\b|\b(?:katowice|cologne|paris|budapest|austin|shanghai|copenhagen|rio|antwerp|stockholm|berlin|london|boston|krakow|atlanta|columbus|dreamhack|mlg|eleague|faceit|pgl|iem|esl|blast)\b/iu', $clean)) {
                continue;
            }
            return (string)preg_replace('/[^a-z0-9]+/u', '', mb_strtolower($clean));
        }
        return '';
    };
    $want = $segment($requested);
    $got = $segment($resolved);
    if ($want !== '' && $got !== '' && $want !== $got && !str_contains($got, $want) && !str_contains($want, $got)) {
        return false;
    }
    return true;
}

function aiChatResolveStickerPickName(string $name, bool $capsulesOnly = false): ?string
{
    $name = trim(aiChatNormalizePickCatalogName(aiChatSanitizeExtractedItemName($name)));
    if ($name === '') {
        return null;
    }

    // "Glock-18 | Moonrise (Factory New) Sticker" is a pistol with Sticker glued on.
    $strippedSuffix = trim((string)preg_replace('/\s+Stickers?$/iu', '', $name));
    if ($strippedSuffix !== $name && !aiChatIsStickerScopedItem($strippedSuffix, false)) {
        if (aiChatCatalogItemKind($strippedSuffix) === 'skin' || aiChatIsWeaponCaseItem($strippedSuffix)) {
            return null;
        }
    }

    if (
        aiChatIsWeaponCaseItem($name)
        || aiChatIsCharmItem($name)
        || aiChatLooksLikeGunSkinName($name)
        || aiChatCatalogItemKind($name) === 'skin'
    ) {
        return null;
    }

    if ($capsulesOnly) {
        $resolved = aiChatResolveStickerCapsulePickName($name);
        if ($resolved !== null && aiChatIsStickerCapsuleItem($resolved) && !aiChatIsWeaponCaseItem($resolved)) {
            return $resolved;
        }
        return null;
    }

    if (aiChatIsPaperStickerItem($name)) {
        $byName = aiChatRoiCatalogByName();
        if (isset($byName[$name])) {
            return $name;
        }
        foreach (aiChatStickerCatalogNames(false) as $catalogName) {
            if (!aiChatIsPaperStickerItem($catalogName)) {
                continue;
            }
            if (mb_strtolower($catalogName) === mb_strtolower($name)) {
                return $catalogName;
            }
        }
        return $name;
    }

    $capsule = aiChatResolveStickerCapsulePickName($name);
    if ($capsule !== null && !aiChatIsWeaponCaseItem($capsule)) {
        return $capsule;
    }

    $bare = trim((string)preg_replace('/^(?:Souvenir\s+)?Stickers?\s*\|?\s*/iu', '', $name));
    $bare = trim((string)preg_replace('/\s+Stickers?$/iu', '', $bare));
    if ($bare === '' || aiChatCatalogItemKind($bare) === 'skin' || aiChatIsWeaponCaseItem($bare)) {
        return null;
    }

    $tries = [];
    if ($bare !== '') {
        $tries[] = 'Sticker | ' . $bare;
        $tries[] = 'Souvenir Sticker | ' . $bare;
    }
    $byName = aiChatRoiCatalogByName();
    foreach ($tries as $try) {
        if (isset($byName[$try]) && aiChatIsPaperStickerItem($try)) {
            return $try;
        }
    }

    $needle = mb_strtolower($bare !== '' ? $bare : $name);
    if ($needle === '' || mb_strlen($needle) < 3) {
        return null;
    }
    foreach (aiChatStickerCatalogNames(false) as $catalogName) {
        if (!aiChatIsPaperStickerItem($catalogName)) {
            continue;
        }
        $hay = mb_strtolower($catalogName);
        $right = mb_strtolower(trim((string)explode('|', $catalogName, 2)[1] ?? ''));
        if ($hay === $needle || $right === $needle || str_contains($right, $needle) || str_contains($hay, $needle)) {
            return $catalogName;
        }
    }

    return null;
}

/**
 * Priced sticker / capsule catalog names for invest / cheapest-sticker shortlists.
 *
 * @return list<string>
 */
function aiChatStickerInvestSeedNames(int $limit = 24, bool $preferCheap = false, bool $capsulesOnly = false): array
{
    $limit = max(4, min(40, $limit));
    $scored = [];
    $seen = [];
    $pool = $capsulesOnly
        ? array_merge(aiChatDefaultStickerCapsuleNames(), aiChatStickerCatalogNames(true))
        : array_merge(
            aiChatDefaultPaperStickerNames(),
            aiChatDefaultStickerCapsuleNames(),
            aiChatStickerCatalogNames(false)
        );
    foreach ($pool as $name) {
        $name = trim((string)$name);
        if ($name === '' || !aiChatIsStickerScopedItem($name, $capsulesOnly)) {
            continue;
        }
        $key = mb_strtolower($name);
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $hit = aiChatRoiCatalogByName()[$name] ?? null;
        $price = is_array($hit) && is_numeric($hit['seed_sell_price'] ?? null)
            ? (float)$hit['seed_sell_price']
            : aiChatCandidateSeedPrice($name);
        $listings = is_array($hit) && is_numeric($hit['seed_sell_listings'] ?? null)
            ? (int)$hit['seed_sell_listings']
            : 0;
        if ($preferCheap && ($price <= 0 || $listings < 5)) {
            continue;
        }
        $scored[] = [
            'name' => $name,
            'price' => $price,
            'listings' => $listings,
        ];
    }

    usort($scored, static function (array $a, array $b) use ($preferCheap): int {
        $aPrice = (float)$a['price'];
        $bPrice = (float)$b['price'];
        $aHas = $aPrice > 0 ? 0 : 1;
        $bHas = $bPrice > 0 ? 0 : 1;
        if ($aHas !== $bHas) {
            return $aHas <=> $bHas;
        }
        if ($preferCheap) {
            if ($aPrice !== $bPrice) {
                return $aPrice <=> $bPrice;
            }
            return ((int)$b['listings']) <=> ((int)$a['listings']);
        }
        $aList = (int)$a['listings'];
        $bList = (int)$b['listings'];
        if ($aList !== $bList) {
            return $bList <=> $aList;
        }
        return $aPrice <=> $bPrice;
    });

    $out = [];
    foreach ($scored as $row) {
        $out[] = (string)$row['name'];
        if (count($out) >= $limit) {
            break;
        }
    }
    return $out;
}

/**
 * CS2 keychain charms (Charm | Hot Wurst, Souvenir Charm | …). Not sticker slabs or gun skins.
 */
function aiChatIsCharmItem(string $name): bool
{
    $name = trim($name);
    if ($name === '') {
        return false;
    }
    if (preg_match('/^Sticker Slab\s*\|/iu', $name)) {
        return false;
    }
    return (bool)preg_match('/^(?:Souvenir\s+)?Charm\s*\|/iu', $name);
}

/**
 * User asked for CS2 charms / keychains (cheapest charms, charm invest, keychains).
 * Must not steal sticker-capsule, souvenir-skin, case, collection, or weapon-skin asks.
 */
function aiChatWantsCharmItems(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }
    if (aiChatWantsStickerCapsules($message)) {
        return false;
    }
    if (!preg_match('/\b(charms?|keychains?)\b/u', $message)) {
        return false;
    }
    // "souvenir charms" are charms; bare souvenir asks stay souvenir-only.
    if (aiChatWantsSouvenirItems($message) && !preg_match('/\b(charms?|keychains?)\b/u', $message)) {
        return false;
    }
    return true;
}

/**
 * Cheapest / budget wording so charm seeds prefer the low end of the catalog.
 */
function aiChatLooksLikeCheapestItemAsk(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }
    return (bool)preg_match('/\b(cheapest|cheap(?:er)?|lowest[- ]priced?|dirt[- ]cheap|budget)\b/u', $message);
}

/**
 * "Cheapest Glock-18 skins right now" / "lowest priced AWP skins": the user
 * wants the bottom of the price list, not a curated invest mix.
 */
function aiChatLooksLikeCheapestListAsk(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }
    return (bool)preg_match('/\b(cheapest|lowest[- ]priced?|dirt[- ]cheap|cheap(?:est)?\s+(?:skins?|items?|options?|picks?|cases?|stickers?|knives|gloves))\b/u', $message);
}

/**
 * Remove ### Items to buy / ### Why these picks / ### Collections to watch
 * blocks (heading through the next heading or the end) from a prose reply.
 */
function aiChatStripPickSections(string $reply): string
{
    $lines = preg_split('/\r?\n/', $reply) ?: [];
    $out = [];
    $skipping = false;
    foreach ($lines as $line) {
        $trim = trim($line);
        if (preg_match('/^#{1,6}\s*(?:[^\w#]{0,6})?(items to buy|why these picks|collections to watch|what to buy next|picks)\b/iu', $trim)) {
            $skipping = true;
            continue;
        }
        if ($skipping && preg_match('/^#{1,6}\s/u', $trim)) {
            $skipping = false;
        }
        if ($skipping) {
            // Pick bullets / **Name** — why lines belong to the skipped block.
            if ($trim === '' || preg_match('/^(•|\*\*|- |\* |\d+[.)]\s)/u', $trim)) {
                continue;
            }
            $skipping = false;
        }
        $out[] = $line;
    }
    return trim(implode("\n", $out));
}

/**
 * "Cheapest X" replies are rebuilt from the catalog's lowest asks so the list
 * is exactly the bottom of the price ladder (the model tends to "upgrade" to
 * nicer skins). The model's why-clauses are kept where names match.
 */
function aiChatForceCheapestPicks(string $reply, string $userMessage): string
{
    $scope = aiChatRequestedCardScope($userMessage);
    $budget = aiChatExtractBudgetEuro($userMessage);
    $names = aiChatCheapestCatalogCandidates(
        $scope['weapon'],
        $scope['type'] !== '' ? $scope['type'] : 'skin',
        5,
        !empty($scope['stattrak']),
        $budget > 0 ? $budget : 0.0
    );
    if (count($names) < 2) {
        return $reply;
    }
    $byName = aiChatRoiCatalogByName();
    $whys = [];
    if (preg_match_all('/^\*\*([^*]+)\*\*\s*[—-]\s*(.+)$/mu', $reply, $m, PREG_SET_ORDER)) {
        foreach ($m as $row) {
            $key = aiChatSkinFamilyKey((string)$row[1]) ?: mb_strtolower(trim((string)$row[1]));
            $clause = trim(preg_replace('/\s*[—-]\s*\*\*€[^*]+\*\*\s*[—-]\s*/u', ' ', (string)$row[2]));
            if ($clause !== '' && !preg_match('/€\s*\d/u', $clause)) {
                $whys[$key] = rtrim($clause, '.');
            }
        }
    }
    $bullets = [];
    $whyLines = [];
    foreach ($names as $name) {
        $price = (float)($byName[$name]['seed_sell_price'] ?? 0);
        $listings = (int)($byName[$name]['seed_sell_listings'] ?? 0);
        $key = aiChatSkinFamilyKey($name) ?: mb_strtolower($name);
        // No digits here: the Why tidy pass strips numbers from why clauses.
        $why = $whys[$key] ?? ($listings >= 100
            ? 'lowest Steam ask in this family, plenty of listings'
            : 'lowest Steam ask in this family');
        $short = trim(preg_replace('/\s*\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu', '', $name));
        $bullets[] = '• **' . $name . '** — **€' . number_format($price, 2, '.', '') . '** — ' . $why;
        $whyLines[] = '**' . $short . '** — ' . $why;
    }
    return "### Items to buy\n" . implode("\n", $bullets) . "\n\n### Why these picks\n" . implode("\n", $whyLines);
}

/**
 * Cheapest-first ordering for a "cheapest X" reply: the ### Items to buy
 * bullets are sorted by their € price ascending, ### Why these picks lines
 * follow the same order, and the cards match.
 *
 * @param list<array<string, mixed>> $cards
 * @return array{reply: string, cards: list<array<string, mixed>>}
 */
function aiChatSortPicksCheapestFirst(string $reply, array $cards): array
{
    $priceOf = static function (string $line): float {
        if (preg_match_all('/€\s*([\d.,]+)/u', $line, $m)) {
            $raw = str_replace(',', '', (string)$m[1][0]);
            return is_numeric($raw) ? (float)$raw : PHP_FLOAT_MAX;
        }
        return PHP_FLOAT_MAX;
    };
    $nameOf = static function (string $line): string {
        return preg_match('/\*\*([^*]+)\*\*/u', $line, $m) ? mb_strtolower(trim(preg_replace('/\s*\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu', '', $m[1]))) : '';
    };

    $lines = preg_split('/\r?\n/', $reply) ?: [];
    $order = [];
    $section = '';
    $blocks = ['items' => [], 'why' => []];
    $out = [];
    $anchors = ['items' => null, 'why' => null];
    foreach ($lines as $i => $line) {
        $trim = trim($line);
        if (preg_match('/^#{2,3}\s*items to buy/iu', $trim)) {
            $section = 'items';
            $out[] = $line;
            $anchors['items'] = count($out);
            continue;
        }
        if (preg_match('/^#{2,3}\s*why these picks/iu', $trim)) {
            $section = 'why';
            $out[] = $line;
            $anchors['why'] = count($out);
            continue;
        }
        if (preg_match('/^#{2,3}\s/u', $trim)) {
            $section = '';
        }
        if ($section === 'items' && str_starts_with($trim, '•')) {
            $blocks['items'][] = $line;
            continue;
        }
        if ($section === 'why' && str_starts_with($trim, '**')) {
            $blocks['why'][] = $line;
            continue;
        }
        $out[] = $line;
    }
    if (count($blocks['items']) < 2) {
        return ['reply' => $reply, 'cards' => $cards];
    }

    usort($blocks['items'], static fn(string $a, string $b): int => $priceOf($a) <=> $priceOf($b));
    foreach ($blocks['items'] as $line) {
        $order[] = $nameOf($line);
    }
    $rank = array_flip(array_filter($order, static fn(string $n): bool => $n !== ''));
    usort($blocks['why'], static function (string $a, string $b) use ($rank, $nameOf): int {
        return ($rank[$nameOf($a)] ?? 999) <=> ($rank[$nameOf($b)] ?? 999);
    });

    // Re-insert the sorted blocks right after their headings.
    $result = [];
    foreach ($out as $idx => $line) {
        $result[] = $line;
        if ($anchors['items'] === $idx + 1) {
            foreach ($blocks['items'] as $l) {
                $result[] = $l;
            }
        }
        if ($anchors['why'] === $idx + 1) {
            foreach ($blocks['why'] as $l) {
                $result[] = $l;
            }
        }
    }

    usort($cards, static function (array $a, array $b) use ($rank): int {
        $ka = mb_strtolower(trim(preg_replace('/\s*\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu', '', (string)($a['market_hash_name'] ?? ''))));
        $kb = mb_strtolower(trim(preg_replace('/\s*\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu', '', (string)($b['market_hash_name'] ?? ''))));
        return ($rank[$ka] ?? 999) <=> ($rank[$kb] ?? 999);
    });

    return ['reply' => implode("\n", $result), 'cards' => array_values($cards)];
}

/**
 * Lowest-priced catalog rows for a scope, cheapest first, one per skin
 * family, only rows with real listings.
 *
 * @return list<string>
 */
function aiChatCheapestCatalogCandidates(string $weapon, string $itemType, int $limit = 8, bool $wantStatTrak = false, float $maxUnitPrice = 0.0): array
{
    $rows = [];
    foreach (aiChatLoadRoiCatalogItems() as $item) {
        if (!is_array($item)) {
            continue;
        }
        $name = trim((string)($item['market_hash_name'] ?? ''));
        $price = is_numeric($item['seed_sell_price'] ?? null) ? (float)$item['seed_sell_price'] : 0.0;
        $listings = is_numeric($item['seed_sell_listings'] ?? null) ? (int)$item['seed_sell_listings'] : 0;
        if ($name === '' || $price <= 0 || $listings < 5) {
            continue;
        }
        if ($maxUnitPrice > 0 && $price > $maxUnitPrice) {
            continue;
        }
        if (!aiChatCatalogNameMatchesScope($name, $weapon, $itemType, $wantStatTrak)) {
            continue;
        }
        if (!$wantStatTrak && aiChatIsStatTrakItemName($name)) {
            continue;
        }
        if ($itemType !== 'souvenir' && preg_match('/\bSouvenir\b/iu', $name)) {
            continue;
        }
        $rows[] = [$name, $price];
    }
    usort($rows, static fn(array $a, array $b): int => $a[1] <=> $b[1]);

    $out = [];
    $seen = [];
    foreach ($rows as [$name, $price]) {
        $key = aiChatSkinFamilyKey($name);
        if ($key === '') {
            $key = mb_strtolower($name);
        }
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $out[] = $name;
        if (count($out) >= $limit) {
            break;
        }
    }
    return $out;
}

/**
 * Charm display names from charms.html (charm-group-map) plus ROI catalog Charm | rows.
 *
 * @return list<string>
 */
function aiChatCharmCatalogNames(): array
{
    static $names = null;
    if (is_array($names)) {
        return $names;
    }

    $names = [];
    $seen = [];
    $add = static function (string $name) use (&$names, &$seen): void {
        $name = trim($name);
        if ($name === '' || !aiChatIsCharmItem($name)) {
            return;
        }
        $key = mb_strtolower($name);
        if (isset($seen[$key])) {
            return;
        }
        $seen[$key] = true;
        $names[] = $name;
    };

    $mapFile = __DIR__ . '/react/charm-group-map.js';
    if (is_file($mapFile)) {
        $src = (string)file_get_contents($mapFile);
        if ($src !== '' && preg_match_all('/"(Charm \| [^"]+|Souvenir Charm \| [^"]+)"/u', $src, $matches)) {
            foreach ($matches[1] as $raw) {
                $add((string)$raw);
            }
        }
    }

    foreach (aiChatLoadRoiCatalogItems() as $item) {
        if (!is_array($item)) {
            continue;
        }
        $add(trim((string)($item['market_hash_name'] ?? '')));
    }

    return $names;
}

/**
 * Well-known charm rows for candidate seeding when catalog search is thin.
 *
 * @return list<string>
 */
function aiChatDefaultCharmSuggestionNames(): array
{
    return [
        'Charm | Hot Wurst',
        'Charm | Pinch O\' Salt',
        'Charm | That\'s Bananas',
        'Charm | Chicken Lil\'',
        'Charm | Disco MAC',
        'Charm | Lil\' Cap Gun',
        'Charm | Backsplash',
        'Charm | Glamour Shot',
        'Charm | Hang Loose',
        'Charm | Die-cast AK',
        'Charm | Baby\'s AK',
        'Charm | Pocket AWP',
        'Charm | Diamond Dog',
        'Charm | Hot Howl',
        'Charm | Big Kev',
        'Charm | Lil\' SAS',
        'Charm | POP Art',
        'Charm | Whittle Knife',
    ];
}

/**
 * Map AI shorthand / gun-mislabel picks onto real Charm | catalog names.
 */
function aiChatResolveCharmPickName(string $name): ?string
{
    $name = trim(aiChatNormalizePickCatalogName(aiChatSanitizeExtractedItemName($name)));
    if ($name === '') {
        return null;
    }

    // "AK-47 | Redline (Field-Tested) Charm" is a rifle with Charm glued on — not a keychain.
    $strippedSuffix = trim((string)preg_replace('/\s+Charms?$/iu', '', $name));
    if ($strippedSuffix !== $name && !aiChatIsCharmItem($strippedSuffix)) {
        if (aiChatCatalogItemKind($strippedSuffix) === 'skin' || aiChatExtractWeaponFamily($strippedSuffix) !== '') {
            return null;
        }
    }

    if (aiChatIsCharmItem($name)) {
        $byName = aiChatRoiCatalogByName();
        if (isset($byName[$name])) {
            return $name;
        }
        foreach (aiChatCharmCatalogNames() as $catalogName) {
            if (mb_strtolower($catalogName) === mb_strtolower($name)) {
                return $catalogName;
            }
        }
        return $name;
    }

    $bare = trim((string)preg_replace('/^(?:Souvenir\s+)?Charms?\s*\|?\s*/iu', '', $name));
    $bare = trim((string)preg_replace('/\s+Charms?$/iu', '', $bare));
    if ($bare === '' || aiChatCatalogItemKind($bare) === 'skin' || aiChatIsWeaponCaseItem($bare)) {
        return null;
    }

    $tries = [];
    if ($bare !== '') {
        $tries[] = 'Charm | ' . $bare;
        $tries[] = 'Souvenir Charm | ' . $bare;
    }
    $byName = aiChatRoiCatalogByName();
    foreach ($tries as $try) {
        if (isset($byName[$try]) && aiChatIsCharmItem($try)) {
            return $try;
        }
    }

    $needle = mb_strtolower($bare !== '' ? $bare : $name);
    if ($needle === '' || mb_strlen($needle) < 3) {
        return null;
    }
    foreach (aiChatCharmCatalogNames() as $catalogName) {
        $hay = mb_strtolower($catalogName);
        $right = mb_strtolower(trim((string)explode('|', $catalogName, 2)[1] ?? ''));
        if ($hay === $needle || $right === $needle || str_contains($right, $needle) || str_contains($hay, $needle)) {
            return $catalogName;
        }
    }

    return null;
}

/**
 * Priced charm catalog names for invest / cheapest-charms shortlists.
 *
 * @return list<string>
 */
function aiChatCharmInvestSeedNames(int $limit = 24, bool $preferCheap = false, bool $includeSouvenir = false): array
{
    $limit = max(4, min(40, $limit));
    $scored = [];
    $seen = [];
    foreach (array_merge(aiChatDefaultCharmSuggestionNames(), aiChatCharmCatalogNames()) as $name) {
        $name = trim((string)$name);
        if ($name === '' || !aiChatIsCharmItem($name)) {
            continue;
        }
        $isSouvenirCharm = (bool)preg_match('/^Souvenir\s+Charm\s*\|/iu', $name);
        if ($includeSouvenir && !$isSouvenirCharm) {
            continue;
        }
        if (!$includeSouvenir && $isSouvenirCharm) {
            continue;
        }
        $key = mb_strtolower($name);
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $hit = aiChatRoiCatalogByName()[$name] ?? null;
        $price = is_array($hit) && is_numeric($hit['seed_sell_price'] ?? null)
            ? (float)$hit['seed_sell_price']
            : aiChatCandidateSeedPrice($name);
        $listings = is_array($hit) && is_numeric($hit['seed_sell_listings'] ?? null)
            ? (int)$hit['seed_sell_listings']
            : 0;
        if ($preferCheap && ($price <= 0 || $listings < 5)) {
            continue;
        }
        $scored[] = [
            'name' => $name,
            'price' => $price,
            'listings' => $listings,
        ];
    }

    usort($scored, static function (array $a, array $b) use ($preferCheap): int {
        $aPrice = (float)$a['price'];
        $bPrice = (float)$b['price'];
        $aHas = $aPrice > 0 ? 0 : 1;
        $bHas = $bPrice > 0 ? 0 : 1;
        if ($aHas !== $bHas) {
            return $aHas <=> $bHas;
        }
        if ($preferCheap) {
            if ($aPrice !== $bPrice) {
                return $aPrice <=> $bPrice;
            }
            return ((int)$b['listings']) <=> ((int)$a['listings']);
        }
        $aList = (int)$a['listings'];
        $bList = (int)$b['listings'];
        if ($aList !== $bList) {
            return $bList <=> $aList;
        }
        return $aPrice <=> $bPrice;
    });

    $out = [];
    foreach ($scored as $row) {
        $out[] = (string)$row['name'];
        if (count($out) >= $limit) {
            break;
        }
    }
    return $out;
}

/**
 * User asked for cheapest / investable skins that drop from CS2 collections
 * (Achroma, Train 2025, Graphic Design, Dust II, …) — not weapon-case skins.
 * Must not steal cheapest-AK, case invest, charms, stickers, or
 * "best collections to invest in" (that still names collections first).
 */
function aiChatWantsCollectionSkins(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }
    if (
        aiChatWantsSouvenirItems($message)
        || aiChatWantsStickerCapsules($message)
        || aiChatWantsStickerItems($message)
        || aiChatWantsCharmItems($message)
    ) {
        return false;
    }
    // Cheapest AK / cheapest AWP — weapon scope wins; this is collection skins.
    if (aiChatExtractWeaponFamily($message) !== '') {
        return false;
    }
    if (preg_match('/\b(cases?|capsules?)\b/u', $message) && !preg_match('/\bcollections?\b/u', $message)) {
        return false;
    }
    if (!preg_match('/\bcollections?\b/u', $message) || !preg_match('/\b(skins?|finishes?)\b/u', $message)) {
        return false;
    }
    $skinFromCollections = (bool)preg_match(
        '/\bcollections?\s+skins?\b|\bskins?\s+from\s+collections?\b|\bskins?\s+in\s+collections?\b|\bskins?\b.{0,40}\bcollections?\b|\bcollections?\b.{0,40}\bskins?\b/u',
        $message
    );
    if (!$skinFromCollections) {
        return false;
    }
    return (bool)preg_match(
        '/\b(cheapest|cheap(?:er)?|lowest[- ]priced?|dirt[- ]cheap|budget|invest(?:ing|ment)?s?|buy|underval(?:ued)?|recommend|suggest|plays?|hold)\b/u',
        $message
    );
}

function aiChatIsCollectionSkinCardScope(string $itemType): bool
{
    return $itemType === 'collection_skin';
}

function aiChatIsCollectionCardScope(string $itemType): bool
{
    return $itemType === 'collection' || aiChatIsCollectionSkinCardScope($itemType);
}

/**
 * $N / invest portfolio / skins-invest / "chart the top item" on a portfolio.
 * Must not steal souvenir, sticker, charm, collections-only, or case-only asks.
 */
function aiChatWantsSkinsInvestPortfolio(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }
    if (
        aiChatWantsSouvenirItems($message)
        || aiChatWantsStickerCapsules($message)
        || aiChatWantsStickerItems($message)
        || aiChatWantsCharmItems($message)
    ) {
        return false;
    }
    // Collections-only asks stay collections-invest.
    if (preg_match('/\bcollections?\b/u', $message) && !preg_match('/\b(skins?|finishes?)\b/u', $message)) {
        return false;
    }
    $wantsCases = (bool)preg_match('/\bcases?\b/u', $message);
    $wantsSkins = (bool)preg_match('/\b(skins?|finishes?)\b/u', $message);
    $wantsPortfolio = (bool)preg_match('/\bportfolio\b/u', $message);
    if ($wantsCases && !$wantsSkins && !$wantsPortfolio) {
        return false;
    }

    $hasMoney = aiChatExtractBudgetEuro($message) >= 10.0;
    $hasInvest = (bool)preg_match('/\binvest(?:ing|ment)?s?\b/u', $message);
    $chartTop = (bool)preg_match(
        '/\bchart(?:s|ing)?\b.{0,48}\btop\s+item\b|\btop\s+item\b.{0,32}\bchart(?:s|ing)?\b|\bchart(?:s|ing)?\b.{0,40}\bstrongest\s+pick\b/u',
        $message
    );

    if ($hasMoney && ($wantsPortfolio || $hasInvest || $chartTop)) {
        return true;
    }
    if ($wantsPortfolio && $hasInvest) {
        return true;
    }
    if ($wantsSkins && $hasInvest && aiChatExtractWeaponFamily($message) === '') {
        return true;
    }
    if ($chartTop && ($wantsPortfolio || $hasInvest || $hasMoney)) {
        return true;
    }

    return false;
}

/**
 * User asked which collections to invest in / best collections / collection plays.
 * Must not steal souvenir, sticker-capsule, case-only, skins-invest / $N portfolio,
 * or "cheapest collection skins".
 */
function aiChatWantsCollectionInvest(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }
    if (aiChatWantsSkinsInvestPortfolio($message)) {
        return false;
    }
    if (
        aiChatWantsSouvenirItems($message)
        || aiChatWantsStickerCapsules($message)
        || aiChatWantsStickerItems($message)
        || aiChatWantsCharmItems($message)
        || aiChatWantsCollectionSkins($message)
    ) {
        return false;
    }
    if (preg_match('/\b(cases?|capsules?)\b/u', $message) && !preg_match('/\bcollections?\b/u', $message)) {
        return false;
    }
    if (!preg_match('/\bcollections?\b/u', $message)) {
        return false;
    }
    return (bool)preg_match(
        '/\b(invest(?:ing|ment)?s?|best|top|buy|underval(?:ued)?|plays?|hold|recommend|suggest|which|what)\b/u',
        $message
    );
}

function aiChatNormalizeCollectionKey(string $name): string
{
    $s = mb_strtolower(trim($name));
    $s = preg_replace('/^the\s+/u', '', $s) ?? $s;
    $s = preg_replace('/\s+collection$/u', '', $s) ?? $s;
    $s = preg_replace('/\s+/u', ' ', $s) ?? $s;
    return trim($s);
}

/**
 * Tracked CS2 collections from collections.html / collection-catalog.js.
 *
 * @return list<array{name:string,category:string}>
 */
function aiChatTrackedCollectionEntries(): array
{
    static $entries = null;
    if (is_array($entries)) {
        return $entries;
    }

    $entries = [];
    $seen = [];
    $file = __DIR__ . '/react/collection-catalog.js';
    if (is_file($file)) {
        $src = (string)file_get_contents($file);
        if (preg_match_all(
            '/\{\s*name:\s*"([^"]+)",\s*intro:\s*"[^"]*",\s*category:\s*"([^"]+)"\s*\}/',
            $src,
            $matches,
            PREG_SET_ORDER
        )) {
            foreach ($matches as $match) {
                $name = trim((string)($match[1] ?? ''));
                $category = trim((string)($match[2] ?? ''));
                if ($name === '' || !preg_match('/\bcollection\b/iu', $name)) {
                    continue;
                }
                $key = aiChatNormalizeCollectionKey($name);
                if ($key === '' || isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;
                $entries[] = [
                    'name' => $name,
                    'category' => $category,
                ];
            }
        }
    }

    if ($entries === []) {
        foreach ([
            ['The Achroma Collection', 'Weapon Skins'],
            ['The Ascent Collection', 'Weapon Skins'],
            ['The Boreal Collection', 'Weapon Skins'],
            ['The Genesis Collection', 'Weapon Skins'],
            ['The Harlequin Collection', 'Weapon Skins'],
            ['The Radiant Collection', 'Weapon Skins'],
            ['The Graphic Design Collection', 'Armory Exclusive'],
            ['The Overpass 2024 Collection', 'Armory Exclusive'],
            ['The Sport & Field Collection', 'Armory Exclusive'],
            ['The Train 2025 Collection', 'Armory Exclusive'],
            ['The 2021 Dust 2 Collection', 'Operation Riptide'],
            ['The 2021 Mirage Collection', 'Operation Riptide'],
            ['The Ancient Collection', 'Operation Broken Fang'],
            ['The Control Collection', 'Operation Broken Fang'],
            ['The Havoc Collection', 'Operation Broken Fang'],
            ['The Norse Collection', 'Operation Shattered Web'],
            ['The Cobblestone Collection', 'Legacy Operation'],
            ['The Overpass Collection', 'Legacy Operation'],
        ] as $row) {
            $entries[] = [
                'name' => $row[0],
                'category' => $row[1],
            ];
        }
    }

    return $entries;
}

/**
 * @return array<string,string> normalized key => canonical collection name
 */
function aiChatTrackedCollectionKeyMap(): array
{
    static $map = null;
    if (is_array($map)) {
        return $map;
    }
    $map = [];
    foreach (aiChatTrackedCollectionEntries() as $entry) {
        $name = trim((string)($entry['name'] ?? ''));
        $key = aiChatNormalizeCollectionKey($name);
        if ($key !== '' && !isset($map[$key])) {
            $map[$key] = $name;
        }
    }
    return $map;
}

function aiChatCollectionCategoryIsPreferred(string $category): bool
{
    $category = trim($category);
    if ($category === '') {
        return false;
    }
    return (bool)preg_match(
        '/^(?:Weapon Skins|Armory Exclusive|Operation |Legacy Operation)/u',
        $category
    );
}

function aiChatCanonicalTrackedCollection(string $origin): string
{
    $origin = trim($origin);
    if ($origin === '') {
        return '';
    }
    $key = aiChatNormalizeCollectionKey($origin);
    if ($key === '') {
        return '';
    }
    return aiChatTrackedCollectionKeyMap()[$key] ?? '';
}

function aiChatIsTrackedCollectionOrigin(string $origin): bool
{
    return aiChatCanonicalTrackedCollection($origin) !== '';
}

/**
 * Cases / capsules / terminals are drop containers, not Collection tags.
 * Origins that already say "collection" stay collections even if they also mention a case.
 */
function aiChatOriginLooksLikeDropContainer(string $origin): bool
{
    $origin = trim($origin);
    if ($origin === '' || preg_match('/\bcollection\b/iu', $origin)) {
        return false;
    }
    return (bool)preg_match('/\b(case|capsule|terminal|package|parcel|pack)\b/iu', $origin);
}

function aiChatTrackedCollectionCategory(string $origin): string
{
    $canon = aiChatCanonicalTrackedCollection($origin);
    if ($canon === '') {
        return '';
    }
    foreach (aiChatTrackedCollectionEntries() as $entry) {
        if (aiChatNormalizeCollectionKey((string)($entry['name'] ?? '')) === aiChatNormalizeCollectionKey($canon)) {
            return trim((string)($entry['category'] ?? ''));
        }
    }
    return '';
}

function aiChatCollectionCategoryIsCaseDrop(string $category): bool
{
    return (bool)preg_match('/classic\s+case/iu', trim($category));
}

/**
 * True when this site tags the skin with a Collection (collections.html catalog),
 * not when its only origin is a weapon case / capsule.
 */
function aiChatSkinHasCollectionTag(string $marketName): bool
{
    $origin = aiChatSkinOriginName($marketName);
    if ($origin === '' || aiChatOriginLooksLikeDropContainer($origin)) {
        return false;
    }
    return aiChatIsTrackedCollectionOrigin($origin);
}

function aiChatOriginLookupKey(string $name): string
{
    return mb_strtolower(trim(aiChatStripItemNamePrefixes(aiChatStripWear($name))));
}

/**
 * @return array<string,string> lowercase "weapon | skin" => origin name
 */
function aiChatLoadSkinOriginLookup(): array
{
    static $lookup = null;
    if (is_array($lookup)) {
        return $lookup;
    }
    $lookup = [];
    $path = __DIR__ . '/assets/steam-market-cache/skin_origin_lookup.json';
    if (!is_file($path)) {
        return $lookup;
    }
    $decoded = json_decode((string)file_get_contents($path), true);
    $items = is_array($decoded['items'] ?? null) ? $decoded['items'] : [];
    foreach ($items as $key => $origin) {
        $key = mb_strtolower(trim((string)$key));
        $origin = trim((string)$origin);
        if ($key === '' || $origin === '') {
            continue;
        }
        $lookup[$key] = $origin;
    }
    return $lookup;
}

function aiChatSkinOriginName(string $marketName): string
{
    $key = aiChatOriginLookupKey($marketName);
    if ($key === '') {
        return '';
    }
    return trim((string)(aiChatLoadSkinOriginLookup()[$key] ?? ''));
}

/**
 * Catalog skins grouped under tracked collections (best-wear row per family).
 *
 * @return array<string,list<string>>
 */
function aiChatSkinsByTrackedCollection(): array
{
    static $map = null;
    if (is_array($map)) {
        return $map;
    }

    $map = [];
    $canonByKey = aiChatTrackedCollectionKeyMap();
    if ($canonByKey === []) {
        return $map;
    }

    $catalogByBase = [];
    foreach (aiChatRoiCatalogByName() as $name => $_item) {
        $name = (string)$name;
        if (aiChatCatalogItemKind($name) !== 'skin') {
            continue;
        }
        $base = aiChatOriginLookupKey($name);
        if ($base === '' || str_starts_with($base, 'sticker | ')) {
            continue;
        }
        $catalogByBase[$base][] = $name;
    }

    foreach (aiChatLoadSkinOriginLookup() as $skinKey => $origin) {
        if (str_starts_with($skinKey, 'sticker | ')) {
            continue;
        }
        $canon = $canonByKey[aiChatNormalizeCollectionKey($origin)] ?? '';
        if ($canon === '') {
            continue;
        }
        $candidates = $catalogByBase[$skinKey] ?? [];
        if ($candidates === []) {
            continue;
        }
        usort($candidates, static function (string $a, string $b): int {
            $rankA = aiChatWearFallbackRank(aiChatExtractWearLabel($a));
            $rankB = aiChatWearFallbackRank(aiChatExtractWearLabel($b));
            if ($rankA !== $rankB) {
                return $rankA <=> $rankB;
            }
            return aiChatCandidateSeedPrice($a) <=> aiChatCandidateSeedPrice($b);
        });
        $map[$canon][] = $candidates[0];
    }

    return $map;
}

/**
 * Liquid skins from tracked collections, diversified across 3–5 sets.
 *
 * @return list<string>
 */
function aiChatCollectionInvestSeedNames(int $limit = 40, float $maxUnitPrice = 0.0): array
{
    $byCollection = aiChatSkinsByTrackedCollection();
    if ($byCollection === []) {
        return [];
    }

    $preferred = [];
    $other = [];
    foreach (aiChatTrackedCollectionEntries() as $entry) {
        $name = trim((string)($entry['name'] ?? ''));
        if ($name === '' || empty($byCollection[$name])) {
            continue;
        }
        if (aiChatCollectionCategoryIsPreferred((string)($entry['category'] ?? ''))) {
            $preferred[] = $name;
        } else {
            $other[] = $name;
        }
    }

    $out = [];
    $seen = [];
    foreach (array_merge($preferred, $other) as $collection) {
        $added = 0;
        foreach ($byCollection[$collection] as $marketName) {
            $marketName = trim((string)$marketName);
            if ($marketName === '') {
                continue;
            }
            $key = mb_strtolower($marketName);
            if (isset($seen[$key])) {
                continue;
            }
            if ($maxUnitPrice > 0) {
                $unit = aiChatCandidateSeedPrice($marketName);
                if ($unit > 0 && $unit > $maxUnitPrice + 0.009) {
                    continue;
                }
            }
            $seen[$key] = true;
            $out[] = $marketName;
            $added++;
            if ($added >= 4 || count($out) >= $limit) {
                break;
            }
        }
        if (count($out) >= $limit) {
            break;
        }
    }

    return $out;
}

/**
 * Collections named in the assistant reply (matched against tracked catalog names).
 *
 * @return list<string>
 */
function aiChatCollectionsNamedInReply(string $reply): array
{
    $hay = mb_strtolower($reply);
    if ($hay === '') {
        return [];
    }
    $found = [];
    foreach (aiChatTrackedCollectionEntries() as $entry) {
        $name = trim((string)($entry['name'] ?? ''));
        if ($name === '') {
            continue;
        }
        $lower = mb_strtolower($name);
        $key = aiChatNormalizeCollectionKey($name);
        if ($lower !== '' && str_contains($hay, $lower)) {
            $found[$name] = true;
            continue;
        }
        if ($key !== '' && str_contains($hay, $key . ' collection')) {
            $found[$name] = true;
        }
    }
    return array_keys($found);
}

/**
 * True when a catalog capsule name plausibly matches the user's pick label.
 */
function aiChatStickerCapsuleResolveMatches(string $requested, string $candidate): bool
{
    $requested = mb_strtolower(trim($requested));
    $candidate = mb_strtolower(trim($candidate));
    if ($requested === '' || $candidate === '') {
        return false;
    }
    if ($requested === $candidate) {
        return true;
    }

    $aliases = [
        'katowice 2014 capsule' => ['ems katowice 2014 legends', 'ems katowice 2014 challengers'],
        'ems katowice 2014 capsule' => ['ems katowice 2014 legends', 'ems katowice 2014 challengers'],
    ];
    if (isset($aliases[$requested]) && in_array($candidate, $aliases[$requested], true)) {
        return true;
    }

    $skip = ['sticker', 'capsule', 'capsules', 'autograph', 'the', 'and', 'case', 'csgo', 'cs2'];
    $tokens = preg_split('/\s+/u', (string)preg_replace('/[^a-z0-9\s]/iu', ' ', $requested)) ?: [];
    $tokens = array_values(array_filter($tokens, static function (string $token) use ($skip): bool {
        return mb_strlen($token) >= 3 && !in_array($token, $skip, true);
    }));
    if (!$tokens) {
        return false;
    }
    foreach ($tokens as $token) {
        if (str_contains($candidate, $token)) {
            return true;
        }
    }
    return false;
}

/**
 * Map AI shorthand capsule names to catalog sticker-capsule rows.
 */
function aiChatResolveStickerCapsulePickName(string $name): ?string
{
    $name = trim(aiChatNormalizePickCatalogName(aiChatSanitizeExtractedItemName($name)));
    if ($name === '') {
        return null;
    }

    $byName = aiChatRoiCatalogByName();
    if (isset($byName[$name]) && aiChatIsStickerCapsuleItem($name) && !aiChatIsWeaponCaseItem($name)) {
        return $name;
    }

    $aliases = [
        'katowice 2014 capsule' => 'EMS Katowice 2014 Legends',
        'ems katowice 2014 capsule' => 'EMS Katowice 2014 Legends',
        'katowice 2014 legends capsule' => 'EMS Katowice 2014 Legends',
        'katowice 2014 challengers capsule' => 'EMS Katowice 2014 Challengers',
    ];
    $aliasKey = mb_strtolower($name);
    if (isset($aliases[$aliasKey])) {
        return $aliases[$aliasKey];
    }

    $accept = static function (string $candidate) use ($name): ?string {
        if ($candidate === '' || aiChatIsWeaponCaseItem($candidate) || !aiChatIsStickerCapsuleItem($candidate)) {
            return null;
        }
        if (preg_match('/^Sticker Capsule$/iu', $candidate) && !preg_match('/^Sticker Capsule(?:\s+\d+)?$/iu', $name)) {
            return null;
        }
        return aiChatStickerCapsuleResolveMatches($name, $candidate) ? $candidate : null;
    };

    if (preg_match('/^(.+?)\s+Capsule\s*$/iu', $name, $match) && !preg_match('/\b(sticker|autograph)\b/iu', $name)) {
        $base = trim((string)$match[1]);
        $tries = [
            $base . ' Sticker Capsule',
            $base . ' Legends Sticker Capsule',
            $base . ' Contenders Sticker Capsule',
            'EMS ' . $base . ' Legends',
        ];
        if (preg_match('/katowice|2014/iu', $base)) {
            $tries[] = 'EMS Katowice 2014 Legends';
            $tries[] = 'EMS Katowice 2014 Challengers';
        }
        foreach ($tries as $try) {
            if (isset($byName[$try])) {
                $got = $accept($try);
                if ($got !== null) {
                    return $got;
                }
            }
            foreach (aiChatSearchCatalog($try, 6) as $hit) {
                $hitName = trim((string)($hit['market_hash_name'] ?? ''));
                $got = $accept($hitName);
                if ($got !== null) {
                    return $got;
                }
            }
        }
    }

    foreach (aiChatSearchCatalog($name, 10) as $hit) {
        $hitName = trim((string)($hit['market_hash_name'] ?? ''));
        $got = $accept($hitName);
        if ($got !== null) {
            return $got;
        }
    }

    return null;
}

/**
 * Dedup key for cards — full name for cases/capsules, skin family for weapons.
 */
function aiChatCardDedupKey(string $marketName): string
{
    $marketName = trim($marketName);
    if ($marketName === '') {
        return '';
    }
    if (str_contains($marketName, '|')) {
        return aiChatSkinFamilyKey($marketName);
    }
    return mb_strtolower($marketName);
}

function aiChatEnsureSouvenirLookup(): void
{
    static $loaded = false;
    if ($loaded) {
        return;
    }
    $loaded = true;
    $path = __DIR__ . '/lib/souvenir_skin_lookup.php';
    if (is_file($path)) {
        require_once $path;
    }
}

/**
 * User asked for souvenir skins/packages (typos: souvenier, souvenior, etc.).
 */
function aiChatWantsSouvenirItems(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }
    return (bool)preg_match('/\bsouven(?:ir|ier|ior|iour)s?\b/u', $message);
}

/**
 * Souvenir packages + Souvenir weapon skins (not charms/tokens/stickers).
 * Base skins that support a souvenir variant also match so candidates can be prefixed.
 */
function aiChatIsSouvenirScopedItem(string $name): bool
{
    $name = trim($name);
    if ($name === '') {
        return false;
    }
    if (preg_match('/\bSouvenir Package\b/iu', $name)) {
        return true;
    }
    if (preg_match('/^Souvenir\s+/iu', $name)) {
        if (preg_match('/^Souvenir\s+(Charm|Sticker|Patch|Graffiti|Music Kit|Pin|Token)\b/iu', $name)) {
            return false;
        }
        return str_contains($name, '|');
    }
    if (aiChatCatalogItemKind($name) !== 'skin') {
        return false;
    }
    aiChatEnsureSouvenirLookup();
    return function_exists('skinSupportsSouvenirVariant') && skinSupportsSouvenirVariant($name);
}

/**
 * Force Souvenir market-hash form for scoped skin picks.
 */
function aiChatToSouvenirMarketName(string $name): string
{
    $name = trim($name);
    if ($name === '') {
        return '';
    }
    if (preg_match('/\bSouvenir Package\b/iu', $name)) {
        return $name;
    }
    if (preg_match('/^Souvenir\s+/iu', $name)) {
        return $name;
    }
    if (aiChatCatalogItemKind($name) === 'skin' && aiChatIsSouvenirScopedItem($name)) {
        return 'Souvenir ' . $name;
    }
    return $name;
}

/**
 * True when a pick name is already a souvenir package/skin (not a regular skin).
 */
function aiChatIsExplicitSouvenirName(string $name): bool
{
    $name = trim($name);
    if ($name === '') {
        return false;
    }
    if (preg_match('/\bSouvenir Package\b/iu', $name)) {
        return true;
    }
    return (bool)preg_match('/^Souvenir\s+.+\|/iu', $name)
        && !preg_match('/^Souvenir\s+(Charm|Sticker|Patch|Graffiti|Music Kit|Pin|Token)\b/iu', $name);
}

function aiChatIsGloveItem(string $name): bool
{
    $stripped = aiChatStripItemNamePrefixes(aiChatStripWear($name));
    if ($stripped === '') {
        return false;
    }
    // "Sticker | Gloves On", "Glove Case", "Glove Case Key" are not gloves.
    if (preg_match('/^(?:Sticker|Patch|Graffiti|Charm|Music Kit)\b/iu', $stripped) || preg_match('/\b(?:Case|Capsule|Key|Package)\b/iu', $stripped)) {
        return false;
    }
    return (bool)preg_match('/\b(?:gloves?|hand wraps?)\b/iu', $stripped);
}

function aiChatIsKnifeItem(string $name): bool
{
    $raw = trim($name);
    $stripped = aiChatStripItemNamePrefixes(aiChatStripWear($raw));
    if ($stripped === '' || aiChatIsGloveItem($raw)) {
        return false;
    }
    if (preg_match(
        '/\b(?:knife|knives|bayonet|karambit|daggers?|talon|navaja|stiletto|ursus|bowie|falchion|butterfly|huntsman|shadow daggers|gut knife|flip knife|classic knife|paracord knife|survival knife|nomad knife|skeleton knife|kukri)\b/iu',
        $stripped
    )) {
        return true;
    }
    return (bool)preg_match('/^★\s+/u', $raw) && str_contains($stripped, '|');
}

/**
 * Coarse CS2 equipment class for a catalog name.
 * rifle includes snipers (Skinport / site rifles grouping). sniper is the subset.
 */
function aiChatItemWeaponClass(string $name): string
{
    if (aiChatIsGloveItem($name)) {
        return 'gloves';
    }
    if (aiChatIsKnifeItem($name)) {
        return 'knife';
    }
    $weapon = mb_strtolower(aiChatCatalogNameWeapon($name));
    if ($weapon === '') {
        return '';
    }
    $map = [
        'desert eagle' => 'pistol', 'dual berettas' => 'pistol', 'r8 revolver' => 'pistol',
        'glock-18' => 'pistol', 'usp-s' => 'pistol', 'cz75-auto' => 'pistol',
        'five-seven' => 'pistol', 'p250' => 'pistol', 'tec-9' => 'pistol',
        'p2000' => 'pistol', 'zeus x27' => 'pistol',
        'ak-47' => 'rifle', 'm4a1-s' => 'rifle', 'm4a4' => 'rifle',
        'galil ar' => 'rifle', 'famas' => 'rifle', 'aug' => 'rifle', 'sg 553' => 'rifle',
        'awp' => 'sniper', 'ssg 08' => 'sniper', 'scar-20' => 'sniper', 'g3sg1' => 'sniper',
        'mac-10' => 'smg', 'mp5-sd' => 'smg', 'pp-bizon' => 'smg', 'p90' => 'smg',
        'mp9' => 'smg', 'mp7' => 'smg', 'ump-45' => 'smg',
        'nova' => 'shotgun', 'xm1014' => 'shotgun', 'mag-7' => 'shotgun', 'sawed-off' => 'shotgun',
        'negev' => 'heavy', 'm249' => 'heavy',
    ];
    return $map[$weapon] ?? '';
}

function aiChatIsStatTrakItemName(string $name): bool
{
    return (bool)preg_match('/^(?:★\s*)?StatTrak/iu', trim($name));
}

function aiChatWantsStatTrakItems(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }
    if (aiChatWantsSouvenirItems($message) && !preg_match('/\bstattrak/u', $message)) {
        return false;
    }
    return (bool)preg_match('/\bstattrak(?:™)?\b/u', $message);
}

/**
 * Exclusive equipment category from the user message.
 * Empty when they named none, or more than one (gloves and knives, rifles and pistols).
 * Mixed "skins, cases, or stickers" portfolios stay unconstrained.
 */
function aiChatExtractExclusiveEquipmentCategory(string $message): string
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return '';
    }
    $wantsSkins = (bool)preg_match('/\b(skins?|finishes?)\b/u', $message);
    $wantsCases = (bool)preg_match('/\bcases?\b/u', $message);
    $wantsStickers = (bool)preg_match('/\b(stickers?|capsules?)\b/u', $message);
    if ($wantsSkins && ($wantsCases || $wantsStickers)) {
        return '';
    }

    $hits = [];
    if (preg_match('/\bgloves?\b|\bhand wraps?\b/u', $message)) {
        $hits[] = 'gloves';
    }
    if (preg_match('/\b(?:knives|knife|bayonets?|karambits?|butterfly knife)\b/u', $message)) {
        $hits[] = 'knife';
    }
    if (preg_match('/\brifles?\b/u', $message)) {
        $hits[] = 'rifle';
    }
    if (preg_match('/\bpistols?\b/u', $message)) {
        $hits[] = 'pistol';
    }
    if (preg_match('/\b(?:smgs?|sub-?machine(?:\s+guns?)?)\b/u', $message)) {
        $hits[] = 'smg';
    }
    if (preg_match('/\bshotguns?\b/u', $message)) {
        $hits[] = 'shotgun';
    }
    if (preg_match('/\bsnipers?\b/u', $message)) {
        $hits[] = 'sniper';
    }
    if (preg_match('/\b(?:heav(?:y|ies)|machine\s*guns?)\b/u', $message)) {
        $hits[] = 'heavy';
    }
    $hits = array_values(array_unique($hits));
    return count($hits) === 1 ? $hits[0] : '';
}

function aiChatIsEquipmentCategoryScope(string $itemType): bool
{
    return in_array($itemType, [
        'gloves', 'knife', 'rifle', 'pistol', 'smg', 'shotgun', 'sniper', 'heavy', 'stattrak',
    ], true);
}

function aiChatCategoryScopeLabel(string $itemType, string $weapon = ''): string
{
    if ($weapon !== '') {
        return $weapon;
    }
    return match ($itemType) {
        'gloves' => 'gloves',
        'knife' => 'knives',
        'rifle' => 'rifles',
        'pistol' => 'pistols',
        'smg' => 'SMGs',
        'shotgun' => 'shotguns',
        'sniper' => 'snipers',
        'heavy' => 'heavy weapons',
        'stattrak' => 'StatTrak items',
        'case' => 'weapon cases',
        default => $itemType,
    };
}

function aiChatCatalogNameMatchesScope(string $name, string $weapon = '', string $itemType = '', bool $wantStatTrak = false): bool
{
    $name = trim($name);
    if ($name === '') {
        return false;
    }
    $kind = aiChatCatalogItemKind($name);
    if ($wantStatTrak || $itemType === 'stattrak') {
        if (!aiChatIsStatTrakItemName($name)) {
            return false;
        }
    }
    if ($itemType === 'souvenir') {
        if (!aiChatIsSouvenirScopedItem($name)) {
            return false;
        }
    } elseif ($itemType === 'skin' && $kind !== 'skin') {
        return false;
    } elseif ($itemType === 'case') {
        if (!aiChatIsWeaponCaseItem($name)) {
            return false;
        }
    } elseif ($itemType === 'sticker_capsule') {
        if (!aiChatIsStickerCapsuleItem($name)) {
            return false;
        }
    } elseif ($itemType === 'sticker') {
        if (!aiChatIsStickerScopedItem($name, false)) {
            return false;
        }
    } elseif ($itemType === 'charm') {
        if (!aiChatIsCharmItem($name)) {
            return false;
        }
    } elseif ($itemType === 'collection') {
        if ($kind !== 'skin') {
            return false;
        }
        $origin = aiChatSkinOriginName($name);
        if ($origin !== '' && !aiChatIsTrackedCollectionOrigin($origin)) {
            return false;
        }
    } elseif ($itemType === 'gloves') {
        if (!aiChatIsGloveItem($name)) {
            return false;
        }
    } elseif ($itemType === 'knife') {
        if (!aiChatIsKnifeItem($name)) {
            return false;
        }
    } elseif (in_array($itemType, ['rifle', 'pistol', 'smg', 'shotgun', 'sniper', 'heavy'], true)) {
        $class = aiChatItemWeaponClass($name);
        if ($itemType === 'rifle') {
            if ($class !== 'rifle' && $class !== 'sniper') {
                return false;
            }
        } elseif ($class !== $itemType) {
            return false;
        }
    } elseif ($itemType === 'stattrak') {
        if (
            $kind !== 'skin'
            && !aiChatLooksLikeGunSkinName($name)
            && !aiChatIsKnifeItem($name)
            && !aiChatIsGloveItem($name)
        ) {
            return false;
        }
    }
    if ($weapon !== '') {
        $got = aiChatCatalogNameWeapon($name);
        if ($got === '' || mb_strtolower($got) !== mb_strtolower($weapon)) {
            return false;
        }
    }
    return true;
}

function aiChatExtractRequestedItemType(string $message, string $weapon = ''): string
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return '';
    }

    // Souvenir beats weapon/skin/case so "souvenir AK" / "souvenir items" stay souvenir-only.
    // "souvenir charms" is charm-scoped (Souvenir Charm | …), not souvenir weapon skins.
    if (aiChatWantsSouvenirItems($message) && !aiChatWantsCharmItems($message)) {
        return 'souvenir';
    }

    // "sticker capsules" / "best capsules" must not fall through to generic weapon-case scope.
    if (aiChatWantsStickerCapsules($message)) {
        return 'sticker_capsule';
    }

    // Charms / keychains must not fall through to gun-skin defaults (Redline + " Charm").
    if (aiChatWantsCharmItems($message)) {
        return 'charm';
    }

    // "Best stickers to invest in" must not fall through to generic skin/case seeds.
    if (aiChatWantsStickerItems($message)) {
        return 'sticker';
    }

    // "Best gloves / knives / rifles" must beat mixed skins-invest / DIVERSIFY.
    $exclusive = aiChatExtractExclusiveEquipmentCategory($message);
    if ($exclusive !== '') {
        return $exclusive;
    }

    // $N / invest portfolio / skins-invest / chart-the-top-item MUST beat collections-invest.
    if (aiChatWantsSkinsInvestPortfolio($message)) {
        $mixCases = (bool)preg_match('/\bcases?\b/u', $message);
        $mixSkins = (bool)preg_match('/\b(skins?|finishes?)\b/u', $message);
        $mixStickers = (bool)preg_match('/\b(stickers?|capsules?)\b/u', $message);
        // Mixed "skins, cases, or stickers" stays unscope so cases/stickers can card.
        if ($mixSkins && ($mixCases || $mixStickers)) {
            return '';
        }
        return 'skin';
    }

    // Collections-invest names collections after the AI market outlook, then skins from those sets.
    if (aiChatWantsCollectionInvest($message)) {
        return 'collection';
    }

    $wantsCases = (bool)preg_match('/\bcases?\b/u', $message);
    $wantsSkins = (bool)preg_match('/\b(skins?|finishes?)\b/u', $message);

    if ($weapon !== '') {
        return 'skin';
    }
    if ($wantsCases && !$wantsSkins && !preg_match('/\bsticker/u', $message)) {
        return 'case';
    }
    $wantsStickers = (bool)preg_match('/\b(stickers?|capsules?)\b/u', $message);
    // Mixed portfolio ("skins, cases, or stickers") stays unscope so real case/sticker picks can card.
    if ($wantsSkins && !$wantsCases && !$wantsStickers) {
        return 'skin';
    }
    if (aiChatWantsStatTrakItems($message) && $weapon === '') {
        return 'stattrak';
    }
    return '';
}

/**
 * @return array{weapon: string, type: string, stattrak: bool}
 */
function aiChatRequestedCardScope(string $message): array
{
    $weapon = aiChatExtractWeaponFamily($message);
    $type = aiChatExtractRequestedItemType($message, $weapon);
    $stattrak = aiChatWantsStatTrakItems($message);
    // Charm / sticker names are not AK-47 rows — don't filter by a weapon token.
    if ($type === 'charm' || aiChatIsStickerCardScope($type) || $type === 'souvenir') {
        $weapon = '';
        if ($type !== 'souvenir') {
            $stattrak = false;
        }
    }
    if ($type === 'gloves' || $type === 'knife') {
        $weapon = '';
    }
    return [
        'weapon' => $weapon,
        'type' => $type,
        'stattrak' => $stattrak,
    ];
}

/**
 * Catalog hits with unique skin bases (ignore wear duplicates like FN vs FT).
 *
 * @return list<string>
 */
function aiChatCollectUniqueCatalogNames(string $query, int $limit = 8, string $weapon = '', string $itemType = '', bool $wantStatTrak = false): array
{
    $names = [];
    $seen = [];
    $fetch = max(80, $limit * 12);
    foreach (aiChatSearchCatalog($query, $fetch) as $hit) {
        $name = trim((string)($hit['market_hash_name'] ?? ''));
        if ($name === '') {
            continue;
        }
        if (!aiChatCatalogNameMatchesScope($name, $weapon, $itemType, $wantStatTrak)) {
            continue;
        }
        $base = aiChatSkinFamilyKey($name);
        if ($base === '' || isset($seen[$base])) {
            continue;
        }
        $seen[$base] = true;
        $names[] = $name;
        if (count($names) >= $limit) {
            break;
        }
    }
    return $names;
}

function aiChatEnsureSkinAssetHelpers(): void
{
    static $loaded = false;
    if ($loaded) {
        return;
    }
    $loaded = true;
    $path = __DIR__ . '/lib/skin_asset_helpers.php';
    if (is_file($path)) {
        require_once $path;
    }
}

function aiChatCatalogImage(array $item): string
{
    foreach (['steam_image_url', 'image', 'project_image_path', 'local_path'] as $key) {
        $value = trim((string)($item[$key] ?? ''));
        if ($value === '') {
            continue;
        }
        if (in_array($value, ['assets/markets/steam.png', 'assets/markets/steam.webp'], true)) {
            continue;
        }
        if (str_starts_with($value, 'http') || str_starts_with($value, '/') || str_starts_with($value, 'assets/')) {
            return $value;
        }
    }

    $market = trim((string)($item['market_hash_name'] ?? $item['display_name'] ?? ''));
    if ($market === '') {
        return '';
    }

    aiChatEnsureSkinAssetHelpers();
    if (function_exists('lookupSteamImageManifestEntry')) {
        $manifest = lookupSteamImageManifestEntry($market);
        if (is_array($manifest)) {
            foreach (['project_image_path', 'local_path', 'steam_image_url', 'image'] as $key) {
                $value = trim((string)($manifest[$key] ?? ''));
                if ($value === '' || in_array($value, ['assets/markets/steam.png', 'assets/markets/steam.webp'], true)) {
                    continue;
                }
                if (str_starts_with($value, 'http') || str_starts_with($value, '/') || str_starts_with($value, 'assets/')) {
                    return $value;
                }
            }
        }
    }

    if (function_exists('resolveSkinPreviewImageUrl') && str_contains($market, '|')) {
        $stripped = aiChatStripWear(aiChatStripItemNamePrefixes($market));
        $parts = explode('|', $stripped, 2);
        $finish = trim((string)($parts[1] ?? ''));
        $token = strtolower((string)preg_replace('/[^a-z0-9]+/i', '', $finish));
        if ($token !== '') {
            $preview = resolveSkinPreviewImageUrl($market, $token, $item);
            if (is_string($preview) && $preview !== '' && !in_array($preview, ['assets/markets/steam.png', 'assets/markets/steam.webp'], true)) {
                return $preview;
            }
        }
    }

    return '';
}

function aiChatCatalogCardFromEntry(array $item): ?array
{
    $market = trim((string)($item['market_hash_name'] ?? ''));
    if ($market === '') {
        return null;
    }

    $display = trim((string)($item['display_name'] ?? ''));
    if ($display === '') {
        $display = aiChatStripWear($market);
    }

    $wear = trim((string)($item['selected_wear'] ?? ''));
    if ($wear === '' && preg_match('/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i', $market, $match)) {
        $wear = (string)$match[1];
    }

    return [
        'market_hash_name' => $market,
        'display_name' => $display,
        'image' => aiChatCatalogImage($item),
        'name_color' => (string)($item['name_color'] ?? 'B0C3D9'),
        'category' => (string)($item['category'] ?? ''),
        'type_note' => (string)($item['type_note'] ?? ''),
        'seed_sell_price' => is_numeric($item['seed_sell_price'] ?? null) ? (float)$item['seed_sell_price'] : null,
        'selected_wear' => $wear,
    ];
}

/**
 * Keep Souvenir prefix on cards when the pick was a souvenir variant (catalog may only have the base).
 *
 * @param array<string, mixed> $card
 * @return array<string, mixed>
 */
function aiChatForceSouvenirCardName(array $card, string $requestedName): array
{
    $market = trim((string)($card['market_hash_name'] ?? ''));
    if ($market === '' || preg_match('/^Souvenir\s+/iu', $market) || preg_match('/\bSouvenir Package\b/iu', $market)) {
        return $card;
    }
    $requested = trim($requestedName);
    $souvenirName = preg_match('/^Souvenir\s+/iu', $requested)
        ? aiChatToSouvenirMarketName($requested)
        : ('Souvenir ' . $market);
    if ($souvenirName === '' || $souvenirName === $market) {
        return $card;
    }
    $card['market_hash_name'] = $souvenirName;
    $display = trim((string)($card['display_name'] ?? ''));
    if ($display === '' || !preg_match('/^Souvenir\s+/iu', $display)) {
        $card['display_name'] = preg_match('/^Souvenir\s+/iu', $display)
            ? $display
            : ('Souvenir ' . ($display !== '' ? $display : aiChatStripWear($market)));
    }
    return $card;
}

function aiChatWearFallbackRank(string $wear): int
{
    return match (mb_strtolower(trim($wear))) {
        'field-tested' => 0,
        'minimal wear' => 1,
        'factory new' => 2,
        'well-worn' => 3,
        'battle-scarred' => 4,
        default => 9,
    };
}

function aiChatResolveCatalogCard(string $name): ?array
{
    $rawName = trim($name);
    $wantSouvenir = (bool)preg_match('/^Souvenir\s+/iu', $rawName);
    $wantCapsulePick = (bool)preg_match('/\bCapsule\s*$/iu', $rawName) && !preg_match('/\bCase\s*$/iu', $rawName);
    $name = aiChatNormalizePickCatalogName(aiChatSanitizeExtractedItemName($name));
    $name = aiChatExpandWearAbbreviations(aiChatMaybeInsertSkinPipe($name));
    if ($name === '') {
        return null;
    }

    $byName = aiChatRoiCatalogByName();
    if ($wantCapsulePick || aiChatIsStickerCapsuleItem($rawName)) {
        $resolvedCapsule = aiChatResolveStickerCapsulePickName($rawName);
        if ($resolvedCapsule !== null && isset($byName[$resolvedCapsule]) && is_array($byName[$resolvedCapsule])) {
            return aiChatCatalogCardFromEntry($byName[$resolvedCapsule]);
        }
    }
    if (isset($byName[$name]) && is_array($byName[$name])) {
        if ($wantCapsulePick && aiChatIsWeaponCaseItem($name)) {
            // Fall through — e.g. "Operation Hydra Capsule" must not bind to Operation Hydra Case.
        } else {
            $card = aiChatCatalogCardFromEntry($byName[$name]);
            return $wantSouvenir && is_array($card) ? aiChatForceSouvenirCardName($card, $rawName) : $card;
        }
    }

    // Knives and gloves are listed with the ★ prefix; the model usually omits it.
    if (!str_starts_with($name, '★') && (aiChatIsKnifeItem($name) || aiChatIsGloveItem($name))) {
        $starred = '★ ' . $name;
        if (isset($byName[$starred]) && is_array($byName[$starred])) {
            return aiChatCatalogCardFromEntry($byName[$starred]);
        }
        $starredWearless = '★ ' . aiChatStripWear($name);
        foreach (['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'] as $wearTry) {
            $key = $starredWearless . ' (' . $wearTry . ')';
            if (isset($byName[$key]) && is_array($byName[$key])) {
                return aiChatCatalogCardFromEntry($byName[$key]);
            }
        }
    }

    // Stickers: match team + event segments literally ("Sticker | Spirit | Paris 2023"
    // → "Sticker | Team Spirit | Paris 2023") before any fuzzy scoring.
    if (preg_match('/^Sticker\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*$/iu', $name, $stickerParts)) {
        $normalize = static fn(string $s): string => (string)preg_replace('/[^a-z0-9]+/u', '', mb_strtolower($s));
        $segA = $normalize((string)$stickerParts[1]);
        $segB = $normalize((string)$stickerParts[2]);
        $best = null;
        $bestLen = PHP_INT_MAX;
        foreach ($byName as $catalogName => $entry) {
            if (!is_array($entry) || !preg_match('/^Sticker\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*$/iu', (string)$catalogName, $cp)) {
                continue;
            }
            $team = $normalize((string)preg_replace('/\s*\((?:holo|foil|gold|glitter|lenticular|champion)\)\s*/iu', '', (string)$cp[1]));
            $event = $normalize((string)$cp[2]);
            $teamOk = ($segA !== '' && ($team === $segA || str_contains($team, $segA))) || ($segB !== '' && ($team === $segB || str_contains($team, $segB)));
            $eventOk = $event === $segB || $event === $segA;
            if (!$teamOk || !$eventOk) {
                continue;
            }
            // Plain paper version (shortest name) wins over (Holo)/(Foil) variants.
            $len = mb_strlen((string)$catalogName);
            if ($len < $bestLen) {
                $best = $entry;
                $bestLen = $len;
            }
        }
        if ($best !== null) {
            return aiChatCatalogCardFromEntry($best);
        }
    }

    $wantWeapon = aiChatCatalogNameWeapon($name);
    $wantKind = aiChatCatalogItemKind($name);
    $scopeType = $wantKind === 'case' ? 'case' : ($wantKind === 'skin' ? 'skin' : '');
    $wantWear = mb_strtolower(aiChatExtractWearLabel($name));
    $stripped = aiChatStripWear(aiChatStripItemNamePrefixes($name));
    $wantFinish = '';
    if (str_contains($stripped, '|')) {
        $wantFinish = mb_strtolower(trim((string)explode('|', $stripped, 2)[1]));
    }

    $candidates = [];
    $seen = [];
    $consider = static function (string $hitName, array $hit) use (
        &$candidates,
        &$seen,
        $byName,
        $wantWeapon,
        $wantFinish,
        $scopeType,
        $wantCapsulePick
    ): void {
        $hitName = trim($hitName);
        if ($hitName === '' || isset($seen[mb_strtolower($hitName)])) {
            return;
        }
        if ($wantCapsulePick && aiChatIsWeaponCaseItem($hitName)) {
            return;
        }
        if ($wantCapsulePick && !aiChatIsStickerCapsuleItem($hitName)) {
            return;
        }
        if ($wantWeapon !== '' && !aiChatCatalogNameMatchesScope($hitName, $wantWeapon, $scopeType)) {
            return;
        }
        if ($wantFinish !== '' && mb_strlen($wantFinish) >= 3) {
            $hitHay = mb_strtolower($hitName . ' ' . (string)($hit['name'] ?? $hit['display_name'] ?? ''));
            if (!aiChatCatalogFinishMatches($wantFinish, $hitHay)) {
                return;
            }
        }
        $seen[mb_strtolower($hitName)] = true;
        $entry = (isset($byName[$hitName]) && is_array($byName[$hitName]))
            ? $byName[$hitName]
            : [
                'market_hash_name' => $hitName,
                'display_name' => (string)($hit['name'] ?? $hit['display_name'] ?? $hitName),
                'seed_sell_price' => $hit['seed_price'] ?? $hit['seed_sell_price'] ?? null,
                'category' => (string)($hit['category'] ?? ''),
            ];
        $candidates[] = $entry;
    };

    if ($stripped !== '') {
        foreach (['Field-Tested', 'Minimal Wear', 'Factory New', 'Well-Worn', 'Battle-Scarred'] as $wear) {
            $try = $stripped . ' (' . $wear . ')';
            if (isset($byName[$try]) && is_array($byName[$try])) {
                $consider($try, $byName[$try]);
            }
        }
        if (isset($byName[$stripped]) && is_array($byName[$stripped])) {
            $consider($stripped, $byName[$stripped]);
        }
    }

    $queries = [$name];
    if ($stripped !== '' && mb_strtolower($stripped) !== mb_strtolower($name)) {
        $queries[] = $stripped;
    }
    foreach ($queries as $query) {
        foreach (aiChatSearchCatalog($query, 12) as $hit) {
            $consider((string)($hit['market_hash_name'] ?? ''), $hit);
        }
    }

    if (!$candidates) {
        return null;
    }

    usort($candidates, static function (array $a, array $b) use ($wantWear): int {
        $aName = (string)($a['market_hash_name'] ?? '');
        $bName = (string)($b['market_hash_name'] ?? '');
        $aWear = mb_strtolower(aiChatExtractWearLabel($aName));
        $bWear = mb_strtolower(aiChatExtractWearLabel($bName));
        $aExact = ($wantWear !== '' && $aWear === $wantWear) ? 0 : 1;
        $bExact = ($wantWear !== '' && $bWear === $wantWear) ? 0 : 1;
        if ($aExact !== $bExact) {
            return $aExact <=> $bExact;
        }
        $wearCmp = aiChatWearFallbackRank($aWear) <=> aiChatWearFallbackRank($bWear);
        if ($wearCmp !== 0) {
            return $wearCmp;
        }
        return mb_strlen($aName) <=> mb_strlen($bName);
    });

    $card = aiChatCatalogCardFromEntry($candidates[0]);
    if ($card === null) {
        return null;
    }
    return $wantSouvenir ? aiChatForceSouvenirCardName($card, $rawName) : $card;
}

function aiChatExtractWeaponFamily(string $message): string
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return '';
    }

    $aliases = [
        'desert eagle' => 'Desert Eagle',
        'dual berettas' => 'Dual Berettas',
        'r8 revolver' => 'R8 Revolver',
        'm4a1-s' => 'M4A1-S',
        'm4a1s' => 'M4A1-S',
        'glock-18' => 'Glock-18',
        'usp-s' => 'USP-S',
        'cz75-auto' => 'CZ75-Auto',
        'five-seven' => 'Five-SeveN',
        'sawed-off' => 'Sawed-Off',
        'pp-bizon' => 'PP-Bizon',
        'mac-10' => 'MAC-10',
        'mp5-sd' => 'MP5-SD',
        'sg 553' => 'SG 553',
        'ssg 08' => 'SSG 08',
        'ak-47' => 'AK-47',
        'ak 47' => 'AK-47',
        'm4a4' => 'M4A4',
        'm4a1' => 'M4A1-S',
        'galil ar' => 'Galil AR',
        'galil' => 'Galil AR',
        'famas' => 'FAMAS',
        'aug' => 'AUG',
        'awp' => 'AWP',
        'scar-20' => 'SCAR-20',
        'g3sg1' => 'G3SG1',
        'glock' => 'Glock-18',
        'usp' => 'USP-S',
        'p250' => 'P250',
        'deagle' => 'Desert Eagle',
        'tec-9' => 'Tec-9',
        'p2000' => 'P2000',
        'p90' => 'P90',
        'mp9' => 'MP9',
        'mp7' => 'MP7',
        'ump-45' => 'UMP-45',
        'ump' => 'UMP-45',
        'bizon' => 'PP-Bizon',
        'nova' => 'Nova',
        'xm1014' => 'XM1014',
        'mag-7' => 'MAG-7',
        'negev' => 'Negev',
        'm249' => 'M249',
        'ak47' => 'AK-47',
        'ak' => 'AK-47',
        'berettas' => 'Dual Berettas',
        'zeus' => 'Zeus x27',
    ];

    uksort($aliases, static fn(string $a, string $b): int => mb_strlen($b) <=> mb_strlen($a));
    foreach ($aliases as $needle => $family) {
        $plural = (preg_match('/[0-9]$/u', $needle) || str_ends_with($needle, 's')) ? '' : 's?';
        if (preg_match('/\b' . preg_quote($needle, '/') . $plural . '\b/u', $message)) {
            return $family;
        }
    }

    return '';
}

function aiChatMatchTokenToWeaponSkin(string $token, string $weaponFamily): ?string
{
    $token = trim($token);
    $weaponFamily = trim($weaponFamily);
    if ($token === '' || $weaponFamily === '' || mb_strlen($token) < 3) {
        return null;
    }

    $skip = [
        'the', 'and', 'for', 'with', 'from', 'this', 'that', 'skin', 'skins', 'item', 'items',
        'buy', 'best', 'good', 'cheap', 'budget', 'wear', 'price', 'market', 'pulse', 'picks',
        'glock', 'glock-18',
    ];
    $tokenLower = mb_strtolower($token);
    if (in_array($tokenLower, $skip, true)) {
        return null;
    }

    $familyLower = mb_strtolower($weaponFamily);
    $queries = array_unique([
        $weaponFamily . ' | ' . $token,
        $weaponFamily . ' ' . $token,
        $token,
    ]);

    foreach ($queries as $query) {
        foreach (aiChatSearchCatalog($query, 4) as $hit) {
            $name = trim((string)($hit['market_hash_name'] ?? ''));
            $display = mb_strtolower((string)($hit['name'] ?? $name));
            $hay = mb_strtolower($name . ' ' . $display);
            if ($name === '') {
                continue;
            }
            if (!str_contains($hay, $familyLower)) {
                continue;
            }
            if (str_contains($display, $tokenLower) || str_contains(mb_strtolower($name), $tokenLower)) {
                return $name;
            }
        }
    }

    return null;
}

function aiChatSanitizeExtractedItemName(string $name): string
{
    $name = trim($name);
    if ($name === '') {
        return '';
    }

    $name = (string)preg_replace('/\*+/u', '', $name);
    $name = (string)preg_replace('/`+/u', '', $name);
    $name = trim((string)preg_replace('/^_+|_+$/u', '', $name));
    $parts = preg_split('/\s+[—–]\s+/u', $name, 2);
    $name = trim((string)((is_array($parts) ? ($parts[0] ?? $name) : $name)));
    $name = trim((string)preg_replace('/\s+[-:]\s+(?:€|\$|£).*$/u', '', $name));
    $name = trim((string)preg_replace('/\s+(?:€|\$|£)\s*(?:\?+|X+[.,]X+|[\d.,]+)\s*$/u', '', $name));
    $name = trim((string)preg_replace('/\s*[x×]\s*\d+\s*(?:=\s*(?:€|\$|£)\s*[\d.,]+)?/iu', '', $name));
    $name = trim((string)preg_replace('/\s+\d+\s*[x×]\s*(?:\([^)]+\))?/iu', '', $name));
    $name = trim((string)preg_replace('/\s+total\b/iu', '', $name));
    $name = trim((string)preg_replace('/[.,;:]+$/u', '', $name));
    $name = trim((string)preg_replace('/\s+/u', ' ', $name));
    $name = aiChatExpandWearAbbreviations($name);
    $name = aiChatMaybeInsertSkinPipe($name);

    // Keep through a closed wear paren ("USP-S | Cortex (Field-Tested) gives a…" → wear only).
    if (preg_match(
        '/^((?:StatTrak™|StatTrak|Souvenir|★)?\s*.+?\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\))/iu',
        $name,
        $wearMatch
    )) {
        $name = trim((string)$wearMatch[1]);
    }

    // Clip trailing why-clause / sentence verbs after a real item token.
    $proseVerb = '(?:adds?|gives?|offers?|provides?|brings?|remains?|stays?|keeps?|makes?|helps?|delivers?|shows?|means?|looks?|feels?|works?|fits?|pairs?|complements?|boosts?|balances?|diversifies?|includes?|features?|creates?|opens?|holds?|trades?|lists?|sits?|comes?|gets?|lets?|allows?|enables?|supports?|is|are|was|were|has|have|had|can|could|will|would|should|may|might|while|because|since|although|across|among|towards?|into|onto)';
    $name = trim((string)preg_replace('/\s+\b' . $proseVerb . '\b.*$/iu', '', $name));
    $name = trim((string)preg_replace('/[.,;:]+$/u', '', $name));
    $name = trim((string)preg_replace('/\s+/u', ' ', $name));

    return $name;
}

/**
 * Repair common AI/catalog pick typos so stickers and slabs resolve to ROI rows.
 * e.g. "Sticker | Titan (Holo) Katowice 2014" -> "Sticker | Titan (Holo) | Katowice 2014"
 */
function aiChatNormalizePickCatalogName(string $name): string
{
    $name = trim($name);
    if ($name === '') {
        return '';
    }

    $tournament = '(Katowice|Cologne|Atlanta|London|Boston|Cluj(?:-Napoca)?|MLG Columbus|DreamHack|ESL One(?: Cologne)?|Berlin|Stockholm|Paris|Rio|Antwerp|Copenhagen|Shanghai|Championship|Foil)';
    if (preg_match(
        '/^(Sticker(?: Slab)?|Patch)\s\|\s*(.+?)\s+' . $tournament . '\s+(20\d{2})\s*$/iu',
        $name,
        $match
    )) {
        $middle = trim((string)$match[2]);
        if ($middle !== '' && !str_contains($middle, '|')) {
            return trim((string)$match[1])
                . ' | '
                . $middle
                . ' | '
                . trim((string)$match[3])
                . ' '
                . trim((string)$match[4]);
        }
    }

    return $name;
}

/**
 * Pull the ### Items to buy block so cards match the pick list (not Why bullets).
 */
function aiChatExtractItemsToBuySection(string $reply): string
{
    // Allow a short emoji/prefix before the title (e.g. "### 🛒 Items to buy").
    if (preg_match('/(?:^|\n)#{2,3}\s*(?:[^\n\w#]{0,6})?Items to buy\s*\r?\n(.*?)(?:\r?\n#{2,3}\s|\z)/uis', $reply, $match)) {
        return trim((string)($match[1] ?? ''));
    }
    return '';
}

function aiChatCatalogFinishMatches(string $wantFinish, string $hitHay): bool
{
    $wantFinish = mb_strtolower(trim($wantFinish));
    $hitHay = mb_strtolower(trim($hitHay));
    if ($wantFinish === '') {
        return true;
    }
    if (mb_strpos($hitHay, $wantFinish) !== false) {
        return true;
    }

    // Stickers often drop the tournament pipe: "Titan (Holo) Katowice 2014" vs "Titan (Holo) | Katowice 2014".
    $wantFlat = trim((string)preg_replace('/\s\|\s/u', ' ', $wantFinish));
    $hitFlat = trim((string)preg_replace('/\s\|\s/u', ' ', $hitHay));
    if ($wantFlat !== '' && mb_strpos($hitFlat, $wantFlat) !== false) {
        return true;
    }

    $tokens = preg_split('/\s+/u', (string)preg_replace('/[^a-z0-9\s|()]/iu', ' ', $wantFinish)) ?: [];
    $tokens = array_values(array_filter($tokens, static function (string $token): bool {
        $token = trim($token, '()');
        return mb_strlen($token) >= 3 && !in_array($token, ['the', 'and', 'for'], true);
    }));
    if (count($tokens) < 2) {
        return false;
    }

    $required = array_values(array_filter($tokens, static function (string $token): bool {
        $token = trim($token, '()');
        return (bool)preg_match('/^(?:holo|foil|gold|katowice|cologne|atlanta|london|boston|cluj|berlin|stockholm|paris|rio|antwerp|copenhagen|shanghai|20\d{2})$/iu', $token);
    }));

    $hits = 0;
    foreach ($tokens as $token) {
        $token = trim($token, '()');
        if ($token !== '' && mb_strpos($hitHay, $token) !== false) {
            $hits++;
        }
    }
    foreach ($required as $token) {
        $token = trim($token, '()');
        if ($token !== '' && mb_strpos($hitHay, $token) === false) {
            return false;
        }
    }

    return $hits >= max(2, count($tokens) - 1);
}

/**
 * Last-resort card when catalog resolve fails but the assistant named a real pick.
 *
 * @return array<string, mixed>|null
 */
function aiChatFallbackPickCard(string $name): ?array
{
    $name = aiChatNormalizePickCatalogName(aiChatSanitizeExtractedItemName($name));
    if ($name === '' || !aiChatExtractedTermLooksLikeItem($name)) {
        return null;
    }

    $byName = aiChatRoiCatalogByName();
    if (isset($byName[$name]) && is_array($byName[$name])) {
        return aiChatCatalogCardFromEntry($byName[$name]);
    }

    foreach (aiChatSearchCatalog($name, 8) as $hit) {
        $hitName = trim((string)($hit['market_hash_name'] ?? ''));
        if ($hitName === '') {
            continue;
        }
        if (isset($byName[$hitName]) && is_array($byName[$hitName])) {
            $card = aiChatCatalogCardFromEntry($byName[$hitName]);
            if ($card !== null) {
                return $card;
            }
        }
        // Prefer a catalog-backed hit even when ROI seed row is missing.
        $card = aiChatResolveCatalogCard($hitName);
        if ($card !== null && trim((string)($card['image'] ?? '')) !== '') {
            return $card;
        }
    }

    // Never emit a CS-placeholder shell for unresolved prose / unmatched names.
    return null;
}

/**
 * @param list<string> $sourceNames
 * @return list<string>
 */
function aiChatExtractReplyItemNames(string $reply, array $sourceNames, string $weaponFamily = ''): array
{
    $reply = str_replace(["\r\n", "\r"], "\n", trim($reply));
    if ($reply === '') {
        return [];
    }

    $replyLower = mb_strtolower($reply);
    $mentioned = [];
    $seen = [];
    $add = static function (string $name) use (&$mentioned, &$seen, $weaponFamily): void {
        $name = aiChatNormalizePickCatalogName(aiChatSanitizeExtractedItemName($name));
        if ($name === '' || !aiChatExtractedTermLooksLikeItem($name)) {
            return;
        }
        if ($weaponFamily !== '') {
            if (aiChatCatalogItemKind($name) === 'case') {
                return;
            }
            $gotWeapon = aiChatCatalogNameWeapon($name);
            if ($gotWeapon !== '' && mb_strtolower($gotWeapon) !== mb_strtolower($weaponFamily)) {
                return;
            }
        }
        $key = mb_strtolower(aiChatSkinFamilyKey($name));
        if ($key === '' || isset($seen[$key])) {
            return;
        }
        $seen[$key] = true;
        $mentioned[] = $name;
    };

    $addBulletLine = static function (string $line) use ($add, $weaponFamily): void {
        $line = aiChatSanitizeExtractedItemName($line);
        $parts = preg_split('/\s+[—–\-:]+\s+/u', $line, 2);
        $line = trim((string)((is_array($parts) ? ($parts[0] ?? $line) : $line)));
        $line = aiChatSanitizeExtractedItemName($line);
        if ($line === '') {
            return;
        }
        if (
            str_contains($line, '|')
            || preg_match('/\b(Case|Capsule|Package|Sticker(?: Slab)?|Patch|Pin|Charm|Agent|Graffiti|Music Kit)\b/u', $line)
            || preg_match('/^EMS\s+/iu', $line)
            || aiChatIsStickerCapsuleItem($line)
        ) {
            $add(aiChatNormalizePickCatalogName($line));
            return;
        }
        // Open-ended portfolio asks often omit "|": "USP-S Cortex FT" / "MAC-10 Sakkaku".
        $piped = aiChatMaybeInsertSkinPipe($line);
        if (str_contains($piped, '|')) {
            $add(aiChatNormalizePickCatalogName($piped));
            return;
        }
        if ($weaponFamily === '') {
            return;
        }
        $matched = aiChatMatchTokenToWeaponSkin($line, $weaponFamily);
        if ($matched) {
            $add($matched);
            return;
        }
        // Only a short finish-like token can become "<weapon> | <token>"; a
        // sentence ("potential short-term pullback if market cools") is prose.
        if (mb_strlen($line) > 32 || count(preg_split('/\s+/u', $line) ?: []) > 4 || !preg_match('/^[\p{Lu}0-9]/u', $line)) {
            return;
        }
        $add($weaponFamily . ' | ' . $line);
    };

    // Signed Key factors chips ("- risk …") are not picks — drop that block
    // before scanning for list markers.
    $stripKeyFactors = static function (string $text): string {
        $kept = [];
        $inFactors = false;
        foreach (preg_split("/\r\n|\n|\r/", $text) ?: [] as $line) {
            $trim = trim((string)$line);
            if (preg_match('/^#{1,6}\s*key\s+factors\b/iu', $trim)) {
                $inFactors = true;
                continue;
            }
            if ($inFactors && preg_match('/^#{1,6}\s+/u', $trim)) {
                $inFactors = false;
            }
            if ($inFactors) {
                continue;
            }
            $kept[] = (string)$line;
        }
        return implode("\n", $kept);
    };

    // Recommendation bullets live above ### Why / Metrics / Risks. Prefer Items to buy only.
    $itemsSection = aiChatExtractItemsToBuySection($reply);
    $bulletSource = $itemsSection !== '' ? $itemsSection : $stripKeyFactors($reply);
    if ($itemsSection === '' && preg_match('/^(.*?)(?:\n#{2,3}\s|\z)/us', $reply, $headMatch)) {
        $head = trim((string)($headMatch[1] ?? ''));
        if ($head !== '' && preg_match('/(?:^|\n)\s*(?:•|\d{1,2}[.)]|[-*])\s+/u', $head)) {
            $bulletSource = $head;
        }
    }

    // Recommendation bullets / numbered picks are the buy list. Prefer them over prose / trending names.
    // Include markdown "- " / "* " lists — models often emit those instead of •.
    if (preg_match_all('/(?:^|\n)(\s*)(?:•|\d{1,2}[.)]|[-*])\s+(.+)/u', $bulletSource, $bulletMatches, PREG_SET_ORDER)) {
        foreach ($bulletMatches as $match) {
            $indent = (string)preg_replace('/[\r\n]+/u', '', (string)($match[1] ?? ''));
            if (mb_strlen($indent) >= 2) {
                continue;
            }
            $addBulletLine((string)($match[2] ?? ''));
        }
    }
    if (!$mentioned) {
        // Picks the model only listed under ### Why these picks ("**Name** — why",
        // no list marker) are still its picks — read them before falling back to
        // catalog candidates the model never mentioned.
        $inWhy = false;
        foreach (preg_split("/\n/", $reply) ?: [] as $line) {
            $trim = trim((string)$line);
            if ($trim === '') {
                continue;
            }
            if (aiChatIsWhyToBuyHeading($trim)) {
                $inWhy = true;
                continue;
            }
            if (preg_match('/^#{1,6}\s+/u', $trim)) {
                $inWhy = false;
                continue;
            }
            if ($inWhy) {
                $addBulletLine($trim);
            }
        }
    }
    if ($mentioned) {
        return $mentioned;
    }

    foreach ($sourceNames as $name) {
        $name = trim((string)$name);
        if ($name === '') {
            continue;
        }
        $display = aiChatStripWear($name);
        if ($display !== '' && mb_strpos($replyLower, mb_strtolower($display)) !== false) {
            $add($name);
            continue;
        }
        $finish = $display;
        if (str_contains($display, ' | ')) {
            $parts = explode(' | ', $display, 2);
            $finish = trim((string)($parts[1] ?? $display));
        }
        if ($finish !== '' && mb_strlen($finish) >= 4 && mb_strpos($replyLower, mb_strtolower($finish)) !== false) {
            $add($name);
            continue;
        }
        if (mb_strpos($replyLower, mb_strtolower($name)) !== false) {
            $add($name);
        }
    }

    // Capture "Weapon | Finish" mentions, but stop before why-clause verbs / trailing prose.
    if (preg_match_all(
        '/((?:StatTrak™|Souvenir|★)?\s*[\w.\-]+\s*\|\s*[^•\n|,]+?(?=\s+\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)|\s+\b(?:adds?|gives?|offers?|provides?|brings?|remains?|stays?|keeps?|makes?|helps?|delivers?|shows?|means?|looks?|feels?|works?|fits?|pairs?|is|are|was|were|has|have|had|can|could|will|would|should|may|might|while|because|since|although|across)\b|[•\n,]|$))/u',
        $reply,
        $matches
    )) {
        foreach ($matches[1] as $raw) {
            $clean = aiChatSanitizeExtractedItemName((string)$raw);
            if ($clean !== '') {
                $add($clean);
            }
        }
        // Re-attach a wear suffix immediately after the clipped finish when present in reply.
        if (preg_match_all(
            '/((?:StatTrak™|Souvenir|★)?\s*[\w.\-]+\s*\|\s*[^•\n|,]+?\s*\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\))/u',
            $reply,
            $wearMatches
        )) {
            foreach ($wearMatches[1] as $raw) {
                $clean = aiChatSanitizeExtractedItemName((string)$raw);
                if ($clean !== '') {
                    $add($clean);
                }
            }
        }
    }

    $hasSkinPick = false;
    foreach ($mentioned as $name) {
        if (str_contains((string)$name, '|')) {
            $hasSkinPick = true;
            break;
        }
    }

    if (!$hasSkinPick && $weaponFamily === '' && preg_match_all('/\b([\w\'.&-]+(?:\s+[\w\'.&-]+){0,5}\s+Case)\b/u', $reply, $caseMatches)) {
        foreach ($caseMatches[1] as $raw) {
            $add(trim((string)$raw));
        }
    }

    return $mentioned;
}

/**
 * @return list<string>
 */
function aiChatCollectCardSourceNames(
    string $userMessage,
    array $pageContext,
    ?array $forecast,
    ?array $distribution,
    ?array $priceHistory
): array {
    $scope = aiChatRequestedCardScope($userMessage);
    $weapon = $scope['weapon'];
    $itemType = $scope['type'];
    $names = [];
    $add = static function (string $name) use (&$names, $weapon, $itemType): void {
        $name = trim($name);
        if ($name === '') {
            return;
        }
        if (($weapon !== '' || $itemType !== '') && !aiChatCatalogNameMatchesScope($name, $weapon, $itemType)) {
            return;
        }
        $key = mb_strtolower($name);
        if (isset($names[$key])) {
            return;
        }
        $names[$key] = $name;
    };

    foreach ([$forecast, $distribution, $priceHistory] as $chart) {
        if (!is_array($chart)) {
            continue;
        }
        $add((string)($chart['item_name'] ?? $chart['item'] ?? ''));
    }

    foreach (['item_name', 'lookup_name'] as $key) {
        $add(trim((string)($pageContext[$key] ?? '')));
    }

    $extracted = aiChatExtractSearchTerms($userMessage);
    if ($extracted !== '') {
        foreach (aiChatCollectUniqueCatalogNames($extracted, 10, $weapon, $itemType) as $name) {
            $add($name);
        }
    }

    if ($weapon !== '') {
        foreach (aiChatCollectUniqueCatalogNames($weapon, 12, $weapon, $itemType !== '' ? $itemType : 'skin') as $name) {
            $add($name);
        }
    } elseif ($itemType === 'case') {
        foreach (aiChatCollectUniqueCatalogNames('Case', 12, '', 'case') as $name) {
            $add($name);
        }
    } elseif ($itemType === 'souvenir') {
        foreach (aiChatDefaultSouvenirSuggestionNames() as $name) {
            $add($name);
        }
        foreach (aiChatCollectUniqueCatalogNames('Souvenir Package', 12, '', 'souvenir') as $name) {
            $add($name);
        }
    } elseif ($itemType === 'sticker_capsule') {
        foreach (aiChatStickerInvestSeedNames(12, true, true) as $name) {
            $add($name);
        }
        foreach (aiChatDefaultStickerCapsuleNames() as $name) {
            $add($name);
        }
        foreach (aiChatCollectUniqueCatalogNames('Sticker Capsule', 12, '', 'sticker_capsule') as $name) {
            $add($name);
        }
    } elseif ($itemType === 'sticker') {
        foreach (aiChatStickerInvestSeedNames(12, true, false) as $name) {
            $add($name);
        }
        foreach (aiChatDefaultPaperStickerNames() as $name) {
            $add($name);
        }
        foreach (aiChatDefaultStickerCapsuleNames() as $name) {
            $add($name);
        }
        foreach (aiChatCollectUniqueCatalogNames('Sticker |', 12, '', 'sticker') as $name) {
            $add($name);
        }
        foreach (aiChatCollectUniqueCatalogNames('Sticker Capsule', 8, '', 'sticker') as $name) {
            $add($name);
        }
    } elseif ($itemType === 'charm') {
        foreach (aiChatDefaultCharmSuggestionNames() as $name) {
            $add($name);
        }
        foreach (aiChatCharmInvestSeedNames(12, true) as $name) {
            $add($name);
        }
        foreach (aiChatCollectUniqueCatalogNames('Charm', 12, '', 'charm') as $name) {
            $add($name);
        }
    }

    // Never merge trending Kilowatt/Revolution filler into buy/recommend card sources.
    return array_values($names);
}

/**
 * Clickable catalog cards for items the assistant actually named this turn.
 * Buy/recommend replies are not padded with trending cases or extra catalog fills.
 *
 * @return list<array<string, mixed>>
 */
function aiChatBuildItemCardsPayload(
    string $userMessage,
    string $reply,
    array $pageContext,
    ?array $forecast = null,
    ?array $distribution = null,
    ?array $priceHistory = null
): array {
    $pageType = trim((string)($pageContext['page_type'] ?? ''));
    if ($pageType === 'inventory') {
        return [];
    }

    $scope = aiChatRequestedCardScope($userMessage);
    $weapon = $scope['weapon'];
    $itemType = $scope['type'];
    $wantStatTrak = !empty($scope['stattrak']);
    $pickQuestion = aiChatLooksLikeItemPickQuestion($userMessage)
        || aiChatLooksLikeBroadMarketQuestion($userMessage)
        || !empty($pageContext['invest_followup']);

    // Buy/invest/portfolio: cards = unique items named as picks in this reply. No trending-case pad.
    if ($pickQuestion) {
        $mentioned = aiChatExtractReplyItemNames($reply, [], $weapon);
        $ordered = $mentioned;
    } else {
        $sources = aiChatCollectCardSourceNames($userMessage, $pageContext, $forecast, $distribution, $priceHistory);
        $mentioned = aiChatExtractReplyItemNames($reply, $sources, $weapon);
        $ordered = $mentioned ?: $sources;
    }

    // "Should I buy AK-47 | Redline?" with no picks in the reply: the card is that
    // item, never six random skins of the same weapon.
    if (!$ordered && $pickQuestion && preg_match('/[\w\-]+\s*\|\s*\S/u', $userMessage)) {
        $named = aiChatExtractSearchTerms($userMessage);
        if ($named !== '') {
            $ordered = [$named];
        }
    }

    // A follow-up whose picks did not resolve gets no cards rather than six random
    // seeds that have nothing to do with the answer.
    if (!$ordered && $pickQuestion && (!empty($pageContext['continuation']) || !empty($pageContext['invest_followup']))) {
        return [];
    }

    if (!$ordered && $pickQuestion) {
        $budgetEuro = aiChatExtractBudgetEuro($userMessage);
        $ordered = aiChatDiversifiedInvestCandidates(
            6,
            $weapon,
            $itemType,
            $budgetEuro > 0 ? $budgetEuro : 0.0,
            [],
            null,
            $wantStatTrak
        );
        if (!$ordered && ($itemType === 'collection' || aiChatWantsCollectionInvest($userMessage))) {
            $ordered = aiChatCollectionInvestSeedNames(6, $budgetEuro > 0 ? $budgetEuro : 0.0);
        }
        if (!$ordered) {
            $ordered = aiChatFallbackInvestSeedNames($userMessage);
        }
    }

    if (!$ordered) {
        return [];
    }

    $cards = [];
    $seenBase = [];
    // A "make it bigger" follow-up legitimately carries 15–20 picks; keep a card for each.
    $limit = !empty($pageContext['invest_followup']) || !empty($pageContext['continuation']) ? 20 : 12;

    $tryAdd = static function (string $name) use (&$cards, &$seenBase, $weapon, $itemType, $wantStatTrak, $limit): bool {
        if (count($cards) >= $limit) {
            return false;
        }
        $pickName = trim($name);
        if (aiChatIsStickerCardScope($itemType)) {
            if (aiChatIsWeaponCaseItem($pickName) || aiChatLooksLikeGunSkinName($pickName)) {
                return false;
            }
            $resolvedPick = aiChatResolveStickerPickName($pickName, $itemType === 'sticker_capsule');
            if (
                $resolvedPick === null
                || aiChatIsWeaponCaseItem($resolvedPick)
                || aiChatLooksLikeGunSkinName($resolvedPick)
                || !aiChatIsStickerScopedItem($resolvedPick, $itemType === 'sticker_capsule')
                || !aiChatStickerResolutionKeepsIdentity($pickName, $resolvedPick)
            ) {
                return false;
            }
            $pickName = $resolvedPick;
        }
        if ($itemType === 'charm') {
            $resolvedPick = aiChatResolveCharmPickName($pickName);
            if ($resolvedPick === null || !aiChatIsCharmItem($resolvedPick)) {
                return false;
            }
            $pickName = $resolvedPick;
        }
        $card = aiChatResolveCatalogCard($pickName);
        if ($card === null && $weapon !== '' && $itemType !== 'charm' && !aiChatIsStickerCardScope($itemType) && !str_contains($pickName, '|')) {
            $matched = aiChatMatchTokenToWeaponSkin($pickName, $weapon);
            if ($matched) {
                $card = aiChatResolveCatalogCard($matched);
            }
        }
        if ($card === null) {
            $card = aiChatFallbackPickCard($pickName);
        }
        if ($card === null) {
            return false;
        }
        $marketName = (string)($card['market_hash_name'] ?? '');
        // A hallucinated finish ("FAMAS | Neon Rider") must not card as a random
        // real skin of that weapon ("FAMAS | 2A2F") with an invented why line.
        if (str_contains($pickName, '|') && str_contains($marketName, '|') && !aiChatSkinResolutionKeepsFinish($pickName, $marketName)) {
            return false;
        }
        // Sticker team/event identity holds in every scope, not only sticker asks
        // ("Sticker | G2 | Paris 2023" must not card as "Sticker | iM | Paris 2023").
        if (preg_match('/^Sticker\s*\|/iu', $pickName) && preg_match('/^Sticker\s*\|/iu', $marketName) && !aiChatStickerResolutionKeepsIdentity($pickName, $marketName)) {
            return false;
        }
        // A vanilla knife ("Navaja Knife") is not any finish of that knife.
        if (!str_contains($pickName, '|') && str_contains($marketName, '|') && aiChatIsKnifeItem($pickName)) {
            return false;
        }
        if ($itemType === 'souvenir') {
            $marketName = aiChatToSouvenirMarketName($pickName !== '' ? $pickName : $marketName);
            if (!aiChatIsExplicitSouvenirName($marketName) && !preg_match('/\bSouvenir Package\b/iu', $marketName)) {
                return false;
            }
            $card = aiChatForceSouvenirCardName($card, $marketName);
            $marketName = (string)($card['market_hash_name'] ?? $marketName);
        }
        if (aiChatIsStickerCardScope($itemType)) {
            if (!aiChatIsStickerScopedItem($marketName, $itemType === 'sticker_capsule') || aiChatIsWeaponCaseItem($marketName)) {
                return false;
            }
        }
        if ($itemType === 'charm') {
            if (!aiChatIsCharmItem($marketName)) {
                return false;
            }
        }
        if (($weapon !== '' || $itemType !== '' || $wantStatTrak) && !aiChatCatalogNameMatchesScope($marketName, $weapon, $itemType, $wantStatTrak)) {
            return false;
        }
        $base = aiChatCardDedupKey($marketName);
        if ($base === '' || isset($seenBase[$base])) {
            return false;
        }
        // Prefer catalog art; never surface empty CS-placeholder shells beside real cards.
        if (trim((string)($card['image'] ?? '')) === '') {
            $card['image'] = aiChatCatalogImage($card);
        }
        if (trim((string)($card['image'] ?? '')) === '') {
            return false;
        }
        $seenBase[$base] = true;
        $card['requested_name'] = $pickName;
        $card['scope_weapon'] = $weapon;
        $card['scope_type'] = $itemType;
        $cards[] = aiChatAttachCheapestListing($card);
        return true;
    };

    foreach ($ordered as $name) {
        $tryAdd((string)$name);
        if (count($cards) >= $limit) {
            break;
        }
    }

    return $cards;
}

function aiChatMarketplaceSourceLabel(string $source): string
{
    $label = aiChatNormalizeMarketplaceLabel($source);
    return $label !== '' ? $label : trim($source);
}

function aiChatMarketplaceSourceKey(string $source): string
{
    $key = strtolower(trim((string)preg_replace('/[^a-zA-Z0-9]+/', '_', $source)));
    $key = trim($key, '_');
    return match ($key) {
        'steammarket', 'steam_market' => 'steam',
        'cs_float', 'float' => 'csfloat',
        'whitemarket', 'white' => 'white_market',
        'marketcsgo' => 'market_csgo',
        'halo_skins' => 'haloskins',
        'mannco_store', 'mannco_com' => 'mannco',
        'buff', 'buff_163', 'buffmarket' => 'buff163',
        'cs_money', 'csmoneybot' => 'csmoney',
        default => $key,
    };
}

function aiChatEnsureListingUrlHelpers(): void
{
    static $loaded = false;
    if ($loaded) {
        return;
    }
    $loaded = true;
    foreach ([
        'white_market_history_lib.php',
        'shadowpay_helpers.php',
        'market_csgo_helpers.php',
        'waxpeer_helpers.php',
        'mannco_helpers.php',
        'haloskins_helpers.php',
    ] as $file) {
        $path = __DIR__ . '/' . $file;
        if (is_file($path)) {
            require_once $path;
        }
    }
}

function aiChatSkinportItemUrl(string $marketHashName): string
{
    $name = trim($marketHashName);
    if ($name === '') {
        return '';
    }

    $slug = strtolower($name);
    $slug = str_replace(['★', '☆', '™', '©', '®'], '', $slug);
    $slug = str_replace(['|', '/', '\\', '_', ',', '.', '(', ')', '[', ']', '{', '}'], ' ', $slug);
    $slug = preg_replace('/\s+/', '-', trim($slug)) ?? '';
    $slug = preg_replace('/[^a-z0-9\-]+/', '', $slug) ?? '';
    $slug = trim((string)preg_replace('/-+/', '-', $slug), '-');
    if ($slug !== '') {
        return 'https://skinport.com/item/' . $slug;
    }

    return 'https://skinport.com/market/730?' . http_build_query(['search' => $name]);
}

function aiChatFallbackListingUrl(string $source, string $marketHashName): string
{
    $name = trim($marketHashName);
    if ($name === '') {
        return '';
    }

    aiChatEnsureListingUrlHelpers();
    $source = aiChatMarketplaceSourceKey($source);
    $encoded = rawurlencode($name);

    return match ($source) {
        'steam' => 'https://steamcommunity.com/market/listings/730/' . $encoded . '?l=english',
        'skinport' => aiChatSkinportItemUrl($name),
        'csfloat' => 'https://csfloat.com/search?' . http_build_query(['market_hash_name' => $name]),
        'white_market' => function_exists('whiteMarketBuildItemUrl')
            ? whiteMarketBuildItemUrl($name)
            : ('https://white.market/item?' . http_build_query(['appId' => '730', 'nameHash' => $name])),
        'dmarket' => 'https://dmarket.com/ingame-items/item-list/csgo-skins?title=' . $encoded,
        'market_csgo' => function_exists('marketCsgoItemUrl')
            ? marketCsgoItemUrl($name)
            : ('https://market.csgo.com/en/?search=' . $encoded),
        'shadowpay' => function_exists('shadowpayItemUrl')
            ? shadowpayItemUrl($name)
            : ('https://shadowpay.com/csgo-items?search=' . $encoded),
        'waxpeer' => function_exists('waxpeerItemUrl')
            ? waxpeerItemUrl($name)
            : ('https://waxpeer.com/?search=' . $encoded),
        'mannco' => function_exists('manncoItemUrl')
            ? manncoItemUrl($name)
            : ('https://mannco.store/cs2?search=' . $encoded),
        'haloskins' => function_exists('haloskinsItemUrl')
            ? haloskinsItemUrl($name)
            : ('https://www.haloskins.com/market?keyword=' . $encoded),
        'buff163' => 'https://buff.163.com/market/csgo#tab=selling&search=' . $encoded,
        'csmoney' => 'https://cs.money/market/buy/?search=' . $encoded,
        default => 'https://steamcommunity.com/market/listings/730/' . $encoded . '?l=english',
    };
}

/**
 * @return list<string>
 */
function aiChatListingHostsForSource(string $source): array
{
    return match (aiChatMarketplaceSourceKey($source)) {
        'steam' => ['steamcommunity.com'],
        'skinport' => ['skinport.com'],
        'csfloat' => ['csfloat.com'],
        'white_market' => ['white.market'],
        'dmarket' => ['dmarket.com'],
        'market_csgo' => ['market.csgo.com'],
        'shadowpay' => ['shadowpay.com'],
        'waxpeer' => ['waxpeer.com'],
        'mannco' => ['mannco.store'],
        'haloskins' => ['haloskins.com'],
        'buff163' => ['buff.163.com', 'buff163.com'],
        'csmoney' => ['cs.money'],
        default => [],
    };
}

function aiChatIsGenericListingUrl(string $source, string $url): bool
{
    $url = trim($url);
    $source = aiChatMarketplaceSourceKey($source);
    if ($url === '' || $url === '#' || str_starts_with(strtolower($url), 'javascript:')) {
        return true;
    }
    if (preg_match('/item_page\.html(?:[?#]|$)/i', $url)) {
        return true;
    }
    if (!preg_match('#^https?://#i', $url)) {
        return true;
    }

    $parts = parse_url($url);
    if (!is_array($parts)) {
        return true;
    }

    $host = strtolower((string)($parts['host'] ?? ''));
    $path = strtolower(rtrim((string)($parts['path'] ?? ''), '/'));
    $query = [];
    parse_str((string)($parts['query'] ?? ''), $query);

    $hosts = aiChatListingHostsForSource($source);
    if ($hosts) {
        $ok = false;
        foreach ($hosts as $expected) {
            if ($host === $expected || str_ends_with($host, '.' . $expected)) {
                $ok = true;
                break;
            }
        }
        if (!$ok) {
            return true;
        }
    }

    if ($source === 'white_market') {
        $hasName = trim((string)($query['nameHash'] ?? $query['name'] ?? '')) !== '';
        if (in_array($path, ['', '/csgo', '/market', '/en', '/en/csgo'], true) && !$hasName) {
            return true;
        }
        if ($path === '/item' && !$hasName) {
            return true;
        }
    }

    if ($source === 'skinport') {
        if (preg_match('#^/market/(pistol|rifle|smg|sniper|shotgun|machinegun|knife|gloves|sticker)#', $path)) {
            return true;
        }
        if ($path === '' || $path === '/market') {
            return true;
        }
        if (str_starts_with($path, '/market/730') && trim((string)($query['search'] ?? '')) === '') {
            return true;
        }
    }

    if ($source === 'steam' && !str_contains($path, '/market/listings/730/')) {
        return true;
    }

    return false;
}

function aiChatResolveListingUrl(string $source, string $marketHashName, string $url = ''): string
{
    $source = aiChatMarketplaceSourceKey($source);
    $name = trim($marketHashName);
    $url = trim($url);
    if ($url !== '' && !aiChatIsGenericListingUrl($source, $url)) {
        return $url;
    }

    return aiChatFallbackListingUrl($source, $name);
}

/**
 * @param list<string> $names
 * @return array<string, array{source: string, label: string, price: float, url: string}>
 */
function aiChatCheapestListingsByName(array $names): array
{
    static $memo = [];

    $wanted = [];
    foreach ($names as $name) {
        $name = trim((string)$name);
        if ($name === '' || isset($memo[$name])) {
            continue;
        }
        $wanted[$name] = true;
    }

    if ($wanted) {
        $candidates = [];
        $remember = static function (string $name, string $source, float $price, string $url) use (&$candidates): void {
            $name = trim($name);
            $source = aiChatMarketplaceSourceKey($source);
            if ($name === '' || $source === '' || $price <= 0) {
                return;
            }
            if (!isset($candidates[$name])) {
                $candidates[$name] = [];
            }
            $url = trim($url);
            $existing = $candidates[$name][$source] ?? null;
            if ($existing !== null) {
                $existingPrice = (float)$existing['price'];
                if ($existingPrice < $price - 0.001) {
                    if (trim((string)$existing['url']) === '' && $url !== '') {
                        $candidates[$name][$source]['url'] = $url;
                    }
                    return;
                }
                if (abs($existingPrice - $price) < 0.001) {
                    $existingUrl = trim((string)$existing['url']);
                    if ($existingUrl !== '' && (aiChatIsGenericListingUrl($source, $url) || $url === '')) {
                        return;
                    }
                    if ($url === '' && $existingUrl !== '') {
                        return;
                    }
                }
            }
            $candidates[$name][$source] = [
                'source' => $source,
                'price' => round($price, 2),
                'url' => $url,
            ];
        };

        $lookup = array_keys($wanted);
        try {
            require_once __DIR__ . '/roi_prices_db.php';
            $pdo = marketHistoryPdoConnection();
            $placeholders = implode(',', array_fill(0, count($lookup), '?'));
            $stmt = $pdo->prepare(
                "SELECT market_hash_name, source, current_price, market_url
                 FROM roi_prices
                 WHERE market_hash_name IN ({$placeholders})
                   AND current_price IS NOT NULL
                   AND current_price > 0"
            );
            $stmt->execute($lookup);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $remember(
                    (string)($row['market_hash_name'] ?? ''),
                    (string)($row['source'] ?? ''),
                    (float)($row['current_price'] ?? 0),
                    (string)($row['market_url'] ?? '')
                );
            }
        } catch (Throwable) {
            // Cache is optional — cards still render without a buy link.
        }

        try {
            $db = dbPdoConnection('db');
            if (dbTableExists($db, 'marketplace_price_cache')) {
                $placeholders = implode(',', array_fill(0, count($lookup), '?'));
                $stmt = $db->prepare(
                    "SELECT market_hash_name, marketplace, price, market_url
                     FROM marketplace_price_cache
                     WHERE market_hash_name IN ({$placeholders})
                       AND price IS NOT NULL
                       AND price > 0"
                );
                $stmt->execute($lookup);
                foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                    $remember(
                        (string)($row['market_hash_name'] ?? ''),
                        (string)($row['marketplace'] ?? ''),
                        (float)($row['price'] ?? 0),
                        (string)($row['market_url'] ?? '')
                    );
                }
            }
        } catch (Throwable) {
            // Optional overlay.
        }

        foreach ($lookup as $name) {
            $csfloatFile = __DIR__ . '/assets/csfloat-cache/' . md5($name) . '.json';
            if (!is_file($csfloatFile)) {
                continue;
            }
            $record = json_decode((string)@file_get_contents($csfloatFile), true);
            if (!is_array($record) || !empty($record['_no_listing'])) {
                continue;
            }
            $type = strtolower((string)($record['listing_type'] ?? $record['type'] ?? ''));
            if (!empty($record['auction']) || !empty($record['is_auction']) || str_contains($type, 'auction')) {
                continue;
            }
            $remember(
                $name,
                'csfloat',
                (float)($record['current_price'] ?? 0),
                (string)($record['market_url'] ?? '')
            );
        }

        foreach ($lookup as $name) {
            $offers = array_values($candidates[$name] ?? []);
            if (!$offers) {
                $memo[$name] = null;
                continue;
            }

            $steam = null;
            foreach ($offers as $offer) {
                if (($offer['source'] ?? '') === 'steam') {
                    $steam = (float)$offer['price'];
                    break;
                }
            }

            $best = null;
            foreach ($offers as $offer) {
                $price = (float)$offer['price'];
                if ($steam !== null && $steam > 0) {
                    if ($price < $steam * 0.35 || $price > $steam * 3.5) {
                        continue;
                    }
                }
                if ($best === null || $price < ((float)$best['price'] - 0.001)) {
                    $best = $offer;
                    continue;
                }
                if ($best !== null && abs($price - (float)$best['price']) < 0.001) {
                    $bestGeneric = aiChatIsGenericListingUrl((string)$best['source'], (string)($best['url'] ?? ''));
                    $offerGeneric = aiChatIsGenericListingUrl((string)($offer['source'] ?? ''), (string)($offer['url'] ?? ''));
                    if ($bestGeneric && !$offerGeneric) {
                        $best = $offer;
                    }
                }
            }
            if ($best === null) {
                $best = $offers[0];
                foreach ($offers as $offer) {
                    if ((float)$offer['price'] < (float)$best['price']) {
                        $best = $offer;
                    }
                }
            }

            $source = aiChatMarketplaceSourceKey((string)($best['source'] ?? ''));
            $url = aiChatResolveListingUrl($source, $name, (string)($best['url'] ?? ''));

            $memo[$name] = [
                'source' => $source,
                'label' => aiChatMarketplaceSourceLabel($source),
                'price' => round((float)$best['price'], 2),
                'url' => $url,
            ];
        }
    }

    $out = [];
    foreach ($names as $name) {
        $name = trim((string)$name);
        if ($name === '' || empty($memo[$name])) {
            continue;
        }
        $out[$name] = $memo[$name];
    }
    return $out;
}

function aiChatAttachCheapestListing(array $card): array
{
    $catalogName = trim((string)($card['market_hash_name'] ?? ''));
    $requested = trim((string)($card['requested_name'] ?? ''));
    if ($catalogName === '' && $requested === '') {
        return $card;
    }

    $lookup = [];
    if ($requested !== '') {
        $lookup[] = $requested;
    }
    if ($catalogName !== '' && strcasecmp($catalogName, $requested) !== 0) {
        $lookup[] = $catalogName;
    }
    $map = aiChatCheapestListingsByName($lookup);

    $requestedWear = mb_strtolower(aiChatExtractWearLabel($requested));
    $catalogWear = mb_strtolower(aiChatExtractWearLabel($catalogName));
    $listing = null;
    $listingName = '';
    if ($requested !== '' && isset($map[$requested]) && is_array($map[$requested]) && (float)($map[$requested]['price'] ?? 0) > 0) {
        $listing = $map[$requested];
        $listingName = $requested;
    } elseif (
        $catalogName !== ''
        && isset($map[$catalogName])
        && is_array($map[$catalogName])
        && (float)($map[$catalogName]['price'] ?? 0) > 0
        && ($requestedWear === '' || $catalogWear === '' || $requestedWear === $catalogWear)
    ) {
        $listing = $map[$catalogName];
        $listingName = $catalogName;
    }
    if (!is_array($listing)) {
        $fallbackName = $catalogName !== '' ? $catalogName : $requested;
        if ($fallbackName !== '' && trim((string)($card['cheapest_url'] ?? '')) === '') {
            $skinportUrl = aiChatSkinportItemUrl($fallbackName);
            $card['cheapest_url'] = $skinportUrl !== ''
                ? $skinportUrl
                : aiChatFallbackListingUrl('steam', $fallbackName);
            if (trim((string)($card['cheapest_marketplace'] ?? '')) === '') {
                $card['cheapest_marketplace'] = $skinportUrl !== '' ? 'Skinport' : 'Steam';
            }
        }
        return $card;
    }

    $source = aiChatMarketplaceSourceKey((string)($listing['source'] ?? $listing['label'] ?? ''));
    $label = trim((string)($listing['label'] ?? ''));
    $card['cheapest_marketplace'] = $label !== '' ? $label : aiChatMarketplaceSourceLabel($source);
    $card['cheapest_price'] = (float)$listing['price'];
    $card['cheapest_url'] = aiChatResolveListingUrl(
        $source,
        $listingName !== '' ? $listingName : $catalogName,
        (string)($listing['url'] ?? '')
    );
    if (!isset($card['seed_sell_price']) || !is_numeric($card['seed_sell_price']) || (float)$card['seed_sell_price'] <= 0) {
        $card['seed_sell_price'] = (float)$listing['price'];
    }

    return $card;
}

function aiChatFormatCheapestListingLine(string $name, array $listing): string
{
    $label = (string)($listing['label'] ?? 'marketplace');
    $price = number_format((float)($listing['price'] ?? 0), 2, '.', '');
    return '- ' . $name . ' — €' . $price . ' (' . $label . ' cheapest ask; use this exact € on the pick bullet, then a real why — not the market name)';
}

function aiChatFormatEuroAmount(float $price): string
{
    return '€' . number_format($price, 2, '.', '');
}

function aiChatFormatBuyOnPhrase(array $listing): string
{
    $label = trim((string)($listing['label'] ?? 'marketplace'));
    if ($label === '') {
        $label = 'marketplace';
    }
    return 'Buy on ' . $label . ' for ' . aiChatFormatEuroAmount((float)($listing['price'] ?? 0));
}

function aiChatPlaceholderPriceRegex(): string
{
    return '/(?:€|\$|£)\s*(?:X+[.,]X+|\?+)(?!\w)|\bX+[.,]X+\b/iu';
}

function aiChatHasPlaceholderPrice(string $text): bool
{
    return (bool)preg_match(aiChatPlaceholderPriceRegex(), $text);
}

/**
 * @return list<string>
 */
function aiChatCardNameAliases(array $card): array
{
    $aliases = [];
    $add = static function (string $value) use (&$aliases): void {
        $value = trim($value);
        if ($value === '' || mb_strlen($value) < 3) {
            return;
        }
        if (preg_match('/^(glock-18|ak-47|awp|m4a1-s|m4a4|usp-s|desert eagle|p250|tec-9|famas|galil ar)$/iu', $value)) {
            return;
        }
        $key = mb_strtolower($value);
        if (!isset($aliases[$key])) {
            $aliases[$key] = $value;
        }
    };

    foreach (['requested_name', 'market_hash_name', 'display_name', 'name'] as $key) {
        $name = trim((string)($card[$key] ?? ''));
        if ($name === '') {
            continue;
        }
        $add($name);
        $stripped = aiChatStripWear($name);
        $add($stripped);
        if (str_contains($stripped, ' | ')) {
            $parts = explode(' | ', $stripped, 2);
            $add(trim((string)($parts[1] ?? '')));
        }
    }

    $values = array_values($aliases);
    usort($values, static fn(string $a, string $b): int => mb_strlen($b) <=> mb_strlen($a));
    return $values;
}

function aiChatListingFromCard(array $card): ?array
{
    $price = 0.0;
    if (isset($card['cheapest_price']) && is_numeric($card['cheapest_price']) && (float)$card['cheapest_price'] > 0) {
        $price = (float)$card['cheapest_price'];
    } elseif (isset($card['seed_sell_price']) && is_numeric($card['seed_sell_price']) && (float)$card['seed_sell_price'] > 0) {
        $price = (float)$card['seed_sell_price'];
    }
    if ($price <= 0) {
        return null;
    }

    $label = trim((string)($card['cheapest_marketplace'] ?? ''));
    if ($label === '') {
        $label = 'Steam';
    }

    $requested = trim((string)($card['requested_name'] ?? ''));
    $catalogName = trim((string)($card['market_hash_name'] ?? $card['display_name'] ?? ''));
    return [
        'name' => $requested !== '' ? $requested : $catalogName,
        'label' => $label,
        'price' => round($price, 2),
        'aliases' => aiChatCardNameAliases($card),
    ];
}

/**
 * @param list<array<string, mixed>> $listings
 */
function aiChatMatchListingForText(string $text, array $listings): ?array
{
    $hay = mb_strtolower($text);
    $lineWeapon = mb_strtolower(aiChatCatalogNameWeapon($text));
    // Knives and gloves are not weapon families: compare the raw "X | " head so a
    // "Fade" alias cannot bind Huntsman Knife | Marble Fade to ★ Bayonet | Fade.
    $headKey = static function (string $name): string {
        $plain = trim((string)preg_replace('/\*+/u', '', $name));
        $plain = (string)preg_replace('/^\s*(?:[-*•]|\d+[.)])\s+/u', '', $plain);
        if (!preg_match('/^([^|\n]{2,60}?)\s*\|/u', $plain, $m)) {
            return '';
        }
        $head = (string)preg_replace('/^(?:★\s*)?(?:StatTrak™?\s*|Souvenir\s*)?/iu', '', trim((string)$m[1]));
        return (string)preg_replace('/[^a-z0-9]+/u', '', mb_strtolower($head));
    };
    $lineHead = $headKey($text);
    $best = null;
    $bestLen = 0;
    foreach ($listings as $listing) {
        if (!is_array($listing)) {
            continue;
        }
        $listingWeapon = mb_strtolower(aiChatCatalogNameWeapon((string)($listing['name'] ?? '')));
        if ($lineWeapon !== '' && $listingWeapon !== '' && $lineWeapon !== $listingWeapon) {
            continue;
        }
        $listingHead = $headKey((string)($listing['name'] ?? ''));
        if ($lineHead !== '' && $listingHead !== '' && $lineHead !== $listingHead) {
            continue;
        }
        $listingWear = mb_strtolower(aiChatExtractWearLabel((string)($listing['name'] ?? '')));
        $lineWear = mb_strtolower(aiChatExtractWearLabel($text));
        if ($lineWear !== '' && $listingWear !== '' && $lineWear !== $listingWear) {
            continue;
        }
        foreach ((array)($listing['aliases'] ?? []) as $alias) {
            $alias = trim((string)$alias);
            if ($alias === '' || mb_strlen($alias) < 3) {
                continue;
            }
            $len = mb_strlen($alias);
            if ($len > $bestLen && mb_strpos($hay, mb_strtolower($alias)) !== false) {
                $best = $listing;
                $bestLen = $len;
            }
        }
    }
    return $best;
}

/**
 * @param list<array<string, mixed>> $listings
 */
function aiChatCheapestOfListings(array $listings): ?array
{
    $best = null;
    foreach ($listings as $listing) {
        if (!is_array($listing)) {
            continue;
        }
        $price = (float)($listing['price'] ?? 0);
        if ($price <= 0) {
            continue;
        }
        if ($best === null || $price < (float)$best['price']) {
            $best = $listing;
        }
    }
    return $best;
}

/**
 * @param list<array<string, mixed>> $listings
 */
function aiChatApplyListingPricesToReply(string $reply, array $listings): string
{
    if ($reply === '' || !$listings || !aiChatHasPlaceholderPrice($reply)) {
        return $reply;
    }

    $placeholder = aiChatPlaceholderPriceRegex();
    $buyOnPlaceholder = '/Buy on [^*\n]+? for (?:€|\$|£)?\s*X+[.,]X+/iu';
    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        $lines = [$reply];
    }

    $current = null;
    $used = [];
    $cheapest = aiChatCheapestOfListings($listings);
    foreach ($lines as $i => $line) {
        $matched = aiChatMatchListingForText((string)$line, $listings);
        if (is_array($matched)) {
            $current = $matched;
        }
        if (!aiChatHasPlaceholderPrice((string)$line)) {
            continue;
        }

        $listing = $matched ?? $current;
        if ($matched === null && (str_contains((string)$line, '|') || preg_match('/\b[\w\'.&-]+(?:\s+[\w\'.&-]+){0,5}\s+Case\b/u', (string)$line))) {
            // Named pick on this line did not resolve — do not reuse another item's price.
            continue;
        }
        if (
            is_array($cheapest)
            && preg_match('/\b(summary|overall|cheapest|around|from)\b/iu', (string)$line)
            && $matched === null
        ) {
            $listing = $cheapest;
        }
        if (!is_array($listing) || (float)($listing['price'] ?? 0) <= 0) {
            continue;
        }

        $key = mb_strtolower((string)($listing['name'] ?? ''));
        if ($key !== '') {
            $used[$key] = true;
        }

        $buy = aiChatFormatBuyOnPhrase($listing);
        $euro = aiChatFormatEuroAmount((float)$listing['price']);
        $newLine = preg_replace($buyOnPlaceholder, $buy, (string)$line) ?? (string)$line;
        $newLine = preg_replace($placeholder, $euro, $newLine) ?? $newLine;
        $lines[$i] = $newLine;
    }

    $reply = implode("\n", $lines);
    if (!aiChatHasPlaceholderPrice($reply)) {
        return $reply;
    }

    $pool = [];
    foreach ($listings as $listing) {
        if (!is_array($listing) || (float)($listing['price'] ?? 0) <= 0) {
            continue;
        }
        $key = mb_strtolower((string)($listing['name'] ?? ''));
        if ($key !== '' && isset($used[$key])) {
            continue;
        }
        $pool[] = $listing;
    }
    if (!$pool) {
        $pool = array_values(array_filter(
            $listings,
            static fn($row): bool => is_array($row) && (float)($row['price'] ?? 0) > 0
        ));
    }
    if (!$pool && is_array($cheapest)) {
        $pool = [$cheapest];
    }
    if (!$pool) {
        return $reply;
    }

    $idx = 0;
    foreach ($lines as $i => $line) {
        if (!aiChatHasPlaceholderPrice((string)$line)) {
            continue;
        }
        if (str_contains((string)$line, '|') || preg_match('/\b[\w\'.&-]+(?:\s+[\w\'.&-]+){0,5}\s+Case\b/u', (string)$line)) {
            continue;
        }
        $listing = $pool[$idx] ?? $pool[count($pool) - 1] ?? null;
        if (!is_array($listing) || (float)($listing['price'] ?? 0) <= 0) {
            continue;
        }
        $idx++;
        $lines[$i] = preg_replace($placeholder, aiChatFormatEuroAmount((float)$listing['price']), (string)$line) ?? (string)$line;
    }

    return implode("\n", $lines);
}

/**
 * Swap leftover €X.XX / $X.XX / XX.XX in assistant text for injected cheapest listings.
 *
 * @param list<array<string, mixed>> $cards
 */
function aiChatFillPlaceholderPrices(string $reply, array $cards, string $userMessage = ''): string
{
    if ($reply === '' || !aiChatHasPlaceholderPrice($reply)) {
        return $reply;
    }

    $listings = [];
    $seen = [];
    $addListing = static function (array $listing) use (&$listings, &$seen): void {
        $name = trim((string)($listing['name'] ?? ''));
        $key = $name !== '' ? mb_strtolower($name) : md5((string)($listing['label'] ?? '') . (string)($listing['price'] ?? ''));
        if (isset($seen[$key]) || (float)($listing['price'] ?? 0) <= 0) {
            return;
        }
        $seen[$key] = true;
        $listings[] = $listing;
    };

    foreach ($cards as $card) {
        if (!is_array($card)) {
            continue;
        }
        $listing = aiChatListingFromCard($card);
        if (is_array($listing)) {
            $addListing($listing);
        }
    }

    $weapon = aiChatExtractWeaponFamily($userMessage);
    $sourceNames = [];
    foreach ($cards as $card) {
        if (is_array($card)) {
            $sourceNames[] = (string)($card['market_hash_name'] ?? '');
        }
    }
    $mentioned = aiChatExtractReplyItemNames($reply, $sourceNames, $weapon);
    $cheapestMap = $mentioned ? aiChatCheapestListingsByName($mentioned) : [];
    foreach ($cheapestMap as $name => $listing) {
        if (!is_array($listing)) {
            continue;
        }
        $addListing([
            'name' => (string)$name,
            'label' => (string)($listing['label'] ?? 'marketplace'),
            'price' => round((float)($listing['price'] ?? 0), 2),
            'aliases' => aiChatCardNameAliases([
                'market_hash_name' => (string)$name,
                'display_name' => aiChatStripWear((string)$name),
            ]),
        ]);
    }

    if (!$listings) {
        return $reply;
    }

    return aiChatApplyListingPricesToReply($reply, $listings);
}

/**
 * Force item-pick bullets to the same cheapest-listing € the cards show.
 *
 * @param list<array<string, mixed>> $cards
 */
/**
 * Indexes of the lines inside a "### Key factors" block — those `- risk` lines
 * mention item names and must never be priced or quantified like picks.
 *
 * @param list<string> $lines
 * @return array<int, true>
 */
function aiChatKeyFactorsLineIndexes(array $lines): array
{
    $set = [];
    $inFactors = false;
    foreach ($lines as $i => $line) {
        $trim = trim((string)$line);
        if (preg_match('/^#{1,6}\s+/u', $trim)) {
            $inFactors = (bool)preg_match('/^#{1,6}\s*key\s+factors\b/iu', $trim);
            continue;
        }
        if ($inFactors) {
            $set[$i] = true;
        }
    }
    return $set;
}

/**
 * Bullet and Why names take the catalog spelling of the matched card
 * ("GUT KNIFE | Doppler" → "★ Gut Knife | Doppler", "DESERT EAGLE" → "Desert Eagle").
 *
 * @param list<array<string, mixed>> $cards
 */
function aiChatCanonicalizePickNames(string $reply, array $cards): string
{
    if ($reply === '' || !$cards) {
        return $reply;
    }
    $canon = [];
    foreach ($cards as $card) {
        if (!is_array($card)) {
            continue;
        }
        $market = trim((string)($card['market_hash_name'] ?? ''));
        if ($market === '') {
            continue;
        }
        $base = aiChatStripWear($market);
        $names = array_merge([$base, (string)($card['requested_name'] ?? '')], aiChatCardNameAliases($card));
        foreach ($names as $alias) {
            $key = aiChatWhyNameKey(aiChatStripWear(trim((string)$alias)));
            if ($key !== '' && !isset($canon[$key])) {
                $canon[$key] = $base;
            }
        }
    }
    if (!$canon) {
        return $reply;
    }
    $lines = preg_split("/\r\n|\n|\r/", $reply) ?: [];
    $skip = aiChatKeyFactorsLineIndexes($lines);
    $changed = false;
    foreach ($lines as $i => $line) {
        if (isset($skip[$i])) {
            continue;
        }
        if (!preg_match('/^(\s*(?:(?:[-*•]|\d+[.)])\s+)?\*\*)([^*\n]+?)(\*\*)/u', (string)$line, $m, PREG_OFFSET_CAPTURE)) {
            continue;
        }
        $head = trim((string)$m[2][0]);
        $wear = '';
        if (preg_match('/\s+(\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\))$/iu', $head, $w)) {
            $wear = ' ' . $w[1];
        }
        $key = aiChatWhyNameKey(aiChatStripWear($head));
        if ($key === '' || !isset($canon[$key])) {
            continue;
        }
        $replacement = $canon[$key] . $wear;
        if ($replacement === $head) {
            continue;
        }
        $lines[$i] = substr_replace((string)$line, $replacement, (int)$m[2][1], strlen((string)$m[2][0]));
        $changed = true;
    }
    return $changed ? implode("\n", $lines) : $reply;
}

function aiChatApplyCheapestPricesToItemBullets(string $reply, array $cards): string
{
    if ($reply === '' || !$cards) {
        return $reply;
    }

    $listings = [];
    foreach ($cards as $card) {
        if (!is_array($card)) {
            continue;
        }
        $listing = aiChatListingFromCard($card);
        if (is_array($listing) && (float)($listing['price'] ?? 0) > 0) {
            $listings[] = $listing;
        }
    }
    if (!$listings) {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }

    $factorLines = aiChatKeyFactorsLineIndexes($lines);
    foreach ($lines as $i => $line) {
        if (isset($factorLines[$i])) {
            continue;
        }
        if (!preg_match('/^\s*(?:[-*•]|\d+[.)])\s+/u', (string)$line)) {
            continue;
        }
        $plain = (string)preg_replace('/^\s*(?:[-*•]|\d+[.)])\s+/u', '', (string)$line);
        if (!aiChatLooksLikeCatalogItemLine($plain) && !aiChatLooksLikeRecommendItemLine($plain)) {
            continue;
        }
        $listing = aiChatMatchListingForText((string)$line, $listings);
        if (!is_array($listing) || (float)($listing['price'] ?? 0) <= 0) {
            continue;
        }
        $euro = aiChatFormatEuroAmount((float)$listing['price']);
        if (preg_match('/(?:€|\$|£)\s*(\d[\d.,]*)/u', (string)$line, $oldMatch)) {
            $updated = preg_replace('/(?:€|\$|£)\s*\d[\d.,]*/u', $euro, (string)$line, 1);
            if (is_string($updated) && $updated !== '') {
                // "×N = €total" must follow the corrected unit price. When the model
                // guessed the price badly (€4.50 for a €287 skin) keep the intended
                // spend instead: rescale the quantity so the line total stays put.
                $unit = (float)$listing['price'];
                $oldUnit = (float)str_replace(',', '', (string)$oldMatch[1]);
                $updated = preg_replace_callback(
                    '/([x×]\s*)(\d{1,4})(\s*=\s*)(?:€|\$|£)\s*\d[\d.,]*/u',
                    static function (array $m) use ($unit, $oldUnit): string {
                        $qty = max(1, (int)$m[2]);
                        if ($oldUnit > 0 && $unit > 0 && $qty > 1 && ($unit / $oldUnit > 2.0 || $unit / $oldUnit < 0.5)) {
                            $qty = max(1, (int)round(($oldUnit * $qty) / $unit));
                        }
                        return $m[1] . $qty . $m[3] . aiChatFormatEuroAmount(round($unit * $qty, 2));
                    },
                    $updated,
                    1
                ) ?? $updated;
                $lines[$i] = $updated;
            }
            continue;
        }
        $lines[$i] = rtrim((string)$line) . ' — ' . $euro;
    }

    return implode("\n", $lines);
}

function aiChatExtractSearchTerms(string $message): string
{
    $message = trim($message);
    if ($message === '') {
        return '';
    }

    if (preg_match('/((?:StatTrak™|Souvenir|★)?\s*[\w\-]+\s*\|\s*[^?!.,]+)/ui', $message, $match)) {
        $candidate = trim(preg_replace('/\s+/u', ' ', (string)$match[1]));
        $candidate = trim((string)preg_replace(
            '/\s+(?:go\s+up|rise|increase|drop|fall|decline|crash|pump|moon|in\s+price|in\s+value|worth(?:\s+more|\s+less)?|soon|tomorrow|next(?:\s+\w+)?)(?:\s+in\s+(?:price|value|worth))?(?:\s+in\s+the\s+future)?\??$/iu',
            '',
            $candidate
        ));
        // "… right now?", "… today", "… at the moment" are question tails, not part of the name.
        $candidate = trim((string)preg_replace(
            '/\s+(?:right\s+now|now|today|currently|at\s+the\s+moment|this\s+(?:week|month|year)|yet|still|or\s+not|or\s+wait|please)\s*\??$/iu',
            '',
            $candidate
        ));
        // Keep wear suffix if present; drop trailing junk after a closed wear paren.
        if (preg_match('/^(.+?\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\))/iu', $candidate, $wearMatch)) {
            $candidate = trim((string)$wearMatch[1]);
        }
        if ($candidate !== '' && aiChatExtractedTermLooksLikeItem($candidate)) {
            return $candidate;
        }
    }

    // "Fracture Case", "Dreams & Nightmares Case" — prefer the trailing case name, not "create a chart for …".
    // Match Case/case case-insensitively; users often type "fracture case".
    if (preg_match_all('/\b((?:[A-Za-z0-9][\w\'.&-]*)(?:\s+(?:&|[A-Za-z0-9][\w\'.&-]*)){0,4}\s+[Cc]ase)\b/u', $message, $caseMatches)) {
        $leadNoise = '/^(?:create|make|draw|show|generate|plot|render|display|chart|graph|a|an|the|for|of|on|about|me|my|us|please|future|price|prices|outlook|trend|prediction|forecast|supply|listing|listings|stock|distribution|history|marketplace|marketplaces|will|would|could|should|can|does|did|is|are|was|were|gonna|going|to|be|get|got|see|check|any|some|item|items|invest|investment|into|buy|hold|holding|i)\s+/iu';
        $leadPhrase = '/^(?:(?:the|a|an)\s+)?(?:future|price|prices|outlook|trend|prediction|forecast|supply|listing|listings|stock|distribution|history)\s+(?:of|for|on|about)\s+/iu';
        $candidates = [];
        $pushCandidate = static function (string $candidate) use (&$candidates): void {
            $candidate = trim(preg_replace('/\s+/u', ' ', $candidate));
            $candidate = (string)preg_replace('/\bcase$/iu', 'Case', $candidate);
            if ($candidate === '' || !preg_match('/\bCase$/u', $candidate) || !aiChatExtractedTermLooksLikeItem($candidate)) {
                return;
            }
            $candidates[] = $candidate;
        };
        foreach (array_reverse($caseMatches[1]) as $raw) {
            $candidate = trim(preg_replace('/\s+/u', ' ', (string)$raw));
            $candidate = trim((string)preg_replace($leadPhrase, '', $candidate, 1));
            for ($i = 0; $i < 12; $i++) {
                $next = trim((string)preg_replace($leadNoise, '', $candidate, 1));
                if ($next === $candidate) {
                    break;
                }
                $candidate = $next;
            }
            $pushCandidate($candidate);

            // Also try trailing "Name Case" / "Name Name Case" slices so
            // "should i invest in fracture case" → "Fracture Case".
            $words = preg_split('/\s+/u', $candidate) ?: [];
            $wordCount = count($words);
            for ($n = 2; $n <= min(4, $wordCount); $n++) {
                $pushCandidate(implode(' ', array_slice($words, -$n)));
            }
        }

        // Prefer catalog hits, then shorter names (e.g. "Fracture Case" over noisy phrases).
        $candidates = array_values(array_unique($candidates));
        usort($candidates, static function (string $a, string $b): int {
            $aHits = aiChatSearchCatalog($a, 1) ? 0 : 1;
            $bHits = aiChatSearchCatalog($b, 1) ? 0 : 1;
            if ($aHits !== $bHits) {
                return $aHits <=> $bHits;
            }
            $aWords = count(preg_split('/\s+/u', $a) ?: []);
            $bWords = count(preg_split('/\s+/u', $b) ?: []);
            if ($aWords !== $bWords) {
                return $aWords <=> $bWords;
            }
            return mb_strlen($a) <=> mb_strlen($b);
        });

        if ($candidates) {
            $best = $candidates[0];
            $hits = aiChatSearchCatalog($best, 1);
            if ($hits && !empty($hits[0]['market_hash_name'])) {
                return (string)$hits[0]['market_hash_name'];
            }
            return $best;
        }
    }

    // Shorthand gun skins: "ak47 frostbite", "awp asiimov", "m4a1 printstream".
    if (preg_match_all(
        '/\b((?:stat\s*trak(?:™)?\s+)?(?:ak-?47|awp|m4a1-s|m4a4|usp-s|glock(?:-?18)?|desert\s+eagle|deagle|p250|tec-9|five-?seven|cz75(?:-auto)?|mp9|mac-10|ump-45|p90|pp-bizon|nova|xm1014|mag-7|sawed-off|m249|negev|galil\s*ar|famas|ssg\s*08|scar-20|g3sg1)\s+[a-z0-9][\w\'.-]*(?:\s+[a-z0-9][\w\'.-]*){0,3})/iu',
        $message,
        $gunMatches
    )) {
        foreach (array_reverse($gunMatches[1]) as $candidate) {
            $candidate = trim(preg_replace('/\s+/u', ' ', (string)$candidate));
            $candidate = trim((string)preg_replace(
                '/\s+(?:chart|graph|plot|supply|history|distribution|forecast|please)$/iu',
                '',
                $candidate
            ));
            if ($candidate === '' || !aiChatExtractedTermLooksLikeItem($candidate)) {
                continue;
            }
            $resolved = aiChatResolveCatalogItemName($candidate);
            if ($resolved !== '') {
                return $resolved;
            }
            return $candidate;
        }
    }

    // "Build a CS2 portfolio" is not an item named Build / Elite Build.
    if (aiChatLooksLikeOpenEndedInvestQuestion($message)) {
        return '';
    }

    // Capsules / packages with similar phrasing.
    if (preg_match_all('/\b((?:[A-Za-z0-9][\w\'.&-]*)(?:\s+(?:&|[A-Za-z0-9][\w\'.&-]*)){0,5}\s+(?:Capsule|Package))\b/iu', $message, $extraMatches)) {
        foreach (array_reverse($extraMatches[1]) as $candidate) {
            $candidate = trim(preg_replace('/\s+/u', ' ', (string)$candidate));
            if ($candidate !== '' && aiChatExtractedTermLooksLikeItem($candidate)) {
                return $candidate;
            }
        }
    }

    // Strip chart/command lead-ins before grabbing a free-form item phrase.
    $stripped = trim((string)preg_replace(
        '/^(?:please\s+)?(?:can you\s+|could you\s+|would you\s+)?(?:create|make|draw|show|generate|plot|render|display|give|build)\s+(?:me\s+)?(?:a\s+|an\s+|the\s+)?(?:chart|graph|plot|forecast|outlook|prediction)(?:\s+(?:on|for|of|about|regarding))?\s+/iu',
        '',
        $message
    ));
    $stripped = trim((string)preg_replace(
        '/^(?:the\s+)?(?:future|price|prices|outlook|trend|prediction|forecast)\s+(?:of|for|on|about)\s+/iu',
        '',
        $stripped
    ));
    $stripped = trim((string)preg_replace(
        '/^(?:please\s+)?(?:will|would|could|should|can|does|is|are)\s+/iu',
        '',
        $stripped
    ));
    $stripped = trim((string)preg_replace(
        '/\s+(?:go\s+up|rise|increase|drop|fall|decline|crash|pump|moon)(?:\s+in\s+(?:price|value|worth))?(?:\s+in\s+the\s+future)?\??$/iu',
        '',
        $stripped
    ));
    $stripped = trim((string)preg_replace('/\bitem\b$/iu', '', $stripped));
    $stripped = trim((string)preg_replace('/\bcase$/iu', 'Case', $stripped));

    if ($stripped !== '' && preg_match('/\b([\w|★\-\']{3,}(?:\s+[\w|★\-\'&.]{2,}){0,6})/u', $stripped, $match)) {
        $candidate = trim((string)$match[1]);
        $candidate = (string)preg_replace('/\bcase$/iu', 'Case', $candidate);
        if (aiChatExtractedTermLooksLikeItem($candidate)) {
            return $candidate;
        }
    }

    if (preg_match('/\b([\w|★\-\']{3,}(?:\s+[\w|★\-\']{2,}){0,6})/u', $message, $match)) {
        $candidate = trim((string)$match[1]);
        if (aiChatExtractedTermLooksLikeItem($candidate)) {
            return $candidate;
        }
    }

    return '';
}

/**
 * @return array<string, string>
 */
function aiChatWearAbbreviationMap(): array
{
    return [
        'fn' => 'Factory New',
        'mw' => 'Minimal Wear',
        'ft' => 'Field-Tested',
        'ww' => 'Well-Worn',
        'bs' => 'Battle-Scarred',
    ];
}

/**
 * Expand FT/MW/FN/(FT) wear shorthand so catalog resolve + wear matching work.
 */
function aiChatExpandWearAbbreviations(string $name): string
{
    $name = trim($name);
    if ($name === '') {
        return '';
    }

    $map = aiChatWearAbbreviationMap();
    $name = (string)preg_replace_callback(
        '/\((FN|MW|FT|WW|BS)\)/iu',
        static function (array $match) use ($map): string {
            $key = strtolower((string)$match[1]);
            return isset($map[$key]) ? '(' . $map[$key] . ')' : (string)$match[0];
        },
        $name
    );
    $name = (string)preg_replace_callback(
        '/\s+(FN|MW|FT|WW|BS)(?=\s*$|\s+[—–\-:])/iu',
        static function (array $match) use ($map): string {
            $key = strtolower((string)$match[1]);
            return isset($map[$key]) ? ' (' . $map[$key] . ')' : (string)$match[0];
        },
        $name
    );

    return trim((string)preg_replace('/\s+/u', ' ', $name));
}

/**
 * "USP-S Cortex FT" → "USP-S | Cortex (Field-Tested)" when the left token is a known weapon.
 */
function aiChatMaybeInsertSkinPipe(string $name): string
{
    $name = trim($name);
    if ($name === '' || str_contains($name, '|')) {
        return $name;
    }
    if (preg_match('/\b(Case|Capsule|Package|Sticker(?: Slab)?|Patch|Pin|Charm|Agent|Graffiti|Music Kit)\b/u', $name)) {
        return $name;
    }
    if (preg_match('/^EMS\s+/iu', $name) || aiChatIsStickerCapsuleItem($name)) {
        return $name;
    }

    // Gloves / knives written without the pipe: "Hand Wraps Scavenger" → "★ Hand Wraps | Scavenger".
    if (preg_match(
        '/^(★\s*)?((?:StatTrak™?\s+)?)((?:Sport|Specialist|Driver|Moto|Hydra|Bloodhound|Broken Fang)\s+Gloves|Hand\s+Wraps|(?:Bayonet|Karambit|Flip|Gut|M9\s+Bayonet|Huntsman|Falchion|Bowie|Butterfly|Shadow\s+Daggers|Navaja|Stiletto|Ursus|Talon|Skeleton|Nomad|Paracord|Survival|Classic|Kukri)(?:\s+Knife)?)\s+(?!\()(.+)$/iu',
        $name,
        $gm
    )) {
        $finish = trim((string)$gm[4]);
        // "Navaja Knife (Factory New)" is a vanilla knife, not "Navaja | Knife (…)".
        if ($finish !== '' && mb_strlen($finish) >= 2 && !preg_match('/^(?:Knife\b|Gloves\b|\()/iu', $finish)) {
            return trim('★ ' . $gm[2] . trim((string)$gm[3]) . ' | ' . $finish);
        }
    }

    $weapon = aiChatExtractWeaponFamily($name);
    if ($weapon === '') {
        return $name;
    }

    $prefix = '';
    $rest = $name;
    if (preg_match('/^((?:★\s*)?(?:StatTrak™|StatTrak|Souvenir)\s+)(.+)$/iu', $name, $prefMatch)) {
        $prefix = (string)$prefMatch[1];
        $rest = trim((string)$prefMatch[2]);
    }

    if (!preg_match('/^' . preg_quote($weapon, '/') . '\s+(.+)$/iu', $rest, $match)) {
        return $name;
    }

    $finish = trim((string)$match[1]);
    if ($finish === '' || mb_strlen($finish) < 2) {
        return $name;
    }

    return trim($prefix . $weapon . ' | ' . $finish);
}

function aiChatExtractWearLabel(string $name): string
{
    $name = aiChatExpandWearAbbreviations($name);
    if (preg_match('/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)/iu', $name, $match)) {
        return (string)$match[1];
    }
    return '';
}

function aiChatStripWear(string $name): string
{
    $name = aiChatExpandWearAbbreviations(trim($name));
    return trim((string)preg_replace(
        '/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i',
        '',
        $name
    ));
}

function aiChatLooksLikePredictionQuestion(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }

    $patterns = [
        '/\b(will|would|could|going to|gonna)\b.*\b(go up|rise|increase|pump|moon|drop|fall|decline|crash|worth more|worth less|price)\b/u',
        '/\b(price|prices)\b.*\b(prediction|predict|forecast|outlook|trend|future|expect)\b/u',
        '/\b(predict|prediction|forecast|outlook)\b.*\b(price|prices|skin|item)\b/u',
        '/\bgo up in price\b/u',
        '/\b(items?|skins?|cases?)\b.*\b(go up|rise|increase|appreciate|gain)\b/u',
        '/\b(go up|rise|increase)\b.*\b(price|prices|value)\b/u',
        '/\bfuture prices?\b/u',
        '/\bshould i (buy|sell|hold)\b/u',
        '/\bgood (buy|investment|time to buy)\b/u',
        '/\b(invest|investment)\b.*\b(skin|item|case|sticker)\b/u',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $message)) {
            return true;
        }
    }

    return false;
}

function aiChatLooksLikeChartQuestion(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }

    $patterns = [
        '/\b(create|make|draw|show|generate|plot|render|display|give|build|pull|get)\b.*\b(chart|graph|plot)s?\b/u',
        '/\b(chart|graph|plot)s?\b.*\b(price|forecast|outlook|prediction|arima|trend|supply|listing|listings|stock|market|marketplace|history|distribution)\b/u',
        '/\b(price|forecast|outlook|prediction|arima|trend|supply|listing|listings|stock|distribution|history)\b.*\b(chart|graph|plot)s?\b/u',
        '/\b(a |the |me |my )?(chart|graph|plot)s?\b/u',
        '/\bvisuali[sz]e\b/u',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $message)) {
            return true;
        }
    }

    return false;
}

function aiChatLooksLikeAlternateChartRequest(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }

    return (bool)preg_match(
        '/\b(different|diffrent|difrent|another|other|new|next|else|switch|change|more)\b.{0,48}\b(chart|graph|plot)s?\b|\b(chart|graph|plot)s?\b.{0,48}\b(different|diffrent|difrent|another|other|new|next|else)\b|\b(show|create|make|give|build)\b.{0,24}\b(something else|another one|one more)\b/u',
        $message
    );
}

function aiChatThreadShownChartKinds(array $messages): array
{
    $shown = [
        'forecast' => false,
        'distribution' => false,
        'price_history' => false,
    ];

    foreach ($messages as $entry) {
        if (!is_array($entry) || ($entry['role'] ?? '') !== 'assistant') {
            continue;
        }
        $charts = is_array($entry['charts'] ?? null) ? $entry['charts'] : [];
        foreach (['forecast', 'distribution', 'price_history'] as $kind) {
            if (!empty($charts[$kind]) || !empty($entry[$kind])) {
                $shown[$kind] = true;
            }
        }
    }

    return $shown;
}

function aiChatShouldPreferAlternateCharts(string $userMessage, array $messages = []): bool
{
    return aiChatLooksLikeAlternateChartRequest($userMessage)
        || (
            aiChatLooksLikeChartQuestion($userMessage)
            && aiChatExtractSearchTerms($userMessage) === ''
            && aiChatFindItemTermFromMessages($messages) !== ''
        );
}

function aiChatLooksLikeAllChartsQuestion(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }

    $patterns = [
        '/\ball(?:\s+the)?\s+charts?\b/u',
        '/\bcharts?\b.*\b(all|every|each)\b/u',
        '/\b(every|each)\s+charts?\b/u',
        '/\b(create|make|show|generate|draw|render)\b.*\b(all|every)\b.*\bcharts?\b/u',
        '/\b(future|distribution|history).*\b(and|,).*\b(future|distribution|history)\b/u',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $message)) {
            return true;
        }
    }

    return false;
}

function aiChatRecentUserTexts(array $messages, int $limit = 8): array
{
    $out = [];
    foreach (array_reverse($messages) as $entry) {
        if (!is_array($entry) || ($entry['role'] ?? '') !== 'user') {
            continue;
        }
        $text = trim((string)($entry['content'] ?? ''));
        if ($text === '') {
            continue;
        }
        $out[] = $text;
        if (count($out) >= $limit) {
            break;
        }
    }
    return $out;
}

function aiChatThreadWantsAllCharts(array $messages): bool
{
    foreach (aiChatRecentUserTexts($messages) as $text) {
        if (aiChatLooksLikeAllChartsQuestion($text)) {
            return true;
        }
    }
    return false;
}

function aiChatThreadWantsAnyChart(array $messages): bool
{
    foreach (aiChatRecentUserTexts($messages) as $text) {
        if (
            aiChatLooksLikeAllChartsQuestion($text)
            || aiChatLooksLikeChartQuestion($text)
            || aiChatLooksLikeDistributionQuestion($text)
            || aiChatLooksLikePriceHistoryQuestion($text)
            || aiChatLooksLikePredictionQuestion($text)
        ) {
            return true;
        }
    }
    return false;
}

function aiChatShouldAttachDistribution(string $userMessage, array $messages = []): bool
{
    if (aiChatLooksLikeDistributionQuestion($userMessage) || aiChatLooksLikeAllChartsQuestion($userMessage)) {
        return true;
    }
    if (aiChatThreadWantsAllCharts($messages)) {
        return true;
    }
    // "Different/another chart" after a Future chart → show marketplace supply next.
    if (aiChatShouldPreferAlternateCharts($userMessage, $messages)) {
        $shown = aiChatThreadShownChartKinds($messages);
        if (empty($shown['distribution']) || aiChatLooksLikeAlternateChartRequest($userMessage)) {
            return true;
        }
    }
    // Generic chart asks include supply — unless this is clearly a Future/outlook-only request.
    if (aiChatLooksLikeChartQuestion($userMessage)) {
        if (aiChatLooksLikeForecastFocusedQuestion($userMessage)) {
            return false;
        }
        return true;
    }
    return false;
}

function aiChatShouldAttachPriceHistory(string $userMessage, array $messages = []): bool
{
    if (aiChatLooksLikePriceHistoryQuestion($userMessage) || aiChatLooksLikeAllChartsQuestion($userMessage)) {
        return true;
    }
    if (aiChatThreadWantsAllCharts($messages)) {
        return true;
    }
    if (aiChatShouldPreferAlternateCharts($userMessage, $messages)) {
        $shown = aiChatThreadShownChartKinds($messages);
        if (empty($shown['price_history']) || aiChatLooksLikeAlternateChartRequest($userMessage)) {
            return true;
        }
    }
    // Generic chart requests should also get multi-provider price history.
    if (aiChatLooksLikeChartQuestion($userMessage) && !aiChatLooksLikeDistributionOnlyQuestion($userMessage)) {
        if (aiChatLooksLikeForecastFocusedQuestion($userMessage)) {
            return false;
        }
        return true;
    }
    return false;
}

function aiChatShouldAttachForecast(string $userMessage, array $messages = []): bool
{
    if (aiChatLooksLikeAllChartsQuestion($userMessage) || aiChatThreadWantsAllCharts($messages)) {
        return true;
    }
    // Supply / marketplace-distribution asks should not force a Future chart.
    if (aiChatLooksLikeDistributionQuestion($userMessage) && !aiChatLooksLikePredictionQuestion($userMessage)) {
        return false;
    }
    // Portfolio / buy lists should not auto-chart a random trending case (Kilowatt filler).
    if (aiChatLooksLikeItemPickQuestion($userMessage) && !aiChatLooksLikeChartQuestion($userMessage)) {
        return false;
    }
    // "Different chart" after Future was already shown → prefer other chart types.
    if (aiChatLooksLikeAlternateChartRequest($userMessage)) {
        $shown = aiChatThreadShownChartKinds($messages);
        if (!empty($shown['forecast']) && (empty($shown['distribution']) || empty($shown['price_history']))) {
            return false;
        }
    }
    if (aiChatLooksLikePriceHistoryQuestion($userMessage) && !aiChatLooksLikeChartQuestion($userMessage)) {
        return false;
    }
    if (aiChatWantsForecastChart($userMessage)) {
        return true;
    }
    // Follow-up like "create it for the fracture case item" after a chart ask.
    return aiChatThreadWantsAnyChart($messages);
}

function aiChatLooksLikeDistributionOnlyQuestion(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '' || !aiChatLooksLikeDistributionQuestion($message)) {
        return false;
    }
    if (aiChatLooksLikePriceHistoryQuestion($message) || aiChatLooksLikePredictionQuestion($message)) {
        return false;
    }
    if (aiChatLooksLikeAllChartsQuestion($message)) {
        return false;
    }
    return (bool)preg_match(
        '/\b(supply|listing|listings|stock|distribution|marketplace|marketplaces|volumes?)\b/u',
        $message
    );
}

/** Future/outlook chart asks should not also build supply + multi-market history (slow). */
function aiChatLooksLikeForecastFocusedQuestion(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }
    if (aiChatLooksLikeAllChartsQuestion($message)) {
        return false;
    }
    if (aiChatLooksLikeDistributionQuestion($message) || aiChatLooksLikePriceHistoryQuestion($message)) {
        return false;
    }
    return (bool)preg_match(
        '/\b(future|outlook|forecast|prediction|predict|arima)\b/u',
        $message
    );
}

function aiChatLooksLikeDistributionQuestion(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }

    $patterns = [
        '/\bmarket\s+distribution\b/u',
        '/\blisting\s+(share|distribution|breakdown|volume|volumes|chart|graph)\b/u',
        '/\b(where|which)\b.*\b(listed|listings|marketplace|marketplaces)\b/u',
        '/\b(listings?|stock|supply|volumes?)\b.*\b(by|across|per|for|on|of|from)\b.*\b(market|markets|marketplace|marketplaces|site|sites|provider|providers)\b/u',
        '/\b(market|markets|marketplace|marketplaces|provider|providers)\b.*\b(listings?|stock|supply|volumes?|share|breakdown|distribution)\b/u',
        '/\b(marketplace|market)\b.*\b(share|breakdown|distribution|volume|volumes|supply)\b/u',
        '/\bdistribution\b.*\b(chart|graph|bar)\b/u',
        '/\b(chart|graph|bar)\b.*\bdistribution\b/u',
        '/\bsupply\s+(chart|graph|breakdown|compare|comparison)\b/u',
        '/\b(chart|graph)\b.*\bsupply\b/u',
        '/\bsupply\b.*\b(chart|graph)\b/u',
        '/\b(listings?|stock)\s+(chart|graph)\b/u',
        '/\b(chart|graph)\b.*\b(listings?|stock)\b/u',
        '/\b(different|various|each|every|all)\b.*\b(marketplace|marketplaces|market|markets|provider|providers)\b/u',
        '/\b(marketplace|marketplaces|markets?)\b.*\b(chart|graph|compare|comparison)\b/u',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $message)) {
            return true;
        }
    }

    return false;
}

function aiChatLooksLikePriceHistoryQuestion(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }

    // Explicit future/forecast wording should stay on the Future chart path.
    if (aiChatLooksLikePredictionQuestion($message) && !preg_match('/\b(history|historical|past)\b/u', $message)) {
        return false;
    }

    $patterns = [
        '/\bprice\s+history\b/u',
        '/\bhistorical\s+(price|prices|market)\b/u',
        '/\b(compare|comparison)\b.*\b(provider|providers|marketplace|marketplaces|steam|skinport|csfloat)\b/u',
        '/\b(provider|providers|marketplace|marketplaces)\b.*\b(history|chart|graph|over time|trend)\b/u',
        '/\b(30d|90d|180d|1y|30 day|90 day|year)\b.*\b(price|history|chart|graph)\b/u',
        '/\b(price|history)\b.*\b(30d|90d|180d|1y|chart|graph)\b/u',
        '/\bmulti[- ]?provider\b.*\b(chart|graph|history)\b/u',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $message)) {
            return true;
        }
    }

    return false;
}

function aiChatWantsForecastChart(string $message): bool
{
    if (aiChatLooksLikeDistributionQuestion($message)) {
        return false;
    }
    if (aiChatLooksLikePriceHistoryQuestion($message)) {
        return false;
    }
    if (aiChatLooksLikeItemPickQuestion($message) && !aiChatLooksLikeChartQuestion($message)) {
        return false;
    }

    return aiChatLooksLikePredictionQuestion($message)
        || aiChatLooksLikeChartQuestion($message)
        || aiChatLooksLikeBroadMarketQuestion($message);
}

function aiChatDetectHistoryRange(string $message): string
{
    $message = mb_strtolower($message);
    if (preg_match('/\b(30\s*d|30\s*day|1\s*m|1\s*month)\b/u', $message)) {
        return '30D';
    }
    if (preg_match('/\b(90\s*d|90\s*day|3\s*m|3\s*month)\b/u', $message)) {
        return '90D';
    }
    if (preg_match('/\b(180\s*d|180\s*day|6\s*m|6\s*month)\b/u', $message)) {
        return '180D';
    }
    if (preg_match('/\b(1\s*y|1\s*year|12\s*m|365)\b/u', $message)) {
        return '1Y';
    }
    return '1Y';
}

function aiChatMarketplacePalette(): array
{
    return [
        'Steam' => ['color' => '#6366f1', 'image' => 'assets/markets/steam.png'],
        'Skinport' => ['color' => '#22d3ee', 'image' => 'assets/markets/skinport.png'],
        'CSFloat' => ['color' => '#ec4899', 'image' => 'assets/markets/floatlogo.png?v=20260602'],
        'White.Market' => ['color' => '#84cc16', 'image' => 'assets/markets/whitemarket.webp?v=20260602'],
        'DMarket' => ['color' => '#facc15', 'image' => 'assets/markets/dmarket.png'],
        'Market.CSGO' => ['color' => '#22d3ee', 'image' => 'assets/markets/marketcsgo.png'],
        'ShadowPay' => ['color' => '#a855f7', 'image' => 'assets/markets/shadowpay.png'],
        'Waxpeer' => ['color' => '#eab308', 'image' => 'assets/markets/waxpeer.png'],
        'Mannco.store' => ['color' => '#f43f5e', 'image' => 'assets/markets/mannco.ico'],
        'HaloSkins' => ['color' => '#fb7185', 'image' => 'assets/markets/haloskins.png'],
        // Amber matches the lightning-bolt logo and MARKETPLACE_COLORS in item-page.tsx.
        'RapidSkins' => ['color' => '#fbbf24', 'image' => 'assets/markets/rapidskins.png'],
        'Buff.163' => ['color' => '#f97316', 'image' => 'assets/markets/buff.webp?v=2'],
        'CS.Money' => ['color' => '#fb7185', 'image' => 'assets/markets/csmoney.png'],
        'UUSkins' => ['color' => '#38bdf8', 'image' => 'assets/markets/uuskins.png?v=1'],
        'YouPin898' => ['color' => '#a78bfa', 'image' => 'assets/markets/youpin898.png?v=1'],
        'SkinSwap CN' => ['color' => '#14b8a6', 'image' => 'assets/markets/skinswap-cn.jfif?v=1'],
        'Ecosteam' => ['color' => '#4ade80', 'image' => 'assets/markets/ecosteam.jpg?v=1'],
        'Unknown' => ['color' => '#94a3b8', 'image' => ''],
        'Other' => ['color' => '#0e7490', 'image' => ''],
    ];
}

/**
 * Same marketplace set as item-page `buildDistributionChartRows`:
 * Steam + WEAR_TABLE_MARKETPLACES (not the wider MAIN_MARKETS table).
 *
 * @return list<string>
 */
function aiChatDistributionVisibleMarkets(): array
{
    return [
        'Steam',
        'Skinport',
        'CSFloat',
        'White.Market',
        'DMarket',
        'Market.CSGO',
        'ShadowPay',
        'Waxpeer',
        'Mannco.store',
        'HaloSkins',
    ];
}

/**
 * Listing / stock count from an item-page quote or price-index row.
 */
function aiChatSnapshotListingCount(?array $snap): int
{
    if (!is_array($snap)) {
        return 0;
    }

    foreach ([
        'listings',
        'sell_orders',
        'volume',
        'quantity',
        'qty',
        'similar_qty',
        'market_product_count',
        '_white_market_similar_qty',
    ] as $key) {
        if (!isset($snap[$key]) || !is_numeric($snap[$key])) {
            continue;
        }
        $count = (int)$snap[$key];
        if ($count > 0) {
            return $count;
        }
    }

    return 0;
}

function aiChatEnsureSteamListingHelpers(): void
{
    static $loaded = false;
    if ($loaded) {
        return;
    }
    $loaded = true;
    $path = __DIR__ . '/get_roi_prices_cached.php';
    if (is_file($path)) {
        require_once $path;
    }
}

/**
 * Steam listing stock only — never priceoverview 24h volume.
 */
function aiChatSteamListingCountFromSnapshot(?array $snap): int
{
    if (!is_array($snap)) {
        return 0;
    }
    if (function_exists('cachedSteamTrustedListingCount')) {
        $trusted = cachedSteamTrustedListingCount($snap);
        if ($trusted !== null && $trusted > 0) {
            return $trusted;
        }
    }
    foreach (['total_count', 'listings', 'sell_listings'] as $key) {
        if (!isset($snap[$key]) || !is_numeric($snap[$key])) {
            continue;
        }
        $source = strtolower(trim((string)($snap['listings_source'] ?? '')));
        if ($source === '' && $key !== 'total_count' && $key !== 'sell_listings') {
            continue;
        }
        $count = (int)$snap[$key];
        if ($count > 0) {
            return $count;
        }
    }
    return 0;
}

/**
 * Steam Market sell listings from the ROI catalog seed (same figure item-page
 * uses when the live listing scrape has not written sell_orders yet).
 */
function aiChatSteamCatalogListingCount(string $name): int
{
    $name = trim($name);
    if ($name === '') {
        return 0;
    }

    $path = __DIR__ . '/assets/steam-market-cache/roi_catalog.json';
    if (!is_file($path)) {
        return 0;
    }

    static $catalogRaw = null;
    if ($catalogRaw === null) {
        $catalogRaw = is_file($path) ? (string)@file_get_contents($path) : '';
    }
    $raw = $catalogRaw;
    if ($raw === '') {
        return 0;
    }

    $needles = [
        '"market_hash_name":' . json_encode($name, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        '"market_hash_name": "' . $name . '"',
    ];
    $pos = false;
    foreach ($needles as $needle) {
        $pos = strpos($raw, $needle);
        if ($pos !== false) {
            break;
        }
    }
    if ($pos === false) {
        return 0;
    }

    $chunk = substr($raw, $pos, 1600);
    if (preg_match('/"seed_sell_listings"\s*:\s*(\d+)/', $chunk, $match)) {
        return (int)$match[1];
    }
    if (preg_match('/"sell_listings"\s*:\s*(\d+)/', $chunk, $match)) {
        return (int)$match[1];
    }

    return 0;
}

/**
 * Replace Steam 24h volume with current Market listing total_count.
 *
 * @param array<string, array{marketplace:string,volume:int,avg_price:?float,source:string}> $byMarket
 */
function aiChatRefreshSteamListingCount(array &$byMarket, string $name, ?array $steamSnap): void
{
    $name = trim($name);
    if ($name === '') {
        return;
    }

    $current = (int)($byMarket['Steam']['volume'] ?? 0);
    $fetchedAt = is_array($steamSnap) ? (int)($steamSnap['listings_fetched_at'] ?? 0) : 0;
    $listingsSource = is_array($steamSnap)
        ? strtolower(trim((string)($steamSnap['listings_source'] ?? '')))
        : '';
    $freshLive = $fetchedAt > 0
        && (time() - $fetchedAt) < 6 * 3600
        && in_array($listingsSource, ['steam_total_count', 'search_sell_listings', 'c_sell_listings'], true)
        && $current > 0;
    if ($freshLive) {
        return;
    }

    aiChatEnsureSteamListingHelpers();
    if (!function_exists('cachedLiveFetchSteamListingTotalCount')) {
        return;
    }

    try {
        $live = cachedLiveFetchSteamListingTotalCount($name);
    } catch (Throwable) {
        $live = null;
    }
    if (!is_array($live) || (int)($live['count'] ?? 0) <= 0) {
        if ($current <= 0) {
            $seed = aiChatSteamCatalogListingCount($name);
            if ($seed > 0) {
                $byMarket['Steam'] = [
                    'marketplace' => 'Steam',
                    'volume' => $seed,
                    'avg_price' => $byMarket['Steam']['avg_price'] ?? null,
                    'source' => 'steam_catalog',
                ];
            }
        }
        return;
    }

    $count = (int)$live['count'];
    $liveSource = (string)($live['source'] ?? 'steam_total_count');
    $byMarket['Steam'] = [
        'marketplace' => 'Steam',
        'volume' => $count,
        'avg_price' => $byMarket['Steam']['avg_price'] ?? (is_array($steamSnap) ? ($steamSnap['current_price'] ?? null) : null),
        'source' => $liveSource,
    ];
    if (function_exists('cachedPersistSteamListingCount')) {
        try {
            cachedPersistSteamListingCount($name, $count, $liveSource);
        } catch (Throwable) {
            // File persist is best-effort.
        }
    }
}

/**
 * Skinport catalog "X items" — never /v1/items quantity.
 */
function aiChatSkinportListingCountFromSnapshot(?array $snap): int
{
    if (!is_array($snap)) {
        return 0;
    }
    if (function_exists('cachedSkinportListingCountFromRow')) {
        $trusted = cachedSkinportListingCountFromRow($snap);
        if ($trusted !== null && $trusted > 0) {
            return $trusted;
        }
    }
    $source = strtolower(trim((string)($snap['listings_source'] ?? '')));
    if (!in_array($source, ['item_menus_listings', 'filter_total', 'other_sales_total'], true)) {
        return 0;
    }
    foreach (['listings', 'items', 'total', 'sell_orders'] as $key) {
        if (isset($snap[$key]) && is_numeric($snap[$key]) && (int)$snap[$key] > 0) {
            return (int)$snap[$key];
        }
    }
    return 0;
}

/**
 * Replace Skinport /v1/items quantity with the catalog header item count.
 *
 * @param array<string, array{marketplace:string,volume:int,avg_price:?float,source:string}> $byMarket
 */
function aiChatRefreshSkinportListingCount(array &$byMarket, string $name, ?array $skinportSnap, array $indexRow = []): void
{
    $name = trim($name);
    if ($name === '') {
        return;
    }

    $current = (int)($byMarket['Skinport']['volume'] ?? 0);
    $fetchedAt = is_array($skinportSnap) ? (int)($skinportSnap['listings_fetched_at'] ?? 0) : 0;
    $listingsSource = is_array($skinportSnap)
        ? strtolower(trim((string)($skinportSnap['listings_source'] ?? '')))
        : '';
    $freshLive = $fetchedAt > 0
        && (time() - $fetchedAt) < 6 * 3600
        && in_array($listingsSource, ['item_menus_listings', 'filter_total', 'other_sales_total'], true)
        && $current > 0;
    if ($freshLive) {
        return;
    }

    aiChatEnsureSteamListingHelpers();
    $countsPath = __DIR__ . '/assets/skinport-cache/listing_counts.json';
    if (is_file($countsPath)) {
        $countsFile = json_decode((string)@file_get_contents($countsPath), true);
        $mapped = is_array($countsFile['map'][$name] ?? null) ? $countsFile['map'][$name] : null;
        $mappedCount = is_array($mapped) ? (int)($mapped['listings'] ?? 0) : 0;
        $mappedAt = is_array($mapped) ? (int)($mapped['fetched_at'] ?? 0) : 0;
        if ($mappedCount > 0 && $mappedAt > 0 && (time() - $mappedAt) < 6 * 3600) {
            $byMarket['Skinport'] = [
                'marketplace' => 'Skinport',
                'volume' => $mappedCount,
                'avg_price' => $byMarket['Skinport']['avg_price'] ?? ($indexRow['min_price'] ?? null),
                'source' => (string)($mapped['source'] ?? 'item_menus_listings'),
            ];
            return;
        }
    }
    $fromIndex = function_exists('cachedSkinportListingCountFromRow')
        ? cachedSkinportListingCountFromRow($indexRow)
        : null;
    if ($fromIndex !== null && $fromIndex > 0) {
        $byMarket['Skinport'] = [
            'marketplace' => 'Skinport',
            'volume' => $fromIndex,
            'avg_price' => $byMarket['Skinport']['avg_price'] ?? ($indexRow['min_price'] ?? null),
            'source' => (string)($indexRow['listings_source'] ?? 'item_menus_listings'),
        ];
        return;
    }

    if (!function_exists('cachedLiveFetchSkinportListingTotal')) {
        return;
    }

    try {
        $live = cachedLiveFetchSkinportListingTotal($name, $indexRow);
    } catch (Throwable) {
        $live = null;
    }
    if (!is_array($live) || (int)($live['count'] ?? 0) <= 0) {
        return;
    }

    $count = (int)$live['count'];
    $liveSource = (string)($live['source'] ?? 'item_menus_listings');
    $byMarket['Skinport'] = [
        'marketplace' => 'Skinport',
        'volume' => $count,
        'avg_price' => $byMarket['Skinport']['avg_price']
            ?? (is_array($skinportSnap) ? ($skinportSnap['current_price'] ?? null) : null)
            ?? ($indexRow['min_price'] ?? null),
        'source' => $liveSource,
    ];
    if (function_exists('cachedPersistSkinportListingCount')) {
        try {
            cachedPersistSkinportListingCount($name, $count, $liveSource);
        } catch (Throwable) {
            // File persist is best-effort.
        }
    }
}

function aiChatBundleSeriesLabel(string $key): string
{
    $map = [
        'steam' => 'Steam',
        'skinport' => 'Skinport',
        'csfloat' => 'CSFloat',
        'white_market' => 'White.Market',
        'dmarket' => 'DMarket',
        'market_csgo' => 'Market.CSGO',
        'shadowpay' => 'ShadowPay',
        'waxpeer' => 'Waxpeer',
        'mannco' => 'Mannco.store',
        'haloskins' => 'HaloSkins',
    ];
    return $map[$key] ?? ucwords(str_replace('_', ' ', $key));
}

function aiChatLocalJsonUrl(string $relative): string
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ((int)($_SERVER['SERVER_PORT'] ?? 80) === 443);
    $scheme = $https ? 'https' : 'http';
    $host = (string)($_SERVER['HTTP_HOST'] ?? '127.0.0.1');
    $scriptDir = str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/csgo_price_tracker/chat.php')));
    $base = rtrim($scriptDir, '/');
    return $scheme . '://' . $host . $base . '/' . ltrim($relative, '/');
}

function aiChatFetchLocalJson(string $relativeUrl): ?array
{
    $relativeUrl = ltrim($relativeUrl, '/');
    $query = [];
    $path = $relativeUrl;
    if (str_contains($relativeUrl, '?')) {
        [$path, $qs] = explode('?', $relativeUrl, 2);
        parse_str($qs, $query);
    }

    if ($path === 'get_distribution.php') {
        $direct = aiChatQueryDistributionData(
            (string)($query['lookup_name'] ?? ''),
            (string)($query['range'] ?? '1Y')
        );
        if (is_array($direct)) {
            return $direct;
        }
    }

    if ($path === 'get_market_chart_bundle.php') {
        $direct = aiChatQueryMarketChartBundle(
            (string)($query['lookup_name'] ?? ''),
            (string)($query['range'] ?? '1Y')
        );
        if (is_array($direct)) {
            return $direct;
        }
    }

    $hosts = [];
    $configured = (string)($_SERVER['HTTP_HOST'] ?? '');
    if ($configured !== '') {
        $hosts[] = $configured;
    }
    $hosts[] = '127.0.0.1';
    $hosts[] = 'localhost';
    $hosts = array_values(array_unique($hosts));

    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ((int)($_SERVER['SERVER_PORT'] ?? 80) === 443);
    $scheme = $https ? 'https' : 'http';
    $scriptDir = str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/csgo_price_tracker/chat.php')));
    $base = rtrim($scriptDir, '/');

    foreach ($hosts as $host) {
        $url = $scheme . '://' . $host . $base . '/' . $relativeUrl;
        if (!function_exists('curl_init')) {
            $raw = @file_get_contents($url);
            if (!is_string($raw) || $raw === '') {
                continue;
            }
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return $decoded;
            }
            continue;
        }

        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ]);
        $raw = curl_exec($curl);
        $status = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
        if (!is_string($raw) || $raw === '' || $status >= 400) {
            continue;
        }
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }

    return null;
}

function aiChatQueryDistributionData(string $lookupName, string $range = '1Y'): ?array
{
    $lookupName = trim($lookupName);
    if ($lookupName === '' || !function_exists('marketHistoryPdoConnection')) {
        return null;
    }

    try {
        $connection = marketHistoryPdoConnection();
        $driver = function_exists('pdoDriverName') ? pdoDriverName($connection) : 'mysql';
        $itemId = resolveDataDbItemId($connection, 1, $lookupName);
        if ($itemId <= 0) {
            return null;
        }

        $range = strtoupper(trim($range));
        $days = match ($range) {
            '1M', '30D' => 30,
            '6M', '90D', '180D' => 180,
            default => 365,
        };

        if (!function_exists('dbColumnExists') || !dbColumnExists($connection, 'price_history', 'source')) {
            return null;
        }

        $where = implode(' AND ', [
            'item_id = :item_id',
            'recorded_at >= ' . dbDaysAgoSql($days, $driver),
        ]);

        $totalStatement = $connection->prepare(
            "SELECT COALESCE(SUM(volume), 0) AS total
             FROM price_history
             WHERE {$where}"
        );
        $totalStatement->execute([':item_id' => $itemId]);
        $total = (int)$totalStatement->fetchColumn();
        if ($total <= 0) {
            return ['total' => 0, 'data' => []];
        }

        $avgExpr = $driver === 'pgsql'
            ? 'ROUND(AVG(price)::numeric, 2)'
            : 'ROUND(AVG(price), 2)';

        $statement = $connection->prepare(
            "SELECT
                source AS marketplace,
                COALESCE(SUM(volume), 0) AS volume,
                {$avgExpr} AS avg_price
             FROM price_history
             WHERE {$where}
             GROUP BY source
             ORDER BY volume DESC"
        );
        $statement->execute([':item_id' => $itemId]);

        $data = [];
        foreach ($statement->fetchAll() as $row) {
            $volume = (int)$row['volume'];
            if ($volume <= 0) {
                continue;
            }
            $data[] = [
                'marketplace' => (string)$row['marketplace'],
                'volume' => $volume,
                'pct' => round(($volume / $total) * 100, 2),
                'avg_price' => (float)$row['avg_price'],
            ];
        }

        return ['total' => $total, 'data' => $data];
    } catch (Throwable $error) {
        return null;
    }
}

function aiChatQueryMarketChartBundle(string $lookupName, string $range = '1Y'): ?array
{
    $lookupName = trim($lookupName);
    if ($lookupName === '') {
        return null;
    }

    try {
        if (!defined('MARKET_CHART_BUNDLE_LIB_ONLY')) {
            define('MARKET_CHART_BUNDLE_LIB_ONLY', true);
        }
        require_once __DIR__ . '/get_market_chart_bundle.php';
        if (!function_exists('marketChartBuildBundlePayload')) {
            return null;
        }
        $payload = marketChartBuildBundlePayload([
            'lookup_name' => $lookupName,
            'range' => strtoupper(trim($range)) ?: '1Y',
            'source' => 'all',
        ]);
        return is_array($payload) ? $payload : null;
    } catch (Throwable $error) {
        return null;
    }
}

function aiChatNormalizeMarketplaceLabel(string $raw): string
{
    $trim = trim($raw);
    if ($trim === '') {
        return '';
    }

    $key = strtolower((string)preg_replace('/[^a-zA-Z0-9]+/', '_', $trim));
    $key = trim($key, '_');
    $map = [
        'steam' => 'Steam',
        'steammarket' => 'Steam',
        'steam_market' => 'Steam',
        'skinport' => 'Skinport',
        'csfloat' => 'CSFloat',
        'cs_float' => 'CSFloat',
        'float' => 'CSFloat',
        'white_market' => 'White.Market',
        'whitemarket' => 'White.Market',
        'dmarket' => 'DMarket',
        'market_csgo' => 'Market.CSGO',
        'marketcsgo' => 'Market.CSGO',
        'shadowpay' => 'ShadowPay',
        'waxpeer' => 'Waxpeer',
        'mannco' => 'Mannco.store',
        'mannco_store' => 'Mannco.store',
        'haloskins' => 'HaloSkins',
        'halo_skins' => 'HaloSkins',
        'buff163' => 'Buff.163',
        'buff_163' => 'Buff.163',
        'buff' => 'Buff.163',
        'cs_money' => 'CS.Money',
        'csmoney' => 'CS.Money',
        'uuskins' => 'UUSkins',
        'uu_skins' => 'UUSkins',
        'youpin898' => 'YouPin898',
        'youpin' => 'YouPin898',
        'you_pin898' => 'YouPin898',
        'skinswap_cn' => 'SkinSwap CN',
        'skinswapcn' => 'SkinSwap CN',
        'ecosteam' => 'Ecosteam',
        'other' => 'Other',
    ];

    if (isset($map[$key])) {
        return $map[$key];
    }

    $palette = aiChatMarketplacePalette();
    foreach (array_keys($palette) as $label) {
        if (strcasecmp((string)$label, $trim) === 0) {
            return (string)$label;
        }
    }

    return $trim;
}

/**
 * Drop Steam-scaled synthetic listing counts that make every bar identical.
 * When 3+ markets share the exact same volume, keep Steam only for that cluster.
 * Also drop any non-Steam row that exactly mirrors Steam's volume.
 *
 * @param list<array{marketplace:string,volume:int,avg_price?:float|null}>|array<string,array{marketplace:string,volume:int,avg_price?:float|null}> $rows
 * @return list<array{marketplace:string,volume:int,avg_price?:float|null}>
 */
function aiChatFilterDistinctListingVolumes(array $rows): array
{
    $list = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $name = trim((string)($row['marketplace'] ?? ''));
        $volume = (int)($row['volume'] ?? 0);
        if ($name === '' || $name === 'Other' || $volume <= 0) {
            continue;
        }
        $list[] = [
            'marketplace' => $name,
            'volume' => $volume,
            'avg_price' => isset($row['avg_price']) && is_numeric($row['avg_price']) && (float)$row['avg_price'] > 0
                ? (float)$row['avg_price']
                : null,
        ];
    }

    if (count($list) < 2) {
        return $list;
    }

    $volumeCounts = [];
    $steamVolume = 0;
    foreach ($list as $row) {
        $volumeCounts[(string)$row['volume']] = ($volumeCounts[(string)$row['volume']] ?? 0) + 1;
        if (strcasecmp($row['marketplace'], 'Steam') === 0) {
            $steamVolume = (int)$row['volume'];
        }
    }

    $filtered = [];
    foreach ($list as $row) {
        $volume = (int)$row['volume'];
        $cloneCluster = ($volumeCounts[(string)$volume] ?? 0) >= 3;
        $mirrorsSteam = $steamVolume > 0
            && $volume === $steamVolume
            && strcasecmp($row['marketplace'], 'Steam') !== 0;
        if ($cloneCluster && strcasecmp($row['marketplace'], 'Steam') !== 0) {
            continue;
        }
        if ($mirrorsSteam) {
            continue;
        }
        $filtered[] = $row;
    }

    // Never return an empty chart if we over-filtered.
    return $filtered ?: $list;
}

/**
 * Listing volumes for every marketplace present in the market-chart bundle.
 * Uses current listing counts (same providers as Price History).
 *
 * @return list<array{marketplace:string,volume:int,avg_price:float|null}>
 */
function aiChatDistributionRowsFromBundle(string $lookupName, string $range = '1Y'): array
{
    $bundle = aiChatQueryMarketChartBundle($lookupName, $range);
    if (!is_array($bundle)) {
        return [];
    }

    $collect = static function (array $candidates): array {
        $byName = [];
        foreach ($candidates as $row) {
            if (!is_array($row)) {
                continue;
            }
            $name = (string)($row['marketplace'] ?? '');
            $volume = (int)($row['volume'] ?? 0);
            // Keep every marketplace with any listing count (including 1).
            if ($name === '' || $name === 'Other' || $volume <= 0) {
                continue;
            }
            $avg = isset($row['avg_price']) ? (float)$row['avg_price'] : null;
            if (!isset($byName[$name]) || $volume > (int)$byName[$name]['volume']) {
                $byName[$name] = [
                    'marketplace' => $name,
                    'volume' => $volume,
                    'avg_price' => ($avg !== null && $avg > 0) ? $avg : null,
                ];
            }
        }
        return array_values($byName);
    };

    $seriesRows = [];
    $series = is_array($bundle['series'] ?? null) ? $bundle['series'] : [];
    foreach ($series as $key => $entry) {
        if (!is_array($entry) || (string)$key === 'all') {
            continue;
        }
        $label = aiChatNormalizeMarketplaceLabel(
            trim((string)($entry['label'] ?? '')) ?: aiChatBundleSeriesLabel((string)$key)
        );
        if ($label === '' || $label === 'Other') {
            continue;
        }

        $volume = (int)($entry['current_volume'] ?? 0);
        if ($volume <= 0) {
            $points = is_array($entry['points'] ?? null) ? $entry['points'] : [];
            if ($points) {
                $last = $points[count($points) - 1];
                if (is_array($last)) {
                    $volume = (int)($last['volume'] ?? 0);
                }
            }
        }
        $avg = isset($entry['current_price']) ? (float)$entry['current_price'] : null;
        if ($avg !== null && $avg <= 0) {
            $avg = null;
        }
        $seriesRows[] = [
            'marketplace' => $label,
            'volume' => $volume,
            'avg_price' => $avg,
        ];
    }

    $cardRows = [];
    $cards = is_array($bundle['snapshot_cards'] ?? null) ? $bundle['snapshot_cards'] : [];
    foreach ($cards as $card) {
        if (!is_array($card)) {
            continue;
        }
        $label = aiChatNormalizeMarketplaceLabel((string)($card['label'] ?? $card['id'] ?? ''));
        $volume = (int)($card['volume'] ?? 0);
        $avg = isset($card['price']) ? (float)$card['price'] : null;
        $cardRows[] = [
            'marketplace' => $label,
            'volume' => $volume,
            'avg_price' => ($avg !== null && $avg > 0) ? $avg : null,
        ];
    }

    $seriesClean = aiChatFilterDistinctListingVolumes($collect($seriesRows));
    $cardsClean = aiChatFilterDistinctListingVolumes($collect($cardRows));

    // Prefer the source with more distinct marketplace volumes.
    if (count($cardsClean) > count($seriesClean)) {
        return $cardsClean;
    }
    if (count($seriesClean) >= 2) {
        return $seriesClean;
    }

    return aiChatFilterDistinctListingVolumes($collect(array_merge($seriesClean, $cardsClean)));
}

/**
 * Current listing stock per marketplace for this exact item/wear.
 * Same sources the rest of the site uses: marketplace_price_cache + roi_prices.sell_orders.
 * Does not invent counts or mix other wears into the named variant.
 *
 * @return array<string, array{marketplace:string,volume:int,avg_price:?float,source:string}>
 */
function aiChatListingShareRowsFromLiveCaches(string $lookupName): array
{
    $name = trim($lookupName);
    if ($name === '') {
        return [];
    }

    $byMarket = [];
    $upsert = static function (array &$byMarket, string $rawName, int $volume, mixed $avg, string $source): void {
        $label = aiChatNormalizeMarketplaceLabel($rawName);
        if ($label === '' || $label === 'Other' || $volume <= 0) {
            return;
        }
        $avgPrice = is_numeric($avg) && (float)$avg > 0 ? (float)$avg : null;
        if (!isset($byMarket[$label])) {
            $byMarket[$label] = [
                'marketplace' => $label,
                'volume' => $volume,
                'avg_price' => $avgPrice,
                'source' => $source,
            ];
            return;
        }
        if ($volume > (int)$byMarket[$label]['volume']) {
            $byMarket[$label]['volume'] = $volume;
            $byMarket[$label]['source'] = $source;
        }
        if ($byMarket[$label]['avg_price'] === null && $avgPrice !== null) {
            $byMarket[$label]['avg_price'] = $avgPrice;
        }
    };

    $connections = [];
    try {
        $connections[] = dbPdoConnection('db');
    } catch (Throwable) {
        // Local MySQL is optional.
    }
    try {
        $hist = marketHistoryPdoConnection();
        $already = false;
        foreach ($connections as $existing) {
            if ($existing === $hist) {
                $already = true;
                break;
            }
        }
        if (!$already) {
            $connections[] = $hist;
        }
    } catch (Throwable) {
        // History DB is optional.
    }

    foreach ($connections as $pdo) {
        if (!($pdo instanceof PDO)) {
            continue;
        }
        try {
            if (!function_exists('dbTableExists') || !dbTableExists($pdo, 'marketplace_price_cache')) {
                continue;
            }
            $stmt = $pdo->prepare(
                'SELECT marketplace, listings, price
                 FROM marketplace_price_cache
                 WHERE market_hash_name = ?
                   AND listings IS NOT NULL
                   AND listings > 0'
            );
            $stmt->execute([$name]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
                $label = aiChatNormalizeMarketplaceLabel((string)($row['marketplace'] ?? ''));
                if (strcasecmp($label, 'Steam') === 0) {
                    continue;
                }
                $upsert(
                    $byMarket,
                    (string)($row['marketplace'] ?? ''),
                    (int)($row['listings'] ?? 0),
                    $row['price'] ?? null,
                    'cache'
                );
            }
        } catch (Throwable) {
            // Try the next connection.
        }
    }

    foreach ($connections as $pdo) {
        if (!($pdo instanceof PDO)) {
            continue;
        }
        try {
            if (!function_exists('dbTableExists') || !dbTableExists($pdo, 'roi_prices')) {
                continue;
            }
            $stmt = $pdo->prepare(
                'SELECT source, sell_orders, current_price
                 FROM roi_prices
                 WHERE market_hash_name = ?
                   AND sell_orders IS NOT NULL
                   AND sell_orders > 0'
            );
            $stmt->execute([$name]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
                $label = aiChatNormalizeMarketplaceLabel((string)($row['source'] ?? ''));
                if (strcasecmp($label, 'Steam') === 0) {
                    continue;
                }
                $upsert(
                    $byMarket,
                    (string)($row['source'] ?? ''),
                    (int)($row['sell_orders'] ?? 0),
                    $row['current_price'] ?? null,
                    'roi_prices'
                );
            }
        } catch (Throwable) {
            // Try the next connection.
        }
    }

    $hash = md5($name);
    $readJson = static function (string $path): ?array {
        if (!is_file($path)) {
            return null;
        }
        $decoded = json_decode((string)@file_get_contents($path), true);
        return is_array($decoded) ? $decoded : null;
    };
    $missing = static function (array $byMarket, string $label): bool {
        return !isset($byMarket[$label]) || (int)$byMarket[$label]['volume'] <= 0;
    };

    // Same on-disk snapshots the item-page quote endpoints read.
    try {
        $csfloat = $readJson(__DIR__ . '/assets/csfloat-cache/' . $hash . '.json');
        if (is_array($csfloat) && empty($csfloat['_no_listing'])) {
            $upsert(
                $byMarket,
                'CSFloat',
                aiChatSnapshotListingCount($csfloat),
                $csfloat['current_price'] ?? null,
                'csfloat_cache'
            );
        }
        if ($missing($byMarket, 'CSFloat')) {
            $indexFile = $readJson(__DIR__ . '/assets/csfloat-cache/_price_list_index.json');
            $map = is_array($indexFile['map'] ?? null) ? $indexFile['map'] : [];
            $row = is_array($map[$name] ?? null) ? $map[$name] : null;
            if ($row) {
                $upsert(
                    $byMarket,
                    'CSFloat',
                    (int)($row['quantity'] ?? 0),
                    null,
                    'csfloat_index'
                );
            }
        }
    } catch (Throwable) {
        // CSFloat cache is optional.
    }

    try {
        $steam = $readJson(__DIR__ . '/assets/roi-price-cache/steam_' . $hash . '.json');
        $steamCount = aiChatSteamListingCountFromSnapshot(is_array($steam) ? $steam : null);
        if ($steamCount > 0) {
            $upsert(
                $byMarket,
                'Steam',
                $steamCount,
                $steam['current_price'] ?? null,
                'steam_file'
            );
        }
        if ($missing($byMarket, 'Steam')) {
            $seed = aiChatSteamCatalogListingCount($name);
            if ($seed > 0) {
                $upsert($byMarket, 'Steam', $seed, null, 'steam_catalog');
            }
        }
        aiChatRefreshSteamListingCount($byMarket, $name, is_array($steam) ? $steam : null);
    } catch (Throwable) {
        // Steam file cache is optional.
    }

    try {
        $skinport = $readJson(__DIR__ . '/assets/roi-price-cache/skinport_' . $hash . '.json');
        $spIndex = $readJson(__DIR__ . '/assets/skinport-cache/items_index.json');
        $spRow = is_array($spIndex['items'][$name] ?? null) ? $spIndex['items'][$name] : null;
        $spCount = aiChatSkinportListingCountFromSnapshot(is_array($skinport) ? $skinport : null);
        if ($spCount <= 0 && is_array($spRow)) {
            $spCount = aiChatSkinportListingCountFromSnapshot($spRow);
        }
        if ($spCount > 0) {
            $upsert(
                $byMarket,
                'Skinport',
                $spCount,
                is_array($skinport) ? ($skinport['current_price'] ?? null) : ($spRow['min_price'] ?? null),
                'skinport_listings'
            );
        }
        aiChatRefreshSkinportListingCount(
            $byMarket,
            $name,
            is_array($skinport) ? $skinport : null,
            is_array($spRow) ? $spRow : []
        );
    } catch (Throwable) {
        // Skinport file cache is optional.
    }

    try {
        $wmQuote = $readJson(__DIR__ . '/assets/white-market-cache/' . $hash . '_quote.json');
        if (is_array($wmQuote)) {
            $upsert(
                $byMarket,
                'White.Market',
                aiChatSnapshotListingCount($wmQuote),
                $wmQuote['current_price'] ?? null,
                'white_market_quote'
            );
        }
        $wmRoi = $readJson(__DIR__ . '/assets/roi-price-cache/white_market_' . $hash . '.json');
        if (is_array($wmRoi)) {
            $upsert(
                $byMarket,
                'White.Market',
                aiChatSnapshotListingCount($wmRoi),
                $wmRoi['current_price'] ?? null,
                'white_market_file'
            );
        }
    } catch (Throwable) {
        // White.Market file cache is optional.
    }

    try {
        $dmarket = $readJson(__DIR__ . '/assets/dmarket-cache/' . $hash . '.json');
        if (is_array($dmarket) && empty($dmarket['_no_listing'])) {
            $upsert(
                $byMarket,
                'DMarket',
                aiChatSnapshotListingCount($dmarket),
                $dmarket['current_price'] ?? null,
                'dmarket_cache'
            );
        }
    } catch (Throwable) {
        // DMarket file cache is optional.
    }

    try {
        $halo = $readJson(__DIR__ . '/assets/haloskins-cache/' . $hash . '_quote.json');
        if (is_array($halo)) {
            $upsert(
                $byMarket,
                'HaloSkins',
                aiChatSnapshotListingCount($halo),
                $halo['current_price'] ?? $halo['price'] ?? null,
                'haloskins_quote'
            );
        }
    } catch (Throwable) {
        // HaloSkins file cache is optional.
    }

    $priceIndexes = [
        ['Market.CSGO', __DIR__ . '/assets/market-csgo-cache/prices_eur.json', 'market_csgo_index'],
        ['ShadowPay', __DIR__ . '/assets/shadowpay-cache/prices_eur.json', 'shadowpay_index'],
        ['Waxpeer', __DIR__ . '/assets/waxpeer-cache/prices_csgo.json', 'waxpeer_index'],
        ['Mannco.store', __DIR__ . '/assets/mannco-cache/prices_csgo.json', 'mannco_index'],
    ];
    foreach ($priceIndexes as [$label, $path, $source]) {
        if (!$missing($byMarket, $label)) {
            continue;
        }
        try {
            $decoded = $readJson($path);
            $entry = is_array($decoded['index'][$name] ?? null) ? $decoded['index'][$name] : null;
            if (!is_array($entry)) {
                continue;
            }
            $upsert(
                $byMarket,
                $label,
                aiChatSnapshotListingCount($entry),
                $entry['price'] ?? null,
                $source
            );
        } catch (Throwable) {
            // Price indexes are optional.
        }
    }

    // Remaining ROI file caches (same naming as get_market_chart_bundle).
    $extraRoiFiles = [
        'dmarket' => 'DMarket',
        'market_csgo' => 'Market.CSGO',
        'shadowpay' => 'ShadowPay',
        'waxpeer' => 'Waxpeer',
        'mannco' => 'Mannco.store',
        'haloskins' => 'HaloSkins',
        'buff' => 'Buff.163',
        'buff163' => 'Buff.163',
        'cs_money' => 'CS.Money',
        'csmoney' => 'CS.Money',
        'uuskins' => 'UUSkins',
        'youpin898' => 'YouPin898',
        'skinswap_cn' => 'SkinSwap CN',
        'ecosteam' => 'Ecosteam',
    ];
    foreach ($extraRoiFiles as $sourceKey => $label) {
        try {
            $path = __DIR__ . '/assets/roi-price-cache/' . $sourceKey . '_' . $hash . '.json';
            $snap = $readJson($path);
            if (!is_array($snap)) {
                continue;
            }
            $upsert(
                $byMarket,
                $label,
                aiChatSnapshotListingCount($snap),
                $snap['current_price'] ?? null,
                $sourceKey . '_file'
            );
        } catch (Throwable) {
            // Extra ROI files are optional.
        }
    }

    // Remaining marketplaces: same quote helpers the item page uses, cache-only.
    try {
        aiChatEnsureListingUrlHelpers();
        $dmarketPath = __DIR__ . '/dmarket_helpers.php';
        if (is_file($dmarketPath)) {
            require_once $dmarketPath;
        }
        $cfg = function_exists('appConfig') ? appConfig() : [];
        $providers = [
            ['Waxpeer', 'waxpeerFetchQuotes', is_array($cfg['waxpeer'] ?? null) ? $cfg['waxpeer'] : []],
            ['Mannco.store', 'manncoFetchQuotes', is_array($cfg['mannco'] ?? null) ? $cfg['mannco'] : []],
            ['ShadowPay', 'shadowpayFetchQuotes', is_array($cfg['shadowpay'] ?? null) ? $cfg['shadowpay'] : []],
            ['HaloSkins', 'haloskinsFetchQuotes', is_array($cfg['haloskins'] ?? null) ? $cfg['haloskins'] : []],
            ['Market.CSGO', 'marketCsgoFetchQuotes', is_array($cfg['market_csgo'] ?? null) ? $cfg['market_csgo'] : []],
            ['DMarket', 'dmarketFetchQuotes', is_array($cfg['dmarket'] ?? null) ? $cfg['dmarket'] : []],
        ];
        foreach ($providers as [$label, $fn, $providerCfg]) {
            if (!$missing($byMarket, $label)) {
                continue;
            }
            if (!is_string($fn) || !function_exists($fn)) {
                continue;
            }
            $quotes = $fn([$name], $providerCfg, ['cache_only' => true]);
            $quote = is_array($quotes[$name] ?? null) ? $quotes[$name] : null;
            if (!is_array($quote)) {
                continue;
            }
            $listings = aiChatSnapshotListingCount($quote);
            $upsert(
                $byMarket,
                $label,
                $listings,
                $quote['current_price'] ?? null,
                'provider_cache'
            );
        }
    } catch (Throwable) {
        // Provider caches are optional.
    }

    return aiChatOverlayFreshBulkIndexCounts($byMarket, $name);
}

/**
 * Prefer current bulk-index listing counts over stale per-item quote files.
 * Indexes cover the whole catalog from a single marketplace API call.
 *
 * @param array<string, array{marketplace:string,volume:int,avg_price:?float,source:string}> $byMarket
 * @return array<string, array{marketplace:string,volume:int,avg_price:?float,source:string}>
 */
function aiChatOverlayFreshBulkIndexCounts(array $byMarket, string $name): array
{
    $name = trim($name);
    if ($name === '') {
        return $byMarket;
    }

    $maxAge = 6 * 3600;
    $now = time();
    $readJson = static function (string $path): ?array {
        if (!is_file($path)) {
            return null;
        }
        $decoded = json_decode((string)@file_get_contents($path), true);
        return is_array($decoded) ? $decoded : null;
    };
    $apply = static function (array &$byMarket, string $label, int $volume, mixed $avg, int $fetchedAt) use ($now, $maxAge): void {
        if ($volume <= 0 || $fetchedAt <= 0 || ($now - $fetchedAt) > $maxAge) {
            return;
        }
        $avgPrice = is_numeric($avg) && (float)$avg > 0 ? (float)$avg : null;
        $prevAvg = isset($byMarket[$label]['avg_price']) && is_numeric($byMarket[$label]['avg_price'])
            ? (float)$byMarket[$label]['avg_price']
            : null;
        $byMarket[$label] = [
            'marketplace' => $label,
            'volume' => $volume,
            'avg_price' => $avgPrice ?? $prevAvg,
            'source' => 'bulk_index',
        ];
    };

    try {
        $csfloat = $readJson(__DIR__ . '/assets/csfloat-cache/_price_list_index.json');
        $row = is_array($csfloat['map'][$name] ?? null) ? $csfloat['map'][$name] : null;
        $fetchedAt = (int)($csfloat['fetched_at'] ?? 0);
        if ($fetchedAt <= 0) {
            $path = __DIR__ . '/assets/csfloat-cache/_price_list_index.json';
            $fetchedAt = is_file($path) ? (int)filemtime($path) : 0;
        }
        if (is_array($row)) {
            $apply($byMarket, 'CSFloat', (int)($row['quantity'] ?? 0), null, $fetchedAt);
        }
    } catch (Throwable) {
    }

    try {
        $skinport = $readJson(__DIR__ . '/assets/skinport-cache/items_index.json');
        $row = is_array($skinport['items'][$name] ?? null) ? $skinport['items'][$name] : null;
        $fetchedAt = (int)($skinport['fetched_at'] ?? 0);
        if ($fetchedAt <= 0) {
            $path = __DIR__ . '/assets/skinport-cache/items_index.json';
            $fetchedAt = is_file($path) ? (int)filemtime($path) : 0;
        }
        if (is_array($row)) {
            $apply(
                $byMarket,
                'Skinport',
                aiChatSkinportListingCountFromSnapshot($row),
                $row['min_price'] ?? null,
                $fetchedAt
            );
        }
    } catch (Throwable) {
    }

    try {
        $spCounts = $readJson(__DIR__ . '/assets/skinport-cache/listing_counts.json');
        $row = is_array($spCounts['map'][$name] ?? null) ? $spCounts['map'][$name] : null;
        $fetchedAt = (int)($row['fetched_at'] ?? $spCounts['fetched_at'] ?? 0);
        if ($fetchedAt <= 0) {
            $path = __DIR__ . '/assets/skinport-cache/listing_counts.json';
            $fetchedAt = is_file($path) ? (int)filemtime($path) : 0;
        }
        $count = is_array($row) ? (int)($row['listings'] ?? 0) : 0;
        $skinportSource = strtolower(trim((string)($byMarket['Skinport']['source'] ?? '')));
        $skinportLive = in_array($skinportSource, ['item_menus_listings', 'filter_total', 'other_sales_total'], true);
        if ($count > 0 && $fetchedAt > 0 && ($now - $fetchedAt) <= $maxAge && !$skinportLive) {
            $prevAvg = isset($byMarket['Skinport']['avg_price']) && is_numeric($byMarket['Skinport']['avg_price'])
                ? (float)$byMarket['Skinport']['avg_price']
                : null;
            $byMarket['Skinport'] = [
                'marketplace' => 'Skinport',
                'volume' => $count,
                'avg_price' => $prevAvg,
                'source' => 'skinport_listing_index',
            ];
        }
    } catch (Throwable) {
    }

    $priceIndexes = [
        ['Waxpeer', __DIR__ . '/assets/waxpeer-cache/prices_csgo.json'],
        ['ShadowPay', __DIR__ . '/assets/shadowpay-cache/prices_eur.json'],
        ['Market.CSGO', __DIR__ . '/assets/market-csgo-cache/prices_eur.json'],
    ];
    foreach ($priceIndexes as [$label, $path]) {
        try {
            $decoded = $readJson($path);
            $entry = is_array($decoded['index'][$name] ?? null) ? $decoded['index'][$name] : null;
            if (!is_array($entry)) {
                continue;
            }
            $fetchedAt = (int)($decoded['fetched_at'] ?? 0);
            if ($fetchedAt <= 0 && is_file($path)) {
                $fetchedAt = (int)filemtime($path);
            }
            $apply(
                $byMarket,
                $label,
                aiChatSnapshotListingCount($entry),
                $entry['price'] ?? null,
                $fetchedAt
            );
        } catch (Throwable) {
        }
    }

    try {
        $steamIndex = $readJson(__DIR__ . '/assets/steam-market-cache/listing_counts.json');
        $row = is_array($steamIndex['map'][$name] ?? null) ? $steamIndex['map'][$name] : null;
        $fetchedAt = (int)($row['fetched_at'] ?? $steamIndex['fetched_at'] ?? 0);
        if ($fetchedAt <= 0) {
            $path = __DIR__ . '/assets/steam-market-cache/listing_counts.json';
            $fetchedAt = is_file($path) ? (int)filemtime($path) : 0;
        }
        $count = is_array($row) ? (int)($row['listings'] ?? $row['total_count'] ?? 0) : 0;
        $steamMaxAge = 48 * 3600;
        $steamSource = strtolower(trim((string)($byMarket['Steam']['source'] ?? '')));
        $steamLive = in_array($steamSource, ['steam_total_count', 'search_sell_listings', 'c_sell_listings'], true);
        if ($count > 0 && $fetchedAt > 0 && ($now - $fetchedAt) <= $steamMaxAge && !$steamLive) {
            $prevAvg = isset($byMarket['Steam']['avg_price']) && is_numeric($byMarket['Steam']['avg_price'])
                ? (float)$byMarket['Steam']['avg_price']
                : null;
            $byMarket['Steam'] = [
                'marketplace' => 'Steam',
                'volume' => $count,
                'avg_price' => $prevAvg,
                'source' => 'steam_listing_index',
            ];
        }
    } catch (Throwable) {
    }

    try {
        $wmPath = __DIR__ . '/assets/white-market-cache/prices_730.json';
        $export = $readJson($wmPath);
        if (is_array($export)) {
            $rows = is_array($export['items'] ?? null)
                ? $export['items']
                : (is_array($export['data'] ?? null) ? $export['data'] : $export);
            $fetchedAt = is_file($wmPath) ? (int)filemtime($wmPath) : 0;
            foreach ((array)$rows as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $rowName = trim((string)($row['market_hash_name'] ?? $row['name'] ?? ''));
                if ($rowName !== $name) {
                    continue;
                }
                $volume = 0;
                foreach (['market_product_count', 'similarQty', 'similar_qty', 'quantity', 'listings'] as $key) {
                    if (isset($row[$key]) && is_numeric($row[$key]) && (int)$row[$key] > 0) {
                        $volume = (int)$row[$key];
                        break;
                    }
                }
                $price = $row['min_price'] ?? $row['price'] ?? $row['lowest_price'] ?? null;
                $apply($byMarket, 'White.Market', $volume, $price, $fetchedAt);
                break;
            }
        }
    } catch (Throwable) {
    }

    return $byMarket;
}

/**
 * Overlay live listing stock onto a distribution map. Never invents Steam-ratio estimates.
 *
 * @param array<string, array{marketplace:string,volume:int,avg_price:?float,source?:string}> $byMarket
 * @return array<string, array{marketplace:string,volume:int,avg_price:?float,source:string}>
 */
function aiChatFillMissingDistributionMarkets(array $byMarket, string $lookupName = ''): array
{
    $live = aiChatListingShareRowsFromLiveCaches($lookupName);
    foreach ($live as $label => $row) {
        $volume = (int)($row['volume'] ?? 0);
        if ($volume <= 0) {
            continue;
        }
        if (!isset($byMarket[$label]) || (int)$byMarket[$label]['volume'] <= 0) {
            $byMarket[$label] = $row;
            continue;
        }
        // Live listing stock wins over historical SUM / bundle clones.
        $byMarket[$label]['volume'] = $volume;
        $byMarket[$label]['source'] = (string)($row['source'] ?? 'cache');
        if ($row['avg_price'] !== null) {
            $byMarket[$label]['avg_price'] = $row['avg_price'];
        }
    }

    return $byMarket;
}

/**
 * Build a Market Distribution chart for an explicit catalog item name.
 * Used by the in-chat chart switcher when the user picks a different recommended card.
 *
 * @param string $itemName Catalog / market hash name
 * @param string $range Display range: 1M | 6M | 1Y (or history codes 30D/90D/180D/1Y)
 */
function aiChatBuildDistributionForItem(string $itemName, string $range = '1Y'): ?array
{
    $term = trim($itemName);
    if ($term === '' || mb_strlen($term) < 3) {
        return null;
    }

    $canonical = aiChatResolveCatalogItemName($term);
    if ($canonical === '') {
        $row = aiChatLoadBestPriceRow($term, [], false);
        $canonical = trim((string)($row['market_hash_name'] ?? ''));
    }
    if ($canonical === '' || !aiChatExtractedTermLooksLikeItem($canonical)) {
        return null;
    }

    $normalized = strtoupper(trim($range));
    $distRange = match ($normalized) {
        '1M', '30D' => '1M',
        '6M', '90D', '180D' => '6M',
        default => '1Y',
    };

    // Same supply as item-page buildDistributionChartRows: live listing stock
    // for Steam + wear-table markets. Zeros stay so the badge matches "N data points".
    $byMarket = aiChatListingShareRowsFromLiveCaches($canonical);

    $palette = aiChatMarketplacePalette();
    $standard = aiChatDistributionVisibleMarkets();

    $out = [];
    foreach ($standard as $name) {
        $row = $byMarket[$name] ?? null;
        $volume = $row ? (int)$row['volume'] : 0;
        $meta = $palette[$name] ?? ['color' => '#38bdf8', 'image' => ''];
        $out[] = [
            'marketplace' => $name,
            'volume' => $volume,
            'pct' => 0.0,
            'avg_price' => $row['avg_price'] ?? null,
            'color' => (string)$meta['color'],
            'image' => (string)$meta['image'],
        ];
    }

    if (!$out) {
        return null;
    }

    usort($out, static fn(array $a, array $b): int => ($b['volume'] <=> $a['volume']));

    $total = array_sum(array_map(static fn(array $row): int => (int)$row['volume'], $out));
    if ($total <= 0) {
        return null;
    }
    foreach ($out as &$row) {
        $row['pct'] = round(((int)$row['volume'] / $total) * 100, 2);
    }
    unset($row);

    return [
        'type' => 'market_distribution',
        'item_name' => $canonical,
        'range' => $distRange,
        'total' => $total,
        'rows' => $out,
    ];
}

function aiChatBuildDistributionPayload(string $userMessage, array $pageContext, array $messages = []): ?array
{
    if (!aiChatShouldAttachDistribution($userMessage, $messages)) {
        return null;
    }

    $term = aiChatResolveForecastItemTerm($userMessage, $pageContext, $messages, true);
    if ($term === '') {
        return null;
    }

    return aiChatBuildDistributionForItem($term, aiChatDetectHistoryRange($userMessage));
}

function aiChatBuildPriceHistoryFromSteam(string $term, string $range, array $pageContext): ?array
{

    $row = aiChatLoadBestPriceRow($term, $pageContext, true);
    if ($row === null) {
        return null;
    }
    $row = aiChatEnrichRowHistory($row, true);
    $history = is_array($row['history'] ?? null) ? $row['history'] : [];
    if (count($history) < 2) {
        return null;
    }

    $days = match ($range) {
        '30D' => 30,
        '90D' => 90,
        '180D' => 180,
        default => 365,
    };
    $cutoff = time() - ($days * 86400);
    $points = [];
    foreach ($history as $point) {
        if (!is_array($point)) {
            continue;
        }
        $ts = isset($point['t']) ? (int)$point['t'] : (isset($point['time']) ? (int)$point['time'] : 0);
        $price = (float)($point['p'] ?? $point['price'] ?? 0);
        if ($price <= 0) {
            continue;
        }
        if ($ts > 0 && $ts < $cutoff) {
            continue;
        }
        $date = $ts > 0 ? gmdate('Y-m-d', $ts) : trim((string)($point['date'] ?? ''));
        if ($date === '') {
            continue;
        }
        $points[] = ['date' => $date, 'price' => round($price, 2)];
    }
    if (count($points) < 2) {
        return null;
    }
    if (count($points) > 120) {
        $step = (int)ceil(count($points) / 120);
        $compressed = [];
        for ($i = 0; $i < count($points); $i += $step) {
            $compressed[] = $points[$i];
        }
        $last = $points[count($points) - 1];
        if ($compressed[count($compressed) - 1] !== $last) {
            $compressed[] = $last;
        }
        $points = $compressed;
    }

    $palette = aiChatMarketplacePalette();
    $meta = $palette['Steam'] ?? ['color' => '#6366f1', 'image' => ''];
    return [
        'type' => 'price_history',
        'item_name' => (string)($row['market_hash_name'] ?? $term),
        'range' => $range,
        'providers' => [[
            'name' => 'Steam',
            'color' => (string)$meta['color'],
            'image' => (string)$meta['image'],
            'points' => $points,
        ]],
    ];
}

/**
 * Build a multi-marketplace Price History chart for an explicit catalog item name.
 * Used by the in-chat chart switcher when the user picks a different recommended card.
 *
 * @param string $itemName Catalog / market hash name
 * @param array $pageContext Optional page context for Steam fallback
 * @param string $range History range: 30D | 90D | 180D | 1Y (also accepts 1M/6M display codes)
 */
function aiChatBuildPriceHistoryForItem(string $itemName, array $pageContext = [], string $range = '1Y'): ?array
{
    $term = trim($itemName);
    if ($term === '' || mb_strlen($term) < 3) {
        return null;
    }

    $canonical = aiChatResolveCatalogItemName($term);
    if ($canonical === '') {
        $row = aiChatLoadBestPriceRow($term, $pageContext, false);
        $canonical = trim((string)($row['market_hash_name'] ?? ''));
    }
    if ($canonical === '' || !aiChatExtractedTermLooksLikeItem($canonical)) {
        return null;
    }

    $normalized = strtoupper(trim($range));
    $historyRange = match ($normalized) {
        '1M', '30D' => '30D',
        '90D' => '90D',
        '6M', '180D' => '180D',
        default => '1Y',
    };

    $json = aiChatQueryMarketChartBundle($canonical, $historyRange);
    if (!is_array($json)) {
        $query = http_build_query([
            'lookup_name' => $canonical,
            'range' => $historyRange,
            'source' => 'all',
        ]);
        $json = aiChatFetchLocalJson('get_market_chart_bundle.php?' . $query);
    }
    $series = is_array($json['series'] ?? null) ? $json['series'] : [];
    if (!$series) {
        return aiChatBuildPriceHistoryFromSteam($canonical, $historyRange, $pageContext);
    }

    $palette = aiChatMarketplacePalette();
    $preferredOrder = [
        'Steam' => 0,
        'Skinport' => 1,
        'CSFloat' => 2,
        'White.Market' => 3,
        'DMarket' => 4,
        'Market.CSGO' => 6,
        'ShadowPay' => 7,
        'Waxpeer' => 8,
        'Mannco.store' => 9,
        'HaloSkins' => 10,
        'RapidSkins' => 11,
    ];
    $providers = [];
    foreach ($series as $key => $entry) {
        if (!is_array($entry) || $key === 'all') {
            continue;
        }
        $pointsRaw = is_array($entry['points'] ?? null) ? $entry['points'] : [];
        $byDate = [];
        foreach ($pointsRaw as $point) {
            if (!is_array($point)) {
                continue;
            }
            $dateRaw = trim((string)($point['date'] ?? ''));
            $price = (float)($point['price'] ?? 0);
            if ($dateRaw === '' || $price <= 0) {
                continue;
            }
            if (preg_match('/^(\d{4}-\d{2}-\d{2})/', $dateRaw, $m)) {
                $date = $m[1];
            } elseif (is_numeric($dateRaw)) {
                $ts = (float)$dateRaw;
                if ($ts > 20000000000) {
                    $ts = $ts / 1000;
                }
                $date = gmdate('Y-m-d', (int)$ts);
            } else {
                $ts = strtotime($dateRaw);
                if ($ts === false) {
                    continue;
                }
                $date = gmdate('Y-m-d', $ts);
            }
            $byDate[$date] = round($price, 2);
        }
        if (count($byDate) < 2) {
            continue;
        }
        ksort($byDate);

        // Drop only extreme outliers (unit mismatches / bad anchors).
        $priceList = array_values($byDate);
        sort($priceList);
        $median = $priceList[(int)floor(count($priceList) / 2)] ?? 0.0;
        $maxAllowed = $median > 0 ? $median * 6.0 : PHP_FLOAT_MAX;
        $minAllowed = $median > 0 ? max(0.01, $median * 0.08) : 0.0;
        $points = [];
        foreach ($byDate as $date => $price) {
            if ($price < $minAllowed || $price > $maxAllowed) {
                continue;
            }
            $points[] = ['date' => $date, 'price' => $price];
        }
        if (count($points) < 2) {
            continue;
        }

        // Keep every provider with enough points to draw a line (no Steam-density gate).
        if (count($points) < 2) {
            continue;
        }

        // Keep charts readable in chat.
        if (count($points) > 120) {
            $step = (int)ceil(count($points) / 120);
            $compressed = [];
            for ($i = 0; $i < count($points); $i += $step) {
                $compressed[] = $points[$i];
            }
            $last = $points[count($points) - 1];
            if ($compressed[count($compressed) - 1]['date'] !== $last['date']) {
                $compressed[] = $last;
            }
            $points = $compressed;
        }

        $label = aiChatNormalizeMarketplaceLabel(
            trim((string)($entry['label'] ?? '')) ?: aiChatBundleSeriesLabel((string)$key)
        );
        $meta = $palette[$label] ?? ['color' => '#38bdf8', 'image' => ''];
        $providers[] = [
            'name' => $label,
            'color' => (string)($meta['color'] ?? '#38bdf8'),
            'image' => (string)($meta['image'] ?? ''),
            'points' => $points,
            'point_count' => count($points),
            'priority' => $preferredOrder[$label] ?? 50,
        ];
    }

    if (count($providers) < 1) {
        return aiChatBuildPriceHistoryFromSteam($canonical, $historyRange, $pageContext);
    }

    usort($providers, static function (array $a, array $b): int {
        $pa = (int)($a['priority'] ?? 50);
        $pb = (int)($b['priority'] ?? 50);
        if ($pa !== $pb) {
            return $pa <=> $pb;
        }
        return ((int)($b['point_count'] ?? 0)) <=> ((int)($a['point_count'] ?? 0));
    });
    $providers = array_slice($providers, 0, 16);
    foreach ($providers as &$provider) {
        unset($provider['point_count'], $provider['priority']);
    }
    unset($provider);

    return [
        'type' => 'price_history',
        'item_name' => $canonical,
        'range' => $historyRange,
        'providers' => $providers,
    ];
}

function aiChatBuildPriceHistoryPayload(string $userMessage, array $pageContext, array $messages = []): ?array
{
    if (!aiChatShouldAttachPriceHistory($userMessage, $messages)) {
        return null;
    }

    $term = aiChatResolveForecastItemTerm($userMessage, $pageContext, $messages, true);
    if ($term === '') {
        return null;
    }

    return aiChatBuildPriceHistoryForItem($term, $pageContext, aiChatDetectHistoryRange($userMessage));
}

/**
 * @param list<string> $kinds 'forecast'|'distribution'|'price_history'
 */
function aiChatChartWritingInstructions(array $kinds, bool $investPick = false): string
{
    $kinds = array_values(array_unique(array_filter($kinds, static fn($k): bool => is_string($k) && $k !== '')));
    if (!$kinds) {
        return '';
    }

    $lines = [
        'CHART REPLY WRITING (financial-terminal style — not a generic chatbot wall of text):',
        'Voice: CS2 market analyst on a price terminal. Scannable sections, real numbers, zero filler. Charts render automatically under your text — never mention "chart below", "[Chart attached]", stub headings, "Chart / outlook", "Future chart available", or "Hidden metadata".',
        'Use **bold** for item names, **€prices**, and **% moves**. Use ### markdown headings. One emoji max per section (🟢 bullish, 🔴 bearish, 🟡 neutral/sideways, 📈 trend, ⚠️ risk).',
        'CRITICAL: every € price, % change, listing count, and marketplace share MUST come from the CHART DATA blocks below — never invent or round differently than provided.',
    ];

    if ($investPick) {
        $lines[] = 'PORTFOLIO + CHART ORDER (strict): (1) ### Item metrics, (2) ### AI SENTIMENT — `BULLISH|NEUTRAL|BEARISH — <one short clause why>` immediately under Item metrics (always include the why; optional Now/1y € go in Key read, not as the sentiment why), (3) ### Key factors — 2–3 `+ ` Positives and 2–3 `- ` Negatives (short clauses, no €/%), (4) ### Items to buy — • pick bullets only (**Name** — **€price**/qty — brief clause; bold the name for skins AND cases/capsules; each market identity at most once), (5) ### Why these picks — one line per listed pick: **Name** — short why (8–14 words: liquidity / thesis / wear; matching Items to buy / cards; no intro blurb, no € / 30d / listings, no • / - / *; never nest ### headings or SCARCITY/LIQUIDITY/VOLATILITY chips inside Why; never `+ `/`- ` signed factor chips; never general market fluff; REQUIRED short why on EVERY listed pick — one clause, no prices, no 30d %; do not skip reasons; never repeat a name already listed). STOP after Why — never a second pick list, Proposed mix, replace-X-with-Y essay, or Portfolio total recap. NEVER write ### Chart focus / Chart focus — charts below already show Now/1y/outlook. AI SENTIMENT immediately under Item metrics, then Key factors. Item cards render between your text and charts — do not describe the cards.';
    } elseif (in_array('forecast', $kinds, true) && count($kinds) === 1) {
        $lines[] = 'FUTURE CHART TEMPLATE (~80–120 words):';
        $lines[] = 'Line 1: quick take on **item name** (one short sentence).';
        $lines[] = '### Item metrics — exactly three chip lines: `**Scarcity:** <Extreme|High|Moderate|Low> — <short why>`, `**Liquidity:** <High|Medium|Low> — <short why>`, `**Volatility:** <High|Medium|Low> — <short why>`. Keep each why under ~10 words and grounded in the provided stats.';
        $lines[] = '### AI SENTIMENT — `BULLISH|NEUTRAL|BEARISH — <one short clause why>` immediately after Item metrics (no emoji on the heading; ALWAYS include the why, written from this item\'s own data — never reuse the wording of this instruction). Put **Now €X** → **1y €Y** (**%change** from CHART DATA) in Key read, not as the sentiment why.';
        $lines[] = '### Key factors — 2–3 `+ ` Positives and 2–3 `- ` Negatives (short clauses, no €/%).';
        $lines[] = '### Key read — 1–2 plain sentences on the projected path (use supply/demand bias + signal note from data).';
    } elseif (in_array('distribution', $kinds, true) && count($kinds) === 1) {
        $lines[] = 'MARKET DISTRIBUTION TEMPLATE (~60–90 words):';
        $lines[] = 'Line 1: quick take on **item name** listing supply.';
        $lines[] = '### Marketplace supply — top 1–2 markets with **name**, **listing count**, and **% share** exactly as in CHART DATA.';
        $lines[] = '### Liquidity read — one sentence: concentrated vs spread across markets.';
        $lines[] = '### Item metrics — exactly three chip lines: `**Scarcity:** <Extreme|High|Moderate|Low> — <short why>`, `**Liquidity:** <High|Medium|Low> — <short why>`, `**Volatility:** <High|Medium|Low> — <short why>`. Keep each why under ~10 words and grounded in the provided stats.';
        $lines[] = '### AI SENTIMENT — `BULLISH|NEUTRAL|BEARISH — <one short clause why>` immediately after Item metrics (never omit; always include the why).';
        $lines[] = '### Key factors — 2–3 `+ ` Positives and 2–3 `- ` Negatives (short clauses, no €/%).';
        $lines[] = 'If supply is thin or dominated by one market, say so in the Scarcity / Liquidity why. No full marketplace laundry list.';
    } elseif (in_array('price_history', $kinds, true) && count($kinds) === 1) {
        $lines[] = 'PRICE HISTORY TEMPLATE (~60–90 words):';
        $lines[] = 'Line 1: quick take on **item name** multi-market price action.';
        $lines[] = '### Price action — biggest mover: **market** **€start → €end** (**%change**) over the chart range from CHART DATA.';
        $lines[] = '### Key read — one sentence on divergence or alignment across providers.';
        $lines[] = '### Item metrics — exactly three chip lines: `**Scarcity:** <Extreme|High|Moderate|Low> — <short why>`, `**Liquidity:** <High|Medium|Low> — <short why>`, `**Volatility:** <High|Medium|Low> — <short why>`. Keep each why under ~10 words and grounded in the provided stats.';
        $lines[] = '### AI SENTIMENT — `BULLISH|NEUTRAL|BEARISH — <one short clause why>` immediately after Item metrics (never omit; always include the why).';
        $lines[] = '### Key factors — 2–3 `+ ` Positives and 2–3 `- ` Negatives (short clauses, no €/%).';
        $lines[] = 'If spreads are wide or a provider looks stale, say so in the Liquidity / Volatility why.';
    } else {
        $lines[] = 'MULTI-CHART TEMPLATE (~100–140 words): one-line hook, then ### Item metrics with exactly three chip lines (`**Scarcity:** <level> — <short why>`, `**Liquidity:** <level> — <short why>`, `**Volatility:** <level> — <short why>`), ### AI SENTIMENT `BULLISH|NEUTRAL|BEARISH — <one short clause why>` immediately under Item metrics (if Future data exists; always include the why), ### Key factors with 2–3 `+ ` Positives and 2–3 `- ` Negatives, ### Marketplace supply (if distribution data), ### Price action (if history data) — each with only the top stats from CHART DATA. Do not repeat the same number in every section.';
    }

    return implode("\n", $lines);
}

function aiChatFormatForecastContext(array $forecast): string
{
    $item = trim((string)($forecast['item_name'] ?? 'Item'));
    $current = (float)($forecast['current_price'] ?? 0);
    $proj1y = (float)($forecast['projected_1y'] ?? 0);
    if ($item === '' || $current <= 0) {
        return '';
    }

    $outlook = trim((string)($forecast['outlook'] ?? 'neutral'));
    $changePct = $forecast['change_pct'] ?? null;
    $sd = trim((string)($forecast['supply_demand'] ?? ''));
    $notes = array_values(array_filter(
        array_map('strval', (array)($forecast['signal_notes'] ?? [])),
        static fn($n): bool => trim($n) !== ''
    ));

    $lines = [
        'FUTURE CHART DATA (authoritative — your prose MUST match these figures exactly):',
        'Item: ' . $item,
        'Now: €' . number_format($current, 2),
    ];
    if ($proj1y > 0) {
        $lines[] = '1-year projection: €' . number_format($proj1y, 2)
            . (is_numeric($changePct) ? ' (' . aiChatFormatSignedPct((float)$changePct) . ' vs now)' : '');
    }
    $lines[] = 'Outlook badge: ' . $outlook;
    if ($sd !== '') {
        $lines[] = 'Supply/demand bias: ' . $sd;
    }
    foreach (array_slice($notes, 0, 3) as $note) {
        $lines[] = 'Signal: ' . $note;
    }
    return implode("\n", $lines);
}

function aiChatFormatDistributionContext(array $distribution): string
{
    $rows = is_array($distribution['rows'] ?? null) ? $distribution['rows'] : [];
    if (!$rows) {
        return '';
    }

    $item = trim((string)($distribution['item_name'] ?? 'Item'));
    $total = (int)($distribution['total'] ?? 0);
    $lines = [
        'MARKET DISTRIBUTION CHART DATA (authoritative — match listing counts and % shares exactly):',
        'Item: ' . $item,
        'Total tracked listings: ' . ($total > 0 ? (string)$total : 'n/a'),
        'Chart is attached automatically — do not say it failed or ask for uploads.',
    ];
    $rank = 0;
    foreach (array_slice($rows, 0, 24) as $row) {
        if (!is_array($row)) {
            continue;
        }
        $name = trim((string)($row['marketplace'] ?? ''));
        $volume = (int)($row['volume'] ?? 0);
        if ($name === '' || $volume <= 0) {
            continue;
        }
        $rank++;
        $pct = isset($row['pct']) && is_numeric($row['pct'])
            ? number_format((float)$row['pct'], 1) . '%'
            : 'n/a';
        $avg = isset($row['avg_price']) && is_numeric($row['avg_price']) && (float)$row['avg_price'] > 0
            ? ' | avg €' . number_format((float)$row['avg_price'], 2)
            : '';
        $lines[] = '#' . $rank . ' ' . $name . ': ' . $volume . ' listings | ' . $pct . ' share' . $avg;
    }
    if ($rank >= 2) {
        $top = $rows[0];
        $second = $rows[1];
        $topName = trim((string)($top['marketplace'] ?? ''));
        $topVol = (int)($top['volume'] ?? 0);
        $topPct = isset($top['pct']) && is_numeric($top['pct']) ? (float)$top['pct'] : null;
        $secondName = trim((string)($second['marketplace'] ?? ''));
        $secondVol = (int)($second['volume'] ?? 0);
        if ($topName !== '' && $secondName !== '') {
            $lines[] = 'Lead read: ' . $topName . ' leads with ' . $topVol . ' listings'
                . ($topPct !== null ? ' (' . number_format($topPct, 1) . '%)' : '')
                . '; #' . 2 . ' is ' . $secondName . ' at ' . $secondVol . '.';
        }
    }

    return implode("\n", $lines);
}

function aiChatFormatPriceHistoryContext(array $priceHistory): string
{
    $providers = is_array($priceHistory['providers'] ?? null) ? $priceHistory['providers'] : [];
    if (!$providers) {
        return '';
    }

    $item = trim((string)($priceHistory['item_name'] ?? 'Item'));
    $range = trim((string)($priceHistory['range'] ?? '1Y'));
    $lines = [
        'PRICE HISTORY CHART DATA (authoritative — match start/end € and % moves exactly):',
        'Item: ' . $item,
        'Range: ' . $range,
        'Providers in chart: ' . count($providers),
        'Chart is attached automatically — do not say it failed or ask for uploads.',
    ];

    $moves = [];
    foreach (array_slice($providers, 0, 16) as $provider) {
        if (!is_array($provider)) {
            continue;
        }
        $name = trim((string)($provider['name'] ?? 'Provider'));
        $points = is_array($provider['points'] ?? null) ? $provider['points'] : [];
        if (count($points) < 2) {
            continue;
        }
        $first = $points[0];
        $last = $points[count($points) - 1];
        $start = (float)($first['price'] ?? 0);
        $end = (float)($last['price'] ?? 0);
        if ($start <= 0 || $end <= 0) {
            continue;
        }
        $change = (($end - $start) / $start) * 100.0;
        $moves[] = ['name' => $name, 'start' => $start, 'end' => $end, 'change' => $change];
        $lines[] = $name . ': €' . number_format($start, 2)
            . ' → €' . number_format($end, 2)
            . ' (' . aiChatFormatSignedPct($change) . ')';
    }
    if ($moves) {
        usort($moves, static fn($a, $b) => abs((float)$b['change']) <=> abs((float)$a['change']));
        $top = $moves[0];
        $lines[] = 'Biggest mover: ' . $top['name'] . ' '
            . aiChatFormatSignedPct((float)$top['change']) . ' (€'
            . number_format((float)$top['start'], 2) . ' → €'
            . number_format((float)$top['end'], 2) . ').';
    }

    return implode("\n", $lines);
}

function aiChatFindItemTermFromMessages(array $messages): string
{
    foreach (array_reverse($messages) as $entry) {
        if (!is_array($entry)) {
            continue;
        }

        $charts = is_array($entry['charts'] ?? null) ? $entry['charts'] : [];
        $chartItem = trim((string)($charts['item'] ?? ''));
        if ($chartItem !== '' && aiChatExtractedTermLooksLikeItem($chartItem)) {
            $canonical = aiChatResolveCatalogItemName($chartItem);
            return $canonical !== '' ? $canonical : $chartItem;
        }

        foreach (['forecast', 'distribution', 'price_history'] as $key) {
            if (!is_array($entry[$key] ?? null)) {
                continue;
            }
            $name = trim((string)(
                $entry[$key]['item_name']
                ?? $entry[$key]['item']
                ?? $entry[$key]['name']
                ?? ''
            ));
            if ($name !== '' && aiChatExtractedTermLooksLikeItem($name)) {
                $canonical = aiChatResolveCatalogItemName($name);
                return $canonical !== '' ? $canonical : $name;
            }
        }

        $content = trim((string)($entry['content'] ?? ''));
        if ($content === '') {
            continue;
        }
        $term = aiChatExtractSearchTerms($content);
        if (
            $term !== ''
            && aiChatExtractedTermLooksLikeItem($term)
            && (
                str_contains($term, '|')
                || preg_match('/\b(Case|Capsule|Package|Sticker|Knife)\b/u', $term)
                || aiChatResolveCatalogItemName($term) !== ''
            )
        ) {
            $canonical = aiChatResolveCatalogItemName($term);
            return $canonical !== '' ? $canonical : $term;
        }
        if (preg_match('/\b([A-Za-z0-9][A-Za-z0-9.\- ]{1,40}\s*\|\s*[A-Za-z0-9][A-Za-z0-9.\- ]{1,60})\b/u', $content, $m)) {
            return trim($m[1]);
        }
    }

    return '';
}

function aiChatLooksLikePriceOrMarketDataQuestion(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }

    $patterns = [
        '/\b(price|prices|cost|worth|value|how much|cheapest|expensive)\b/u',
        '/\b(steam api|steam market|real[- ]?time|live price|current price|market price|latest price)\b/u',
        '/\b(access|api)\b.*\b(steam|price|market)\b/u',
        '/\b(steam|price|market)\b.*\b(access|api)\b/u',
        '/\b(updated|refresh|up to date|update)\b.*\b(price|prices|market|cache|data)\b/u',
        '/\b(price|prices|market|data)\b.*\b(updated|refresh|up to date|update|cache)\b/u',
        '/\b(data\s*cache|price\s*cache|roi[_\s-]?prices|cached\s+data|cache)\b/u',
        '/[€$]\s*\d/u',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $message)) {
            return true;
        }
    }

    return false;
}

function aiChatLooksLikeItemPickQuestion(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }

    if (aiChatWantsCharmItems($message) || aiChatWantsStickerCapsules($message) || aiChatWantsStickerItems($message)) {
        return true;
    }

    $patterns = [
        '/\bportfolio\b/u',
        '/\b\d+\s*(?:month|year|week)s?\s+hold\b/u',
        '/\bspecific items?\b/u',
        // "cheapest Glock-18 skins" is a pick list too (cheapest-first candidates).
        '/\b(cheapest|lowest[- ]priced?|dirt[- ]cheap)\b/u',
        '/\b(recommend|suggest|give me|show me|list)\b.*\b(item|skin|case|sticker|souvenir|invest|charm|keychain|capsule)\b/u',
        '/\binvest(?:ing|ment)?s?\b/u',
        '/\bwhat (should|can) i (buy|invest in)\b/u',
        '/\bwhat\b.{0,40}\b(items?|skins?|cases?|souvenirs?|collections?|charms?|keychains?|stickers?|capsules?|gloves?|knives|rifles?|pistols?|smgs?)\b/u',
        '/\bwhich\b.{0,40}\b(items?|skins?|cases?|souvenirs?|collections?|charms?|keychains?|stickers?|capsules?|gloves?|knives|rifles?|pistols?|smgs?)\b/u',
        '/\b(items?|skins?|cases?|souvenirs?|collections?|charms?|keychains?|stickers?|capsules?|gloves?|knives|rifles?|pistols?|smgs?)\b.{0,24}\b(buy|get|pick|recommend|invest)\b/u',
        '/\b(best|top|good)\b.{0,48}\bcollections?\b/u',
        '/\bshould i buy\b/u',
        '/\b(good|best|top)\b.*\b(buy|investment|pick|deal)\b/u',
        '/\b(best|top|good|coolest)\b.{0,48}\b(skins?|items?|cases?|knives|knife|gloves?|rifles?|pistols?|smgs?|charms?|keychains?|stickers?|capsules?|stattrak)\b/u',
        '/\bundervalued\b/u',
        '/\bitems? to (buy|watch|hold)\b/u',
        '/\bmultiple\b.*\b(item|skin|case|chart|forecast)\b/u',
        '/\b(go up|rise|increase)\b.*\b(multiple|several|few|some)\b/u',
        '/\b(raise|lower|cut|drop)\b.*\bbudget\b/u',
        '/\btry\b.*\binstead\b/u',
        '/\b(swap|replace)\b.*\bitem\b/u',
        '/\bdifferent\b.*\b(picks?|skins?|items?)\b/u',
        '/\bkeep\b.*\b\d+\s*items?\b/u',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $message)) {
            return true;
        }
    }

    return false;
}

/**
 * Chip follow-up: "Raise the budget" / "Try {amount} instead" / typed equivalents —
 * the user wants a fresh, pricier list, not the same picks repeated.
 */
function aiChatLooksLikeRaiseBudgetRequest(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }
    return (bool)preg_match('/\braise\b.*\bbudget\b/u', $message)
        || (bool)preg_match('/\btry\b.*\binstead\b/u', $message)
        || (bool)preg_match('/\b(higher|bigger|more)\b.*\bbudget\b/u', $message)
        || (bool)preg_match('/\bincrease\b.*\bbudget\b/u', $message);
}

/**
 * Chip follow-up: "Swap one item" / "replace one item" — change exactly one
 * pick from the immediately previous list, keep the rest.
 */
function aiChatLooksLikeSwapOneItemRequest(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }
    return (bool)preg_match('/\b(swap|replace)\b.*\b(one|1|a)\b.*\bitem\b/u', $message)
        || (bool)preg_match('/\bswap\b.*\bitem\b/u', $message);
}

/**
 * Chip follow-up: "Show me different picks/skins" / "show me more" — the user
 * wants a bigger and/or genuinely different list, not the same 3 again.
 */
function aiChatLooksLikeMoreItemsRequest(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }
    return (bool)preg_match('/\bdifferent\b.*\b(picks?|skins?|items?)\b/u', $message)
        || (bool)preg_match('/\b(more|another|other)\b.*\b(picks?|skins?|items?|options?)\b/u', $message)
        || (bool)preg_match('/\bmore\s+(than|options?)\b/u', $message);
}

/**
 * Portfolio / what-to-buy with no explicit weapon or "AK | Skin" — diversify across families.
 */
function aiChatLooksLikeOpenEndedInvestQuestion(string $message): bool
{
    if (!aiChatLooksLikeItemPickQuestion($message)) {
        return false;
    }
    // Typed catalog asks (stickers, capsules, charms, cases, souvenirs, collections)
    // are not a mixed skins/cases portfolio — do not apply DIVERSIFY / cheap-case filler.
    $typed = aiChatExtractRequestedItemType($message, '');
    if ($typed !== '' && $typed !== 'skin') {
        return false;
    }
    if (preg_match('/((?:StatTrak™|Souvenir|★)?\s*[\w\-]+\s*\|\s*[^?!.,]{2,})/ui', $message)) {
        return false;
    }
    return aiChatExtractWeaponFamily($message) === '';
}

function aiChatLooksLikeBroadMarketQuestion(string $message): bool
{
    return aiChatLooksLikeItemPickQuestion($message)
        || (
            aiChatLooksLikePredictionQuestion($message)
            && !preg_match('/((?:StatTrak™|Souvenir|★)?\s*[\w\-]+\s*\|\s*[^?!.,]+)/ui', $message)
            && !preg_match('/\b[\w\'.&-]+(?:\s+[\w\'.&-]+){0,4}\s+Case\b/ui', $message)
        );
}

/**
 * Knowledge / "explain it to me" question ("how does the cs2 economy work",
 * "what is float", "why do case prices drop after a release", "explain
 * StatTrak"). These get a plain written answer — no Item metrics strips, no
 * pick list, no item cards — instead of the invest template.
 */
/**
 * "Top market movers today", "biggest gainers", "what's pumping": the user
 * wants the actual items that moved, answered from CS Price's own price
 * history rather than a lesson on why prices move.
 */
function aiChatLooksLikeMoversQuestion(string $message): bool
{
    $m = mb_strtolower(trim($message));
    if ($m === '') {
        return false;
    }
    return (bool)preg_match(
        '/\b(?:market\s+)?movers?\b'
        . '|\b(?:top|biggest|largest|best|worst)\s+(?:gainers?|losers?|risers?|fallers?|decliners?|jumps?|drops?|moves?|pumps?|dumps?|performers?)\b'
        . '|\bgainers?\s+(?:and|&)\s+(?:losers?|decliners?)\b'
        . '|\bwhat(?:\'s|\s+is|\s+are)\s+(?:moving|pumping|dumping|mooning|crashing|trending)\b'
        . '|\bwhat\s+(?:went|is\s+going|are\s+going)\s+(?:up|down)\b'
        . '|\b(?:trending|hottest)\s+(?:items|skins|cases|stickers)\b/u',
        $m
    );
}

/**
 * The movers the site itself shows in the home ticker
 * (assets/data/ticker-pool.json, rebuilt by scripts/build_ticker_pool.php):
 * real items with their change over the pool's window and, from the daily
 * price line, the last 7 days. Returns "" when the pool is missing.
 */
function aiChatBuildMoversContext(int $perSide = 8): string
{
    $file = __DIR__ . '/assets/data/ticker-pool.json';
    if (!is_file($file)) {
        return '';
    }
    $pool = json_decode((string)file_get_contents($file), true);
    $items = is_array($pool['items'] ?? null) ? $pool['items'] : [];
    if (!$items) {
        return '';
    }
    $days = max(1, (int)($pool['range_days'] ?? 30));
    $generated = substr((string)($pool['generated'] ?? ''), 0, 10);

    $rows = [];
    foreach ($items as $item) {
        if (!is_array($item) || !is_numeric($item['pct'] ?? null) || trim((string)($item['name'] ?? '')) === '') {
            continue;
        }
        $spark = array_values(array_filter(is_array($item['spark'] ?? null) ? $item['spark'] : [], 'is_numeric'));
        // Last-7-days change from the daily line, only when it actually moved:
        // the pool carries its last price forward, so a flat 0.00% is filler.
        $week = null;
        if (count($spark) >= 8) {
            $then = (float)$spark[count($spark) - 8];
            $now = (float)$spark[count($spark) - 1];
            if ($then > 0) {
                $week = round(($now / $then - 1) * 100, 2);
                if (abs($week) < 0.5) {
                    $week = null;
                }
            }
        }
        $rows[] = [
            'name' => trim((string)$item['name']),
            'pct' => round((float)$item['pct'], 2),
            'week' => $week,
            'price' => is_numeric($item['price'] ?? null) ? round((float)$item['price'], 2) : null,
        ];
    }
    if (!$rows) {
        return '';
    }

    $format = static function (array $r) use ($days): string {
        $line = sprintf('- %s: %s%.2f%% over %d days', $r['name'], $r['pct'] >= 0 ? '+' : '', $r['pct'], $days);
        if ($r['week'] !== null) {
            $line .= sprintf(', %s%.2f%% over the last 7 days', $r['week'] >= 0 ? '+' : '', $r['week']);
        }
        if ($r['price'] !== null) {
            $line .= sprintf(', now about €%.2f', $r['price']);
        }
        return $line;
    };

    $gainers = array_values(array_filter($rows, static fn($r) => $r['pct'] > 0));
    usort($gainers, static fn($a, $b) => $b['pct'] <=> $a['pct']);
    $losers = array_values(array_filter($rows, static fn($r) => $r['pct'] < 0));
    usort($losers, static fn($a, $b) => $a['pct'] <=> $b['pct']);

    $lines = [sprintf('CS Price market movers (Steam price history, %d-day window%s):', $days, $generated !== '' ? ', data from ' . $generated : '')];
    $lines[] = 'Biggest gainers:';
    foreach (array_slice($gainers, 0, $perSide) as $r) {
        $lines[] = $format($r);
    }
    $lines[] = 'Biggest drops:';
    foreach (array_slice($losers, 0, $perSide) as $r) {
        $lines[] = $format($r);
    }
    return implode("\n", $lines);
}

/**
 * Cards for the movers a reply names: every ticker-pool item whose exact name
 * appears in the reply, in reply order, up to $limit.
 */
function aiChatMoversCards(string $reply, int $limit = 6): array
{
    $file = __DIR__ . '/assets/data/ticker-pool.json';
    if ($reply === '' || !is_file($file)) {
        return [];
    }
    $pool = json_decode((string)file_get_contents($file), true);
    $found = [];
    foreach ((is_array($pool['items'] ?? null) ? $pool['items'] : []) as $item) {
        $name = trim((string)($item['name'] ?? ''));
        if ($name === '') {
            continue;
        }
        $pos = mb_stripos($reply, $name);
        if ($pos !== false) {
            $found[$name] = $pos;
        }
    }
    asort($found);
    $cards = [];
    foreach (array_keys($found) as $name) {
        $card = aiChatResolveCatalogCard($name);
        if ($card === null) {
            continue;
        }
        if (trim((string)($card['image'] ?? '')) === '') {
            $card['image'] = aiChatCatalogImage($card);
        }
        if (trim((string)($card['image'] ?? '')) === '') {
            continue;
        }
        $card['requested_name'] = $name;
        $cards[] = aiChatAttachCheapestListing($card);
        if (count($cards) >= $limit) {
            break;
        }
    }
    return $cards;
}

function aiChatLooksLikeExplainerQuestion(string $message): bool
{
    $message = mb_strtolower(trim($message));
    if ($message === '') {
        return false;
    }

    // Anything that asks for picks, money decisions, forecasts or charts is
    // not an explainer, however it is phrased.
    $decisionCues = [
        '/\b(buy|buying|invest|investing|investment|portfolio|budget|recommend|suggest|picks?|flip|arbitrage|deals?)\b/u',
        '/\b(should i|worth it|worth buying|is it worth|good time|best|top \d|cheapest|undervalued|underpriced)\b/u',
        '/\b(will|gonna|going to)\b.*\b(go up|rise|increase|drop|fall|crash|moon|pump)\b/u',
        '/\b(predict|prediction|forecast|outlook|chart|graph|history)\b/u',
        '/\b(grow|appreciate|gain)\b.*\b(future|value|price)\b/u',
        '/(€|\$|eur\b|usd\b|\d+\s?(euro|dollars?|bucks))/u',
        '/\b(items?|skins?|cases?|stickers?|charms?|capsules?)\s+to\s+(buy|get|hold|watch)\b/u',
    ];
    foreach ($decisionCues as $pattern) {
        if (preg_match($pattern, $message)) {
            return false;
        }
    }

    $explainCues = [
        '/^(how|what|why|when|where|who)\b/u',
        '/\b(how|why)\s+(do|does|did|is|are|can|could|would|to)\b/u',
        '/\bwhat(\'s| is| are| does| do| was| were| means?)\b/u',
        '/\b(explain|describe|tell me about|teach me|walk me through|meaning of|difference between|definition of)\b/u',
        '/\b(work|works|working|happen|happens|happened|mean|means|matter|matters)\b/u',
    ];
    foreach ($explainCues as $pattern) {
        if (preg_match($pattern, $message)) {
            return true;
        }
    }

    return false;
}

/**
 * Seeded Fisher–Yates so one request can share a rotation without changing later calls.
 *
 * @param list<mixed> $items
 * @return list<mixed>
 */
function aiChatShuffleList(array $items, int $salt): array
{
    $items = array_values($items);
    $n = count($items);
    $state = $salt & 0x7fffffff;
    for ($i = $n - 1; $i > 0; $i--) {
        $state = ($state * 1103515245 + 12345) & 0x7fffffff;
        $j = $state % ($i + 1);
        $tmp = $items[$i];
        $items[$i] = $items[$j];
        $items[$j] = $tmp;
    }
    return $items;
}

function aiChatNewInvestRotationSalt(string $userMessage = '', array $messages = []): int
{
    $material = $userMessage . "\n" . (string)count($messages) . "\n" . (string)hrtime(true);
    try {
        $material .= "\n" . (string)random_int(0, 0x7fffffff);
    } catch (Throwable) {
        $material .= "\n" . (string)mt_rand();
    }
    foreach (array_reverse($messages) as $entry) {
        if (!is_array($entry) || ($entry['role'] ?? '') !== 'assistant') {
            continue;
        }
        $material .= "\n" . mb_substr((string)($entry['content'] ?? ''), 0, 600);
        break;
    }
    return crc32($material) & 0x7fffffff;
}

/**
 * Item names recommended in earlier assistant turns (so the next shortlist can skip them).
 *
 * @return list<string>
 */
function aiChatRecentRecommendedNames(array $messages): array
{
    $names = [];
    $seen = [];
    foreach ($messages as $entry) {
        if (!is_array($entry) || ($entry['role'] ?? '') !== 'assistant') {
            continue;
        }
        foreach (aiChatExtractReplyItemNames((string)($entry['content'] ?? ''), []) as $name) {
            $key = aiChatSkinFamilyKey($name);
            if ($key === '' || isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $names[] = $name;
        }
    }
    return $names;
}

function aiChatRecentInvestPicksCachePath(): string
{
    return __DIR__ . '/assets/ai/recent_invest_picks.json';
}

/**
 * @return list<string>
 */
function aiChatLoadRecentInvestPickExclusions(): array
{
    $path = aiChatRecentInvestPicksCachePath();
    if (!is_file($path)) {
        return [];
    }
    $payload = json_decode((string)file_get_contents($path), true);
    if (!is_array($payload)) {
        return [];
    }
    $names = [];
    $seen = [];
    foreach (is_array($payload['sets'] ?? null) ? $payload['sets'] : [] as $set) {
        if (!is_array($set)) {
            continue;
        }
        foreach ($set as $name) {
            $name = trim((string)$name);
            $key = aiChatSkinFamilyKey($name);
            if ($name === '' || $key === '' || isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $names[] = $name;
        }
    }
    return $names;
}

/**
 * @param list<string> $names
 */
function aiChatRememberInvestPickSet(array $names): void
{
    $clean = [];
    $seen = [];
    foreach ($names as $name) {
        $name = trim((string)$name);
        $key = aiChatSkinFamilyKey($name);
        if ($name === '' || $key === '' || isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $clean[] = $name;
    }
    if (!$clean) {
        return;
    }

    $path = aiChatRecentInvestPicksCachePath();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        return;
    }

    $sets = [];
    if (is_file($path)) {
        $payload = json_decode((string)file_get_contents($path), true);
        if (is_array($payload) && is_array($payload['sets'] ?? null)) {
            $sets = $payload['sets'];
        }
    }
    array_unshift($sets, $clean);
    $sets = array_slice($sets, 0, 1);
    @file_put_contents($path, json_encode([
        'sets' => $sets,
        'updated_at' => date('c'),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

/**
 * Per-request salt + names to avoid so catalog, prices, and charts share one rotation.
 *
 * @return array{salt:int, exclude:list<string>}
 */
function aiChatInvestRotationState(array $messages = [], string $userMessage = '', bool $reset = false): array
{
    static $state = null;
    if ($reset || $state === null) {
        $exclude = array_merge(
            aiChatRecentRecommendedNames($messages),
            aiChatLoadRecentInvestPickExclusions()
        );
        $unique = [];
        $seen = [];
        foreach ($exclude as $name) {
            $name = trim((string)$name);
            $key = aiChatSkinFamilyKey($name);
            if ($name === '' || $key === '' || isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $unique[] = $name;
        }
        $state = [
            'salt' => aiChatNewInvestRotationSalt($userMessage, $messages),
            'exclude' => $unique,
        ];
    }
    return $state;
}

/**
 * Accept a priced, liquid catalog row for open-ended invest shortlists.
 */
function aiChatInvestCandidateLooksQuality(string $name, string $category, float $price, int $listings): bool
{
    $name = trim($name);
    if ($name === '' || $price <= 0) {
        return false;
    }
    if (preg_match('/\b(key|map coin|music kit|sealed|terminal)\b/iu', $name)) {
        return false;
    }
    if (aiChatIsCharmItem($name) || preg_match('/^Sticker Slab\s*\|/iu', $name)) {
        return false;
    }
    $category = mb_strtolower(trim($category));
    if (preg_match('/^stattrak/iu', $name) && $category === 'skins') {
        return false;
    }
    if (aiChatIsGloveItem($name) || preg_match('/glove/i', $category)) {
        return $listings >= 4 && $price >= 5;
    }
    if (aiChatIsKnifeItem($name) || preg_match('/knife/i', $category)) {
        return $listings >= 4 && $price >= 5;
    }
    if ($category === 'skins' || (str_contains($name, '|') && !preg_match('/^sticker\s*\|/iu', $name))) {
        return $listings >= 18 && $price >= 1.2 && $price <= 140;
    }
    if ($category === 'cases' || aiChatIsWeaponCaseItem($name)) {
        if (preg_match('/\bSouvenir Package\b/iu', $name)) {
            return $listings >= 12 && $price <= 80;
        }
        if (aiChatIsStickerCapsuleItem($name)) {
            return $listings >= 40 && $price <= 40;
        }
        return aiChatIsWeaponCaseItem($name) && $listings >= 400 && $price >= 0.2 && $price <= 30;
    }
    if (preg_match('/\bSouvenir Package\b/iu', $name)) {
        return $listings >= 12 && $price <= 80;
    }
    if (aiChatIsStickerCapsuleItem($name)) {
        return $listings >= 40 && $price <= 40;
    }
    return false;
}

function aiChatInvestNameHasCatalogQuality(string $name): bool
{
    $hit = aiChatRoiCatalogByName()[$name] ?? null;
    if (!is_array($hit)) {
        return false;
    }
    $price = is_numeric($hit['seed_sell_price'] ?? null) ? (float)$hit['seed_sell_price'] : 0.0;
    $listings = is_numeric($hit['seed_sell_listings'] ?? null) ? (int)$hit['seed_sell_listings'] : 0;
    return aiChatInvestCandidateLooksQuality($name, (string)($hit['category'] ?? ''), $price, $listings);
}

/**
 * Liquid, reasonably priced catalog names (cached per process).
 *
 * @return list<string>
 */
function aiChatPricedCatalogInvestSeeds(string $weapon = '', string $itemType = '', float $maxUnitPrice = 0.0, bool $wantStatTrak = false): array
{
    static $scored = null;
    if (!is_array($scored)) {
        $scored = [];
        foreach (aiChatLoadRoiCatalogItems() as $item) {
            if (!is_array($item)) {
                continue;
            }
            $name = trim((string)($item['market_hash_name'] ?? ''));
            $category = (string)($item['category'] ?? '');
            $price = is_numeric($item['seed_sell_price'] ?? null) ? (float)$item['seed_sell_price'] : 0.0;
            $listings = is_numeric($item['seed_sell_listings'] ?? null) ? (int)$item['seed_sell_listings'] : 0;
            if (!aiChatInvestCandidateLooksQuality($name, $category, $price, $listings)) {
                continue;
            }
            $score = $listings;
            if (str_contains(mb_strtolower($name), 'field-tested')) {
                $score += 50;
            }
            if (aiChatCatalogNameWeapon($name) !== '') {
                $score += 90;
            }
            $scored[] = [
                'name' => $name,
                'score' => $score,
                'price' => $price,
            ];
        }
        usort($scored, static function (array $a, array $b): int {
            return $b['score'] <=> $a['score'];
        });
    }

    $out = [];
    $seen = [];
    foreach ($scored as $row) {
        $name = (string)$row['name'];
        if (!aiChatCatalogNameMatchesScope($name, $weapon, $itemType, $wantStatTrak)) {
            continue;
        }
        if ($maxUnitPrice > 0 && (float)$row['price'] > $maxUnitPrice + 0.009) {
            continue;
        }
        $base = aiChatSkinFamilyKey($name);
        if ($base === '' || isset($seen[$base])) {
            continue;
        }
        $seen[$base] = true;
        $out[] = $name;
        if (count($out) >= 80) {
            break;
        }
    }
    return $out;
}

/**
 * @return string|null Normalized market name, or null when the row is out of scope.
 */
function aiChatAcceptInvestCandidate(string $name, string $weapon, string $itemType, float $maxUnitPrice, bool $wantStatTrak = false): ?string
{
    $name = trim($name);
    if ($name === '') {
        return null;
    }
    if (!aiChatCatalogNameMatchesScope($name, $weapon, $itemType, $wantStatTrak)) {
        return null;
    }
    if ($itemType === 'souvenir') {
        $name = aiChatToSouvenirMarketName($name);
        if (!aiChatIsExplicitSouvenirName($name) && !preg_match('/\bSouvenir Package\b/iu', $name)) {
            return null;
        }
    }
    if (aiChatIsStickerCardScope($itemType)) {
        if (aiChatIsWeaponCaseItem($name) || aiChatLooksLikeGunSkinName($name)) {
            return null;
        }
        $resolved = aiChatResolveStickerPickName($name, $itemType === 'sticker_capsule');
        if (
            $resolved === null
            || aiChatIsWeaponCaseItem($resolved)
            || aiChatLooksLikeGunSkinName($resolved)
            || !aiChatIsStickerScopedItem($resolved, $itemType === 'sticker_capsule')
        ) {
            return null;
        }
        $name = $resolved;
    }
    if ($itemType === 'charm') {
        $resolved = aiChatResolveCharmPickName($name);
        if ($resolved === null || !aiChatIsCharmItem($resolved)) {
            return null;
        }
        $name = $resolved;
    }
    if ($maxUnitPrice > 0) {
        $unit = aiChatCandidateSeedPrice($name);
        if ($unit <= 0) {
            $card = aiChatResolveCatalogCard($name);
            $unit = is_array($card) && is_numeric($card['seed_sell_price'] ?? null)
                ? (float)$card['seed_sell_price']
                : 0.0;
        }
        if ($itemType !== 'souvenir' && ($unit <= 0 || $unit > $maxUnitPrice + 0.009)) {
            return null;
        }
        if ($itemType === 'souvenir' && $unit > 0 && $unit > $maxUnitPrice + 0.009) {
            return null;
        }
    }
    return $name;
}

/**
 * Walk a name list and keep a mix of bases / finishes / weapons / price bands.
 *
 * @param list<string> $names
 * @return list<string>
 */
function aiChatPickDiversifiedFromPool(
    array $names,
    int $limit,
    string $weapon = '',
    string $itemType = '',
    float $maxUnitPrice = 0.0,
    bool $wantStatTrak = false
): array {
    $limit = max(1, $limit);
    $openMix = $weapon === '';
    $picked = [];
    $seenBase = [];
    $seenFinish = [];
    $seenWeapon = [];
    $seenBand = [];
    $seenCollection = [];
    $caseCount = 0;
    $capsuleCount = 0;

    $tryAdd = static function (string $name, bool $strictWeapon, bool $strictFinish) use (
        &$picked,
        &$seenBase,
        &$seenFinish,
        &$seenWeapon,
        &$seenBand,
        &$seenCollection,
        &$caseCount,
        &$capsuleCount,
        $limit,
        $weapon,
        $itemType,
        $openMix,
        $maxUnitPrice,
        $wantStatTrak
    ): bool {
        if (count($picked) >= $limit) {
            return false;
        }
        $accepted = aiChatAcceptInvestCandidate($name, $weapon, $itemType, $maxUnitPrice, $wantStatTrak);
        if ($accepted === null) {
            return false;
        }
        $name = $accepted;
        if ($openMix && $itemType === '' && aiChatIsWeaponCaseItem($name) && $caseCount >= 2) {
            return false;
        }
        if ($openMix && $itemType === '' && aiChatIsStickerCapsuleItem($name) && $capsuleCount >= 1) {
            return false;
        }
        if ($openMix && $itemType === '' && preg_match('/\bSouvenir Package\b/iu', $name)) {
            return false;
        }
        $base = aiChatSkinFamilyKey($name);
        if ($base === '' || isset($seenBase[$base])) {
            return false;
        }
        $finish = aiChatFinishFamilyKey($name);
        if ($strictFinish && $openMix && $finish !== '' && isset($seenFinish[$finish])) {
            return false;
        }
        $gotWeapon = aiChatCatalogNameWeapon($name);
        $weaponKey = mb_strtolower($gotWeapon);
        if ($strictWeapon && $openMix && $weaponKey !== '' && isset($seenWeapon[$weaponKey])) {
            return false;
        }
        $collectionKey = '';
        if ($itemType === 'collection') {
            $collectionKey = aiChatCanonicalTrackedCollection(aiChatSkinOriginName($name));
            if ($collectionKey === '') {
                $collectionKey = '_unknown';
            }
            $perCollection = (int)($seenCollection[$collectionKey] ?? 0);
            if ($strictWeapon && $perCollection >= 1) {
                return false;
            }
            if ($perCollection >= 2) {
                return false;
            }
        }
        $seenBase[$base] = true;
        if ($finish !== '') {
            $seenFinish[$finish] = true;
        }
        if ($weaponKey !== '') {
            $seenWeapon[$weaponKey] = true;
        }
        $band = aiChatPriceBandKey(aiChatCandidateSeedPrice($name));
        if ($band !== 'unknown') {
            $seenBand[$band] = true;
        }
        if (aiChatIsWeaponCaseItem($name)) {
            $caseCount++;
        }
        if (aiChatIsStickerCapsuleItem($name)) {
            $capsuleCount++;
        }
        if ($collectionKey !== '') {
            $seenCollection[$collectionKey] = (int)($seenCollection[$collectionKey] ?? 0) + 1;
        }
        $picked[] = $name;
        return true;
    };

    foreach ($names as $name) {
        $tryAdd((string)$name, true, true);
        if (count($picked) >= $limit) {
            return $picked;
        }
    }
    foreach ($names as $name) {
        $tryAdd((string)$name, false, true);
        if (count($picked) >= $limit) {
            return $picked;
        }
    }
    foreach ($names as $name) {
        $tryAdd((string)$name, false, false);
        if (count($picked) >= $limit) {
            return $picked;
        }
    }
    return $picked;
}

/**
 * Top bullish / trending market-hash names from the site pulse + defaults.
 *
 * @return list<string>
 */
function aiChatTrendingForecastCandidates(int $limit = 6): array
{
    $names = [];
    $seen = [];
    $add = static function (string $name) use (&$names, &$seen, $limit): void {
        $name = trim($name);
        if ($name === '' || count($names) >= $limit) {
            return;
        }
        $key = mb_strtolower($name);
        if (isset($seen[$key])) {
            return;
        }
        $seen[$key] = true;
        $names[] = $name;
    };

    if (is_file(__DIR__ . '/mark_daily_pulse_helpers.php')) {
        require_once __DIR__ . '/mark_daily_pulse_helpers.php';
        $home = markDailyPulseLoadHomeRoi();
        foreach (array_slice($home['trending'], 0, $limit) as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $add((string)($entry['market_hash_name'] ?? $entry['display_name'] ?? ''));
        }
    }

    foreach (aiChatDefaultSuggestionNames() as $name) {
        $add($name);
    }

    return $names;
}

/**
 * Unique investable names across weapons, finishes, and price bands.
 * Builds a large liquid pool, then rotates a diverse shortlist per request.
 *
 * @param list<string> $excludeNames
 * @return list<string>
 */
function aiChatDiversifiedInvestCandidates(
    int $limit = 10,
    string $weapon = '',
    string $itemType = '',
    float $maxUnitPrice = 0.0,
    array $excludeNames = [],
    ?int $rotationSalt = null,
    bool $wantStatTrak = false
): array {
    $limit = max(3, min(16, $limit));
    if ($rotationSalt === null) {
        $state = aiChatInvestRotationState();
        $rotationSalt = (int)$state['salt'];
        if (!$excludeNames) {
            $excludeNames = $state['exclude'];
        }
    }

    $pool = [];
    $seen = [];
    $openMix = $weapon === '' && $itemType === '';
    $push = static function (string $name, bool $requireQuality = false) use (
        &$pool,
        &$seen,
        $weapon,
        $itemType,
        $maxUnitPrice,
        $openMix,
        $wantStatTrak
    ): void {
        $accepted = aiChatAcceptInvestCandidate($name, $weapon, $itemType, $maxUnitPrice, $wantStatTrak);
        if ($accepted === null) {
            return;
        }
        if ($openMix && preg_match('/\bSouvenir Package\b/iu', $accepted)) {
            return;
        }
        if ($requireQuality && !aiChatInvestNameHasCatalogQuality($accepted)) {
            // Curated defaults (Redline, etc.) may be missing from the ROI catalog.
            $inDefaults = in_array($accepted, aiChatDefaultSuggestionNames(), true);
            if (!$inDefaults) {
                return;
            }
        }
        $key = mb_strtolower($accepted);
        if (isset($seen[$key])) {
            return;
        }
        $seen[$key] = true;
        $pool[] = $accepted;
    };

    if ($itemType !== 'souvenir' && !aiChatIsStickerCardScope($itemType) && $itemType !== 'charm') {
        foreach (aiChatTrendingForecastCandidates(20) as $name) {
            $push($name);
        }
        foreach (aiChatPricedCatalogInvestSeeds($weapon, $itemType, $maxUnitPrice, $wantStatTrak) as $name) {
            $push($name);
        }
        if ($itemType !== 'collection' && !aiChatIsEquipmentCategoryScope($itemType)) {
            foreach (aiChatDefaultSuggestionNames() as $name) {
                $push($name);
            }
        }
    }
    if ($itemType === 'collection') {
        foreach (aiChatCollectionInvestSeedNames(40, $maxUnitPrice) as $name) {
            $push($name);
        }
    }

    $seeds = [];
    if ($itemType === 'sticker_capsule') {
        $seeds[] = ['Sticker Capsule', 'sticker_capsule'];
        foreach (['Chroma', 'Gamma', 'Community', 'Paris', 'Copenhagen', 'Budapest', 'EMS Katowice'] as $needle) {
            $seeds[] = [$needle, 'sticker_capsule'];
        }
        foreach (aiChatStickerInvestSeedNames(32, true, true) as $name) {
            $push($name);
        }
        foreach (aiChatDefaultStickerCapsuleNames() as $name) {
            $push($name);
        }
        foreach (aiChatPricedCatalogInvestSeeds($weapon, $itemType, $maxUnitPrice) as $name) {
            $push($name);
        }
    } elseif ($itemType === 'sticker') {
        $seeds[] = ['Sticker |', 'sticker'];
        $seeds[] = ['Sticker Capsule', 'sticker'];
        foreach (['Katowice', 'Budapest', 'Paris', 'Community', 'Crown', 'Howling Dawn'] as $needle) {
            $seeds[] = [$needle, 'sticker'];
        }
        foreach (aiChatStickerInvestSeedNames(32, true, false) as $name) {
            $push($name);
        }
        foreach (aiChatDefaultPaperStickerNames() as $name) {
            $push($name);
        }
        foreach (aiChatDefaultStickerCapsuleNames() as $name) {
            $push($name);
        }
        foreach (aiChatPricedCatalogInvestSeeds($weapon, $itemType, $maxUnitPrice) as $name) {
            $push($name);
        }
    } elseif ($itemType === 'souvenir') {
        if ($weapon !== '') {
            $seeds[] = [$weapon, 'souvenir'];
        } else {
            foreach (['AK-47', 'AWP', 'M4A1-S', 'Glock-18', 'USP-S', 'MAC-10', 'Desert Eagle', 'MP9', 'P90', 'FAMAS'] as $needle) {
                $seeds[] = [$needle, 'souvenir'];
            }
        }
        $seeds[] = ['Souvenir Package', 'souvenir'];
        foreach (aiChatDefaultSouvenirSuggestionNames() as $name) {
            $push($name);
        }
        foreach (aiChatPricedCatalogInvestSeeds($weapon, $itemType, $maxUnitPrice) as $name) {
            $push($name);
        }
    } elseif ($itemType === 'charm') {
        $seeds[] = ['Charm |', 'charm'];
        $seeds[] = ['Charm', 'charm'];
        foreach (['Hot Wurst', 'Small Arms', 'Missing Link', 'Die-cast', 'Disco MAC', 'Diamond Dog'] as $needle) {
            $seeds[] = [$needle, 'charm'];
        }
        foreach (aiChatCharmInvestSeedNames(32, true) as $name) {
            $push($name);
        }
        foreach (aiChatDefaultCharmSuggestionNames() as $name) {
            $push($name);
        }
    } elseif ($itemType === 'gloves') {
        foreach (['Gloves', 'Specialist Gloves', 'Hydra Gloves', 'Sport Gloves', 'Driver Gloves', 'Moto Gloves', 'Hand Wraps'] as $needle) {
            $seeds[] = [$needle, 'gloves'];
        }
        foreach (aiChatDefaultGloveSuggestionNames() as $name) {
            $push($name);
        }
    } elseif ($itemType === 'knife') {
        foreach (['Knife', 'Bayonet', 'Karambit', 'Butterfly Knife', 'M9 Bayonet', 'Talon Knife'] as $needle) {
            $seeds[] = [$needle, 'knife'];
        }
        foreach (aiChatDefaultKnifeSuggestionNames() as $name) {
            $push($name);
        }
    } elseif (in_array($itemType, ['rifle', 'pistol', 'smg', 'shotgun', 'sniper', 'heavy'], true)) {
        $classNeedles = match ($itemType) {
            'rifle' => ['AK-47', 'M4A1-S', 'M4A4', 'AWP', 'FAMAS', 'Galil AR', 'AUG'],
            'pistol' => ['Glock-18', 'USP-S', 'Desert Eagle', 'P250', 'Five-SeveN'],
            'smg' => ['MAC-10', 'MP9', 'MP7', 'P90', 'UMP-45'],
            'shotgun' => ['Nova', 'XM1014', 'MAG-7', 'Sawed-Off'],
            'sniper' => ['AWP', 'SSG 08', 'SCAR-20', 'G3SG1'],
            default => ['Negev', 'M249'],
        };
        foreach ($classNeedles as $needle) {
            $seeds[] = [$needle, $itemType];
        }
    } elseif ($weapon !== '') {
        $seeds[] = [$weapon, $itemType !== '' ? $itemType : 'skin'];
    } elseif ($itemType === 'case') {
        $seeds[] = ['Case', 'case'];
    } else {
        $needles = [
            'AK-47', 'AWP', 'M4A1-S', 'M4A4', 'Glock-18', 'USP-S', 'MAC-10',
            'Desert Eagle', 'P250', 'MP9', 'FAMAS', 'Galil AR', 'P90',
        ];
        foreach ($needles as $needle) {
            $seeds[] = [$needle, 'skin'];
        }
        if ($itemType === '') {
            $seeds[] = ['Case', 'case'];
        }
    }

    foreach ($seeds as [$seed, $type]) {
        $seedWeapon = $weapon;
        if ($seedWeapon === '' && $type === 'skin') {
            $seedWeapon = $seed;
        } elseif ($seedWeapon === '' && $type === 'souvenir' && !preg_match('/package/iu', $seed)) {
            $seedWeapon = $seed;
        }
        $perSeed = $type === 'souvenir' ? 8 : 6;
        foreach (aiChatCollectUniqueCatalogNames($seed, $perSeed, $seedWeapon, $type, $wantStatTrak) as $name) {
            $push($name, $itemType === '' || $itemType === 'skin' || $itemType === 'case');
        }
    }

    if ($itemType === 'souvenir' || aiChatIsStickerCardScope($itemType) || $itemType === 'charm' || aiChatIsEquipmentCategoryScope($itemType)) {
        $fallbackNames = match ($itemType) {
            'souvenir' => aiChatDefaultSouvenirSuggestionNames(),
            'sticker_capsule' => aiChatDefaultStickerCapsuleNames(),
            'sticker' => array_merge(aiChatDefaultPaperStickerNames(), aiChatDefaultStickerCapsuleNames()),
            'gloves' => aiChatDefaultGloveSuggestionNames(),
            'knife' => aiChatDefaultKnifeSuggestionNames(),
            default => $itemType === 'charm' ? aiChatDefaultCharmSuggestionNames() : [],
        };
        foreach ($fallbackNames as $name) {
            $push($name);
        }
        if ($itemType === 'charm') {
            foreach (aiChatCharmInvestSeedNames(24, true) as $name) {
                $push($name);
            }
        }
        if (aiChatIsStickerCardScope($itemType)) {
            foreach (aiChatStickerInvestSeedNames(24, true, $itemType === 'sticker_capsule') as $name) {
                $push($name);
            }
        }
    } else {
        foreach (aiChatDefaultSuggestionNames() as $name) {
            $push($name);
        }
    }

    if ($maxUnitPrice > 0 && count($pool) < ($limit * 3)) {
        foreach (aiChatLoadRoiCatalogItems() as $item) {
            if (!is_array($item)) {
                continue;
            }
            $cand = trim((string)($item['market_hash_name'] ?? ''));
            $seed = is_numeric($item['seed_sell_price'] ?? null) ? (float)$item['seed_sell_price'] : 0.0;
            if ($cand === '' || $seed <= 0 || $seed > $maxUnitPrice + 0.009) {
                continue;
            }
            $push($cand);
            if (count($pool) >= 80) {
                break;
            }
        }
    }

    $excludeKeys = [];
    foreach ($excludeNames as $name) {
        $key = aiChatSkinFamilyKey((string)$name);
        if ($key !== '') {
            $excludeKeys[$key] = true;
        }
    }
    $fresh = [];
    foreach ($pool as $name) {
        $key = aiChatSkinFamilyKey($name);
        if ($key !== '' && isset($excludeKeys[$key])) {
            continue;
        }
        $fresh[] = $name;
    }
    if (count($fresh) < max($limit * 3, 18)) {
        $fresh = $pool;
    }

    if ($itemType === 'charm' || aiChatIsStickerCardScope($itemType)) {
        usort($fresh, static function (string $a, string $b): int {
            $aPrice = aiChatCandidateSeedPrice($a);
            $bPrice = aiChatCandidateSeedPrice($b);
            $aHas = $aPrice > 0 ? 0 : 1;
            $bHas = $bPrice > 0 ? 0 : 1;
            if ($aHas !== $bHas) {
                return $aHas <=> $bHas;
            }
            if ($aPrice !== $bPrice) {
                return $aPrice <=> $bPrice;
            }
            return mb_strtolower($a) <=> mb_strtolower($b);
        });
        $window = array_slice($fresh, 0, max(20, $limit * 3));
        $rotated = $window;
    } else {
        $window = array_slice($fresh, 0, max(36, $limit * 4));
        $rotated = aiChatShuffleList($window, $rotationSalt);
    }
    $picked = aiChatPickDiversifiedFromPool($rotated, $limit, $weapon, $itemType, $maxUnitPrice);
    if (count($picked) < $limit) {
        foreach ($fresh as $name) {
            $picked = aiChatPickDiversifiedFromPool(array_merge($picked, [$name]), $limit, $weapon, $itemType, $maxUnitPrice);
            if (count($picked) >= $limit) {
                break;
            }
        }
    }

    return $picked;
}

/**
 * Priced, diversified candidate block + invest answer format.
 */
function aiChatBuildInvestPicksContext(string $userMessage, array $pageContext, array $messages = []): string
{
    if ($messages) {
        aiChatInvestRotationState($messages, $userMessage);
    }
    $scope = aiChatRequestedCardScope($userMessage);
    $budgetEuro = aiChatExtractBudgetEuro($userMessage);
    $names = aiChatDiversifiedInvestCandidates(14, $scope['weapon'], $scope['type'], $budgetEuro > 0 ? $budgetEuro : 0.0);
    if ($scope['type'] === 'charm') {
        $wantSouvenirCharms = aiChatWantsSouvenirItems($userMessage);
        $preferCheap = aiChatLooksLikeCheapestItemAsk($userMessage);
        $charmSeeds = aiChatCharmInvestSeedNames(14, $preferCheap, $wantSouvenirCharms);
        if ($charmSeeds) {
            $names = $charmSeeds;
        }
    }
    if (aiChatIsStickerCardScope($scope['type'])) {
        $preferCheap = aiChatLooksLikeCheapestItemAsk($userMessage);
        $stickerSeeds = aiChatStickerInvestSeedNames(14, $preferCheap, $scope['type'] === 'sticker_capsule');
        if ($stickerSeeds) {
            $names = $stickerSeeds;
        }
    }
    if (!$names && $scope['type'] === 'charm') {
        $names = aiChatCharmInvestSeedNames(14, aiChatLooksLikeCheapestItemAsk($userMessage));
        if (!$names) {
            $names = aiChatDefaultCharmSuggestionNames();
        }
    }
    if (!$names && aiChatIsStickerCardScope($scope['type'])) {
        $names = aiChatStickerInvestSeedNames(14, aiChatLooksLikeCheapestItemAsk($userMessage), $scope['type'] === 'sticker_capsule');
        if (!$names) {
            $names = $scope['type'] === 'sticker_capsule'
                ? aiChatDefaultStickerCapsuleNames()
                : array_merge(aiChatDefaultPaperStickerNames(), aiChatDefaultStickerCapsuleNames());
        }
    }
    if (!$names) {
        if ($scope['type'] !== 'collection') {
            return '';
        }
        $fallbackNames = [];
        foreach (aiChatTrackedCollectionEntries() as $entry) {
            $fallbackNames[] = (string)($entry['name'] ?? '');
        }
        $fallbackNames = array_values(array_filter($fallbackNames));
        if ($fallbackNames === []) {
            return '';
        }
        $lines = [
            'COLLECTION-INVEST: no priced membership rows were available. PRIMARY ANSWER: after ### AI market, emit ### Collections to watch (never write shortlist) with 3–5 real tracked collection names as **Name** — one-line why. Use ONLY these site collections — never invent a name. Then pick skins you know belong to those named collections:',
            implode(', ', array_slice($fallbackNames, 0, 18)) . '.',
            'COLLECTIONS HARD RULE: AFTER ### AI market, list 3–5 bold collection names under ### Collections to watch (**Name** — why). ### Items to buy must be skins from those named collections only.',
        ];
        return implode("\n", $lines);
    }
    aiChatRememberInvestPickSet($names);

    $lines = match ($scope['type']) {
        'souvenir' => [
            'SOUVENIR-ONLY invest candidates (Souvenir Packages and Souvenir Weapon | Skin rows). Every pick MUST be souvenir — never regular skins, StatTrak, cases, or non-souvenir stickers:',
        ],
        'sticker_capsule' => [
            'STICKER-CAPSULE-ONLY invest candidates (Sticker Capsule / Autograph Capsule / EMS Katowice sets from this site\'s stickers.html catalog). Every pick MUST be a sticker or autograph capsule — never weapon cases (Snakebite Case, Clutch Case, Falchion Case, Spectrum Case, Operation Hydra Case, etc.) and never gun skins (Glock-18 | Moonrise, USP-S | Guardian):',
        ],
        'sticker' => [
            'STICKER-ONLY invest candidates (paper stickers Sticker | … and sticker/autograph capsules from this site\'s stickers.html catalog). Every pick MUST be a real sticker or sticker capsule. NEVER recommend weapon skins or weapon cases (no Snakebite Case, Clutch Case, Glock-18 | Moonrise, USP-S | Guardian). NEVER suffix " Sticker" onto a rifle/pistol name:',
        ],
        'charm' => [
            'CHARM-ONLY invest candidates (CS2 keychain charms from this site\'s charm catalog — Charm | Hot Wurst, Small Arms, Missing Link, Dr. Boom, Souvenir Charm | …). Every pick MUST be a real charm. NEVER recommend weapon skins and NEVER suffix " Charm" onto a rifle/AWP/pistol name (no AK-47 | Redline Charm, no M4A1-S | Night Terror Charm):',
        ],
        'collection' => [
            'COLLECTION-INVEST candidates (skins that belong to tracked CS2 collections on this site). PRIMARY ANSWER: after ### AI market, name 3–5 collections under ### Collections to watch (never write shortlist) as **Name** — one-line why, then pick skins ONLY from those named collections. Never invent a collection name. Never recommend a popular skin from an unnamed collection (no AK-47 | Redline / M4A1-S | Night Terror unless that skin\'s [Collection] tag is one you named):',
        ],
        'gloves' => [
            'GLOVES-ONLY invest candidates. Every pick MUST be gloves / hand wraps (Specialist Gloves, Hydra Gloves, Sport Gloves, Driver Gloves). Never knives (Bayonet), never rifles (AK-47), never pistols or cases:',
        ],
        'knife' => [
            'KNIVES-ONLY invest candidates. Every pick MUST be a knife (Bayonet, Karambit, Butterfly, M9). Never gloves, never rifles, never pistols or cases:',
        ],
        'rifle' => [
            'RIFLES-ONLY invest candidates (AK-47, M4, AWP, FAMAS, Galil, AUG, snipers). Every pick MUST be a rifle skin. Never gloves, knives, pistols, SMGs, or cases:',
        ],
        'pistol' => [
            'PISTOLS-ONLY invest candidates. Every pick MUST be a pistol skin (Glock-18, USP-S, Desert Eagle, P250). Never rifles, gloves, knives, or cases:',
        ],
        'smg' => [
            'SMG-ONLY invest candidates. Every pick MUST be an SMG skin (MAC-10, MP9, P90, UMP-45). Never rifles, pistols, gloves, or cases:',
        ],
        'stattrak' => [
            'STATTRAK-ONLY invest candidates. Every pick MUST start with StatTrak™. Never regular (non-StatTrak) skins, souvenirs, or cases:',
        ],
        default => [
            'Rotating invest candidates from this site cache (liquid, priced rows across weapons, finishes, and price bands). Pick a MIX of 3–5 from ANYWHERE in this list — never always the first five, never dump one finish family such as Elite Build on four guns, and do not repeat the same set as a prior reply in this thread:',
        ],
    };
    if ($budgetEuro > 0) {
        $budget = aiChatExtractBudgetDetails($userMessage);
        $slack = round($budgetEuro * 0.05, 2);
        $low = max(0, round($budgetEuro - $slack, 2));
        $high = round($budgetEuro + $slack, 2);
        $lines[] = 'BUDGET HARD CAP: ' . $budget['label']
            . ' (site prices are €; ±5% OK — roughly €' . number_format($low, 2, '.', '')
            . '–€' . number_format($high, 2, '.', '')
            . ' TOTAL). Pick 3–5 unique item types and assign whole quantities (×2, ×10, etc.) so unit_price × qty per line sums into that band.'
            . ' Cheap cases/capsules SHARE this total — never give each cheap pick its own €20–50 slice.'
            . ' Drop any item whose unit price alone exceeds the budget; do not keep it with "exceeds budget; remove".'
            . ' One coherent pick list only (no draft list then adjusted list).'
            . ' Each bullet must show qty and line total, e.g. **Name (wear)** — €12.00 ×3 = €36.00 — why. Never list 1× each if that leaves the plan far under budget.'
            . ' After ### Why these picks, STOP. Do not emit Proposed final mix, replace-X-with-Y writeups, or a Portfolio total recap that re-lists every line.';
        $sample = aiChatSuggestPortfolioAllocation($names, $budgetEuro);
        if ($sample !== '') {
            $lines[] = 'Example quantity plan from these candidates (adjust picks/weights but keep the TOTAL near budget — not each line near budget):';
            $lines[] = $sample;
        }
    } elseif (aiChatLooksLikeHoldHorizonQuestion($userMessage) || aiChatLooksLikeOpenEndedInvestQuestion($userMessage)) {
        if (aiChatIsStickerCardScope($scope['type'])) {
            $lines[] = 'CHEAP STICKERS/CAPSULES (unit price under €5): every such pick MUST show quantity + line total on the bullet — e.g. **€0.13 ×150 = €19.50** — why. Never 1× only; when NO total budget is set, target a sensible ~€20–50 slice. Never substitute weapon cases (Snakebite Case, Clutch Case) or gun skins.';
        } elseif ($scope['type'] !== 'charm' && $scope['type'] !== 'souvenir') {
            $lines[] = 'CHEAP ITEMS (cases, capsules, unit price under €5): every such pick MUST show quantity + line total on the bullet — e.g. **€0.40 ×50 = €20.00** — why. Never 1× only; when NO total budget is set, target a sensible ~€20–50 slice (often 50–100 units for sub-€1 cases). After Why these picks, stop — no portfolio-total recap.';
        }
    }

    if ($scope['type'] === 'collection') {
        $named = [];
        foreach ($names as $candName) {
            $canon = aiChatCanonicalTrackedCollection(aiChatSkinOriginName((string)$candName));
            if ($canon !== '') {
                $named[$canon] = true;
            }
        }
        if ($named !== []) {
            $lines[] = 'TRACKED COLLECTIONS IN THIS LIST (PRIMARY ANSWER — after ### AI market, name 3–5 of these under ### Collections to watch as **Name** — one-line why; never write shortlist; do not invent names): '
                . implode(', ', array_keys($named)) . '.';
        }
    }

    $liveBudget = ($scope['type'] === 'souvenir' || $scope['type'] === 'charm' || aiChatIsStickerCardScope($scope['type'])) ? 8 : 0;
    foreach ($names as $name) {
        $row = aiChatLoadPriceRow($name, $scope['type'] === 'souvenir', $liveBudget);
        $price = is_array($row) ? round((float)($row['current_price'] ?? 0), 2) : aiChatCandidateSeedPrice($name);
        $line = '- ' . $name;
        if ($price > 0) {
            $line .= ' — €' . number_format($price, 2, '.', '');
        }
        if (is_array($row)) {
            $history = is_array($row['history'] ?? null) ? $row['history'] : [];
            if (count($history) >= 4) {
                $change30 = aiChatHistoryBaseline($history, 30, $price > 0 ? $price : null);
                if (is_numeric($change30['change_pct'] ?? null)) {
                    $line .= ' | 30d ' . aiChatFormatSignedPct((float)$change30['change_pct']);
                }
            }
            if (isset($row['volume_24h']) && $row['volume_24h'] !== null) {
                $line .= ' | 24h vol ' . number_format((int)$row['volume_24h']);
            }
            if (isset($row['sell_orders']) && $row['sell_orders'] !== null) {
                $line .= ' | ' . number_format((int)$row['sell_orders']) . ' listings';
            }
        }
        $hit = aiChatRoiCatalogByName()[$name] ?? null;
        if (is_array($hit)) {
            $category = trim((string)($hit['category'] ?? ''));
            if ($category !== '') {
                $line .= ' [' . $category . ']';
            }
        }
        $collectionName = aiChatCanonicalTrackedCollection(aiChatSkinOriginName($name));
        if ($collectionName !== '') {
            $line .= ' [' . $collectionName . ']';
        }
        $lines[] = $line;
    }

    $cheapestMap = aiChatCheapestListingsByName($names);
    if ($cheapestMap) {
        $lines[] = 'Cheapest tracked asks (use these exact € figures on the pick bullet; the item card shows the same number; never write €X.XX):';
        $shown = 0;
        foreach ($names as $name) {
            $listing = $cheapestMap[$name] ?? null;
            if (!is_array($listing) || (float)($listing['price'] ?? 0) <= 0) {
                continue;
            }
            $lines[] = aiChatFormatCheapestListingLine((string)$name, $listing);
            $shown++;
            if ($shown >= 10) {
                break;
            }
        }
    }

    if (aiChatIsStickerCardScope($scope['type'])) {
        $noun = $scope['type'] === 'sticker_capsule'
            ? 'sticker/autograph capsules'
            : 'paper stickers (Sticker | …) and/or sticker capsules';
        $lines[] = 'Use 3–5 of these ' . $noun . ' only — never invent other catalog rows, never weapon cases, never gun skins. Choose from the whole shortlist, not the top of the list, and vary from prior replies. Unique names only — each name at most once under Items to buy and once under Why these picks; repeat the same name only via ×qty on one bullet. Each pick MUST include qty, line total, and a short why: • **Name** — €unit ×qty = €line_total — one clause from trend/volume/listings/rarity. Capsules and any pick under €5 need bulk qty when no TOTAL budget is set; with a TOTAL budget, share that budget across picks. "on CSFloat" / "on Skinport" is NOT a why. After ### Why these picks, STOP — never a second list or Portfolio total recap. Use each item\'s cheapest tracked ask € (same figure the cards show). Cards under the reply are the named picks only.';
    } else {
        $lines[] = 'Use 3–5 of these (or other priced catalog rows). Choose from the whole shortlist, not the top of the list, and vary from prior replies. Unique item types only — each market identity (weapon|skin + wear, or case/capsule name) at most once; repeat the same name only via ×qty on one bullet, never duplicate bullets. A case/sticker is fine only as a real pick, not filler. Each pick MUST include qty, line total, and a short why: • **Name (wear)** — €unit ×qty = €line_total — one clause from trend/volume/listings/rarity. Cases/capsules and any pick under €5 need bulk qty when no TOTAL budget is set; with a TOTAL budget, share that budget across picks (do not stack independent €20–50 slices). "on CSFloat" / "on Skinport" is NOT a why. After ### Why these picks, STOP — never a second list or Portfolio total recap. Use each item\'s cheapest tracked ask € (same figure the cards show). Skip sticker crafts unless in context. Cards under the reply are the named picks only.';
    }
    if ($scope['type'] === 'souvenir') {
        $lines[] = 'SOUVENIR HARD RULE: every Items to buy bullet MUST be a Souvenir Package or a name starting with Souvenir (e.g. Souvenir AK-47 | Safari Mesh (FT)). Never recommend regular AK-47 | Redline, stickers, StatTrak, or non-souvenir cases.';
    } elseif ($scope['type'] === 'sticker_capsule') {
        $cheapHint = aiChatLooksLikeCheapestItemAsk($userMessage)
            ? ' Prefer the lowest € capsules from this list.'
            : '';
        $lines[] = 'STICKER CAPSULE HARD RULE: every Items to buy bullet MUST be a Sticker Capsule, Autograph Capsule, or EMS Katowice 2014 Legends/Challengers set. Never weapon cases — no Snakebite Case, Clutch Case, Falchion Case, Spectrum Case, Kilowatt Case. Never gun skins (Glock-18 | Moonrise, USP-S | Guardian). Use full catalog names when provided (e.g. Paris 2023 Legends Sticker Capsule, Budapest 2025 Contenders Sticker Capsule).'
            . $cheapHint;
    } elseif ($scope['type'] === 'sticker') {
        $cheapHint = aiChatLooksLikeCheapestItemAsk($userMessage)
            ? ' Prefer the lowest € stickers/capsules from this list.'
            : '';
        $lines[] = 'STICKER HARD RULE: every Items to buy bullet MUST be a paper sticker (Sticker | Bomb Doge, Sticker | Titan (Holo) | Katowice 2014) or a sticker/autograph capsule from this site\'s sticker catalog. Never weapon cases (Snakebite Case, Clutch Case) and never gun skins (Glock-18 | Moonrise, USP-S | Guardian, AK-47 | Redline). Never write Glock-18 | Moonrise Sticker — that is a pistol, not a sticker. Stickers have no FN/MW/FT wear unless it is already in the catalog name. Items to buy and Why these picks must name the same stickers/capsules.'
            . $cheapHint;
    } elseif ($scope['type'] === 'charm') {
        $cheapHint = aiChatLooksLikeCheapestItemAsk($userMessage)
            ? ' Prefer the lowest € charms from this list.'
            : '';
        $lines[] = 'CHARM HARD RULE: every Items to buy bullet MUST be a real CS2 charm using catalog names like **Charm | Hot Wurst** or **Souvenir Charm | Austin 2025 Highlight**. Never gun skins. Never write AK-47 | Redline Charm / M4A1-S | Night Terror Charm / AWP | Worm God Charm — those are rifles, not keychains. Charms have no FN/MW/FT wear. Items to buy and Why these picks must name the same charms.'
            . $cheapHint;
    } elseif ($scope['type'] === 'collection') {
        $lines[] = 'COLLECTIONS HARD RULE: AFTER ### AI market, emit ### Collections to watch (never write shortlist) with 3–5 bold collection names from the TRACKED list as **Name** — one-line why each. That list is the primary answer. ### Items to buy must be skins whose [Collection] tag is one of those named collections — not generic popular skins from other sets. ### Why these picks: **Skin** — short why for EVERY listed pick (same skins as the cards). Never a why line for a collection — Why explains individual skins only.';
    } elseif (aiChatIsEquipmentCategoryScope($scope['type']) || $scope['weapon'] !== '') {
        $label = aiChatCategoryScopeLabel($scope['type'], $scope['weapon']);
        $st = !empty($scope['stattrak']) ? ' StatTrak-only.' : '';
        $lines[] = 'CATEGORY HARD RULE: every Items to buy bullet and every Why these picks line MUST be ' . $label
            . ' only.' . $st
            . ' Never pad the list with other equipment (no Bayonet on a gloves ask, no AK-47 / SCAR-20 on a gloves ask, no gloves on a knife ask).'
            . ' Items to buy and Why these picks must name the same ' . $label . '.';
    }

    return implode("\n", $lines);
}

function aiChatPickAutonomousForecastItem(string $userMessage, array $pageContext, array $messages = []): string
{
    $explicit = aiChatResolveForecastItemTerm($userMessage, $pageContext, $messages, false);
    if ($explicit !== '') {
        return $explicit;
    }

    $scope = aiChatRequestedCardScope($userMessage);
    $pool = aiChatLooksLikeItemPickQuestion($userMessage)
        ? aiChatDiversifiedInvestCandidates(8, $scope['weapon'], $scope['type'])
        : aiChatTrendingForecastCandidates(8);
    if (!$pool) {
        $pool = aiChatTrendingForecastCandidates(8);
    }

    $liveAttempts = 0;
    foreach ($pool as $candidate) {
        $row = aiChatLoadBestPriceRow($candidate, $pageContext, false);
        if ($row === null) {
            continue;
        }
        $allowLive = $liveAttempts < 2;
        if ($allowLive) {
            $liveAttempts++;
        }
        $row = aiChatEnrichRowHistory($row, $allowLive);
        $history = is_array($row['history'] ?? null) ? $row['history'] : [];
        if (count($history) >= 10 && (float)($row['current_price'] ?? 0) > 0) {
            return (string)($row['market_hash_name'] ?? $candidate);
        }
    }

    $fallback = aiChatTrendingForecastCandidates(1);
    return $fallback[0] ?? '';
}

function aiChatShouldInjectLivePrices(string $userMessage, array $pageContext): bool
{
    $pageType = trim((string)($pageContext['page_type'] ?? ''));
    // Inventory analysis already ships a priced snapshot — skip live Steam round-trips.
    if ($pageType === 'inventory') {
        return false;
    }
    if ($pageType === 'mark') {
        return true;
    }
    if (aiChatLooksLikePriceOrMarketDataQuestion($userMessage)) {
        return true;
    }
    if (aiChatLooksLikeItemPickQuestion($userMessage)) {
        return true;
    }
    if (aiChatLooksLikePredictionQuestion($userMessage)) {
        return true;
    }
    if (aiChatExtractWeaponFamily($userMessage) !== '') {
        return true;
    }

    foreach (['item_name', 'lookup_name'] as $key) {
        if (trim((string)($pageContext[$key] ?? '')) !== '') {
            return true;
        }
    }

    $extracted = aiChatExtractSearchTerms($userMessage);
    if (mb_strlen($extracted) >= 3 && aiChatSearchCatalog($extracted, 1)) {
        return true;
    }

    return false;
}

function aiChatExtractedTermLooksLikeItem(string $term): bool
{
    $term = trim($term);
    if ($term === '' || mb_strlen($term) < 3) {
        return false;
    }

    $lower = mb_strtolower($term);
    // Refuse chat / chart UI phrasing that used to pollute item resolution
    // (e.g. assistant text "I can't create…" → subtitle "can't create").
    if (preg_match('/\b(can(?:not|\'t)|could(?:not|\'t)|won(?:not|\'t)|unable)\b/u', $lower)) {
        return false;
    }
    if (preg_match('/^(?:the\s+)?(?:price|prices|market|history|chart|graph|forecast|outlook|prediction|distribution|supply|listings?)(?:\s+\w+){0,4}$/u', $lower)) {
        return false;
    }

    // Why-clause / sentence fragments mistakenly captured as "Weapon | Finish …".
    if (preg_match('/\b(adds?|gives?|offers?|provides?|brings?|remains?|stays?|keeps?|makes?|helps?|delivers?|shows?|means?|looks?|feels?|works?|fits?|pairs?|complements?|boosts?|balances?|diversifies?|includes?|features?|while|because|since|although|across|among)\b/u', $lower)) {
        return false;
    }

    if (str_contains($term, '|') || str_contains($term, '★')) {
        if (str_contains($term, '|')) {
            $finishParts = explode('|', aiChatStripWear($term), 2);
            $finish = trim((string)($finishParts[1] ?? ''));
            $finishWords = preg_split('/\s+/u', $finish) ?: [];
            // Real finishes are short; long right-hand sides are almost always prose.
            if (count($finishWords) > 6) {
                return false;
            }
        }
        return true;
    }

    $noise = [
        'create', 'make', 'draw', 'show', 'generate', 'plot', 'render', 'display',
        'chart', 'charts', 'graph', 'please', 'thanks', 'hello', 'hey', 'hi', 'yes', 'no',
        'predict', 'prediction', 'forecast', 'outlook', 'trend', 'future', 'price',
        'prices', 'analysis', 'analyze', 'analyse', 'history', 'interactive', 'providers',
        'provider', 'below', 'text', 'plain', 'marketplace', 'marketplaces', 'listing',
        'listings', 'supply', 'distribution', 'here', 'there',
        'build', 'portfolio', 'invest', 'investment', 'hold', 'month', 'months', 'year', 'years',
    ];
    if (in_array($lower, $noise, true)) {
        return false;
    }

    if (preg_match('/\b(case|knife|glove|sticker|awp|ak-?47|m4a1|karambit|butterfly|capsule|souvenir)\b/u', $lower)) {
        return true;
    }

    $stopWords = [
        'can', 'you', 'give', 'me', 'the', 'what', 'how', 'do', 'have', 'access',
        'specific', 'items', 'item', 'skin', 'skins', 'price', 'prices', 'steam', 'api',
        'real', 'time', 'about', 'tell', 'show', 'list', 'recommend', 'suggest',
        'create', 'make', 'draw', 'chart', 'graph', 'plot', 'for', 'a', 'an',
        'please', 'history', 'interactive',
    ];
    $words = preg_split('/\s+/u', $lower) ?: [];
    $stopCount = 0;
    foreach ($words as $word) {
        $word = trim($word, " \t\n\r\0\x0B'\".,!?");
        if ($word === '') {
            continue;
        }
        if (in_array($word, $stopWords, true)) {
            $stopCount++;
        }
    }

    return count($words) <= 5 && $stopCount < 2 && count($words) >= 1 && $stopCount < count($words);
}

/**
 * Resolve a free-form term to a real catalog market_hash_name.
 * Prevents garbage lookups (and get_market_chart_bundle item_id=1 fallback).
 */
function aiChatResolveCatalogItemName(string $term): string
{
    $term = trim($term);
    if ($term === '') {
        return '';
    }

    $normalized = mb_strtolower($term);
    $normalized = (string)preg_replace('/\bak47\b/u', 'ak-47', $normalized);
    $normalized = (string)preg_replace('/\s+/u', ' ', $normalized);

    // Common typos / nicknames users type in chat.
    $aliases = [
        'frostbite' => 'frontside misty',
        'fronstbite' => 'frontside misty',
        'frontsbite' => 'frontside misty',
        'frontside' => 'frontside misty',
        'asiimov' => 'asiimov',
        'printstream' => 'printstream',
        'redline' => 'redline',
    ];
    foreach ($aliases as $from => $to) {
        if (preg_match('/\b' . preg_quote($from, '/') . '\b/u', $normalized)) {
            $normalized = (string)preg_replace(
                '/\b' . preg_quote($from, '/') . '\b/u',
                $to,
                $normalized
            );
        }
    }
    $normalized = trim((string)preg_replace('/\s+/u', ' ', $normalized));

    if (!aiChatExtractedTermLooksLikeItem($term) && !aiChatExtractedTermLooksLikeItem($normalized)) {
        return '';
    }

    foreach (array_unique([$normalized, $term]) as $query) {
        $hits = aiChatSearchCatalog($query, 6);
        if (!$hits) {
            continue;
        }
        $needle = mb_strtolower($query);
        foreach ($hits as $hit) {
            $name = trim((string)($hit['market_hash_name'] ?? ''));
            if ($name === '') {
                continue;
            }
            if (mb_strtolower($name) === $needle || mb_strtolower((string)($hit['name'] ?? '')) === $needle) {
                return $name;
            }
        }

        // Prefer a Field-Tested wear when the query omitted wear.
        $ranked = $hits;
        usort($ranked, static function (array $a, array $b): int {
            $aName = mb_strtolower((string)($a['market_hash_name'] ?? ''));
            $bName = mb_strtolower((string)($b['market_hash_name'] ?? ''));
            $aFt = str_contains($aName, 'field-tested') ? 0 : 1;
            $bFt = str_contains($bName, 'field-tested') ? 0 : 1;
            if ($aFt !== $bFt) {
                return $aFt <=> $bFt;
            }
            return mb_strlen($aName) <=> mb_strlen($bName);
        });
        $best = trim((string)($ranked[0]['market_hash_name'] ?? ''));
        if ($best === '') {
            continue;
        }
        $hay = mb_strtolower($best . ' ' . (string)($ranked[0]['name'] ?? ''));
        $parts = preg_split('/[\s|]+/u', $needle) ?: [];
        $meaningful = [];
        foreach ($parts as $part) {
            $part = trim($part, " \t\n\r\0\x0B'\".,!?");
            if (mb_strlen($part) < 3) {
                continue;
            }
            if (in_array($part, ['the', 'and', 'for', 'chart', 'graph', 'supply'], true)) {
                continue;
            }
            $meaningful[] = $part;
        }
        $matched = 0;
        foreach ($meaningful as $part) {
            if (mb_strpos($hay, $part) !== false) {
                $matched++;
            }
        }
        if ($meaningful && $matched >= max(1, (int)ceil(count($meaningful) * 0.6))) {
            return $best;
        }
        // Alias-expanded queries like "ak-47 frontside misty" should accept strong catalog hits.
        if (count($meaningful) >= 2 && $matched >= 2) {
            return $best;
        }
    }

    // Already a strong skin/case name even if catalog is offline.
    if (str_contains($term, '|') || preg_match('/\b(Case|Capsule|Package)\b/u', $term)) {
        return $term;
    }

    return '';
}

function aiChatDefaultSuggestionNames(): array
{
    return [
        'AK-47 | Redline (Field-Tested)',
        'AK-47 | Slate (Field-Tested)',
        'AK-47 | Ice Coaled (Factory New)',
        'AWP | Asiimov (Field-Tested)',
        'AWP | Worm God (Factory New)',
        'M4A1-S | Printstream (Field-Tested)',
        'M4A1-S | Night Terror (Factory New)',
        'M4A1-S | Black Lotus (Field-Tested)',
        'M4A4 | Evil Daimyo (Field-Tested)',
        'Glock-18 | Water Elemental (Factory New)',
        'Glock-18 | Vogue (Field-Tested)',
        'Glock-18 | Moonrise (Factory New)',
        'USP-S | Cortex (Field-Tested)',
        'USP-S | Guardian (Field-Tested)',
        'USP-S | Ticket to Hell (Factory New)',
        'Desert Eagle | Oxide Blaze (Factory New)',
        'Desert Eagle | Printstream (Field-Tested)',
        'MAC-10 | Neon Rider (Field-Tested)',
        'P250 | Supernova (Factory New)',
        'Dreams & Nightmares Case',
        'Kilowatt Case',
        'Revolution Case',
        'Fracture Case',
        'Recoil Case',
        'Fever Case',
        'Gallery Case',
        'Sticker | Titan (Holo) | Katowice 2014',
    ];
}

function aiChatDefaultGloveSuggestionNames(): array
{
    return [
        'Specialist Gloves | Fade (Field-Tested)',
        'Hydra Gloves | Emerald (Field-Tested)',
        'Sport Gloves | Pandora\'s Box (Field-Tested)',
        'Driver Gloves | Imperial Plaid (Field-Tested)',
        'Specialist Gloves | Crimson Kimono (Field-Tested)',
        'Moto Gloves | Cool Mint (Field-Tested)',
        'Bloodhound Gloves | Charred (Field-Tested)',
        'Hand Wraps | Giraffe (Field-Tested)',
        'Specialist Gloves | Forest DDPAT (Field-Tested)',
        'Driver Gloves | Lunar Weave (Field-Tested)',
    ];
}

function aiChatDefaultKnifeSuggestionNames(): array
{
    return [
        'Bayonet | Doppler (Factory New)',
        'Karambit | Fade (Factory New)',
        'Butterfly Knife | Autotronic (Field-Tested)',
        'M9 Bayonet | Tiger Tooth (Factory New)',
        'Talon Knife | Doppler (Factory New)',
        'Flip Knife | Marble Fade (Factory New)',
        'Gut Knife | Tiger Tooth (Factory New)',
        'Shadow Daggers | Fade (Factory New)',
    ];
}

/**
 * Priced souvenir packages + known souvenir skins for invest candidate seeding.
 *
 * @return list<string>
 */
function aiChatDefaultSouvenirSuggestionNames(): array
{
    return [
        'Antwerp 2022 Dust II Souvenir Package',
        'Antwerp 2022 Mirage Souvenir Package',
        'Stockholm 2021 Dust II Souvenir Package',
        'Stockholm 2021 Mirage Souvenir Package',
        'Rio 2022 Nuke Souvenir Package',
        'Paris 2023 Ancient Souvenir Package',
        'Copenhagen 2024 Anubis Souvenir Package',
        'Shanghai 2024 Dust II Souvenir Package',
        'Austin 2025 Dust II Souvenir Package',
        'Souvenir MP5-SD | Lab Rats (Factory New)',
        'Souvenir AK-47 | Safari Mesh (Field-Tested)',
        'Souvenir AWP | Safari Mesh (Field-Tested)',
        'Souvenir Glock-18 | Groundwater (Field-Tested)',
        'Souvenir USP-S | Forest Leaves (Field-Tested)',
        'Souvenir M4A1-S | Boreal Forest (Field-Tested)',
        'Souvenir P90 | Sand Spray (Field-Tested)',
        'Souvenir MAC-10 | Palm (Field-Tested)',
        'Souvenir Desert Eagle | Urban DDPAT (Field-Tested)',
        'Souvenir FAMAS | Colony (Field-Tested)',
        'Souvenir MP9 | Sand Dashed (Field-Tested)',
    ];
}

/**
 * Priced sticker / autograph capsules for invest candidate seeding.
 *
 * @return list<string>
 */
function aiChatDefaultStickerCapsuleNames(): array
{
    return [
        'Sticker Capsule 2',
        'Community Sticker Capsule 1',
        '2021 Community Sticker Capsule',
        'CS20 Sticker Capsule',
        'Chroma 3 Sticker Capsule',
        'Gamma 2 Sticker Capsule',
        'Ambush Sticker Capsule',
        'Espionage Sticker Capsule',
        'Paris 2023 Legends Sticker Capsule',
        'Paris 2023 Contenders Sticker Capsule',
        'Copenhagen 2024 Champions Sticker Capsule',
        'Budapest 2025 Contenders Sticker Capsule',
        'Budapest 2025 Legends Sticker Capsule',
        'Budapest 2025 Challengers Sticker Capsule',
        'Antwerp 2022 Legends Sticker Capsule',
        'EMS Katowice 2014 Legends',
        'EMS Katowice 2014 Challengers',
        '10 Year Birthday Sticker Capsule',
        'Enfu Sticker Capsule',
    ];
}

function aiChatParseSteamPrice(string $raw): ?float
{
    $stripped = preg_replace('/[^0-9.,]/', '', $raw);
    if ($stripped === '' || $stripped === null) {
        return null;
    }
    if (preg_match('/,(\d{2})$/', $stripped)) {
        $stripped = str_replace(['.', ','], ['', '.'], $stripped);
    } else {
        $stripped = str_replace(',', '', $stripped);
    }
    $value = (float)$stripped;
    return $value > 0 ? round($value, 2) : null;
}

function aiChatFetchSteamLivePrice(string $marketHashName): ?array
{
    $marketHashName = trim($marketHashName);
    if ($marketHashName === '') {
        return null;
    }

    $url = 'https://steamcommunity.com/market/priceoverview/?appid=730&currency=3&market_hash_name='
        . rawurlencode($marketHashName);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; CSPriceBot/1.0)',
    ]);
    $body = (string)(curl_exec($ch) ?: '');
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($code === 429) {
        return ['_rate_limited' => true];
    }
    if ($code !== 200 || $body === '') {
        return null;
    }

    $data = json_decode($body, true);
    if (!is_array($data) || empty($data['success'])) {
        return null;
    }

    $price = aiChatParseSteamPrice((string)($data['lowest_price'] ?? $data['median_price'] ?? ''));
    if ($price === null) {
        return null;
    }

    $volume = isset($data['volume'])
        ? (int)str_replace(',', '', (string)$data['volume'])
        : null;

    return [
        'market_hash_name' => $marketHashName,
        'current_price' => $price,
        'sell_orders' => null,
        'buy_orders' => null,
        'volume_24h' => $volume,
        'updated_at' => gmdate(DATE_ATOM),
        'price_source' => 'steam_live',
    ];
}

function aiChatNormalizePriceRow(array $row, string $marketHashName, string $priceSource): array
{
    $history = [];
    $rawHistory = $row['price_history'] ?? null;
    if (is_string($rawHistory) && $rawHistory !== '') {
        $decoded = json_decode($rawHistory, true);
        if (is_array($decoded)) {
            $history = $decoded;
        }
    } elseif (is_array($rawHistory)) {
        $history = $rawHistory;
    }

    return [
        'market_hash_name' => $marketHashName,
        'current_price' => round((float)($row['current_price'] ?? 0), 2),
        'sell_orders' => isset($row['sell_orders']) ? (int)$row['sell_orders'] : null,
        'buy_orders' => isset($row['buy_orders']) ? (int)$row['buy_orders'] : null,
        'volume_24h' => isset($row['volume_24h']) ? (int)$row['volume_24h'] : null,
        'updated_at' => (string)($row['updated_at'] ?? ''),
        'history' => $history,
        'price_source' => $priceSource,
        'seed_only' => false,
    ];
}

function aiChatEnsureMarketActivityLib(): void
{
    if (function_exists('loadMarketActivityCacheAnyAge')) {
        return;
    }
    if (!defined('STEAM_MARKET_HISTORY_LIB_ONLY')) {
        define('STEAM_MARKET_HISTORY_LIB_ONLY', true);
    }
    require_once __DIR__ . '/get_steam_market_activity.php';
}

/**
 * Convert item-page market-activity points ({date,price}) into ARIMA history ({time,price}).
 */
function aiChatHistoryFromMarketActivity(array $points): array
{
    $out = [];
    foreach ($points as $point) {
        if (!is_array($point)) {
            continue;
        }
        $price = (float)($point['price'] ?? $point['value'] ?? 0);
        if ($price <= 0) {
            continue;
        }

        if (isset($point['time']) && is_numeric($point['time'])) {
            $time = (int)$point['time'];
        } elseif (!empty($point['date'])) {
            $time = (int)strtotime((string)$point['date'] . ' UTC');
        } elseif (!empty($point['recorded_at'])) {
            $time = (int)strtotime((string)$point['recorded_at']);
        } else {
            continue;
        }

        if ($time <= 0) {
            continue;
        }

        $out[] = [
            'time' => $time,
            'price' => $price,
        ];
    }

    return $out;
}

/** Seconds between earliest and latest history sample (0 if unknown). */
function aiChatHistoryTimeSpan(array $history): int
{
    $min = null;
    $max = null;
    foreach ($history as $point) {
        if (!is_array($point)) {
            continue;
        }
        $time = (int)($point['time'] ?? $point['t'] ?? 0);
        if ($time <= 0) {
            continue;
        }
        $min = $min === null ? $time : min($min, $time);
        $max = $max === null ? $time : max($max, $time);
    }
    if ($min === null || $max === null || $max <= $min) {
        return 0;
    }
    return $max - $min;
}

/**
 * Fill missing price history from the same market-activity cache the item page charts use.
 * Optionally fetch Steam pricehistory API when cache is empty/thin (chart/forecast requests).
 * When $allowLiveFetch is true, prefer all-time history (item existence → today) over short ROI slices.
 */
function aiChatEnrichRowHistory(array $row, bool $allowLiveFetch = false): array
{
    $history = is_array($row['history'] ?? null) ? $row['history'] : [];
    $existingCount = count($history);
    $existingSpan = aiChatHistoryTimeSpan($history);

    // Non-chart callers can keep a short cached series.
    if (!$allowLiveFetch && $existingCount >= 10) {
        return $row;
    }

    $name = trim((string)($row['market_hash_name'] ?? ''));
    if ($name === '') {
        return $row;
    }

    $converted = [];
    try {
        aiChatEnsureMarketActivityLib();
        $cache = loadMarketActivityCacheAnyAge($name, 730);
        if (is_array($cache)) {
            $byRange = is_array($cache['sales_history_by_range'] ?? null) ? $cache['sales_history_by_range'] : [];
            // Prefer full all-time series for charts (existence → today). Never use 1y/6m slices.
            $points = is_array($byRange['all'] ?? null)
                ? $byRange['all']
                : (is_array($byRange['max'] ?? null)
                    ? $byRange['max']
                    : (is_array($cache['sales_history'] ?? null) ? $cache['sales_history'] : []));
            $converted = aiChatHistoryFromMarketActivity($points);
        }

        $convertedSpan = aiChatHistoryTimeSpan($converted);
        // Prefer cache for speed. Live Steam only when history is missing or too short.
        $minPoints = $allowLiveFetch ? 40 : 10;
        $minSpan = $allowLiveFetch ? (86400 * 120) : 0;
        $needsLive = count($converted) < $minPoints
            || ($minSpan > 0 && ($convertedSpan <= 0 || $convertedSpan < $minSpan));

        if ($needsLive && $allowLiveFetch) {
            $livePoints = [];
            if (function_exists('resolveSteamMarketHistoryPoints')) {
                $livePoints = resolveSteamMarketHistoryPoints($name, 730, 10000);
            } elseif (function_exists('steamFetchPriceHistoryApi')) {
                $livePoints = steamFetchPriceHistoryApi($name, 730);
            }
            $liveConverted = aiChatHistoryFromMarketActivity($livePoints);
            $liveSpan = aiChatHistoryTimeSpan($liveConverted);
            if (
                $liveSpan > $convertedSpan
                || ($liveSpan === $convertedSpan && count($liveConverted) > count($converted))
            ) {
                $converted = $liveConverted;
                $convertedSpan = $liveSpan;
            }
            if (count($converted) >= 10 && function_exists('saveMarketActivityCache') && function_exists('normalizeMarketActivityHistory')) {
                $normalized = normalizeMarketActivityHistory(array_map(static function (array $p): array {
                    return [
                        'time' => $p['time'],
                        'price' => $p['price'],
                        'quantity' => 1,
                    ];
                }, $converted));
                if (count($normalized) >= 10) {
                    saveMarketActivityCache($name, 730, [
                        'success' => true,
                        'market_hash_name' => $name,
                        'app_id' => 730,
                        'sales_history' => array_slice($normalized, -240),
                        'sales_history_by_range' => [
                            'all' => $normalized,
                            'max' => $normalized,
                        ],
                        'history_source' => 'steam_pricehistory',
                        'history_schema' => 14,
                        'history_point_count' => count($normalized),
                    ]);
                }
            }
        }
    } catch (Throwable) {
        return $row;
    }

    if (count($converted) < 10) {
        return $row;
    }

    $convertedSpan = aiChatHistoryTimeSpan($converted);
    // Prefer the series that covers more of the item's market lifetime (not just denser points).
    if ($existingSpan > $convertedSpan + (86400 * 14)) {
        return $row;
    }
    if ($existingSpan >= $convertedSpan && $existingCount > count($converted) && $existingSpan > 0) {
        return $row;
    }

    $row['history'] = $converted;
    $row['seed_only'] = false;
    if (in_array((string)($row['price_source'] ?? ''), ['steam_live', 'catalog_seed', 'cache'], true)) {
        $row['price_source'] = 'market_activity_cache';
    }

    return $row;
}

function aiChatPersistSteamPriceRow(string $marketHashName, array $live, ?array $cachedRow = null): void
{
    $price = (float)($live['current_price'] ?? 0);
    if ($price <= 0 || $marketHashName === '') {
        return;
    }

    $history = $live['price_history'] ?? $live['history'] ?? null;
    if (($history === null || $history === '' || $history === []) && is_array($cachedRow)) {
        $history = $cachedRow['price_history'] ?? $cachedRow['history'] ?? null;
    }

    try {
        require_once __DIR__ . '/roi_prices_db.php';
        $pdo = marketHistoryPdoConnection();
        roiPricesEnsureTable($pdo);
        roiPricesUpsert($pdo, [
            'market_hash_name' => $marketHashName,
            'source' => 'steam',
            'current_price' => $price,
            'sell_orders' => $live['sell_orders'] ?? $cachedRow['sell_orders'] ?? null,
            'buy_orders' => $live['buy_orders'] ?? $cachedRow['buy_orders'] ?? null,
            'price_history' => $history,
            'market_url' => $live['market_url'] ?? $cachedRow['market_url'] ?? null,
        ]);
    } catch (Throwable) {
        // Non-fatal — chat can still cite the live quote.
    }

    try {
        $cacheDir = __DIR__ . '/assets/roi-price-cache';
        if (!is_dir($cacheDir)) {
            @mkdir($cacheDir, 0775, true);
        }
        $cachePath = $cacheDir . '/steam_' . md5($marketHashName) . '.json';
        $payload = [
            'current_price' => $price,
            'sell_orders' => $live['sell_orders'] ?? $cachedRow['sell_orders'] ?? null,
            'buy_orders' => $live['buy_orders'] ?? $cachedRow['buy_orders'] ?? null,
            'price_history' => is_string($history) ? $history : (is_array($history) ? json_encode($history) : null),
            'updated_at' => gmdate(DATE_ATOM),
            'fetched_at' => time(),
            'steam_price_source' => 'priceoverview',
            'price_verified' => true,
        ];
        @file_put_contents($cachePath, json_encode($payload, JSON_UNESCAPED_SLASHES));
    } catch (Throwable) {
        // ignore file-cache write failures
    }
}

function aiChatLoadPriceRow(string $marketHashName, bool $preferLive, int &$liveBudget): ?array
{
    $marketHashName = trim($marketHashName);
    if ($marketHashName === '') {
        return null;
    }

    $cachedRow = null;
    try {
        $pdo = marketHistoryPdoConnection();
        $rows = priceCacheLoadRoiBatch($pdo, [$marketHashName], 'steam', false, 86400 * 30);
        $cachedRow = $rows[$marketHashName] ?? null;
    } catch (Throwable) {
        $cachedRow = null;
    }

    // Prefer-live: 1h. Otherwise still refresh anything older than 6h so Mark
    // never cites multi-week-old roi_prices as "current".
    $maxAge = $preferLive ? 3600 : 21600;
    $cacheFresh = is_array($cachedRow)
        && (float)($cachedRow['current_price'] ?? 0) > 0
        && priceCacheRowIsFresh($cachedRow, $maxAge);

    if ($cacheFresh) {
        return aiChatEnrichRowHistory(aiChatNormalizePriceRow($cachedRow, $marketHashName, 'cache'));
    }

    if ($liveBudget > 0) {
        $live = aiChatFetchSteamLivePrice($marketHashName);
        if (is_array($live) && !empty($live['_rate_limited'])) {
            if (is_array($cachedRow) && (float)($cachedRow['current_price'] ?? 0) > 0) {
                return aiChatEnrichRowHistory(aiChatNormalizePriceRow($cachedRow, $marketHashName, 'cache_stale'));
            }
            return null;
        }
        if (is_array($live) && (float)($live['current_price'] ?? 0) > 0) {
            $liveBudget--;
            aiChatPersistSteamPriceRow($marketHashName, $live, is_array($cachedRow) ? $cachedRow : null);
            // Keep ROI/cache history — Steam priceoverview has no chart series.
            if (is_array($cachedRow)) {
                $normalized = aiChatNormalizePriceRow($cachedRow, $marketHashName, 'cache');
                $live['history'] = is_array($normalized['history'] ?? null) ? $normalized['history'] : [];
                if (($live['sell_orders'] ?? null) === null && isset($normalized['sell_orders'])) {
                    $live['sell_orders'] = $normalized['sell_orders'];
                }
                if (($live['buy_orders'] ?? null) === null && isset($normalized['buy_orders'])) {
                    $live['buy_orders'] = $normalized['buy_orders'];
                }
                $live['price_source'] = 'steam_live_merged';
            }
            return aiChatEnrichRowHistory($live);
        }
    }

    if (is_array($cachedRow) && (float)($cachedRow['current_price'] ?? 0) > 0) {
        return aiChatEnrichRowHistory(aiChatNormalizePriceRow($cachedRow, $marketHashName, 'cache'));
    }

    foreach (aiChatSearchCatalog($marketHashName, 1) as $hit) {
        $seedPrice = is_numeric($hit['seed_price'] ?? null) ? (float)$hit['seed_price'] : null;
        if ($seedPrice !== null && $seedPrice > 0) {
            return aiChatEnrichRowHistory([
                'market_hash_name' => (string)($hit['market_hash_name'] ?? $marketHashName),
                'current_price' => round($seedPrice, 2),
                'sell_orders' => null,
                'buy_orders' => null,
                'volume_24h' => null,
                'updated_at' => '',
                'history' => [],
                'price_source' => 'catalog_seed',
                'seed_only' => true,
            ]);
        }
    }

    return null;
}

function aiChatCollectPriceQueryNames(string $userMessage, array $pageContext, bool $includeTrending): array
{
    $names = [];
    $seen = [];
    $add = static function (string $name) use (&$names, &$seen): void {
        $name = trim($name);
        if ($name === '') {
            return;
        }
        $key = mb_strtolower($name);
        if (isset($seen[$key])) {
            return;
        }
        $seen[$key] = true;
        $names[] = $name;
    };

    foreach (['item_name', 'lookup_name'] as $key) {
        $add((string)($pageContext[$key] ?? ''));
    }

    if (aiChatLooksLikeItemPickQuestion($userMessage)) {
        $scope = aiChatRequestedCardScope($userMessage);
        foreach (aiChatDiversifiedInvestCandidates(10, $scope['weapon'], $scope['type']) as $name) {
            $add($name);
        }
        if (aiChatLooksLikeOpenEndedInvestQuestion($userMessage)) {
            return array_slice($names, 0, 10);
        }
    }

    $terms = [];
    $extracted = aiChatExtractSearchTerms($userMessage);
    if ($extracted !== '' && aiChatExtractedTermLooksLikeItem($extracted)) {
        $terms[] = $extracted;
    }
    if (preg_match_all('/((?:StatTrak™|Souvenir|★)?\s*[\w\-]+\s*\|\s*[^?!.,]+)/ui', $userMessage, $matches)) {
        foreach ($matches[1] as $match) {
            $terms[] = trim((string)$match);
        }
    }

    foreach ($terms as $term) {
        foreach (aiChatCandidateMarketNames($term, aiChatSearchCatalog($term, 4)) as $name) {
            $add($name);
        }
    }

    $weapon = aiChatExtractWeaponFamily($userMessage);
    if ($weapon !== '') {
        foreach (aiChatCollectUniqueCatalogNames($weapon, 10) as $name) {
            $add($name);
        }
    }

    if ($includeTrending && count($names) < 6 && is_file(__DIR__ . '/mark_daily_pulse_helpers.php')) {
        require_once __DIR__ . '/mark_daily_pulse_helpers.php';
        $home = markDailyPulseLoadHomeRoi();
        foreach (array_slice($home['trending'], 0, 6) as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $add((string)($entry['market_hash_name'] ?? ''));
        }
    }

    if ($includeTrending && count($names) < 3) {
        foreach (aiChatDefaultSuggestionNames() as $name) {
            $add($name);
        }
    }

    return array_slice($names, 0, $weapon !== '' ? 10 : 8);
}

function aiChatFormatLivePriceLine(array $row): string
{
    $name = (string)($row['market_hash_name'] ?? '');
    $price = round((float)($row['current_price'] ?? 0), 2);
    $parts = ['- ' . $name . ': €' . number_format($price, 2)];

    $source = (string)($row['price_source'] ?? 'cache');
    if ($source === 'steam_live') {
        $parts[] = 'live Steam';
    } elseif ($source === 'cache_stale') {
        $parts[] = 'cached (stale; live refresh unavailable)';
    } elseif ($source === 'catalog_seed') {
        $parts[] = 'catalog seed';
    } else {
        $parts[] = 'cached';
    }

    if (!empty($row['updated_at'])) {
        $parts[] = 'updated ' . $row['updated_at'];
    }
    if (isset($row['sell_orders']) && $row['sell_orders'] !== null) {
        $parts[] = (int)$row['sell_orders'] . ' listings';
    }
    if (isset($row['volume_24h']) && $row['volume_24h'] !== null) {
        $parts[] = '24h vol ' . number_format((int)$row['volume_24h']);
    }

    return implode(' | ', $parts);
}

function aiChatBuildLivePriceContext(string $userMessage, array $pageContext): string
{
    if (!empty($pageContext['explainer_question'])) {
        return ''; // a price feed only tempts the model into a pick list
    }
    if (!aiChatShouldInjectLivePrices($userMessage, $pageContext)) {
        return '';
    }

    $preferLive = true;
    $includeTrending = trim((string)($pageContext['page_type'] ?? '')) === 'mark'
        || aiChatLooksLikeItemPickQuestion($userMessage)
        || aiChatLooksLikeBroadMarketQuestion($userMessage)
        || aiChatLooksLikePredictionQuestion($userMessage)
        || aiChatLooksLikePriceOrMarketDataQuestion($userMessage);

    $names = aiChatCollectPriceQueryNames($userMessage, $pageContext, $includeTrending);
    $lines = [
        'Steam market price feed (CS Price: roi_prices cache + on-demand Steam Community Market priceoverview):',
    ];

    if (preg_match('/\b(steam api|access|real[- ]?time|live price|cache)\b/ui', $userMessage)) {
        $lines[] = 'Capability: you DO have access to this site\'s Steam price data layer. Cite the prices below with source/time. Never tell the user you lack Steam or real-time price access.';
    }

    $liveBudget = 8;
    $priced = 0;
    foreach ($names as $name) {
        $row = aiChatLoadPriceRow($name, $preferLive, $liveBudget);
        if ($row === null || (float)($row['current_price'] ?? 0) <= 0) {
            continue;
        }
        $lines[] = aiChatFormatLivePriceLine($row);
        $priced++;
    }

    $cheapestMap = aiChatCheapestListingsByName($names);
    if ($cheapestMap) {
        $lines[] = 'Cheapest marketplace listings to buy (cached asks across Steam, Skinport, CSFloat, White.Market, DMarket, Market.CSGO, ShadowPay, Waxpeer, HaloSkins). Use that row\'s exact euro price on the pick bullet — the item card shows the same figure. After the €price write a real why (30d trend, volume, listings, or rarity). "on CSFloat" / "on Skinport" is not a why. Never invent a cheaper market, never quote a different cache price for the same name/wear, never mask digits, never write placeholder prices.';
        $shown = 0;
        foreach ($names as $name) {
            $listing = $cheapestMap[$name] ?? null;
            if (!is_array($listing)) {
                continue;
            }
            $lines[] = aiChatFormatCheapestListingLine((string)$name, $listing);
            $shown++;
            if ($shown >= 10) {
                break;
            }
        }
    }

    if ($priced === 0 && $includeTrending) {
        $lines[] = 'When suggesting specific items, pick from the priced examples above (or market pulse gainers). One bullet per item: **name** — €price — one short useful clause. Do not write Reason to buy essays under each bullet.';
    } elseif ($priced === 0) {
        $lines[] = 'No matching items in cache yet. Ask which exact skin/case they mean, or suggest the ROI browser / item page for charts.';
    }

    return implode("\n", $lines);
}

function aiChatHistoryBaseline(array $history, int $days, ?float $currentPrice = null): array
{
    if (!$history) {
        return [
            'current_price' => $currentPrice,
            'baseline_price' => null,
            'change_pct' => null,
            'change_abs' => null,
            'effective_days' => 0,
        ];
    }

    $latest = $history[count($history) - 1];
    $latestTime = (int)($latest['time'] ?? 0);
    $current = $currentPrice ?? round((float)($latest['price'] ?? 0), 2);
    $baseline = $history[0];

    if ($days > 0 && $latestTime > 0) {
        $targetTime = $latestTime - ($days * 86400);
        foreach ($history as $point) {
            if ((int)($point['time'] ?? 0) <= $targetTime) {
                $baseline = $point;
            } else {
                break;
            }
        }
    }

    $baselinePrice = round((float)($baseline['price'] ?? 0), 2);
    $baselineTime = (int)($baseline['time'] ?? 0);
    $effectiveDays = ($latestTime > 0 && $baselineTime > 0)
        ? max(0, (int)round(($latestTime - $baselineTime) / 86400))
        : 0;
    $changePct = $baselinePrice > 0 ? round((($current - $baselinePrice) / $baselinePrice) * 100, 2) : null;
    $changeAbs = $baselinePrice > 0 ? round($current - $baselinePrice, 2) : null;

    return [
        'current_price' => $current,
        'baseline_price' => $baselinePrice,
        'change_pct' => $changePct,
        'change_abs' => $changeAbs,
        'effective_days' => $effectiveDays,
    ];
}

function aiChatLinearForecast(array $history, int $forecastDays = 14): ?array
{
    if (count($history) < 4) {
        return null;
    }

    $latestTime = (int)($history[count($history) - 1]['time'] ?? 0);
    if ($latestTime <= 0) {
        return null;
    }

    $cutoff = $latestTime - (30 * 86400);
    $points = [];
    foreach ($history as $point) {
        $time = (int)($point['time'] ?? 0);
        $price = (float)($point['price'] ?? 0);
        if ($time >= $cutoff && $price > 0) {
            $points[] = ['x' => ($time - $cutoff) / 86400, 'y' => $price];
        }
    }

    if (count($points) < 4) {
        $points = [];
        foreach ($history as $point) {
            $time = (int)($point['time'] ?? 0);
            $price = (float)($point['price'] ?? 0);
            if ($time > 0 && $price > 0) {
                $points[] = ['x' => ($time - (int)$history[0]['time']) / 86400, 'y' => $price];
            }
        }
    }

    if (count($points) < 4) {
        return null;
    }

    $n = count($points);
    $sumX = 0.0;
    $sumY = 0.0;
    $sumXY = 0.0;
    $sumXX = 0.0;
    foreach ($points as $point) {
        $sumX += $point['x'];
        $sumY += $point['y'];
        $sumXY += $point['x'] * $point['y'];
        $sumXX += $point['x'] * $point['x'];
    }

    $denominator = ($n * $sumXX) - ($sumX * $sumX);
    if (abs($denominator) < 0.00001) {
        return null;
    }

    $slope = (($n * $sumXY) - ($sumX * $sumY)) / $denominator;
    $intercept = ($sumY - ($slope * $sumX)) / $n;
    $lastX = $points[$n - 1]['x'];
    $futureX = $lastX + max(1, $forecastDays);
    $projected = max(0.01, round($intercept + ($slope * $futureX), 2));
    $current = round((float)($history[count($history) - 1]['price'] ?? 0), 2);
    $changePct = $current > 0 ? round((($projected - $current) / $current) * 100, 2) : null;

    return [
        'days' => $forecastDays,
        'projected_price' => $projected,
        'change_pct' => $changePct,
        'slope_per_day' => round($slope, 4),
    ];
}

function aiChatPriceVolatilityPct(array $history): ?float
{
    if (count($history) < 3) {
        return null;
    }

    $returns = [];
    for ($i = 1, $count = count($history); $i < $count; $i++) {
        $prev = (float)($history[$i - 1]['price'] ?? 0);
        $next = (float)($history[$i]['price'] ?? 0);
        if ($prev <= 0 || $next <= 0) {
            continue;
        }
        $returns[] = (($next - $prev) / $prev) * 100;
    }

    if (count($returns) < 2) {
        return null;
    }

    $mean = array_sum($returns) / count($returns);
    $variance = 0.0;
    foreach ($returns as $value) {
        $variance += ($value - $mean) ** 2;
    }
    $variance /= count($returns);

    return round(sqrt($variance), 2);
}

function aiChatOutlookLabel(?float $change7, ?float $change30, ?array $forecast): string
{
    $signals = [];
    foreach ([$change7, $change30, $forecast['change_pct'] ?? null] as $value) {
        if (!is_numeric($value)) {
            continue;
        }
        if ((float)$value > 1.5) {
            $signals[] = 1;
        } elseif ((float)$value < -1.5) {
            $signals[] = -1;
        } else {
            $signals[] = 0;
        }
    }

    if (!$signals) {
        return 'neutral / insufficient trend data';
    }

    $score = array_sum($signals);
    if ($score >= 2) {
        return 'bullish (upward trend)';
    }
    if ($score <= -2) {
        return 'bearish (downward trend)';
    }
    if ($score === 1) {
        return 'mildly bullish';
    }
    if ($score === -1) {
        return 'mildly bearish';
    }

    return 'neutral / sideways';
}

function aiChatCandidateMarketNames(string $term, array $catalogHits): array
{
    $candidates = [];
    $term = trim($term);
    if ($term !== '') {
        $candidates[] = $term;
        $base = aiChatStripWear($term);
        if ($base !== $term) {
            $candidates[] = $base;
        }
    }

    foreach ($catalogHits as $hit) {
        $name = trim((string)($hit['market_hash_name'] ?? ''));
        if ($name === '') {
            continue;
        }
        $candidates[] = $name;
        $base = aiChatStripWear($name);
        if ($base !== $name && str_contains($base, '|')) {
            foreach (['Field-Tested', 'Minimal Wear', 'Factory New'] as $wear) {
                $candidates[] = $base . ' (' . $wear . ')';
            }
        }
    }

    $unique = [];
    foreach ($candidates as $candidate) {
        $key = mb_strtolower($candidate);
        if (!isset($unique[$key])) {
            $unique[$key] = $candidate;
        }
    }

    return array_values($unique);
}

function aiChatLoadBestPriceRow(string $term, array $pageContext, bool $preferLive = true): ?array
{
    $terms = [];
    foreach (['item_name', 'lookup_name'] as $key) {
        $value = trim((string)($pageContext[$key] ?? ''));
        if ($value !== '') {
            $terms[] = $value;
        }
    }
    if ($term !== '') {
        $terms[] = $term;
    }

    $catalogHits = [];
    $seen = [];
    foreach ($terms as $lookup) {
        $key = mb_strtolower($lookup);
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        foreach (aiChatSearchCatalog($lookup, 4) as $hit) {
            $catalogHits[] = $hit;
        }
    }

    $names = aiChatCandidateMarketNames($term, $catalogHits);
    if (!$names) {
        return null;
    }

    $liveBudget = $preferLive ? 1 : 0;
    $best = null;
    $bestScore = -1;
    foreach ($names as $name) {
        $row = aiChatLoadPriceRow($name, $preferLive, $liveBudget);
        if ($row === null || (float)($row['current_price'] ?? 0) <= 0) {
            continue;
        }

        $history = is_array($row['history'] ?? null) ? $row['history'] : [];
        $score = count($history) * 10;
        if (str_contains(mb_strtolower($name), 'field-tested')) {
            $score += 25;
        }
        if ($score > $bestScore) {
            $bestScore = $score;
            $best = $row;
        }
    }

    if ($best !== null) {
        return aiChatEnrichRowHistory($best);
    }

    if (!$catalogHits) {
        return null;
    }

    $fallback = $catalogHits[0];
    $seedPrice = is_numeric($fallback['seed_price'] ?? null) ? (float)$fallback['seed_price'] : null;
    if ($seedPrice === null || $seedPrice <= 0) {
        return null;
    }

    return aiChatEnrichRowHistory([
        'market_hash_name' => (string)($fallback['market_hash_name'] ?? $fallback['name'] ?? ''),
        'current_price' => $seedPrice,
        'sell_orders' => null,
        'buy_orders' => null,
        'updated_at' => '',
        'history' => [],
        'seed_only' => true,
        'price_source' => 'catalog_seed',
    ]);
}

function aiChatFormatSignedPct(?float $value): string
{
    if (!is_numeric($value)) {
        return 'n/a';
    }
    $rounded = round((float)$value, 2);
    return ($rounded > 0 ? '+' : '') . number_format($rounded, 2) . '%';
}

function aiChatBuildProactivePicksContext(string $userMessage, array $pageContext, array $messages = []): string
{
    if (!empty($pageContext['explainer_question'])) {
        return '';
    }
    if (!aiChatLooksLikeBroadMarketQuestion($userMessage) && !aiChatLooksLikeItemPickQuestion($userMessage)) {
        if (!(aiChatLooksLikePredictionQuestion($userMessage) || aiChatLooksLikeChartQuestion($userMessage))) {
            return '';
        }
        if (aiChatResolveForecastItemTerm($userMessage, $pageContext, $messages, false) !== '') {
            return '';
        }
    }

    if ($messages) {
        aiChatInvestRotationState($messages, $userMessage);
    }
    $scope = aiChatRequestedCardScope($userMessage);
    $budgetEuro = aiChatExtractBudgetEuro($userMessage);
    $cheapestAsk = aiChatLooksLikeCheapestListAsk($userMessage);
    $candidates = $cheapestAsk
        ? aiChatCheapestCatalogCandidates(
            $scope['weapon'],
            $scope['type'] !== '' ? $scope['type'] : 'skin',
            8,
            !empty($scope['stattrak']),
            $budgetEuro > 0 ? $budgetEuro : 0.0
        )
        : [];
    if (!$candidates) {
        $candidates = aiChatLooksLikeItemPickQuestion($userMessage)
        ? aiChatDiversifiedInvestCandidates(12, $scope['weapon'], $scope['type'], $budgetEuro > 0 ? $budgetEuro : 0.0)
        : aiChatPickDiversifiedFromPool(
            aiChatShuffleList(aiChatTrendingForecastCandidates(16), (int)aiChatInvestRotationState()['salt']),
            6,
            $scope['weapon'],
            $scope['type'],
            $budgetEuro > 0 ? $budgetEuro : 0.0
        );
    }
    if (!$candidates) {
        $candidates = aiChatTrendingForecastCandidates(5);
    }
    if (!$candidates) {
        return '';
    }
    aiChatRememberInvestPickSet($candidates);

    $lines = [
        $cheapestAsk
            ? 'CHEAPEST candidates from the CS Price catalog, sorted cheapest first (lowest Steam ask per skin). The user asked for the lowest-priced options: list these in this order with their prices — do NOT replace them with pricier or "better" skins:'
            : 'Autonomous market picks from CS Price (use a MIX of weapons/finishes — do NOT ask the user to name an item first):',
    ];

    $chartPick = '';
    foreach ($candidates as $index => $name) {
        $row = aiChatLoadBestPriceRow($name, $pageContext, false);
        if ($cheapestAsk && ($row === null || (float)($row['current_price'] ?? 0) <= 0)) {
            // Bottom-of-the-list skins often have no live row yet; the catalog
            // seed ask is exactly the number the user asked about.
            $seed = aiChatRoiCatalogByName()[$name] ?? null;
            $seedPrice = is_array($seed) && is_numeric($seed['seed_sell_price'] ?? null) ? (float)$seed['seed_sell_price'] : 0.0;
            if ($seedPrice > 0) {
                $row = [
                    'market_hash_name' => $name,
                    'current_price' => $seedPrice,
                    'sell_orders' => (int)($seed['seed_sell_listings'] ?? 0),
                    'buy_orders' => null,
                    'updated_at' => '',
                    'history' => [],
                    'seed_only' => true,
                    'price_source' => 'catalog_seed',
                ];
            }
        }
        if ($row === null || (float)($row['current_price'] ?? 0) <= 0) {
            continue;
        }
        $row = aiChatEnrichRowHistory($row, $index === 0);
        $price = round((float)$row['current_price'], 2);
        $history = is_array($row['history'] ?? null) ? $row['history'] : [];
        $change30 = count($history) >= 4 ? aiChatHistoryBaseline($history, 30, $price) : null;
        $line = ($index + 1) . ') ' . (string)$row['market_hash_name'] . ' — €' . number_format($price, 2);
        if (is_array($change30) && is_numeric($change30['change_pct'] ?? null)) {
            $line .= ' | 30d ' . aiChatFormatSignedPct((float)$change30['change_pct']);
        }
        $lines[] = $line;
        if ($chartPick === '' && count($history) >= 10) {
            $chartPick = (string)$row['market_hash_name'];
        }
    }

    if (count($lines) <= 1) {
        return '';
    }

    if ($chartPick === '') {
        $chartPick = (string)($candidates[0] ?? '');
    }

    $lines[] = 'Primary chart pick (auto-selected for the in-chat Future widget when a chart is attached): ' . $chartPick;
    $lines[] = 'List 3–5 unique picks as • bullets from anywhere in this rotating shortlist (not always the first names, and not the same set as a prior reply): **Item name (wear)** — €price — one short why clause (trend/volume/listings/rarity). "on CSFloat" is NOT a why. Never a name+price-only list. You may add 1–2 plain sentences per pick after the list. Use that item\'s cheapest tracked ask € for that exact wear (same figure the cards show). Skip crafts/sticker-to-skin math unless that data is provided. Do not pad the list with extra cases.';

    return implode("\n", $lines);
}

function aiChatBuildPredictionContext(string $userMessage, array $pageContext, ?array $existingForecast = null, array $messages = []): string
{
    if (!aiChatWantsForecastChart($userMessage)) {
        return '';
    }

    $term = aiChatResolveForecastItemTerm($userMessage, $pageContext, $messages, true);
    $row = $term !== '' ? aiChatLoadBestPriceRow($term, $pageContext, true) : null;
    if ($row === null) {
        $proactive = aiChatBuildProactivePicksContext($userMessage, $pageContext, $messages);
        if ($proactive !== '') {
            return $proactive;
        }
        return 'The user asked for a price outlook, but no priced items were available in cache yet. Suggest 2–3 well-known liquid items from general CS2 knowledge only as examples to look up on this site — do not invent exact € prices.';
    }

    // Forecast payload already refreshed history — skip a second live Steam pass.
    $row = aiChatEnrichRowHistory($row, $existingForecast === null);

    $name = (string)$row['market_hash_name'];
    $current = round((float)$row['current_price'], 2);
    $history = is_array($row['history'] ?? null) ? $row['history'] : [];
    $seedOnly = !empty($row['seed_only']);

    $lines = [
        'Price outlook data from CS Price cache (trend-based analysis):',
        'Item: ' . $name,
        'Current Steam reference price: €' . number_format($current, 2),
    ];

    $proactive = aiChatBuildProactivePicksContext($userMessage, $pageContext, $messages);
    if ($proactive !== '') {
        $lines[] = $proactive;
    }

    if (!empty($row['updated_at'])) {
        $lines[] = 'Last updated: ' . $row['updated_at'];
    }
    if (isset($row['sell_orders']) && $row['sell_orders'] !== null) {
        $lines[] = 'Steam sell listings: ' . number_format((int)$row['sell_orders']);
    }

    if ($seedOnly || count($history) < 4) {
        $lines[] = 'Historical trend: limited data in cache (only a current reference price is available).';
        $lines[] = 'Still give a useful answer with the priced picks above. Prefer actionable picks over asking clarifying questions.';
        return implode("\n", $lines);
    }

    $change7 = aiChatHistoryBaseline($history, 7, $current);
    $change30 = aiChatHistoryBaseline($history, 30, $current);
    $change90 = aiChatHistoryBaseline($history, 90, $current);
    $linear = aiChatLinearForecast($history, 14);
    $arima = $existingForecast;
    if ($arima === null) {
        $arima = aiArimaBuildForecast($history, [
            'item_name' => $name,
            'current_price' => $current,
            'sell_orders' => isset($row['sell_orders']) ? (int)$row['sell_orders'] : null,
            'buy_orders' => isset($row['buy_orders']) ? (int)$row['buy_orders'] : null,
            'volume_24h' => isset($row['volume_24h']) ? (int)$row['volume_24h'] : null,
        ], 1);
    }
    $volatility = aiChatPriceVolatilityPct($history);
    $outlook = aiChatOutlookLabel(
        is_numeric($change7['change_pct'] ?? null) ? (float)$change7['change_pct'] : null,
        is_numeric($change30['change_pct'] ?? null) ? (float)$change30['change_pct'] : null,
        $arima !== null
            ? ['change_pct' => $arima['change_pct'] ?? null]
            : $linear
    );

    $lines[] = '7-day change: ' . aiChatFormatSignedPct($change7['change_pct'] ?? null)
        . ' (over ' . (int)($change7['effective_days'] ?? 0) . ' days of data)';
    $lines[] = '30-day change: ' . aiChatFormatSignedPct($change30['change_pct'] ?? null)
        . ' (over ' . (int)($change30['effective_days'] ?? 0) . ' days of data)';
    $lines[] = '90-day change: ' . aiChatFormatSignedPct($change90['change_pct'] ?? null)
        . ' (over ' . (int)($change90['effective_days'] ?? 0) . ' days of data)';

    if ($linear !== null) {
        $lines[] = '14-day linear trend projection: €' . number_format((float)$linear['projected_price'], 2)
            . ' (' . aiChatFormatSignedPct($linear['change_pct'] ?? null) . ' vs today)';
    }

    if ($arima !== null) {
        $lines[] = 'Future outlook model attached (all-time history + 1-year projection).';
        $lines[] = '1-year future projection: €' . number_format((float)$arima['projected_1y'], 2)
            . ' (' . aiChatFormatSignedPct($arima['change_pct'] ?? null) . ' vs today)';
        $lines[] = 'Outlook badge: ' . (string)($arima['outlook'] ?? $outlook);
        $lines[] = 'Supply/demand bias: ' . (string)$arima['supply_demand'];
        foreach (array_slice((array)($arima['signal_notes'] ?? []), 0, 2) as $note) {
            $lines[] = 'Signal: ' . $note;
        }
        $lines[] = 'Follow the CHART REPLY WRITING block for section layout. Call the widget Future, not ARIMA.';
    }

    if ($volatility !== null) {
        $lines[] = 'Recent volatility (daily moves): ~' . number_format($volatility, 2) . '% std dev';
    }

    $lines[] = 'Overall outlook label: ' . $outlook;
    $lines[] = 'Use only the €/% figures above in your verdict — do not invent confidence %, bear/bull cases, or extra projections.';

    return implode("\n", $lines);
}

function aiChatResolveForecastItemTerm(string $userMessage, array $pageContext, array $messages = [], bool $allowAutonomous = false): string
{
    foreach (['lookup_name', 'item_name'] as $key) {
        $value = trim((string)($pageContext[$key] ?? ''));
        if ($value !== '' && (str_contains($value, '|') || preg_match('/\bcase\b/i', $value) || mb_strlen($value) >= 4)) {
            $extracted = aiChatExtractSearchTerms($userMessage);
            if (
                $extracted !== ''
                && aiChatExtractedTermLooksLikeItem($extracted)
                && mb_strtolower($extracted) !== mb_strtolower($value)
                && (str_contains($extracted, '|') || preg_match('/\bcase\b/i', $extracted))
            ) {
                return $extracted;
            }
            return $value;
        }
    }

    $term = aiChatExtractSearchTerms($userMessage);
    if ($term !== '' && aiChatExtractedTermLooksLikeItem($term)) {
        return $term;
    }

    $fromThread = aiChatFindItemTermFromMessages($messages);
    if ($fromThread !== '') {
        return $fromThread;
    }

    if ($allowAutonomous && (aiChatWantsForecastChart($userMessage) || aiChatShouldAttachForecast($userMessage, $messages))) {
        return aiChatPickAutonomousForecastItem($userMessage, $pageContext, $messages);
    }

    return $term !== '' && aiChatExtractedTermLooksLikeItem($term) ? $term : '';
}

/**
 * Build a Future/ARIMA chart payload for an explicit catalog item name.
 * Used by the in-chat chart switcher when the user picks a different recommended card.
 */
function aiChatBuildArimaForecastForItem(string $itemName, array $pageContext = []): ?array
{
    $term = trim($itemName);
    if ($term === '' || mb_strlen($term) < 3) {
        return null;
    }

    // Prefer live Steam refresh so prediction charts have enough history.
    $row = aiChatLoadBestPriceRow($term, $pageContext, true);
    if ($row === null) {
        return null;
    }

    $row = aiChatEnrichRowHistory($row, true);

    $history = is_array($row['history'] ?? null) ? $row['history'] : [];
    if (count($history) < 10) {
        return null;
    }

    return aiArimaBuildForecast($history, [
        'item_name' => (string)($row['market_hash_name'] ?? $term),
        'current_price' => (float)($row['current_price'] ?? 0),
        'sell_orders' => isset($row['sell_orders']) ? (int)$row['sell_orders'] : null,
        'buy_orders' => isset($row['buy_orders']) ? (int)$row['buy_orders'] : null,
        'volume_24h' => isset($row['volume_24h']) ? (int)$row['volume_24h'] : null,
    ], 1);
}

function aiChatBuildArimaForecastPayload(string $userMessage, array $pageContext, array $messages = []): ?array
{
    if (!aiChatShouldAttachForecast($userMessage, $messages)) {
        return null;
    }

    $term = aiChatResolveForecastItemTerm($userMessage, $pageContext, $messages, true);
    if ($term === '') {
        return null;
    }

    return aiChatBuildArimaForecastForItem($term, $pageContext);
}
function aiChatBuildCatalogContext(string $userMessage, array $pageContext, array $messages = []): string
{
    if (aiChatLooksLikeItemPickQuestion($userMessage)) {
        $invest = aiChatBuildInvestPicksContext($userMessage, $pageContext, $messages);
        if ($invest !== '' && aiChatLooksLikeOpenEndedInvestQuestion($userMessage)) {
            return $invest;
        }
        if ($invest !== '') {
            $specific = aiChatBuildCatalogSearchContext($userMessage, $pageContext);
            return trim($specific . ($specific !== '' ? "\n\n" : '') . $invest);
        }
    }

    return aiChatBuildCatalogSearchContext($userMessage, $pageContext);
}

function aiChatBuildCatalogSearchContext(string $userMessage, array $pageContext): string
{
    $terms = [];
    foreach (['item_name', 'lookup_name'] as $key) {
        $value = trim((string)($pageContext[$key] ?? ''));
        if ($value !== '') {
            $terms[] = $value;
        }
    }

    $extracted = aiChatExtractSearchTerms($userMessage);
    if ($extracted !== '') {
        $terms[] = $extracted;
    }

    $weapon = aiChatExtractWeaponFamily($userMessage);
    if ($weapon !== '') {
        $terms[] = $weapon;
    }

    $seen = [];
    $lines = [];

    foreach ($terms as $term) {
        $key = mb_strtolower($term);
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;

        $limit = ($weapon !== '' && mb_strtolower($term) === mb_strtolower($weapon)) ? 8 : 4;
        foreach (aiChatSearchCatalog($term, $limit) as $hit) {
            $line = '- ' . $hit['name'];
            $hitName = trim((string)($hit['market_hash_name'] ?? ''));
            $listing = $hitName !== '' ? (aiChatCheapestListingsByName([$hitName])[$hitName] ?? null) : null;
            if (is_array($listing) && (float)($listing['price'] ?? 0) > 0) {
                $line .= ' — ' . aiChatFormatBuyOnPhrase($listing);
            } elseif ($hit['seed_price'] !== null) {
                $line .= ' (cached Steam from €' . number_format((float)$hit['seed_price'], 2, '.', '') . ')';
            }
            if ($hit['category'] !== '') {
                $line .= ' [' . $hit['category'] . ']';
            }
            $lines[] = $line;
        }
    }

    if (!$lines) {
        return '';
    }

    $unique = array_values(array_unique($lines));
    return "Relevant catalog matches from this site cache:\n" . implode("\n", array_slice($unique, 0, 12));
}

function aiChatLoadKnowledgeFile(string $relativePath, int $maxChars): string
{
    $path = __DIR__ . '/' . ltrim($relativePath, '/');
    if (!is_file($path)) {
        return '';
    }

    $raw = (string)file_get_contents($path);
    $lines = [];
    foreach (preg_split('/\r\n|\r|\n/', $raw) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        $lines[] = $line;
    }

    $text = implode("\n", $lines);
    if ($maxChars <= 0) {
        return $text;
    }

    return mb_substr($text, 0, $maxChars);
}

function aiChatCommunitySourceSummaries(int $maxChars = 1200): string
{
    $path = __DIR__ . '/assets/ai/community-sources.json';
    if (!is_file($path)) {
        return '';
    }

    $decoded = json_decode((string)file_get_contents($path), true);
    $sources = is_array($decoded['sources'] ?? null) ? $decoded['sources'] : [];
    if (!$sources) {
        return '';
    }

    $lines = ['Community source registry (YouTube/social clips):'];
    foreach ($sources as $source) {
        if (!is_array($source)) {
            continue;
        }
        $title = trim((string)($source['title'] ?? ''));
        $url = trim((string)($source['url'] ?? ''));
        $summary = trim((string)($source['summary'] ?? ''));
        if ($title === '' && $summary === '') {
            continue;
        }
        $line = '- ' . ($title !== '' ? $title : 'Community clip');
        if ($url !== '') {
            $line .= ' (' . $url . ')';
        }
        if ($summary !== '') {
            $line .= ': ' . $summary;
        }
        $lines[] = $line;
    }

    if (count($lines) <= 1) {
        return '';
    }

    $text = implode("\n", $lines);
    return $maxChars > 0 ? mb_substr($text, 0, $maxChars) : $text;
}

function aiChatReferenceKnowledge(): string
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    $sections = [];
    $marketKnowledge = aiChatLoadKnowledgeFile('assets/ai/mark-knowledge.md', 4200);
    if ($marketKnowledge !== '') {
        $sections[] = "Market & skin history reference:\n" . $marketKnowledge;
    }

    $communityKnowledge = aiChatLoadKnowledgeFile('assets/ai/community-knowledge.md', 5200);
    if ($communityKnowledge !== '') {
        $sections[] = "Community & player-culture reference:\n" . $communityKnowledge;
    }

    $sourceSummaries = aiChatCommunitySourceSummaries(1200);
    if ($sourceSummaries !== '') {
        $sections[] = $sourceSummaries;
    }

    $cached = mb_substr(implode("\n\n", $sections), 0, 11000);
    return $cached;
}

/**
 * Builds the LANGUAGE rule for the system prompt. When the site's language
 * picker sent a code, that language wins outright; otherwise fall back to the
 * old detect-from-the-user's-message behaviour.
 *
 * The structural tokens (### headings, BULLISH/NEUTRAL/BEARISH, the +/- chip
 * markers, Scarcity/Liquidity/Volatility levels) must stay English because the
 * reply parser keys off them — the UI translates those for display.
 */
function aiChatLanguageInstruction(array $pageContext): string
{
    $glyphRule = 'Item names, € prices, and marketplace labels stay exactly as given — never transliterate or translate a skin, case, sticker, collection, or marketplace name.';
    $structureRule = 'KEEP THESE TOKENS IN ENGLISH regardless of reply language, because the interface parses them: the ### section headings (### Item metrics, ### AI SENTIMENT, ### Key factors, ### Items to buy, ### Why these picks), the chip labels **Scarcity:** / **Liquidity:** / **Volatility:** and their levels (Extreme/High/Moderate/Medium/Low), the sentiment word BULLISH/NEUTRAL/BEARISH, and the leading `+ ` / `- ` markers under Key factors. Everything else — every sentence, clause, and "why" — must be written in the reply language.';

    $language = $pageContext['lang'] ?? null;
    if (is_array($language) && ($language['name'] ?? '') !== '') {
        return sprintf(
            'LANGUAGE (HARD RULE): The user has set this site to %s. Write EVERY sentence of your reply in %s, even if the user typed in another language and even if the conversation history is in another language. Do not apologise for or mention the language. Do not mix languages or add bilingual fragments. %s %s',
            $language['name'],
            $language['name'],
            $glyphRule,
            $structureRule
        );
    }

    return 'LANGUAGE: Reply entirely in the user\'s language. If the user writes in English (or mixed/unclear), reply in English only. Default to English. NEVER mix Chinese, Japanese, or Korean glyphs (汉字 / かな / 한글) into an English answer — no bilingual fragments, no translated filler words mid-sentence (e.g. never write "FT提供 broad"). '
        . $glyphRule . ' ' . $structureRule;
}

/**
 * The "Personality:" line of the system prompt. When the signed-in user saved
 * an AI personality on their profile (ai_persona_helpers.php) it takes the
 * place of the default voice; leaving both in the prompt made the model keep
 * the default and ignore the user's.
 */
function aiChatPersonalityLine(string $default): string
{
    $persona = function_exists('aiPersonaForCurrentUser') ? aiPersonaForCurrentUser() : '';
    if ($persona === '') {
        return $default;
    }
    return 'Personality (chosen by this user on their profile - it replaces the default voice and applies to '
        . 'every sentence you write): ' . trim(str_replace(["\r", "\n"], ' ', $persona));
}

function aiChatSystemPrompt(
    array $pageContext,
    string $catalogContext,
    string $predictionContext = '',
    string $marketPulseContext = '',
    string $inventoryContext = '',
    string $livePriceContext = '',
    ?bool $chartAttached = null,
    string $userMessage = '',
    array $attachedChartKinds = []
): string
{
    // Knowledge questions ("what is the cs economy like", "how do stickers
    // work") get their own short prompt. Appending an exception to the long
    // terminal-format prompt was not enough: the model kept emitting the
    // Item metrics / Items to buy template.
    $earlyPageType = trim((string)($pageContext['page_type'] ?? ''));
    if (
        $userMessage !== ''
        && $earlyPageType !== 'inventory'
        && $earlyPageType !== 'item'
        && empty($pageContext['invest_followup'])
        && (!empty($pageContext['explainer_question']) || aiChatLooksLikeExplainerQuestion($userMessage))
    ) {
        $explainerLines = [
            'You are Mark, the built-in AI assistant for CS Price (CS2 Market) — a Counter-Strike 2 skins, cases, and market price tracker.',
            aiChatLanguageInstruction($pageContext),
            aiChatPersonalityLine('Personality: chill, funny, and laid-back — like a knowledgeable friend who also knows the market. Casual wording, light CS slang, no corporate filler.'),
            'The user asked a KNOWLEDGE question (how something works, what something is, what the market is like). Write a real, educational answer of around 120–220 words: explain the mechanics (drops, cases and keys, wear and float, StatTrak, trade holds, marketplaces vs Steam fees, supply from cases, demand from events and hype, how prices form).',
            'MARKDOWN FORMAT (required): the interface renders Markdown, so structure the answer like a well-formatted note, never one dense block of text.',
            '- Use **bold** to highlight key terms, numbers and important concepts (e.g. **StatTrak™**, **Factory New**, **supply and demand**, **15% Steam fee**). Bold is a highlight, not every word.',
            '- Whenever you explain several factors, steps or comparisons, put them in a bullet list (lines starting with `• `) or a numbered list (`1. ` lines), one point per line — never as a run-on paragraph and never as bare consecutive sentences. Use the • character for bullets, never a leading `- ` dash. Inside a section that lists factors, EVERY factor is its own bullet, e.g.: a `**1. Where new skins come from**` header line, then one intro sentence, then `• **Cases and drops** — keys open cases, adding new skins to the market` then `• **Trade-ups** — …`.',
            '- When the answer covers more than one topic, split it into as many numbered sections as the topic genuinely has distinct aspects (typically 2–5) — never cram everything under a single section 1. Every section starts with its own header line, bolded as a whole: a sequential number, a period, and a clear, specific title that tells the reader exactly what that section covers (e.g. `**1. Where new skins come from**`, `**2. How supply and demand set the price**`, `**3. How Steam fees change your profit**`) — never a generic label. Number 1, 2, 3 in order from top to bottom, restarting at 1 in every new answer. Headers are never bullets, never ### lines, never skipped or repeated, and the titles are never listed again at the end of the answer.',
            '- Under each numbered header, write one or two short intro sentences first, THEN the bullet points for that section — never start a section with a bullet.',
            '- Only a single short answer with no distinct sections skips the numbering and just uses plain **bold** terms and bullets.',
            '- Keep paragraphs short: 2–3 sentences max, with a blank line between paragraphs and around lists/headings.',
            '- No TL;DR, summary, recap or closing line: the answer ends right after the last section\'s content.',
            'STRICT CONTENT RULES: no ### Item metrics, no ### AI SENTIMENT, no ### Key factors, no ### Items to buy, no ### Why these picks, no shopping list, no bullet list of items with prices, no item cards, no chart stubs, no disclaimers, no markdown tables or links. You may mention one or two example items or prices inline in a sentence if it helps the explanation, nothing more.',
            'Never end with an offer or a question back — finish the explanation and stop.',
            'You are not affiliated with Valve or Steam.',
        ];
        $moversContext = !empty($pageContext['movers_question']) ? aiChatBuildMoversContext() : '';
        if ($moversContext !== '') {
            // "Top market movers": name the actual items from CS Price data.
            // These lines come after STRICT CONTENT RULES on purpose - they
            // override its "no list of items with prices" for this request.
            $explainerLines[] = 'MARKET MOVERS REQUEST (overrides the rule against item lists above): the user wants the ACTUAL items that moved, not theory. Answer ONLY from the CS Price movers data below. Use the exact item names as written, the exact percentages and prices; never invent an item, a price or a percentage, and never pad with general market explanations.';
            $explainerLines[] = 'Format: one short opening line that states the window honestly (the biggest moves in the CS Price data window, with the last 7 days where given; the data is daily Steam history, so do not claim intraday "today" moves). Then `**1. Biggest gainers**` and, one bullet per item, `• **<exact item name>** — +X% (30D) — now €Y — <one short clause>`, 5–6 items, using the 7-day figure in the clause only when the data gives one and it tells a different story (never write "+0.00% over the last 7 days"). Then `**2. Biggest drops**` in the same shape with the negative figures. Then `**3. What to watch**` with 2–3 bullets that each name one of those items and the signal worth watching. No other sections.';
            $explainerLines[] = $moversContext;
        } elseif (!empty($pageContext['follow_up'])) {
            $explainerLines[] = 'FOLLOW-UP TAP: the user pressed one of your own suggested questions, so they want your read on what happens NEXT — not a lesson on how the market works. Give a forward-looking take of roughly 80–150 words: what you expect over the asked horizon, what would change your mind, and the one or two signals worth watching. Same Markdown rules, no pick list, and never restate your previous answer.';
        }
        if ($earlyPageType === 'mark') {
            $explainerLines[] = 'After your visible answer, append ---FOLLOWUPS--- then exactly four SHORT follow-up questions separated by | pipes, written in the same language as your answer. Each question is 3–6 words and under 40 characters (e.g. "How do trade holds work?", "Which wear holds value best?"), specific to what you just explained, and something the user might tap next. Never write a Hidden metadata heading or label.';
        }
        if ($marketPulseContext !== '') {
            $explainerLines[] = 'Live market pulse from CS Price (use a number or two only if it genuinely illustrates the point):';
            $explainerLines[] = $marketPulseContext;
        }
        return implode("\n", $explainerLines);
    }

    $lines = [
        'You are Mark, the built-in AI assistant for CS Price (CS2 Market) — a Counter-Strike 2 skins, cases, and market price tracker.',
        aiChatLanguageInstruction($pageContext),
        aiChatPersonalityLine('Personality: chill, funny, and laid-back — like a knowledgeable friend who also knows the market. Light sarcasm and CS slang are fine; never try-hard or corporate.'),
        'Talk like a CS player: casual wording, dry one-liners when they fit. Humor is seasoning — keep it brief.',
        'Avoid stiff phrases like "Certainly!", "As an AI", or "I would be happy to assist." Prefer vibes like "yeah so…", "honestly?", "quick take:".',
        'TERMINAL VOICE (all replies): You are a CS2 financial terminal analyst, not a generic chatbot. Lead with the direct answer. Never emit ### Verdict or a lone Verdict heading — AI SENTIMENT is the call. Use ### section headings so replies scan like Bloomberg/TradingView notes. On market / invest / outlook / chart replies ALWAYS emit THREE strips IN THIS ORDER: (1) ### Item metrics with exactly three chip lines — `**Scarcity:** <Extreme|High|Moderate|Low> — <short why>`, `**Liquidity:** <High|Medium|Low> — <short why>`, `**Volatility:** <High|Medium|Low> — <short why>` (each why under ~10 words, only from provided data; never as ### Scarcity / ### Liquidity / ### Volatility headings), (2) ### AI SENTIMENT immediately under Item metrics — one line `BULLISH|NEUTRAL|BEARISH — <one short clause why>` (shape: `BULLISH — <your own short read of THIS item/list>`; ALWAYS include the why, never verdict-only, and never reuse the wording of this instruction — write the clause from the data you were given), (3) ### Key factors immediately under AI SENTIMENT — 2–3 `+ ` Positives and 2–3 `- ` Negatives (short clauses, no €/%). Never invent confidence %, bear/base/bull scenario prices, impact scores, or factor tables with made-up %.',
        'AI SENTIMENT WHY (required): after Item metrics emit ### AI SENTIMENT then exactly `BULLISH|NEUTRAL|BEARISH — <one short clause why>` on the same strip. The why is a qualitative market read (demand / liquidity / finishes) — never omit it, never verdict-only, never use Now/1y € or %change as the why (those belong in Key read). Then ### Key factors with 2–3 `+ ` Positives and 2–3 `- ` Negatives (short clauses, no €/%).',
        'KEY FACTORS MARKERS (required): every Negative line under ### Key factors MUST start with `- ` exactly as every Positive starts with `+ `. An unmarked line is dropped by the interface and replaced with generic filler, so a risk without its `- ` is a risk the user never sees. Write both sides as plain readable phrases a player would say ("Selling large amounts can take time"), not clipped data labels ("Liquidity can thin quickly").',
        'SENTIMENT BIAS: BEARISH is the exception, not the default hedge. Use NEUTRAL when the read is mixed, uncertain, or simply quiet — that is the honest answer most of the time. Only call BEARISH when the data you were given actually shows deterioration (a clearly falling trend, collapsing volume, or listings drying up), never because you feel cautious or want to sound balanced. If the numbers look fine, say BULLISH.',
        'PICK SELECTION: you are choosing what is worth buying, so lead with items whose data looks constructive — steady or rising trend, workable liquidity, real demand. Do not fill the list with items you then argue against. If genuinely nothing in the provided data looks good, say so plainly in one sentence instead of recommending weak picks.',
        'Help users navigate the site, understand CS2 skins/cases/markets, compare marketplaces, and interpret prices.',
        'Site sections: Deals (arbitrage), ROI/Market browser, Watchlist, Inventory (Steam login), Collections, Cases, Armory, Skin Crafter, Mark AI, Market Data, item detail pages.',
        'LENGTH: keep it tight. Default answers are 2–5 short sentences or a few • bullets — usually under ~70 words. Skip intros, recaps, filler jokes, and "anyway / so yeah" padding. Only go longer when the user clearly asks for detail, a deep dive, or a multi-item list.',
        'Be proactive: infer intent from short or messy prompts. When market pulse, live prices, autonomous picks, or outlook data are provided, answer immediately with concrete item names and numbers — do NOT ask the user which item they mean first.',
        'If the user asks what will go up / best buys / multiple items and also wants a chart, list several picks then focus the chart on the primary chart pick already chosen in the context.',
        'Format like a financial terminal brief: clear visual hierarchy. Use **double asterisks** to bold item names, euro prices, percent moves, and key labels. On every • catalog bullet, bold the **skin/item name** and **€price** (keep the brief clause normal weight). Use ### markdown headings for sections — e.g. ### Item metrics, ### AI SENTIMENT, ### Key factors, ### Items to buy, ### Why these picks. Never emit ### Verdict or a lone Verdict heading. Tasteful emojis are welcome (🟢 🔴 🟡 📈 ⚠️) — one per section max, never spammy. No markdown tables or links. Bold is a highlight, not every word.',
        'BULLETS: use the • character for named skins/catalog picks under ### Items to buy (one item per line; never the same item twice). ### Why these picks is one line per item: **Name** — short why (8–14 words on liquidity / thesis / wear, matching the pick list/cards) — never intro sentences, € prices, 30d %, listings, or • / - / * / numbered markers under Why. Never wrap to a second line. Never repeat a name already listed in that section. REQUIRED short why after an em dash on EVERY listed pick — one clause, no prices, no 30d %; do not skip reasons. Optional theme sub-header (collection/case/weapon family, name only) above the pick lines. Never use - or * as catalog list markers. Outlook wrap-ups stay plain sentences with NO bullets, dashes, or numbered lists. Never emit a disclaimer, not-financial-advice line, or market-vibes wrap-up.',
        'INVEST / RECOMMEND LISTS: emit strips then body IN THIS ORDER — (1) ### Item metrics (three chip lines: `**Scarcity:** <level> — <short why>`, `**Liquidity:** <level> — <short why>`, `**Volatility:** <level> — <short why>`), (2) ### AI SENTIMENT `BULLISH|NEUTRAL|BEARISH — <one short clause why>` (immediately under Item metrics; always include the why), (3) ### Key factors — 2–3 `+ ` Positives and 2–3 `- ` Negatives (short clauses, no €/%; never inside Why these picks), (4) ### Items to buy (• bullets: **Item name** — **€price** — brief clause; ALWAYS bold the item name including Case/Capsule/Sticker names without `|`; never name+price-only; marketplace labels like "on CSFloat" are NOT a why; each market identity at most once), (5) ### Why these picks as **Name** — short why (one line per listed item, 8–14 words on liquidity / thesis / wear; no • / - / * / numbered markers; no intro blurb; no **€price** / **30d** / listings; REQUIRED short why on EVERY listed pick — one clause, no prices, no 30d %; do not skip reasons; never repeat a name; never prose paragraphs; never nest ### headings inside Why; never `+ `/`- ` signed chips; never Scarcity/Liquidity/Volatility chips / risk essays here — those belong ONLY under ### Item metrics). Never emit ### Verdict. Skip sticker crafts unless in context. For portfolio / what-should-I-buy / hold-horizon asks, follow the INVEST / BUY FORMAT block below.',
        'PRICES + TONE: write a € price on EVERY pick — a best estimate is fine because the server swaps in the live cheapest listing. Never write meta remarks such as "skip if price not provided", "price unknown", or "remove if strict", and never placeholder text such as "why", "reason", "TBD" — write the actual reason. Never end with an offer or a question back ("If you want, I can pull…", "Want me to…?") — do the useful thing in this reply or leave it out. Vary sentence openings and reasons between items; never repeat the same why clause for several items.',
        'You are connected to CS Price\'s Steam market data: cached roi_prices database plus on-demand Steam Community Market priceoverview refreshes. When a Steam market price feed block is provided below, cite those € prices with their source (live Steam vs cached) and update time.',
        'Never invent prices. Use only numbers from provided catalog, live price feed, market pulse, or price-outlook context; otherwise suggest opening the item page or Deals for more detail.',
        'When users ask whether you have Steam API or real-time price access: confirm YES — you read prices through this site\'s Steam integration (not a separate public Steam API key). Do not claim you lack access.',
        'When price outlook data is provided: use the CHART REPLY WRITING template — ### Item metrics (Scarcity / Liquidity / Volatility chip lines), then ### AI SENTIMENT `BULLISH|NEUTRAL|BEARISH — <one short clause why>` immediately under Item metrics (always include the why), then ### Key factors with 2–3 `+ ` Positives and 2–3 `- ` Negatives. Put real Now/1y € and % from data in Key read, not as the sentiment why. Call the widget Future, not ARIMA.',
        'For any item price prediction / "will it go up" / outlook question: always use the provided outlook data and the attached Future chart when CHART STATUS is attached. Never say the item is missing from cache, unavailable, or that you cannot chart it when outlook data or a chart is attached.',
        'Charts: interactive widgets render under your message (Future, Market Distribution, Price History) from attached data — the UI injects them. NEVER invent "[Chart attached]", ASCII art, bare Future/Chart stub lines, ### Chart / outlook, "Future chart available:…", ### Chart focus / Chart focus prose (Now/1y/outlook), ### Hidden metadata, or a Hidden metadata label. If a chart is attached, do not describe it or say a future chart is available — just give verdict/numbers. If not attached, do not claim a chart is shown and do not write a Chart/outlook stub instead.',
        'Item cards: clickable cards render BELOW your reasoning for the items you name as buys. Name only the items you are actually recommending — cards are not padded with extra catalog cases. Do not invent items that are not in the provided lists. Do not write markdown links — the cards already link through.',
        'Do NOT emit a ### CS2 markets overview section, LIVE DATA strip, or Market / 24H Vol / trend / Items / AI Sentiment dashboard — a live overview widget is rendered above every reply automatically.',
        'When recommending items to buy and cheapest marketplace listings are provided: put that item\'s exact numeric euro price on the pick bullet. That is the cheapest ask across tracked marketplaces for that exact name/wear — the same figure the item card shows. Never invent a cheaper market or price, and never quote a different cache/Steam average for the same pick. NEVER write placeholder prices such as X.XX — use only the provided numbers. If a listing is missing, skip the buy price rather than faking one.',
        'IMPORTANT: This chat CAN and DOES create live charts. Never say you cannot create a chart here, cannot create a new/different chart, or that the user must open the item page instead — unless CHART STATUS explicitly says data failed to load.',
        'When the user asks for another chart, a different chart, a new chart, or something else: create a different chart type for the same item (Market Distribution and/or Price History if Future was already shown). Do not refuse.',
        'Never ask the user to upload, attach, paste, or provide Market Distribution, Price History, Future Outlook, or any chart data files. This site builds those charts automatically from live/cached market data. If charts could not be loaded, say so briefly and suggest opening the item page — do not ask for uploads.',
        'When the user asks for a supply chart, listings chart, marketplace chart, or charts across markets/providers, that means Market Distribution (and Price History when attached). Never say you cannot create those charts when CHART STATUS is attached.',
        'You are not affiliated with Valve or Steam.',
        'NEVER write a disclaimer, "one-line disclaimer", not-financial-advice sentence, or market-vibes wrap-up. Do not mention financial advice.',
    ];

    $pageType = trim((string)($pageContext['page_type'] ?? ''));
    $isInventoryAnalysis = $pageType === 'inventory';
    $isExplainer = !$isInventoryAnalysis && $pageType !== 'item' && $userMessage !== ''
        && empty($pageContext['invest_followup'])
        && aiChatLooksLikeExplainerQuestion($userMessage);
    $isInvest = !$isInventoryAnalysis && !$isExplainer && $userMessage !== '' && (aiChatLooksLikeItemPickQuestion($userMessage) || !empty($pageContext['invest_followup']));
    if ($attachedChartKinds) {
        $chartWriting = aiChatChartWritingInstructions($attachedChartKinds, $isInvest);
        if ($chartWriting !== '') {
            $lines[] = $chartWriting;
        }
    }

    if ($chartAttached === true) {
        $lines[] = 'CHART STATUS: attached. A real interactive chart WILL render under your reply automatically. Do NOT write "[Chart attached]", "[chart attached]", "chart below", "Chart / outlook", "Future chart available", Hidden metadata, or a bare Future/Chart heading — the widget is enough. Just give the outlook/numbers. Never claim you cannot create charts.';
    } elseif ($chartAttached === false) {
        $lines[] = 'CHART STATUS: requested but live chart data failed to load for this turn. Briefly say the chart widget could not load right now and suggest the item page. Do NOT say that this chat is unable to create charts in general — it normally can.';
    }

    if ($userMessage !== '' && $isInvest) {
        $scope = aiChatRequestedCardScope($userMessage);
        if (aiChatLooksLikeCheapestListAsk($userMessage)) {
            $lines[] = 'CHEAPEST ASK (overrides the strips rule and every pick-quality rule): the user wants the LOWEST-PRICED options, full stop. Skip ### Item metrics, ### AI SENTIMENT and ### Key factors entirely. Open with one short sentence, then ### Items to buy with 4–6 bullets taken ONLY from the "CHEAPEST candidates" list in context, in that list\'s order (cheapest first) with the € price given there — never add names from the Steam price feed or trending lists, never swap in pricier or "better" skins, never add ×qty. Then ### Why these picks with one short line each.';
        }
        $lines[] = 'INVEST / BUY FORMAT (overrides the default ~70-word cap): item cards show BELOW your text. Emit body parts IN THIS EXACT ORDER: (1) ### Item metrics (three chip lines: `**Scarcity:** <level> — <short why>`, `**Liquidity:** <level> — <short why>`, `**Volatility:** <level> — <short why>`), (2) ### AI SENTIMENT — `BULLISH|NEUTRAL|BEARISH — <one short clause why>` immediately under Item metrics (never omit; always include the why), (3) ### Key factors — 2–3 `+ ` Positives and 2–3 `- ` Negatives (short clauses, no €/%; never inside Why these picks), (4) ### Items to buy — 3–5 unique • picks: **Name (wear)** — **€price** (or **€unit ×qty = €line_total** when qty matters) — one brief clause from trend/volume/listings/rarity. Never stop at name+price. Cases, capsules, and any pick under €5 MUST include quantity + line total (e.g. €0.40 ×50 = €20.00) — never 1× only; when NO total budget is set, target ~€20–50 per cheap pick. When a TOTAL budget IS set, share that budget across all picks — never stack per-pick €20–50 slices past the budget. "on CSFloat" / "on Skinport" / "on White.Market" is NOT a why, (5) ### Why these picks — **Name** — short why (one line per listed pick, 8–14 words on liquidity / thesis / wear; never • / - / *; no intro sentence; no € / 30d / listings; REQUIRED short why on EVERY listed pick — one clause, no prices, no 30d %; do not skip reasons; never nest ### headings inside Why; never paragraph blocks; never general market fluff; never `+ `/`- ` signed chips; never SCARCITY/LIQUIDITY/VOLATILITY lines or ### Scarcity / ### Liquidity / ### Volatility chips here — they belong only under ### Item metrics; NEVER write Chart focus or ### Verdict). AI SENTIMENT immediately under Item metrics. Use the cheapest tracked listing € for that exact name/wear on the bullet — the same figure the cards show. No empty Buy/Hold/Sell labels. Do not invent sticker crafts, remaining-craft counts, or collector demand unless those numbers are provided — skip unknown factors. Never write €X.XX.';
        $whyOnce = $scope['type'] === 'collection'
            ? ' ### Why these picks is one short **Name** — why line per listed skin only (never a why line for a collection).'
            : ' ### Why these picks is one short **Name** — why line per listed skin (never a collections-only list unless the user asked for collections).';
        $lines[] = 'ONE LIST ONLY — STOP AFTER WHY: each recommended item appears once under ### Items to buy.'
            . $whyOnce
            . ' Then STOP. Never a second pick list, never "Proposed final mix" / "final mix near budget", never "To hit ~€…", never "If you want to stay within €…", never "Replace X with Y" / "Keep X as core" / alternative-mix essays, never TOTAL / Portfolio total recap that re-lists every line. Qty and line totals already live on the first bullets — do not type the items twice.';
        $lines[] = 'UNIQUE PICKS HARD RULE: each market identity appears at most ONCE under ### Items to buy and at most ONCE under ### Why these picks. Identity is weapon|skin + wear (or the case/capsule/sticker name). Glock-18 | Moonrise (Factory New) twice is ONE line — scale with ×qty on that bullet. Two Dreams & Nightmares Case lines is ONE. Different wears of the same skin may both appear only if the user asked for both (Moonrise FN and Moonrise FT are not duplicates). NEVER write a second copy. NEVER write "see above (duplicate line not allowed; adjust below)" or any self-correction about duplicates — if you already listed it, skip it.';
        $budgetEuro = aiChatExtractBudgetEuro($userMessage);
        if ($budgetEuro > 0) {
            $budget = aiChatExtractBudgetDetails($userMessage);
            $slack = round($budgetEuro * 0.05, 2);
            $low = max(0, round($budgetEuro - $slack, 2));
            $high = round($budgetEuro + $slack, 2);
            $lines[] = 'BUDGET HARD CAP: ' . $budget['label']
                . ' (site prices are €; ±5% OK — roughly €' . number_format($low, 2, '.', '')
                . '–€' . number_format($high, 2, '.', '')
                . ' TOTAL). Use whole quantities only (×2, ×10 — never fractional skins). Each bullet: **Name** — €unit ×qty = €line_total — why.'
                . ' The SUM of all line totals must land in that band — do NOT reply with five 1× picks that only spend ~40–60% of the budget,'
                . ' and do NOT let cheap bulk qty alone (or stacked across picks) blow past the band.'
                . ' Drop unit prices that exceed the budget; never leave an "exceeds budget" item in the final list.'
                . ' One pick list only. After Why these picks, STOP — no Proposed mix, no replace-X-with-Y writeup, no Portfolio total recap.';
        } elseif (aiChatLooksLikeHoldHorizonQuestion($userMessage)) {
            $lines[] = 'HOLD PORTFOLIO: cases/capsules and picks under €5 need bulk quantity on the bullet (€unit ×qty = €line_total). Typical cheap-pick slice is ~€20–50 (e.g. 50–100 cheap cases) when no total budget is set. Expensive skins/stickers can stay 1×.';
        }
        if (aiChatLooksLikeRaiseBudgetRequest($userMessage)) {
            $lines[] = 'BUDGET RAISED (follow-up): the user just asked for a higher budget than your immediately previous Items to buy list in this thread. Pick a genuinely DIFFERENT, generally MORE EXPENSIVE set — do not just repeat the same names/prices from that previous list. Use the extra room to feature pricier or rarer picks that were out of range before.';
        }
        if (aiChatLooksLikeSwapOneItemRequest($userMessage)) {
            $lines[] = 'SWAP ONE ITEM (follow-up): the user wants exactly ONE pick from your immediately previous Items to buy list replaced with a different comparable item at a similar price — keep the other picks from that list unchanged. Do not regenerate the whole list and do not swap more than one item.';
        }
        if (aiChatLooksLikeMoreItemsRequest($userMessage)) {
            $lines[] = 'MORE / DIFFERENT PICKS (follow-up): the user wants to see more or different options than your immediately previous Items to buy list. Use 5 Items to buy (the top of the normal 3–5 range), not 3, and make every name different from anything you already listed earlier in this thread.';
        }
        if ($scope['type'] === 'collection') {
            $lines[] = 'COLLECTIONS-INVEST FORMAT (overrides body order above): ### Item metrics then ### AI SENTIMENT `BULLISH|NEUTRAL|BEARISH — <one short clause why>` (outlook only — sits immediately under Item metrics; always include the why), then ### Collections to watch (never write the word shortlist; optional 🟢 on this heading only) with 3–5 real CS2 collection names as **Name** — one-line why (e.g. **The Achroma Collection** — clean, versatile graphics that stay timeless). That list is the primary answer. Use only names from TRACKED COLLECTIONS / candidate [Collection] tags — never invent a collection. Then ### Items to buy with 3–5 skins that actually belong to those named collections. Never lead with random popular skins (AK-47 | Redline, M4A1-S | Night Terror, USP-S | Ticket to Hell, etc.) unless that skin\'s collection is one you named. ### Why these picks: **Skin** — short why for EVERY listed pick (same skins as Items to buy / cards). Never a why line for a collection — Why explains individual skins only; the collection rationale belongs under ### Collections to watch. After Why, STOP — no second mix or recap.';
        } elseif (aiChatLooksLikeOpenEndedInvestQuestion($userMessage) && $scope['type'] !== 'souvenir' && !aiChatIsStickerCardScope($scope['type']) && $scope['type'] !== 'charm') {
            $lines[] = 'DIVERSIFY: different weapons, different finish families, and different price bands. Never dump one collection (Elite Build ×4). Unique item types only — scale with ×qty, not duplicate bullets. A case or sticker only if it is an actual pick, not filler.';
        } elseif ($scope['type'] === 'souvenir') {
            $lines[] = 'SOUVENIR ONLY: every pick must be a Souvenir Package or Souvenir Weapon | Skin. Never regular skins (no bare AK-47 | Redline), never StatTrak, never non-souvenir stickers/cases. Prefer the souvenir candidates provided in context.';
        } elseif ($scope['type'] === 'sticker_capsule') {
            $lines[] = 'STICKER CAPSULES ONLY: every pick must be a Sticker Capsule or Autograph Capsule (or EMS Katowice 2014 Legends/Challengers). Never weapon cases (Snakebite Case, Clutch Case) and never gun skins (Glock-18, USP-S). Prefer the sticker-capsule candidates provided in context.';
        } elseif ($scope['type'] === 'sticker') {
            $lines[] = 'STICKERS ONLY: every pick must be a paper sticker (Sticker | …) or a sticker/autograph capsule from this site\'s stickers.html catalog. Never weapon cases. Never gun skins. Never glue the word Sticker onto a rifle/pistol name (no Glock-18 | Moonrise Sticker). Prefer the sticker/capsule candidates provided in context.';
        } elseif ($scope['type'] === 'charm') {
            $lines[] = 'CHARMS ONLY: every pick must be a CS2 keychain charm from this site (Charm | Hot Wurst, Charm | Disco MAC, Souvenir Charm | …). Never weapon skins. Never glue the word Charm onto a rifle/AWP name. Prefer the charm candidates provided in context.';
        } elseif (aiChatIsEquipmentCategoryScope($scope['type']) || $scope['type'] === 'case') {
            $label = aiChatCategoryScopeLabel($scope['type'], $scope['weapon']);
            $st = !empty($scope['stattrak']) ? ' Every pick must be StatTrak™.' : '';
            $lines[] = strtoupper($scope['type']) . ' ONLY: every Items to buy and Why these picks line MUST be ' . $label
                . ' — never other equipment types (no Bayonet / AK-47 / SCAR-20 fillers on a gloves ask; no gloves on a knife ask; no pistols on a rifles ask).'
                . $st
                . ' Unique names, no duplicates. Prefer the ' . $label . ' candidates provided in context.';
        } elseif ($scope['weapon'] !== '') {
            $lines[] = 'The user scoped ' . $scope['weapon'] . ' — stay on that weapon but still vary finishes. Unique items, no duplicates. Never recommend other weapons.';
        } elseif ($scope['type'] !== '') {
            $lines[] = 'Stay on ' . $scope['type'] . ' items but still vary names/collections. Unique items, no duplicates.';
        }
    }

    if ($isExplainer) {
        $lines[] = 'EXPLAINER QUESTION (overrides every format rule above): the user is asking how something works or what something is — they want a written answer, not picks. Format it as clean Markdown: short paragraphs (2–3 sentences), `• ` bullet lists (never `- ` dashes) whenever you explain several factors or steps, and when the answer covers more than one topic, as many numbered bold section headers as the topic has distinct aspects, each on its own line with a clear, specific title (e.g. `**1. Where new skins come from**`, `**2. How Steam fees change your profit**`, numbered from 1 in order, never ### headings, never inside a bullet, never generic, never listed again at the end) each followed by one or two intro sentences before its bullets; **bold** on key terms and numbers. No TL;DR, summary or closing line — end after the last section. A single short answer with no sections skips the numbering. Up to ~200 words. Absolutely NO ### Item metrics, ### AI SENTIMENT, ### Key factors, ### Items to buy, ### Why these picks, no price list, no item recommendations, no item cards, no chart stubs. Never end with an offer or a question back.';
    } elseif (!empty($pageContext['explain_followup'])) {
        $lines[] = 'EXPLAIN TURN (overrides every format rule above): the user wants the reasoning behind something in your previous answer. Reply with 3–6 plain sentences — no ### headings, no Item metrics / AI SENTIMENT / Key factors, no pick list, no bullets, no prices unless they asked. Name the item you are explaining in the first sentence and give concrete reasons (demand, liquidity, supply, wear, event cycle). Never end with an offer or a question.';
    } elseif (!empty($pageContext['continuation'])) {
        $lines[] = 'FOLLOW-UP TURN (overrides the strips rule above): the user is reacting to your previous answer, not asking a fresh question. Do NOT repeat ### Item metrics, ### AI SENTIMENT, or ### Key factors. Open with ONE short sentence that directly answers or acknowledges the request, then give the updated content. Never answer with a question back ("Want me to pull a list?") — do the work in this reply. Never invent pseudo-items such as "(cheaper tier)" or "(budget version)"; every pick is a real market item name.';
        $lines[] = 'FOLLOW-UP KINDS: "bigger / more / expand / add": keep EVERY previous pick, ADD new unique items (different weapons, finish families, and price bands) — if the user gives a number ("add 5 more") add EXACTLY that many — one ### Items to buy list, then ### Why these picks with one short why line for EVERY item including the new ones. "double / triple the quantities": multiply EVERY ×qty by that factor and recompute every = €total and the grand total. "cheaper / alternatives / instead / something else": give 3–5 concrete cheaper REAL alternatives in the same category under ### Items to buy (name — **€price** — short why) then ### Why these picks; a one-sentence comparison to the previous item is welcome. "why / explain": answer in plain sentences, no new list. Constraints stated earlier in the thread (a budget such as "under €300", a category such as knives or cases, a weapon) still apply unless the user changed them — never add a €1500 knife to an under-€300 list. Never reuse the exact wording of your previous reply.';
    }
    if ($pageType === 'mark') {
        $lines[] = 'The user is on the dedicated Mark AI page. Stay short — same tight length rules as elsewhere; do not pad with extra commentary.';
        $lines[] = 'After your visible answer, append ---FOLLOWUPS--- then exactly four SHORT follow-up questions separated by | pipes, written in the same language as your answer. Each question is 3–6 words and under 40 characters (e.g. "Cheaper picks under €50?", "Swap the AK-47 for a knife?"), specific to THIS answer (the items, category or topic you just covered), fresh every time — never generic, never repeat questions from earlier in the thread — and something the user might tap next. Never write a Hidden metadata heading or label — that marker is stripped and must not appear in the visible answer.';
    }
    if ($pageType === 'inventory') {
        $lines[] = 'INVENTORY REVIEW (overrides INVEST / RECOMMEND LISTS and any buy-list format): review the user\'s CURRENT STASH only. Tell them the future of THEIR inventory — not what to buy next.';
        $lines[] = 'Analyze the holdings in the Steam inventory snapshot: mix, concentration, liquidity, and outlook for those items — what may rise, stall, stay liquid, and the main risks.';
        $lines[] = 'Briefly note estimated total € value and biggest holdings. Keep inventory-facing bits about the current stash: a one-line take, a short portfolio summary, ### Item metrics, and ### AI SENTIMENT. Never emit ### Verdict or a lone Verdict heading.';
        $lines[] = 'HARD BAN: do NOT recommend new items to buy. Do NOT emit ### Items to buy, ### What to buy next, ### Why these picks, or any shopping / pick / "buy next" list. Do not suggest cases, skins, or capsules they do not already hold. Market pulse is context for existing holdings only.';
        $lines[] = 'Do not invent holdings or prices beyond the snapshot. Avoid sell-the-portfolio advice. Keep the whole answer tight. Use ### headings such as ### Summary of your portfolio and ### Outlook. No buy-list bullets.';
    }
    if ($pageType === 'item') {
        $lines[] = 'The user requested an AI item analysis.';
        $lines[] = 'This works for guests and logged-in users — do not ask them to sign in with Steam to get the analysis.';
        $lines[] = 'Keep it under ~90 words: short outlook (near + longer term), one risk/upside line, and whether it is a decent buy/add. Prefer expand/buy guidance over sell guidance.';
    }

    $mode = trim((string)($pageContext['mode'] ?? ''));
    if ($mode !== '') {
        $lines[] = 'Current Mark AI mode: ' . $mode;
    }

    $path = trim((string)($pageContext['path'] ?? ''));
    if ($path !== '') {
        $lines[] = 'Current page path: ' . $path;
    }

    $title = trim((string)($pageContext['title'] ?? ''));
    if ($title !== '') {
        $lines[] = 'Current page title: ' . $title;
    }

    foreach (['item_name', 'lookup_name', 'wear'] as $key) {
        $value = trim((string)($pageContext[$key] ?? ''));
        if ($value !== '') {
            $lines[] = ($key === 'wear' ? 'Selected wear: ' : 'Current item context: ') . $value;
        }
    }

    if ($catalogContext !== '') {
        $lines[] = $catalogContext;
    }

    if ($predictionContext !== '') {
        $lines[] = $predictionContext;
    }

    if ($marketPulseContext !== '') {
        $lines[] = $marketPulseContext;
    }

    if ($inventoryContext !== '') {
        $lines[] = $inventoryContext;
    }

    if ($livePriceContext !== '') {
        $lines[] = $livePriceContext;
    }

    $referenceKnowledge = aiChatReferenceKnowledge();
    if ($referenceKnowledge !== '') {
        $lines[] = 'Educational reference (CS skins/markets/history + community culture — not live prices):';
        $lines[] = $referenceKnowledge;
        $lines[] = 'When community culture conflicts with market facts, prefer cached prices and item-page data for numbers; use community reference for tone, memes, creator context, and how players talk about the game.';
    }

    return implode("\n", $lines);
}

function aiChatUsesCompletionTokens(string $model): bool
{
    $name = strtolower(trim($model));
    if ($name === '') {
        return false;
    }

    // Only the legacy GPT-4o / GPT-4 / GPT-3.5 chat models still take
    // max_tokens; everything newer (GPT-4.1, GPT-5.x, GPT-6, o-series,
    // chat-latest…) wants max_completion_tokens.
    return !aiChatIsLegacyChatModel($name);
}

/** gpt-4o*, gpt-4-*, gpt-4, gpt-3.5* — the pre-reasoning chat models. */
function aiChatIsLegacyChatModel(string $model): bool
{
    $name = strtolower(trim($model));
    return (bool)preg_match('/^(gpt-4o|gpt-4-|gpt-4$|gpt-3\.5)/', $name);
}

/**
 * @return array{max_completion_tokens?:int,max_tokens?:int}
 */
function aiChatTokenLimitParams(string $model, int $limit): array
{
    $limit = max(1, $limit);
    if (aiChatUsesCompletionTokens($model)) {
        return ['max_completion_tokens' => $limit];
    }

    return ['max_tokens' => $limit];
}

/**
 * GPT-5 / o-series reject custom temperature (only default 1 is allowed).
 */
function aiChatSupportsCustomTemperature(string $model): bool
{
    $name = strtolower(trim($model));
    if ($name === '') {
        return true;
    }

    // Reasoning-era models (GPT-5.x, GPT-6, o-series, chat-latest) only
    // accept the default temperature; the legacy chat models take a custom one.
    return aiChatIsLegacyChatModel($name) || str_starts_with($name, 'gpt-4.1');
}

/**
 * @return array{temperature?:float}
 */
function aiChatTemperatureParams(string $model, float $temperature): array
{
    if (!aiChatSupportsCustomTemperature($model)) {
        return [];
    }

    return ['temperature' => $temperature];
}

/**
 * GPT-5 models default to heavy reasoning that can exhaust max_completion_tokens
 * before any visible content is produced. Prefer minimal effort for chat UX.
 *
 * @return array{reasoning_effort?:string}
 */
function aiChatReasoningParams(string $model): array
{
    $name = strtolower(trim($model));
    // Reasoning models only. The *-chat-latest and *-codex variants do not take
    // the parameter, so they are left alone.
    if ($name === '' || str_contains($name, 'chat-latest') || str_contains($name, 'codex')) {
        return [];
    }
    if (!preg_match('/^gpt-(\d+)(?:\.(\d+))?/', $name, $match)) {
        return [];
    }
    $major = (int)$match[1];
    $minor = isset($match[2]) ? (int)$match[2] : 0;
    if ($major < 5) {
        return [];
    }

    $effort = strtolower(trim((string)(aiChatConfig()['reasoning_effort'] ?? 'minimal')));
    if (!in_array($effort, ['minimal', 'low', 'medium', 'high', 'xhigh'], true)) {
        $effort = 'minimal';
    }
    // 'minimal' was dropped in GPT-5.4; from there on 'low' is the floor and a
    // request carrying 'minimal' is rejected outright with a 400.
    $supportsMinimal = ($major === 5 && $minor <= 3);
    if ($effort === 'minimal' && !$supportsMinimal) {
        $effort = 'low';
    }

    return ['reasoning_effort' => $effort];
}

/**
 * Merge shared OpenAI chat.completions options for the configured model.
 *
 * @return array<string, mixed>
 */
function aiChatModelRequestParams(string $model, int $maxTokens, ?float $temperature = null): array
{
    $params = array_merge(
        aiChatReasoningParams($model),
        aiChatTokenLimitParams($model, $maxTokens)
    );
    if ($temperature !== null) {
        $params = array_merge($params, aiChatTemperatureParams($model, $temperature));
    }

    return $params;
}

function aiHttpPostJson(string $url, array $payload, array $headers, int $timeoutSeconds = 30): array
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_THROW_ON_ERROR),
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers),
        CURLOPT_TIMEOUT => $timeoutSeconds,
        CURLOPT_CONNECTTIMEOUT => min(10, $timeoutSeconds),
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $body = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);

    if ($body === false) {
        $error = curl_error($curl);
        curl_close($curl);
        throw new RuntimeException('AI request failed: ' . $error);
    }

    curl_close($curl);

    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('AI response was not valid JSON.');
    }

    return [
        'status' => $status,
        'json' => $decoded,
        'body' => $body,
    ];
}

function aiChatLooksLikeFinancialDisclaimerLine(string $line): bool
{
    $plain = trim(preg_replace('/\*\*/u', '', (string)$line) ?? (string)$line);
    $plain = trim(preg_replace('/^#+\s+/u', '', $plain) ?? $plain);
    if ($plain === '') {
        return false;
    }
    if (preg_match('/^(?:one-line\s+)?disclaimer\b/iu', $plain)) {
        return true;
    }
    if (preg_match('/^(?:this is\s+)?not financial advice\b/iu', $plain)) {
        return true;
    }
    if (preg_match('/\bnot financial advice\b/iu', $plain) && preg_match('/\bmarket vibes\b/iu', $plain)) {
        return true;
    }
    if (preg_match('/\bmarket vibes from the data you see\b/iu', $plain)) {
        return true;
    }
    return false;
}

function aiChatStripFinancialDisclaimer(string $reply): string
{
    if ($reply === '') {
        return $reply;
    }
    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }
    $kept = [];
    foreach ($lines as $line) {
        if (aiChatLooksLikeFinancialDisclaimerLine((string)$line)) {
            continue;
        }
        $kept[] = $line;
    }
    $out = implode("\n", $kept);
    $out = preg_replace('/(?:\n[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*)+\s*$/u', '', $out) ?? $out;
    $out = preg_replace("/\n{3,}/u", "\n\n", $out) ?? $out;
    return trim($out);
}

function aiChatLooksLikePostListParagraph(string $line): bool
{
    $trim = trim($line);
    if ($trim === '') {
        return false;
    }
    if (aiChatLooksLikeFinancialDisclaimerLine($trim)) {
        return true;
    }
    return (bool)preg_match('/\b(not financial advice|disclaimer|volatility|chart (?:is )?below|cards below)\b/iu', $trim);
}

function aiChatBulletExtraLimit(): int
{
    return 220;
}

function aiChatLooksLikeRecommendItemLine(string $body): bool
{
    $plain = trim(preg_replace('/\*\*/u', '', $body) ?? $body);
    if ($plain === '') {
        return false;
    }
    if (str_contains($plain, '|')) {
        return true;
    }
    if (preg_match('/\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred|FN|MW|FT|WW|BS)\)/iu', $plain)) {
        return true;
    }
    // Wear abbreviations without parens: "USP-S Cortex FT"
    if (preg_match('/\b(?:FN|MW|FT|WW|BS)\b/u', $plain)) {
        return true;
    }
    if (preg_match('/^(?:StatTrak™?\s+)?(?:★\s+)?(?:AK-47|M4A1-S|M4A4|AWP|USP-S|Glock-18|Glock|Desert Eagle|Deagle|P250|P2000|Five-SeveN|Tec-9|CZ75-Auto|Dual Berettas|MAC-10|MP7|MP9|MP5-SD|UMP-45|P90|PP-Bizon|Galil AR|FAMAS|SG 553|AUG|SSG 08|SCAR-20|G3SG1|Negev|M249|Nova|XM1014|Sawed-Off|MAG-7|R8 Revolver)\b/iu', $plain)) {
        return true;
    }
    // Vanilla knives / gloves without a pipe: "★ Navaja Knife — €26.07", "Hand Wraps | …" handled above.
    if (preg_match('/^(?:★\s*)?(?:StatTrak™?\s+)?(?:(?:Bayonet|Karambit|Flip|Gut|M9 Bayonet|Huntsman|Falchion|Bowie|Butterfly|Shadow Daggers|Navaja|Stiletto|Ursus|Talon|Skeleton|Nomad|Paracord|Survival|Classic|Kukri)(?:\s+Knife)?|(?:Sport|Specialist|Driver|Moto|Hydra|Bloodhound|Broken Fang)\s+Gloves|Hand Wraps)\b/iu', $plain)) {
        return true;
    }
    if (
        preg_match('/\b(Case|Capsule|Package|Pin|Charm|Sticker|Patch|Agent|Graffiti|Terminal)\b/iu', $plain)
        && preg_match('/(?:€|\$|£)\s*\d/u', $plain)
    ) {
        return true;
    }
    return false;
}

function aiChatLooksLikeEssayHeading(string $line): bool
{
    $trim = trim($line);
    if ($trim === '') {
        return false;
    }
    $plain = preg_replace('/\*\*/u', '', $trim) ?? $trim;
    $plain = trim($plain);
    if (preg_match('/^(?:Notes?|Why(?: these picks| this mix)?|Future outlook|Outlook|Analysis|Summary|Caveats?|Risks?|Disclaimer)\s*:?\s*$/iu', $plain)) {
        return true;
    }
    return (bool)preg_match('/^(?:\*\*)?(?:Reason to buy|Why(?: to buy| it)?|Chart pick|Outlook|Buy on)\s*:?\s*(?:\*\*)?$/iu', $trim);
}

function aiChatLooksLikeWrapUpAfterList(string $line): bool
{
    $trim = trim($line);
    if ($trim === '') {
        return false;
    }
    if (aiChatLooksLikePostListParagraph($trim)) {
        return true;
    }
    return (bool)preg_match('/^(?:These|Those|Anyway|So yeah|Quick take:)\b/iu', $trim);
}

function aiChatLooksLikeBulletContinuation(string $line): bool
{
    $trim = trim($line);
    if ($trim === '') {
        return false;
    }
    if (aiChatLooksLikeEssayHeading($trim)) {
        return true;
    }
    if (preg_match('/^\s+•\s+(.*)$/u', $line, $nested)) {
        $nestedBody = trim((string)$nested[1]);
        // Nested catalog picks are promoted, not folded into the parent bullet.
        if (aiChatLooksLikeCatalogItemLine($nestedBody)) {
            return false;
        }
        return true;
    }
    return false;
}

function aiChatExtractListedPrice(string $text): string
{
    if (preg_match('/(?:€|\$|£)\s*\d[\d.,]*/u', $text, $matches)) {
        return trim((string)$matches[0]);
    }
    return '';
}

function aiChatNormalizeBulletExtra(string $extra): string
{
    $extra = trim($extra);
    $extra = preg_replace('/^(?:[\s]*[—–\-]+[\s]*)+/u', '', $extra) ?? $extra;
    $extra = preg_replace('/^•\s+/u', '', $extra) ?? $extra;
    $extra = preg_replace('/^(?:\*\*)?(?:Reason to buy|Why(?: to buy)?)\s*:?\s*/iu', '', $extra) ?? $extra;
    return trim($extra);
}

function aiChatCapBulletExtra(string $extra): string
{
    $extra = aiChatNormalizeBulletExtra($extra);
    if ($extra === '' || aiChatLooksLikeEssayHeading($extra) || aiChatLooksLikeMarketOnlyExtra($extra)) {
        return '';
    }
    if (mb_strlen($extra) > aiChatBulletExtraLimit()) {
        return '';
    }
    return $extra;
}

function aiChatLooksLikeMarketOnlyExtra(string $extra): bool
{
    $extra = aiChatNormalizeBulletExtra($extra);
    $extra = trim((string)preg_replace('/[.,;]+$/u', '', $extra));
    if ($extra === '') {
        return true;
    }
    $market = '(?:steam|skinport|cs\s*float|csfloat|white(?:\.?\s*market)?|dmarket|shadowpay|waxpeer|mannco(?:\.?\s*store)?|halo\s*skins|haloskins|market\.?csgo|buff(?:163)?|csmoney)';
    if (preg_match('/^(?:cheapest\s+)?(?:listed|ask|listing)$/iu', $extra)) {
        return true;
    }
    if (preg_match('/^(?:cheapest\s+)?on\s+' . $market . '(?:\s+market)?$/iu', $extra)) {
        return true;
    }
    if (preg_match('/^buy on\s+' . $market . '$/iu', $extra)) {
        return true;
    }
    return false;
}

function aiChatLooksLikeWeakPickWhy(string $extra): bool
{
    $extra = aiChatNormalizeBulletExtra($extra);
    if ($extra === '' || aiChatLooksLikeMarketOnlyExtra($extra)) {
        return true;
    }
    $market = '(?:steam|skinport|cs\s*float|csfloat|white(?:\.?\s*market)?|dmarket|shadowpay|waxpeer|mannco(?:\.?\s*store)?|halo\s*skins|haloskins|market\.?csgo|buff(?:163)?|csmoney)';
    $withoutMarket = trim((string)preg_replace('/(?:cheapest\s+)?on\s+' . $market . '(?:\s+market)?/iu', '', $extra));
    $withoutMarket = trim((string)preg_replace('/[\s—–\-]+/u', ' ', $withoutMarket));
    if ($withoutMarket === '') {
        return true;
    }
    if (preg_match('/\b(30d|7d|vol(?:ume)?|listing|liquid|classif|covert|restricted|mil-spec|rare|trend|demand|hold|underval|supply|collection)\b/iu', $withoutMarket)) {
        return false;
    }
    return mb_strlen($withoutMarket) < 15;
}

function aiChatUsdToEurRate(): float
{
    static $rate = null;
    if (is_float($rate)) {
        return $rate;
    }
    $rate = 0.92;
    $configFile = __DIR__ . '/config.php';
    if (is_file($configFile)) {
        $config = require $configFile;
        if (is_array($config)) {
            $rate = max(0.01, (float)(
                $config['dmarket']['usd_to_eur']
                ?? $config['shadowpay']['usd_to_eur']
                ?? $config['waxpeer']['usd_to_eur']
                ?? $config['mannco']['usd_to_eur']
                ?? $rate
            ));
        }
    }
    return $rate;
}

/**
 * @return array{amount: float, currency: string, euro: float, label: string}
 */
function aiChatExtractBudgetDetails(string $message): array
{
    $message = trim($message);
    $empty = ['amount' => 0.0, 'currency' => 'EUR', 'euro' => 0.0, 'label' => ''];
    if ($message === '') {
        return $empty;
    }

    $amount = 0.0;
    $currency = 'EUR';

    if (preg_match('/(?:about|around|under|below|with|for)?\s*(\$)\s*(\d+(?:[.,]\d+)?)\s*(?:total|budget|stack|portfolio)?/iu', $message, $match)) {
        $amount = round((float)str_replace(',', '.', (string)$match[2]), 2);
        $currency = 'USD';
    } elseif (preg_match('/(?:about|around|under|below|with|for)?\s*(€)\s*(\d+(?:[.,]\d+)?)\s*(?:total|budget|stack|portfolio)?/iu', $message, $match)) {
        $amount = round((float)str_replace(',', '.', (string)$match[2]), 2);
        $currency = 'EUR';
    } elseif (preg_match('/(?:about|around|under|below|with|for)?\s*(£)\s*(\d+(?:[.,]\d+)?)\s*(?:total|budget|stack|portfolio)?/iu', $message, $match)) {
        $amount = round((float)str_replace(',', '.', (string)$match[2]), 2);
        $currency = 'GBP';
    } elseif (preg_match('/\b(\d+(?:[.,]\d+)?)\s*(usd|dollars?|bucks)\b/iu', $message, $match)) {
        $amount = round((float)str_replace(',', '.', (string)$match[1]), 2);
        $currency = 'USD';
    } elseif (preg_match('/\b(\d+(?:[.,]\d+)?)\s*(euros?)\b/iu', $message, $match)) {
        $amount = round((float)str_replace(',', '.', (string)$match[1]), 2);
        $currency = 'EUR';
    } elseif (preg_match('/\b(\d+(?:[.,]\d+)?)\s*(?:total|budget)\b/iu', $message, $match)) {
        $amount = round((float)str_replace(',', '.', (string)$match[1]), 2);
        $currency = 'EUR';
    }

    if ($amount <= 0) {
        return $empty;
    }

    $euro = $amount;
    if ($currency === 'USD') {
        $euro = round($amount * aiChatUsdToEurRate(), 2);
    } elseif ($currency === 'GBP') {
        $euro = round($amount * 1.17, 2);
    }

    $label = match ($currency) {
        'USD' => 'about $' . number_format($amount, 2, '.', '') . ' (~€' . number_format($euro, 2, '.', '') . ')',
        'GBP' => 'about £' . number_format($amount, 2, '.', '') . ' (~€' . number_format($euro, 2, '.', '') . ')',
        default => 'about €' . number_format($amount, 2, '.', ''),
    };

    return [
        'amount' => $amount,
        'currency' => $currency,
        'euro' => $euro,
        'label' => $label,
    ];
}

function aiChatExtractBudgetEuro(string $message): float
{
    return aiChatExtractBudgetDetails($message)['euro'];
}

function aiChatCheapItemUnitThreshold(): float
{
    return 5.0;
}

function aiChatCheapItemDefaultAllocation(): float
{
    return 35.0;
}

function aiChatItemNeedsQuantityDisplay(string $name, float $unitPrice): bool
{
    if ($unitPrice > 0 && $unitPrice < aiChatCheapItemUnitThreshold()) {
        return true;
    }
    $kind = aiChatCatalogItemKind($name);
    if ($kind === 'case') {
        return true;
    }
    if (preg_match('/\b(Capsule|Package)\b/iu', $name)) {
        return true;
    }
    if (preg_match('/\bSticker\b/iu', $name) && $unitPrice > 0 && $unitPrice < 20.0) {
        return true;
    }
    return false;
}

function aiChatLooksLikeHoldHorizonQuestion(string $message): bool
{
    if (preg_match(
        '/\b(?:\d+\s*(?:month|year|week)s?\s+hold|hold(?:ing)?\s+(?:for\s+)?\d+\s*(?:month|year|week)|'
        . '(?:3|6|12)\s*[- ]?months?|short[- ]term|mid[- ]term|long[- ]term)\b/iu',
        $message
    )) {
        return true;
    }
    return (bool)preg_match('/\bhold(?:ing)?\b/iu', $message) && aiChatLooksLikeItemPickQuestion($message);
}

function aiChatRoundBulkQuantity(int $raw): int
{
    $raw = max(1, $raw);
    if ($raw <= 5) {
        return $raw;
    }
    if ($raw <= 20) {
        return max(5, (int)(round($raw / 5) * 5));
    }
    if ($raw <= 100) {
        return max(10, (int)(round($raw / 10) * 10));
    }
    if ($raw <= 250) {
        return max(25, (int)(round($raw / 25) * 25));
    }
    return max(50, (int)(round($raw / 50) * 50));
}

function aiChatSuggestCheapItemQuantity(float $unitPrice, float $targetEuro): int
{
    if ($unitPrice <= 0 || $targetEuro <= 0) {
        return 1;
    }
    return aiChatRoundBulkQuantity((int)round($targetEuro / $unitPrice));
}

function aiChatPickBulletHasQuantity(string $line): bool
{
    return (bool)preg_match('/(?:€|\$|£)\s*[\d.,]+\s*[x×]\s*\d+/iu', $line)
        || (bool)preg_match('/[x×]\s*\d+\s*=\s*(?:€|\$|£)\s*[\d.,]+/iu', $line);
}

function aiChatLooksLikePortfolioBudgetQuestion(string $message): bool
{
    return aiChatLooksLikeItemPickQuestion($message)
        && aiChatExtractBudgetEuro($message) >= 10.0
        && aiChatExtractPerItemCapEuro($message) <= 0.0;
}

/**
 * "best knives under 300 euro" caps each pick — it is not a €300 budget to fill.
 */
function aiChatExtractPerItemCapEuro(string $message): float
{
    $text = mb_strtolower(trim($message));
    if ($text === '' || preg_match('/\b(?:budget|total|portfolio|spend|i have|with|worth of)\b/u', $text)) {
        return 0.0;
    }
    if (!preg_match('/\b(?:under|below|less than|cheaper than|max(?:imum)?|up to|no more than)\s*(?:€|\$|£)?\s*(\d+(?:[.,]\d+)?)\s*(?:€|euros?|eur|\$|usd|dollars?|£|bucks)?/u', $text, $m)) {
        return 0.0;
    }
    return round((float)str_replace(',', '.', (string)$m[1]), 2);
}

/**
 * Per-item cap that still governs this turn: the latest user message that set one,
 * unless a later message switched to a total budget.
 *
 * @param list<array{role: string, content: string}> $messages
 */
function aiChatThreadPerItemCap(array $messages, string $lastUser): float
{
    $cap = aiChatExtractPerItemCapEuro($lastUser);
    if ($cap > 0) {
        return $cap;
    }
    if (aiChatExtractBudgetEuro($lastUser) > 0) {
        return 0.0;
    }
    foreach (array_reverse($messages) as $entry) {
        if (($entry['role'] ?? '') !== 'user') {
            continue;
        }
        $content = (string)($entry['content'] ?? '');
        $cap = aiChatExtractPerItemCapEuro($content);
        if ($cap > 0) {
            return $cap;
        }
        if (aiChatExtractBudgetEuro($content) > 0) {
            return 0.0;
        }
    }
    return 0.0;
}

/**
 * Total budget that governs this turn (latest user message that set one).
 *
 * @param list<array{role: string, content: string}> $messages
 */
function aiChatThreadBudgetEuro(array $messages, string $lastUser): float
{
    if (aiChatExtractPerItemCapEuro($lastUser) > 0) {
        return 0.0;
    }
    $budget = aiChatExtractBudgetEuro($lastUser);
    if ($budget > 0) {
        return $budget;
    }
    foreach (array_reverse($messages) as $entry) {
        if (($entry['role'] ?? '') !== 'user') {
            continue;
        }
        $content = (string)($entry['content'] ?? '');
        if (aiChatExtractPerItemCapEuro($content) > 0) {
            return 0.0;
        }
        $budget = aiChatExtractBudgetEuro($content);
        if ($budget > 0) {
            return $budget;
        }
    }
    return 0.0;
}

/**
 * Wear-less identity keys of every pick bullet in a reply (Key factors excluded),
 * mapped to the bullet's display name.
 *
 * @return array<string, string>
 */
function aiChatReplyPickKeys(string $reply): array
{
    $keys = [];
    if ($reply === '') {
        return $keys;
    }
    $lines = preg_split("/\r\n|\n|\r/", $reply) ?: [];
    $factorLines = aiChatKeyFactorsLineIndexes($lines);
    foreach ($lines as $i => $line) {
        if (isset($factorLines[$i])) {
            continue;
        }
        if (!preg_match('/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/u', (string)$line, $m)) {
            continue;
        }
        $body = (string)$m[1];
        if (!aiChatLooksLikeCatalogItemLine($body) && !aiChatLooksLikeRecommendItemLine($body)) {
            continue;
        }
        $name = aiChatExtractWhyBulletItemName($body);
        $key = aiChatWhyNameKey(aiChatStripWear($name));
        if ($key !== '' && !isset($keys[$key])) {
            $keys[$key] = $name;
        }
    }
    return $keys;
}

/**
 * "make it bigger" / "add 5 more" where the model only echoed its previous list:
 * append real catalog picks so the list actually grows.
 *
 * @param list<array{role: string, content: string}> $messages
 */
function aiChatAppendPicksOnExpand(string $reply, array $messages, string $lastUser, array $pageContext): string
{
    if ($reply === '' || !preg_match('/\b(?:bigger|larger|more|expand|extend|add|another)\b/iu', $lastUser)) {
        return $reply;
    }
    if (preg_match('/\b(?:cheaper|pricier|remove|drop|fewer|less|smaller|swap|replace|instead|why|explain|only|just)\b/iu', $lastUser)) {
        return $reply;
    }
    $previous = '';
    foreach (array_reverse($messages) as $entry) {
        if (($entry['role'] ?? '') === 'assistant') {
            $previous = (string)($entry['content'] ?? '');
            break;
        }
    }
    if ($previous === '') {
        return $reply;
    }
    $prevKeys = aiChatReplyPickKeys($previous);
    $curKeys = aiChatReplyPickKeys($reply);
    if (!$prevKeys || !$curKeys) {
        return $reply;
    }
    $newCount = count(array_diff_key($curKeys, $prevKeys));
    $wanted = 4;
    if (preg_match('/\b(\d{1,2})\s+more\b/iu', $lastUser, $n) || preg_match('/\badd\s+(\d{1,2})\b/iu', $lastUser, $n)) {
        $wanted = max(1, min(10, (int)$n[1]));
    }
    $missing = $wanted - $newCount;
    if ($missing <= 0) {
        return $reply;
    }

    // Scope, budget and cap come from the thread, not from "make it bigger".
    $weapon = '';
    $itemType = '';
    $wantStatTrak = false;
    foreach (array_reverse($messages) as $entry) {
        if (($entry['role'] ?? '') !== 'user') {
            continue;
        }
        $scope = aiChatRequestedCardScope((string)($entry['content'] ?? ''));
        if ((string)($scope['type'] ?? '') !== '' || (string)($scope['weapon'] ?? '') !== '') {
            $weapon = (string)($scope['weapon'] ?? '');
            $itemType = (string)($scope['type'] ?? '');
            $wantStatTrak = !empty($scope['stattrak']);
            break;
        }
    }
    $cap = aiChatThreadPerItemCap($messages, $lastUser);
    $budget = aiChatThreadBudgetEuro($messages, $lastUser);
    $maxUnit = $cap > 0 ? $cap : ($budget > 0 ? round($budget * 0.4, 2) : 0.0);

    $exclude = array_values($curKeys);
    $candidates = aiChatDiversifiedInvestCandidates($missing + 8, $weapon, $itemType, $maxUnit, $exclude, null, $wantStatTrak);
    $bullets = [];
    $seen = $curKeys;
    foreach ($candidates as $candidate) {
        if (count($bullets) >= $missing) {
            break;
        }
        $card = aiChatResolveCatalogCard((string)$candidate);
        if ($card === null) {
            continue;
        }
        $marketName = trim((string)($card['market_hash_name'] ?? ''));
        $key = aiChatWhyNameKey(aiChatStripWear($marketName));
        if ($marketName === '' || $key === '' || isset($seen[$key])) {
            continue;
        }
        if (($weapon !== '' || $itemType !== '' || $wantStatTrak) && !aiChatCatalogNameMatchesScope($marketName, $weapon, $itemType, $wantStatTrak)) {
            continue;
        }
        $card = aiChatAttachCheapestListing($card);
        $price = is_numeric($card['cheapest_price'] ?? null) ? (float)$card['cheapest_price'] : (float)($card['seed_sell_price'] ?? 0);
        if ($price <= 0 || ($maxUnit > 0 && $price > $maxUnit)) {
            continue;
        }
        $qty = aiChatItemNeedsQuantityDisplay($marketName, $price) ? max(1, aiChatSuggestCheapItemQuantity($price, 20.0)) : 1;
        $seen[$key] = $marketName;
        $bullets[] = '• **' . $marketName . '** — **' . aiChatFormatEuroAmount($price) . '** ×' . $qty . ' = '
            . aiChatFormatEuroAmount(round($price * $qty, 2)) . ' — ' . aiChatFallbackWhyPickReason($marketName);
    }
    if (!$bullets) {
        return $reply;
    }

    // Insert after the last pick bullet of the Items to buy block.
    $lines = preg_split("/\r\n|\n|\r/", $reply) ?: [];
    $factorLines = aiChatKeyFactorsLineIndexes($lines);
    $insertAt = null;
    $inItems = false;
    foreach ($lines as $i => $line) {
        $trim = trim((string)$line);
        if (aiChatIsItemsToBuyHeading($trim)) {
            $inItems = true;
            $insertAt = $i;
            continue;
        }
        if ($inItems && preg_match('/^#{1,6}\s+/u', $trim)) {
            break;
        }
        if ($inItems && !isset($factorLines[$i]) && preg_match('/^\s*(?:[-*•]|\d+[.)])\s+\S/u', $trim)) {
            $insertAt = $i;
        }
    }
    if ($insertAt === null) {
        // No heading: put them after the last pick bullet anywhere.
        foreach ($lines as $i => $line) {
            if (!isset($factorLines[$i]) && preg_match('/^\s*(?:[-*•]|\d+[.)])\s+\S/u', trim((string)$line))) {
                $insertAt = $i;
            }
        }
    }
    if ($insertAt === null) {
        return $reply;
    }
    array_splice($lines, $insertAt + 1, 0, $bullets);
    return implode("\n", $lines);
}

/**
 * Cards must be the picks the visible reply lists — never leftovers from a second
 * list the model wrote and the pipeline removed.
 *
 * @param list<array<string, mixed>> $cards
 * @return list<array<string, mixed>>
 */
function aiChatFilterCardsToReplyPicks(string $reply, array $cards): array
{
    if ($reply === '' || !$cards) {
        return $cards;
    }
    $keys = aiChatReplyPickKeys($reply);
    if (!$keys) {
        return $cards;
    }
    $kept = [];
    foreach ($cards as $card) {
        if (!is_array($card)) {
            continue;
        }
        $names = array_merge(
            [(string)($card['market_hash_name'] ?? ''), (string)($card['requested_name'] ?? '')],
            aiChatCardNameAliases($card)
        );
        $match = false;
        foreach ($names as $candidate) {
            $key = aiChatWhyNameKey(aiChatStripWear(trim((string)$candidate)));
            if ($key === '') {
                continue;
            }
            if (isset($keys[$key])) {
                $match = true;
                break;
            }
            foreach (array_keys($keys) as $bulletKey) {
                if (mb_strlen($key) >= 6 && (str_contains((string)$bulletKey, $key) || str_contains($key, (string)$bulletKey))) {
                    $match = true;
                    break 2;
                }
            }
        }
        if ($match) {
            $kept[] = $card;
        }
    }
    return $kept;
}

/**
 * Remove pick bullets priced above the per-item cap (plus their Why lines).
 * When every pick is over the cap, keep them and say so instead of showing nothing.
 */
function aiChatDropPicksOverCap(string $reply, float $cap, string $noteWhenAllDropped = ''): string
{
    if ($reply === '' || $cap <= 0) {
        return $reply;
    }
    $limit = $cap * 1.05;
    $lines = preg_split("/\r\n|\n|\r/", $reply) ?: [];
    $factorLines = aiChatKeyFactorsLineIndexes($lines);
    $dropped = [];
    $pricedBullets = 0;
    $overCap = 0;
    foreach ($lines as $i => $line) {
        if (isset($factorLines[$i]) || !preg_match('/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/u', (string)$line, $m)) {
            continue;
        }
        if (preg_match('/(?:€|\$|£)\s*(\d[\d.,]*)/u', (string)$m[1], $p)) {
            $pricedBullets++;
            if ((float)str_replace(',', '', (string)$p[1]) > $limit) {
                $overCap++;
            }
        }
    }
    if ($pricedBullets > 0 && $overCap === $pricedBullets) {
        if ($noteWhenAllDropped === '') {
            return $reply;
        }
        foreach ($lines as $i => $line) {
            if (aiChatIsItemsToBuyHeading((string)$line)) {
                array_splice($lines, $i + 1, 0, [$noteWhenAllDropped]);
                return implode("\n", $lines);
            }
        }
        return $reply;
    }
    foreach ($lines as $i => $line) {
        if (isset($factorLines[$i])) {
            continue;
        }
        if (!preg_match('/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/u', (string)$line, $m)) {
            continue;
        }
        $body = (string)$m[1];
        if (!preg_match('/(?:€|\$|£)\s*(\d[\d.,]*)/u', $body, $p)) {
            continue;
        }
        $unit = (float)str_replace(',', '', (string)$p[1]);
        if ($unit <= $limit) {
            continue;
        }
        $name = aiChatExtractWhyBulletItemName($body);
        $key = aiChatWhyNameKey(aiChatStripWear($name));
        if ($key !== '') {
            $dropped[$key] = true;
        }
        unset($lines[$i]);
    }
    if (!$dropped) {
        return $reply;
    }
    foreach ($lines as $i => $line) {
        if (!preg_match('/^\s*\*\*([^*\n]+?)\*\*\s+[—–-]\s+/u', (string)$line, $m)) {
            continue;
        }
        $key = aiChatWhyNameKey(aiChatStripWear(trim((string)$m[1])));
        if ($key !== '' && isset($dropped[$key])) {
            unset($lines[$i]);
        }
    }
    return implode("\n", array_values($lines));
}

/**
 * The other half of aiChatFilterCardsToReplyPicks(): a priced pick bullet
 * whose item has no card is dropped, with its Why line. Cards come only from
 * catalog rows, so a pick without one is an item that does not exist in the
 * game or on the market (user, 2026-10-04: the model listed "PVP | Supernova
 * (Factory New)" next to four real skins; "show just the items that exist in
 * game and if the ai is typing 5 items make it also show 5 cards").
 * Name matching is the same as the card filter's. Nothing is dropped when
 * there are no cards at all, or when every pick would go.
 *
 * @param list<array<string, mixed>> $cards
 */
function aiChatDropPicksWithoutCards(string $reply, array $cards): string
{
    if ($reply === '' || !$cards) {
        return $reply;
    }
    $cardKeys = [];
    foreach ($cards as $card) {
        if (!is_array($card)) {
            continue;
        }
        $names = array_merge(
            [(string)($card['market_hash_name'] ?? ''), (string)($card['requested_name'] ?? ''), (string)($card['display_name'] ?? '')],
            aiChatCardNameAliases($card)
        );
        foreach ($names as $candidate) {
            $key = aiChatWhyNameKey(aiChatStripWear(trim((string)$candidate)));
            if ($key !== '') {
                $cardKeys[$key] = true;
            }
        }
    }
    if (!$cardKeys) {
        return $reply;
    }
    $hasCard = static function (string $key) use ($cardKeys): bool {
        if ($key === '') {
            return true;
        }
        if (isset($cardKeys[$key])) {
            return true;
        }
        foreach (array_keys($cardKeys) as $cardKey) {
            if (mb_strlen($key) >= 6 && (str_contains((string)$cardKey, $key) || str_contains($key, (string)$cardKey))) {
                return true;
            }
        }
        return false;
    };

    $lines = preg_split("/\r\n|\n|\r/", $reply) ?: [];
    $factorLines = aiChatKeyFactorsLineIndexes($lines);
    $drop = [];
    $dropped = [];
    $picks = 0;
    foreach ($lines as $i => $line) {
        if (isset($factorLines[$i]) || !preg_match('/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/u', (string)$line, $m)) {
            continue;
        }
        $body = (string)$m[1];
        // A pick bullet names a bold item and prices it; anything else (prose
        // bullets, factor chips) is left alone.
        if (!preg_match('/\*\*[^*\n]+\*\*/u', $body) || !preg_match('/(?:€|\$|£)\s*\d/u', $body)) {
            continue;
        }
        $picks++;
        $name = aiChatExtractWhyBulletItemName($body);
        $key = aiChatWhyNameKey(aiChatStripWear($name));
        if ($key !== '' && !$hasCard($key)) {
            $drop[$i] = true;
            $dropped[$key] = true;
        }
    }
    if (!$drop || count($drop) >= $picks) {
        return $reply;
    }
    foreach ($lines as $i => $line) {
        if (isset($drop[$i])) {
            continue;
        }
        if (!preg_match('/^\s*\*\*([^*\n]+?)\*\*\s+[—–-]\s+/u', (string)$line, $m)) {
            continue;
        }
        $key = aiChatWhyNameKey(aiChatStripWear(trim((string)$m[1])));
        if ($key !== '' && isset($dropped[$key])) {
            $drop[$i] = true;
        }
    }
    foreach (array_keys($drop) as $i) {
        unset($lines[$i]);
    }
    return implode("\n", array_values($lines));
}

/**
 * @param list<array{price: float, name?: string}> $picks
 * @return list<int>
 */
function aiChatAllocatePortfolioQuantities(array $picks, float $budgetEuro): array
{
    $count = count($picks);
    if ($count === 0 || $budgetEuro <= 0) {
        return [];
    }

    $low = round($budgetEuro * 0.95, 2);
    $high = round($budgetEuro * 1.05, 2);
    $qtys = array_fill(0, $count, 1);
    $evenTarget = round($budgetEuro / $count, 2);

    $sumTotal = static function (array $quantities) use ($picks, $count): float {
        $total = 0.0;
        for ($i = 0; $i < $count; $i++) {
            $total += (float)$picks[$i]['price'] * max(1, (int)$quantities[$i]);
        }
        return round($total, 2);
    };

    // Phase 1: grow each pick toward an even share of the TOTAL budget.
    for ($i = 0; $i < $count; $i++) {
        $price = (float)$picks[$i]['price'];
        if ($price <= 0) {
            continue;
        }
        $targetQty = max(1, (int)floor(($evenTarget + 0.0001) / $price));
        while ($qtys[$i] < $targetQty) {
            $next = round($sumTotal($qtys) + $price, 2);
            if ($next > $high) {
                break;
            }
            $qtys[$i]++;
        }
    }

    // Phase 2: fill remaining room toward the -5% floor without exceeding +5%.
    $guard = 0;
    $total = $sumTotal($qtys);
    while ($total < $low && $guard < 800) {
        $guard++;
        $bestIdx = null;
        $bestScore = PHP_FLOAT_MAX;
        for ($i = 0; $i < $count; $i++) {
            $price = (float)$picks[$i]['price'];
            if ($price <= 0) {
                continue;
            }
            $next = round($total + $price, 2);
            if ($next > $high) {
                continue;
            }
            $nextLine = $price * ((int)$qtys[$i] + 1);
            $gap = abs($budgetEuro - $next);
            $evenPenalty = abs($nextLine - $evenTarget) * 0.35;
            $name = trim((string)($picks[$i]['name'] ?? ''));
            $bulkBonus = aiChatItemNeedsQuantityDisplay($name, $price) ? -0.2 : 0.0;
            $score = $gap + $evenPenalty + $bulkBonus;
            if ($score < $bestScore) {
                $bestScore = $score;
                $bestIdx = $i;
            }
        }
        if ($bestIdx === null) {
            break;
        }
        $qtys[$bestIdx]++;
        $total = $sumTotal($qtys);
        if ($total >= $low) {
            break;
        }
    }

    $guard = 0;
    while ($total > $high && $guard < 200) {
        $guard++;
        $reduced = false;
        for ($i = 0; $i < $count; $i++) {
            if ($qtys[$i] <= 1) {
                continue;
            }
            $qtys[$i]--;
            $next = $sumTotal($qtys);
            if ($next >= $low) {
                $total = $next;
                $reduced = true;
                break;
            }
            $qtys[$i]++;
        }
        if (!$reduced) {
            break;
        }
    }

    return $qtys;
}

/**
 * @param list<string> $names
 */
function aiChatSuggestPortfolioAllocation(array $names, float $budgetEuro): string
{
    if ($budgetEuro <= 0 || !$names) {
        return '';
    }

    $picks = [];
    $liveBudget = 0;
    foreach (array_slice($names, 0, 5) as $name) {
        $row = aiChatLoadPriceRow((string)$name, false, $liveBudget);
        $price = is_array($row) ? round((float)($row['current_price'] ?? 0), 2) : aiChatCandidateSeedPrice((string)$name);
        if ($price <= 0) {
            $map = aiChatCheapestListingsByName([(string)$name]);
            $listing = $map[(string)$name] ?? null;
            $price = is_array($listing) ? round((float)($listing['price'] ?? 0), 2) : 0.0;
        }
        if ($price <= 0 || $price > $budgetEuro + 0.009) {
            continue;
        }
        $picks[] = ['name' => (string)$name, 'price' => $price];
    }
    if (count($picks) < 2) {
        return '';
    }

    $qtys = aiChatAllocatePortfolioQuantities($picks, $budgetEuro);
    $lines = [];
    $running = 0.0;
    foreach ($picks as $i => $pick) {
        $qty = max(1, (int)($qtys[$i] ?? 1));
        $line = round($pick['price'] * $qty, 2);
        $running += $line;
        $lines[] = sprintf(
            '- %s — €%.2f ×%d = €%.2f',
            $pick['name'],
            $pick['price'],
            $qty,
            $line
        );
    }
    $lines[] = '- Planned total: €' . number_format($running, 2, '.', '');

    return implode("\n", $lines);
}

/**
 * @param list<string> $droppedNames
 */
function aiChatStripOverBudgetPickBullets(string $reply, array $droppedNames = []): string
{
    if ($reply === '') {
        return $reply;
    }

    $aliasNeedles = [];
    foreach ($droppedNames as $name) {
        $name = trim((string)$name);
        if ($name === '') {
            continue;
        }
        $aliasNeedles[] = mb_strtolower($name);
        $stripped = aiChatStripWear($name);
        if ($stripped !== '' && $stripped !== $name) {
            $aliasNeedles[] = mb_strtolower($stripped);
        }
    }
    $aliasNeedles = array_values(array_unique(array_filter($aliasNeedles)));

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }

    $out = [];
    foreach ($lines as $line) {
        $text = (string)$line;
        if (preg_match('/exceeds\s+budget/iu', $text)) {
            continue;
        }
        $isBullet = (bool)preg_match('/^\s*(?:[-*•]|\d+[.)])\s+/u', $text);
        if ($isBullet && $aliasNeedles) {
            $hay = mb_strtolower($text);
            $drop = false;
            foreach ($aliasNeedles as $needle) {
                if ($needle !== '' && mb_strpos($hay, $needle) !== false) {
                    $drop = true;
                    break;
                }
            }
            if ($drop) {
                continue;
            }
        }
        $out[] = $text;
    }

    $joined = implode("\n", $out);
    $joined = preg_replace("/\n{3,}/u", "\n\n", $joined) ?? $joined;
    return trim($joined);
}

/**
 * @param list<array{name: string, price: float, quantity: int, line_total: float, aliases?: list<string>}> $listings
 */
function aiChatRewritePortfolioTotalSentence(string $reply, array $listings = [], float $portfolioTotal = 0.0): string
{
    // Qty / line totals live on the first pick bullets. Never append a recap that re-lists every line.
    unset($listings, $portfolioTotal);
    return aiChatStripDuplicateItemRecap($reply);
}

/**
 * @param list<array{name: string, price: float, quantity: int, line_total: float, aliases?: list<string>}> $listings
 */
function aiChatApplyQuantityToPickBullets(string $reply, array $listings, ?float $portfolioTotal = null): string
{
    if ($reply === '' || !$listings) {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }

    $matched = 0;
    $factorLines = aiChatKeyFactorsLineIndexes($lines);
    foreach ($lines as $i => $line) {
        if (isset($factorLines[$i])) {
            continue;
        }
        if (!preg_match('/^\s*(?:[-*•]|\d+[.)])\s+/u', (string)$line)) {
            continue;
        }
        $plain = (string)preg_replace('/^\s*(?:[-*•]|\d+[.)])\s+/u', '', (string)$line);
        if (!aiChatLooksLikeCatalogItemLine($plain) && !aiChatLooksLikeRecommendItemLine($plain)) {
            continue;
        }
        $listing = aiChatMatchListingForText((string)$line, $listings);
        if (!is_array($listing)) {
            continue;
        }
        $qty = max(1, (int)($listing['quantity'] ?? 1));
        $unit = (float)($listing['price'] ?? 0);
        $lineTotal = round((float)($listing['line_total'] ?? ($unit * $qty)), 2);
        if ($unit <= 0) {
            continue;
        }

        $marker = '';
        $prefix = (string)$line;
        if (preg_match('/^(\s*(?:[-*•]|\d+[.)])\s+)/u', (string)$line, $markerMatch)) {
            $marker = (string)$markerMatch[1];
            $prefix = (string)preg_replace('/^\s*(?:[-*•]|\d+[.)])\s+/u', '', (string)$line);
        }

        $head = $prefix;
        if (preg_match('/^(.+?)(?:\s+[—–\-:]\s+|\s+)(?:\*\*)?(?:€|\$|£)/u', $prefix, $headMatch)) {
            $head = trim((string)$headMatch[1]);
        } else {
            $parts = preg_split('/\s+[—–]\s+/u', $prefix, 2);
            $head = trim((string)((is_array($parts) ? ($parts[0] ?? $prefix) : $prefix)));
        }
        $head = aiChatSanitizeExtractedItemName($head);
        if ($head === '') {
            continue;
        }

        $extra = '';
        if (preg_match('/\s+[—–]\s+(.+)$/u', $prefix, $extraMatch)) {
            $tail = trim((string)$extraMatch[1]);
            // Peel every leading price / ×qty / = total chunk (bold or not) so the
            // recomputed chunk is never stacked in front of an old one.
            // "= **€2.20**" (bold total) and a lone "= €2.20" leftover both count as price chunks.
            $priceChunk = '/^(?:\*\*)?(?:(?:€|\$|£)\s*[\d.,]+(?:\*\*)?(?:\s*[x×]\s*\d+)?)?(?:\s*=\s*(?:\*\*)?(?:€|\$|£)\s*[\d.,]+(?:\*\*)?)?(?:\*\*)?\s*(?:[—–\-]\s*)?/iu';
            for ($pass = 0; $pass < 4; $pass++) {
                $stripped = trim((string)preg_replace($priceChunk, '', $tail));
                if ($stripped === $tail) {
                    break;
                }
                $tail = $stripped;
            }
            if ($tail !== '' && !aiChatLooksLikeMarketOnlyExtra($tail)) {
                $extra = ' — ' . $tail;
            }
        }

        $priceChunk = aiChatFormatEuroAmount($unit) . ' ×' . $qty . ' = ' . aiChatFormatEuroAmount($lineTotal);
        $lines[$i] = $marker . $head . ' — ' . $priceChunk . $extra;
        $matched++;
    }

    if ($matched === 0 && $portfolioTotal === null) {
        return $reply;
    }

    $updatedReply = implode("\n", $lines);
    if ($portfolioTotal !== null && $portfolioTotal > 0) {
        $updatedReply = aiChatRewritePortfolioTotalSentence($updatedReply, $listings, $portfolioTotal);
    }

    return $updatedReply;
}

/**
 * ×qty already present on pick bullets, keyed by lower-cased wear-less name.
 *
 * @return array<string, int>
 */
function aiChatExtractBulletQuantities(string $reply): array
{
    $map = [];
    foreach (preg_split("/\r\n|\n|\r/", $reply) ?: [] as $line) {
        if (!preg_match('/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/u', (string)$line, $match)) {
            continue;
        }
        $body = (string)$match[1];
        if (!preg_match('/[x×]\s*(\d{1,4})\b/u', $body, $qtyMatch)) {
            continue;
        }
        $parts = preg_split('/\s+[—–\-:]+\s+/u', $body, 2);
        $head = aiChatSanitizeExtractedItemName(trim((string)($parts[0] ?? $body)));
        $head = trim((string)preg_replace('/\*+/u', '', $head));
        if ($head === '') {
            continue;
        }
        $map[mb_strtolower(aiChatStripWear($head))] = max(1, (int)$qtyMatch[1]);
    }
    return $map;
}

/**
 * "double the quantities": models often echo the previous list unchanged. Multiply every
 * ×qty that is still identical to the previous turn's value and recompute its = €total.
 */
function aiChatApplyQuantityMultiplier(string $reply, string $userMessage, array $messages): string
{
    $text = mb_strtolower($userMessage);
    if (!preg_match('/\b(?:quantit\w*|qty|amounts?|units?|counts?|copies|each|everything|all of them)\b/u', $text)) {
        return $reply;
    }
    $factor = 0.0;
    if (preg_match('/\b(double|twice|2x)\b/u', $text)) {
        $factor = 2.0;
    } elseif (preg_match('/\b(triple|3x)\b/u', $text)) {
        $factor = 3.0;
    } elseif (preg_match('/\b(quadruple|4x)\b/u', $text)) {
        $factor = 4.0;
    } elseif (preg_match('/\b(halve|half|halved)\b/u', $text)) {
        $factor = 0.5;
    }
    if ($factor <= 0.0) {
        return $reply;
    }
    $previous = '';
    foreach (array_reverse($messages) as $entry) {
        if (($entry['role'] ?? '') === 'assistant') {
            $previous = (string)($entry['content'] ?? '');
            break;
        }
    }
    $prevQty = $previous !== '' ? aiChatExtractBulletQuantities($previous) : [];
    if (!$prevQty) {
        return $reply;
    }
    $lines = preg_split("/\r\n|\n|\r/", $reply) ?: [];
    $changed = false;
    foreach ($lines as $i => $line) {
        if (!preg_match('/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/u', (string)$line, $match)) {
            continue;
        }
        $body = (string)$match[1];
        if (!preg_match('/(?:€|\$|£)\s*(\d[\d.,]*)/u', $body, $unitMatch)) {
            continue;
        }
        if (!preg_match('/([x×]\s*)(\d{1,4})\b/u', $body, $qtyMatch, PREG_OFFSET_CAPTURE)) {
            continue;
        }
        $parts = preg_split('/\s+[—–\-:]+\s+/u', $body, 2);
        $head = aiChatSanitizeExtractedItemName(trim((string)($parts[0] ?? $body)));
        $head = trim((string)preg_replace('/\*+/u', '', $head));
        $key = mb_strtolower(aiChatStripWear($head));
        if ($key === '' || !isset($prevQty[$key])) {
            continue;
        }
        $qty = (int)$qtyMatch[2][0];
        if ($qty !== (int)$prevQty[$key]) {
            continue; // the model already adjusted this one
        }
        $newQty = max(1, (int)round($qty * $factor));
        if ($newQty === $qty) {
            continue;
        }
        $unit = (float)str_replace(',', '', (string)$unitMatch[1]);
        $updated = substr_replace($line, (string)$newQty, (int)$qtyMatch[2][1] + (strlen($line) - strlen($body)), strlen((string)$qtyMatch[2][0]));
        $updated = preg_replace_callback(
            '/([x×]\s*\d{1,4}\s*=\s*)(?:€|\$|£)\s*\d[\d.,]*/u',
            static fn(array $m): string => $m[1] . aiChatFormatEuroAmount(round($unit * $newQty, 2)),
            $updated,
            1
        ) ?? $updated;
        $lines[$i] = $updated;
        $changed = true;
    }
    return $changed ? implode("\n", $lines) : $reply;
}

/**
 * @param array<string, int> $map
 * @param array<string, mixed> $card
 */
function aiChatLookupBulletQuantity(array $map, array $card): int
{
    if (!$map) {
        return 0;
    }
    $names = array_merge(
        [(string)($card['market_hash_name'] ?? ''), (string)($card['requested_name'] ?? '')],
        aiChatCardNameAliases($card)
    );
    foreach ($names as $candidate) {
        $key = mb_strtolower(aiChatStripWear(trim((string)$candidate)));
        if ($key !== '' && isset($map[$key])) {
            return (int)$map[$key];
        }
    }
    return 0;
}

/**
 * @param list<array<string, mixed>> $cards
 * @return array{reply: string, cards: list<array<string, mixed>>}
 */
function aiChatApplyInvestItemQuantities(string $reply, array $cards, string $userMessage, bool $forceInvest = false): array
{
    if ($reply === '' || !$cards || (!$forceInvest && !aiChatLooksLikeItemPickQuestion($userMessage))) {
        return ['reply' => $reply, 'cards' => $cards];
    }

    $budgetEuro = aiChatExtractBudgetEuro($userMessage);
    $hasBudget = aiChatLooksLikePortfolioBudgetQuestion($userMessage);
    $holdHorizon = aiChatLooksLikeHoldHorizonQuestion($userMessage);
    if (!$forceInvest && !$hasBudget && !$holdHorizon && !aiChatLooksLikeOpenEndedInvestQuestion($userMessage)) {
        return ['reply' => $reply, 'cards' => $cards];
    }

    // Portfolio-budget turns are owned by aiChatApplyPortfolioBudget: never stack
    // independent ~€20–50 cheap-item slices on top of a TOTAL budget like $20.
    if ($hasBudget && $budgetEuro > 0) {
        return ['reply' => $reply, 'cards' => $cards];
    }

    $cheapCount = 0;
    foreach ($cards as $card) {
        if (!is_array($card)) {
            continue;
        }
        $name = trim((string)($card['market_hash_name'] ?? $card['requested_name'] ?? ''));
        $price = is_numeric($card['cheapest_price'] ?? null)
            ? round((float)$card['cheapest_price'], 2)
            : (is_numeric($card['seed_sell_price'] ?? null) ? round((float)$card['seed_sell_price'], 2) : 0.0);
        if ($name !== '' && $price > 0 && aiChatItemNeedsQuantityDisplay($name, $price)) {
            $cheapCount++;
        }
    }
    if ($cheapCount === 0) {
        return ['reply' => $reply, 'cards' => $cards];
    }

    $allocationPerCheap = aiChatCheapItemDefaultAllocation();
    if ($cheapCount > 1) {
        $allocationPerCheap = max(20.0, min(50.0, round(aiChatCheapItemDefaultAllocation() / sqrt($cheapCount), 2)));
    }

    $listings = [];
    $portfolioTotal = 0.0;
    // Quantities the model already wrote on its bullets (e.g. after "make it
    // bigger") win over the default cheap-item allocation — otherwise every
    // follow-up snapped back to the same ×20 / ×50 defaults.
    $replyQtys = aiChatExtractBulletQuantities($reply);
    foreach ($cards as $cardIndex => $card) {
        if (!is_array($card)) {
            continue;
        }
        $name = trim((string)($card['market_hash_name'] ?? $card['requested_name'] ?? ''));
        $price = is_numeric($card['cheapest_price'] ?? null)
            ? round((float)$card['cheapest_price'], 2)
            : (is_numeric($card['seed_sell_price'] ?? null) ? round((float)$card['seed_sell_price'], 2) : 0.0);
        if ($name === '' || $price <= 0) {
            continue;
        }

        $existingQty = max(1, (int)($card['quantity'] ?? 1));
        $needsQty = aiChatItemNeedsQuantityDisplay($name, $price);
        $qty = $existingQty;

        $replyQty = aiChatLookupBulletQuantity($replyQtys, $card);
        if ($replyQty > 1) {
            $qty = $replyQty;
        } elseif ($needsQty && $existingQty <= 1) {
            $qty = max($existingQty, aiChatSuggestCheapItemQuantity($price, $allocationPerCheap));
        }

        $lineTotal = round($price * $qty, 2);
        $cards[$cardIndex]['quantity'] = $qty;
        $cards[$cardIndex]['line_total'] = $lineTotal;
        $portfolioTotal += $lineTotal;

        // Any bullet with a quantity gets its line recomputed from the catalog
        // unit price — the model's own multiplication is often wrong.
        if (($needsQty && $qty > 1) || $replyQty > 1) {
            $listings[] = [
                'name' => $name,
                'price' => $price,
                'quantity' => $qty,
                'line_total' => $lineTotal,
                'aliases' => aiChatCardNameAliases($card),
            ];
        }
    }
    $portfolioTotal = round($portfolioTotal, 2);

    if (!$listings) {
        return ['reply' => $reply, 'cards' => $cards];
    }

    $updatedReply = aiChatApplyQuantityToPickBullets($reply, $listings, $portfolioTotal);

    return ['reply' => $updatedReply, 'cards' => $cards];
}

/**
 * @param list<array<string, mixed>> $cards
 * @return array{reply: string, cards: list<array<string, mixed>>}
 */
function aiChatApplyPortfolioBudget(string $reply, array $cards, string $userMessage): array
{
    if ($reply === '' || !$cards || !aiChatLooksLikePortfolioBudgetQuestion($userMessage)) {
        return ['reply' => $reply, 'cards' => $cards];
    }

    $budgetEuro = aiChatExtractBudgetEuro($userMessage);
    if ($budgetEuro <= 0) {
        return ['reply' => $reply, 'cards' => $cards];
    }

    $originalCards = [];
    foreach ($cards as $card) {
        if (is_array($card)) {
            $originalCards[] = $card;
        }
    }
    if (!$originalCards) {
        return ['reply' => $reply, 'cards' => $cards];
    }

    $high = round($budgetEuro * 1.05, 2);
    $keptCards = [];
    $droppedNames = [];
    $picks = [];
    foreach ($originalCards as $card) {
        $name = trim((string)($card['market_hash_name'] ?? $card['requested_name'] ?? ''));
        $price = is_numeric($card['cheapest_price'] ?? null)
            ? round((float)$card['cheapest_price'], 2)
            : (is_numeric($card['seed_sell_price'] ?? null) ? round((float)$card['seed_sell_price'], 2) : 0.0);
        if ($name === '' || $price <= 0) {
            continue;
        }
        if ($price > $budgetEuro + 0.009) {
            $droppedNames[] = $name;
            $req = trim((string)($card['requested_name'] ?? ''));
            if ($req !== '' && $req !== $name) {
                $droppedNames[] = $req;
            }
            $stripped = aiChatStripWear($name);
            if ($stripped !== '' && $stripped !== $name) {
                $droppedNames[] = $stripped;
            }
            continue;
        }
        $newIndex = count($keptCards);
        $keptCards[] = $card;
        $picks[] = [
            'card_index' => $newIndex,
            'name' => $name,
            'price' => $price,
        ];
    }

    // Keep every successfully built pick card visible even when unit price exceeds budget.
    // Only lines that explicitly say "exceeds budget" are removed from reply text.
    $reply = aiChatStripOverBudgetPickBullets($reply, []);
    $cards = $keptCards;

    if (!$picks) {
        return ['reply' => $reply, 'cards' => $originalCards];
    }

    $qtys = aiChatAllocatePortfolioQuantities(
        array_map(static fn(array $pick): array => ['price' => $pick['price'], 'name' => $pick['name']], $picks),
        $budgetEuro
    );

    $rebuildCompact = static function (array $srcPicks, array $srcQtys, array $srcCards, int $dropIdx = -1) use (&$droppedNames): array {
        $newPicks = [];
        $newQtys = [];
        $newCards = [];
        foreach ($srcPicks as $i => $pick) {
            if ($i === $dropIdx) {
                $droppedNames[] = (string)$pick['name'];
                continue;
            }
            $card = $srcCards[$pick['card_index']] ?? null;
            if (!is_array($card)) {
                continue;
            }
            $newPicks[] = [
                'card_index' => count($newCards),
                'name' => $pick['name'],
                'price' => $pick['price'],
            ];
            $newQtys[] = max(1, (int)($srcQtys[$i] ?? 1));
            $newCards[] = $card;
        }
        return [$newPicks, $newQtys, $newCards];
    };

    $sumAt = static function (array $srcPicks, array $quantities): float {
        $total = 0.0;
        foreach ($srcPicks as $i => $pick) {
            $total += (float)$pick['price'] * max(1, (int)($quantities[$i] ?? 1));
        }
        return round($total, 2);
    };

    // Final hard trim: never leave the portfolio above +5% of budget.
    $plannedTotal = $sumAt($picks, $qtys);
    $guard = 0;
    while ($plannedTotal > $high && $guard < 400) {
        $guard++;
        $reduced = false;
        $order = [];
        foreach ($picks as $i => $pick) {
            $order[] = [
                'i' => $i,
                'line' => $pick['price'] * max(1, (int)($qtys[$i] ?? 1)),
            ];
        }
        usort($order, static fn(array $a, array $b): int => $b['line'] <=> $a['line']);
        foreach ($order as $row) {
            $i = (int)$row['i'];
            if (($qtys[$i] ?? 1) <= 1) {
                continue;
            }
            $qtys[$i]--;
            $plannedTotal = $sumAt($picks, $qtys);
            $reduced = true;
            break;
        }
        if ($reduced) {
            continue;
        }
        // All remaining picks are 1× and still over — drop the most expensive from the qty plan only.
        $dropIdx = null;
        $dropPrice = -1.0;
        foreach ($picks as $i => $pick) {
            if ($pick['price'] > $dropPrice) {
                $dropPrice = $pick['price'];
                $dropIdx = $i;
            }
        }
        if ($dropIdx === null) {
            break;
        }
        [$picks, $qtys, $cards] = $rebuildCompact($picks, $qtys, $cards, (int)$dropIdx);
        if (!$picks) {
            $reply = aiChatStripOverBudgetPickBullets($reply, []);
            return ['reply' => $reply, 'cards' => $originalCards];
        }
        $plannedTotal = $sumAt($picks, $qtys);
    }

    $listings = [];
    $plannedTotal = 0.0;
    $allocatedByKey = [];
    foreach ($picks as $i => $pick) {
        $qty = max(1, (int)($qtys[$i] ?? 1));
        $lineTotal = round($pick['price'] * $qty, 2);
        $plannedTotal += $lineTotal;
        $card = $cards[$pick['card_index']] ?? null;
        if (is_array($card)) {
            $cards[$pick['card_index']]['quantity'] = $qty;
            $cards[$pick['card_index']]['line_total'] = $lineTotal;
            $key = aiChatCardDedupKey((string)($card['market_hash_name'] ?? $pick['name']));
            if ($key !== '') {
                $allocatedByKey[$key] = $cards[$pick['card_index']];
            }
        }
        $listings[] = [
            'name' => $pick['name'],
            'price' => $pick['price'],
            'quantity' => $qty,
            'line_total' => $lineTotal,
            'aliases' => aiChatCardNameAliases($cards[$pick['card_index']] ?? ['market_hash_name' => $pick['name']]),
        ];
    }
    $plannedTotal = round($plannedTotal, 2);

    // Preserve original pick order / membership so every named invest item keeps a card.
    $mergedCards = [];
    $seenKeys = [];
    foreach ($originalCards as $card) {
        $market = (string)($card['market_hash_name'] ?? '');
        $key = aiChatCardDedupKey($market !== '' ? $market : (string)($card['requested_name'] ?? ''));
        if ($key !== '' && isset($seenKeys[$key])) {
            continue;
        }
        if ($key !== '' && isset($allocatedByKey[$key])) {
            $mergedCards[] = $allocatedByKey[$key];
        } else {
            $mergedCards[] = $card;
        }
        if ($key !== '') {
            $seenKeys[$key] = true;
        }
    }

    $reply = aiChatStripOverBudgetPickBullets($reply, []);
    $updatedReply = aiChatApplyQuantityToPickBullets($reply, $listings, $plannedTotal);

    return ['reply' => $updatedReply, 'cards' => $mergedCards];
}

function aiChatComposePickWhy(string $name): string
{
    $name = aiChatSanitizeExtractedItemName($name);
    if ($name === '') {
        return 'liquid catalog pick with real market volume';
    }

    $resolved = aiChatResolveCatalogCard($name);
    $resolvedName = is_array($resolved) ? trim((string)($resolved['market_hash_name'] ?? '')) : '';
    $tries = array_values(array_unique(array_filter([$name, aiChatStripWear($name), $resolvedName])));
    $change30 = null;
    $listings = null;
    $volume = null;
    $category = '';
    $wear = aiChatExtractWearLabel($name);
    $liveBudget = 0;

    foreach ($tries as $try) {
        $row = aiChatLoadPriceRow((string)$try, false, $liveBudget);
        if (!is_array($row)) {
            continue;
        }
        $price = (float)($row['current_price'] ?? 0);
        $history = is_array($row['history'] ?? null) ? $row['history'] : [];
        if ($change30 === null && count($history) >= 4) {
            $baseline = aiChatHistoryBaseline($history, 30, $price > 0 ? $price : null);
            if (is_numeric($baseline['change_pct'] ?? null)) {
                $change30 = (float)$baseline['change_pct'];
            }
        }
        if ($listings === null && isset($row['sell_orders']) && $row['sell_orders'] !== null) {
            $listings = (int)$row['sell_orders'];
        }
        if ($volume === null && isset($row['volume_24h']) && $row['volume_24h'] !== null) {
            $volume = (int)$row['volume_24h'];
        }
        if ($change30 !== null && ($listings !== null || $volume !== null)) {
            break;
        }
    }

    foreach ($tries as $try) {
        $hit = aiChatRoiCatalogByName()[$try] ?? null;
        if (is_array($hit)) {
            $category = trim((string)($hit['category'] ?? ''));
            if ($category !== '') {
                break;
            }
        }
    }
    if ($category === '' && is_array($resolved)) {
        $category = trim((string)($resolved['category'] ?? ''));
    }

    $bits = [];
    if (is_numeric($change30)) {
        $bits[] = '30d ' . aiChatFormatSignedPct((float)$change30);
    }
    if ($listings !== null && $listings > 0) {
        $bits[] = number_format($listings) . ' listings';
    } elseif ($volume !== null && $volume > 0) {
        $bits[] = '24h vol ' . number_format($volume);
    }
    if ($category !== '' && count($bits) < 3 && !preg_match('/^(skins?|items?|other)$/iu', $category)) {
        $bits[] = $category;
    }
    if ($wear !== '' && $bits === []) {
        $bits[] = 'liquid ' . $wear . ' with catalog demand';
    }
    $why = implode(', ', $bits);
    $why = trim((string)preg_replace('/\s+/u', ' ', $why));
    if (mb_strlen($why) < 15) {
        $why = $wear !== ''
            ? trim($why === '' ? 'liquid ' . $wear . ' with catalog demand' : $why . ', liquid ' . $wear)
            : 'liquid catalog pick with real market volume';
    }
    if (mb_strlen($why) > 180) {
        $why = rtrim(mb_substr($why, 0, 177)) . '…';
    }
    return $why;
}

function aiChatPlainSectionHeading(string $line): string
{
    $plain = trim(preg_replace('/\*\*/u', '', $line) ?? $line);
    $plain = trim(preg_replace('/^#+\s+/u', '', $plain) ?? $plain);
    return rtrim($plain, " \t:");
}

function aiChatIsWhyToBuyHeading(string $line): bool
{
    $heading = aiChatPlainSectionHeading($line);
    if ($heading === '') {
        return false;
    }
    if (preg_match(
        '/^(?:Why(?: these (?:picks|pics)| this mix)?|Reason to buy|Why(?: to buy| it)?|Chart pick)$/iu',
        $heading
    )) {
        return true;
    }
    // Leaked prompt text (e.g. "Why these picks MUST be +/- factors") still counts as Why.
    return (bool)preg_match('/^Why these (?:picks|pics)\b/iu', $heading);
}

function aiChatIsWhyNamesOnlyHeading(string $line): bool
{
    $heading = aiChatPlainSectionHeading($line);
    if ($heading === '') {
        return false;
    }
    return (bool)preg_match('/^(?:Why these (?:picks|pics)|Why this mix)\b/iu', $heading);
}

function aiChatWhyPickCardLabel(array $card): string
{
    $display = trim((string)($card['display_name'] ?? ''));
    $market = trim((string)($card['market_hash_name'] ?? $card['name'] ?? ''));
    $name = $display !== '' ? $display : $market;
    $name = trim((string)preg_replace(
        '/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i',
        '',
        $name
    ));
    $name = aiChatSanitizeExtractedItemName($name);
    $name = trim((string)preg_replace('/\*+/u', '', $name));
    return $name;
}

function aiChatLooksLikeWhyIntroLine(string $line): bool
{
    $plain = aiChatStripLeadingListMarker($line);
    $plain = trim((string)preg_replace('/\*\*/u', '', $plain));
    if ($plain === '') {
        return true;
    }
    if (preg_match('/^(?:Portfolio\s+total|Total|These|Those|Anyway|So yeah|Quick take|Reuse|This mix|Overall|Together)\b/iu', $plain)) {
        return true;
    }
    $name = aiChatExtractWhyBulletItemName($plain);
    if ($name === '' || mb_strlen($name) > 80) {
        return true;
    }
    if (aiChatLooksLikeCatalogItemLine($name) || aiChatLooksLikeRecommendItemLine($name)) {
        return false;
    }
    if (preg_match('/[.!?]$/u', $plain)) {
        return true;
    }
    if (mb_strlen($plain) > 60 && preg_match('/\b(?:without|overpaying|dynamics|reasonable|depth|supply|demand)\b/iu', $plain)) {
        return true;
    }
    return mb_strlen($plain) > 90;
}

function aiChatWhyNameKey(string $name): string
{
    $s = mb_strtolower($name);
    $s = preg_replace('/\((?:factory new|minimal wear|field-tested|well-worn|battle-scarred|fn|mw|ft|ww|bs)\)/iu', '', $s) ?? $s;
    $s = preg_replace('/\b(?:fn|mw|ft|ww|bs)\b/iu', '', $s) ?? $s;
    $s = preg_replace('/[^a-z0-9]+/u', '', $s) ?? $s;
    return $s;
}

function aiChatExtractWhyClause(string $body, string $name): string
{
    $plain = aiChatStripLeadingListMarker($body);
    $plain = trim((string)preg_replace('/\*\*/u', '', $plain));
    $item = trim($name);
    if ($plain === '' || $item === '') {
        return '';
    }

    $parts = preg_split('/\s+[—–-]\s+/u', $plain);
    $rest = '';
    if (is_array($parts) && count($parts) > 1) {
        $rest = trim(implode(' — ', array_slice($parts, 1)));
    } else {
        $pos = mb_stripos($plain, $item);
        if ($pos !== false) {
            $rest = trim(mb_substr($plain, $pos + mb_strlen($item)));
        } else {
            $head = trim((string)($parts[0] ?? $plain));
            $rest = trim(mb_substr($plain, mb_strlen($head)));
        }
        $rest = preg_replace('/^[\s,;:\-–—]+/u', '', $rest) ?? $rest;
    }

    // "sub-$3 floor" → "floor", not "sub- floor".
    $rest = preg_replace('/(?:\b(?:sub|under|below|around|about|near)\s*-?\s*)?(?:€|\$|£)\s*\d[\d.,]*/iu', ' ', $rest) ?? $rest;
    $rest = preg_replace('/\b(?:30d|7d)\s*[+\-−]?\s*\d+(?:[.,]\d+)?\s*%/iu', ' ', $rest) ?? $rest;
    $rest = preg_replace('/\b[\d,]+\s+listings?\b/iu', ' ', $rest) ?? $rest;
    $rest = preg_replace('/\b24h\s+vol\b\S*/iu', ' ', $rest) ?? $rest;
    $rest = preg_replace('/\b[x×]\s*\d+\s*=?\s*/iu', ' ', $rest) ?? $rest;
    $rest = preg_replace('/\*+/u', ' ', $rest) ?? $rest;
    $rest = trim((string)preg_replace('/\s+/u', ' ', $rest));
    $rest = trim($rest, " \t,;:–—-./");
    if ($rest !== '') {
        $clauses = preg_split('/\s+[—–-]\s+/u', $rest) ?: [];
        $cleanClauses = [];
        foreach ($clauses as $clause) {
            $clause = trim($clause, " \t,;:–—-./");
            if ($clause !== '') {
                $cleanClauses[] = $clause;
            }
        }
        if ($cleanClauses !== []) {
            $rest = (string)end($cleanClauses);
        }
    }
    if ($rest === '' || mb_strlen($rest) < 8 || preg_match('/^(?:€|\$|£)/u', $rest)) {
        return '';
    }
    if (preg_match('/^on\s+(?:csfloat|skinport|white\.?market|steam|buff|bitskins)\b/iu', $rest)) {
        return '';
    }
    $words = preg_split('/\s+/u', $rest) ?: [];
    if (count($words) > 14) {
        $rest = implode(' ', array_slice($words, 0, 14));
    }
    return $rest;
}

function aiChatMatchWhyReason(string $name, array $entries): string
{
    $key = aiChatWhyNameKey($name);
    if ($key === '') {
        return '';
    }
    foreach ($entries as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $reason = trim((string)($entry['reason'] ?? ''));
        if ($reason === '') {
            continue;
        }
        $entryName = (string)($entry['name'] ?? '');
        if (aiChatLooksLikeCollectionTitleName($entryName)) {
            continue;
        }
        $other = aiChatWhyNameKey($entryName);
        if ($other === '') {
            continue;
        }
        if ($other === $key || str_contains($other, $key) || str_contains($key, $other)) {
            return $reason;
        }
    }
    return '';
}

function aiChatFallbackCollectionWatchReason(): string
{
    return 'timeless set identity with steady demand across weapon lines';
}

function aiChatFallbackWhyPickReason(string $name): string
{
    static $cursor = 0;
    $plain = mb_strtolower(trim((string)preg_replace('/\*+/u', '', $name)));
    if (preg_match('/\bcollection\b/iu', $plain)) {
        return '';
    }
    // Rotate phrasings so five fallback rows never read as one copy-pasted line.
    if (preg_match('/\b(?:case|capsule|package)\b/iu', $plain)) {
        $pool = [
            'cheap wrapper with recognizable brand; good for tiny swings',
            'deep listing pool, so entries and exits stay quick',
            'low unit price lets you scale the position gradually',
            'drop-pool demand keeps a floor under the price',
            'steady trade volume; easy to unload in small batches',
        ];
    } elseif (preg_match('/\b(?:sticker|graffiti|patch|charm|pin|music kit)\b/iu', $plain)) {
        $pool = [
            'cheap entry, watched by collectors, good for filling slots',
            'collector demand outlasts the event hype cycle',
            'low supply growth once the capsule leaves the drop pool',
            'small ticket size with room for slow appreciation',
        ];
    } else {
        $pool = [
            'recognizable finish; balanced risk/return profile',
            'steady buyer interest keeps resale windows short',
            'mid-band price with healthy listing turnover',
            'popular weapon line, so demand rarely dries up',
            'clean look that holds value across wear tiers',
        ];
    }
    $reason = $pool[$cursor % count($pool)];
    $cursor++;
    return $reason;
}

function aiChatIsWhyExactCard(string $name, array $cardLabels): bool
{
    $key = aiChatWhyNameKey($name);
    if ($key === '') {
        return false;
    }
    foreach ($cardLabels as $label) {
        if (aiChatWhyNameKey((string)$label) === $key) {
            return true;
        }
    }
    return false;
}

function aiChatIsWhyThemeLabel(string $name, string $reason, array $cardLabels): bool
{
    $clean = aiChatSanitizeExtractedItemName($name);
    $clean = trim((string)preg_replace('/\*+/u', '', $clean));
    if ($clean === '' || trim($reason) !== '') {
        return false;
    }
    if (str_contains($clean, '|')) {
        return false;
    }
    if (aiChatIsWhyExactCard($clean, $cardLabels)) {
        return false;
    }
    if (preg_match('/\bcollection\b/iu', $clean)) {
        return false;
    }
    if (preg_match('/\b(?:case|capsule|package)\b/iu', $clean)) {
        return true;
    }
    return (bool)preg_match(
        '/^(?:stattrak™?\s+)?(?:★\s+)?(?:ak-?47|m4a1-?s|m4a4|awp|usp-?s|glock-?18|glock|desert eagle|deagle|p250|p2000|five-seven|tec-9|cz75-auto|dual berettas|mac-10|mp7|mp9|mp5-sd|ump-45|p90|pp-bizon|galil ar|famas|sg 553|aug|ssg 08|scar-20|g3sg1|negev|m249|nova|xm1014|sawed-off|mag-7|r8 revolver)\s*$/iu',
        $clean
    );
}

function aiChatFormatWhyPickLine(string $name, string $reason = ''): string
{
    $name = aiChatSanitizeExtractedItemName($name);
    $name = trim((string)preg_replace('/\*+/u', '', $name));
    $name = trim((string)preg_replace('/\s+\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/iu', '', $name));
    if ($name === '' || aiChatLooksLikeCollectionTitleName($name)) {
        return '';
    }
    $reason = trim((string)preg_replace('/\*+/u', '', $reason));
    // "out of budget, skip" / "not within €100" are model bookkeeping, not a thesis.
    if ($reason !== '' && preg_match('/\b(?:skip(?:ped|ping)?|out of budget|over budget|not within|placeholder|n\/a|tbd)\b/iu', $reason)) {
        $reason = '';
    }
    // "liquid Factory New" / "liquid Field-Tested with catalog demand" is a data
    // stub the price step wrote, not a thesis — let the rotating fallback speak.
    if ($reason !== '' && preg_match('/^liquid\s+(?:factory new|minimal wear|field-tested|well-worn|battle-scarred)(?:\s+with catalog demand)?\.?$/iu', $reason)) {
        $reason = '';
    }
    if ($reason === '') {
        $reason = aiChatFallbackWhyPickReason($name);
    }
    if ($reason === '') {
        return '';
    }
    return '**' . $name . '** — ' . $reason;
}

function aiChatIsItemsToBuyHeading(string $line): bool
{
    $heading = aiChatPlainSectionHeading($line);
    if ($heading === '') {
        return false;
    }
    return (bool)preg_match(
        '/^(?:Items to buy|What to buy next|Top opportunity)$/iu',
        $heading
    );
}

/**
 * Inventory mini-review: drop shopping lists so the reply stays on current holdings.
 */
function aiChatStripInventoryBuySections(string $reply): string
{
    if ($reply === '') {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines) || $lines === []) {
        return $reply;
    }

    $out = [];
    $skipping = false;
    foreach ($lines as $line) {
        $line = (string)$line;
        if (aiChatIsItemsToBuyHeading($line) || aiChatIsWhyToBuyHeading($line)) {
            $skipping = true;
            continue;
        }
        if ($skipping) {
            $trim = trim($line);
            if ($trim === '') {
                continue;
            }
            $isNextSection = aiChatLooksLikeTerminalSectionHeading($line)
                || (bool)preg_match('/^#{1,6}\s+\S/u', $trim);
            if (
                $isNextSection
                && !aiChatIsItemsToBuyHeading($line)
                && !aiChatIsWhyToBuyHeading($line)
            ) {
                $skipping = false;
                $out[] = $line;
                continue;
            }
            continue;
        }
        $out[] = $line;
    }

    return trim(implode("\n", $out));
}

function aiChatIsMarketVerdictHeading(string $line): bool
{
    $heading = aiChatPlainSectionHeading($line);
    if ($heading === '') {
        return false;
    }
    return (bool)preg_match(
        '/^(?:AI market(?: verdict)?|AI sentiment|Market outlook)\b/iu',
        $heading
    );
}

/** Lone ### Verdict / Verdict heading — not AI SENTIMENT / AI market. */
function aiChatIsStandaloneVerdictHeading(string $line): bool
{
    $heading = aiChatStripHeadingEmojiAndShortlist(aiChatPlainSectionHeading($line));
    return $heading !== '' && (bool)preg_match('/^Verdict$/iu', $heading);
}

/** Trailing `BULLISH — why` on an AI SENTIMENT heading, if the model inlined it. */
function aiChatSentimentHeadingTrail(string $line): string
{
    $plain = trim((string)preg_replace('/\*\*/u', '', $line));
    $plain = trim((string)preg_replace('/^#+\s+/u', '', $plain));
    if (!preg_match('/^(?:AI market(?: verdict)?|AI sentiment|Market outlook)\s*[:\-–—]?\s*(.*)$/iu', $plain, $m)) {
        return '';
    }
    return trim((string)($m[1] ?? ''));
}

/** Normalize ### AI SENTIMENT and keep an inlined verdict+why as the next line. */
function aiChatRewriteSentimentHeadingBlock(array $block): array
{
    if ($block === [] || !aiChatIsMarketVerdictHeading((string)$block[0])) {
        return $block;
    }
    $trail = aiChatSentimentHeadingTrail((string)$block[0]);
    $block[0] = '### AI SENTIMENT';
    if ($trail === '') {
        return $block;
    }
    $next = isset($block[1]) ? trim((string)$block[1]) : '';
    if ($next !== '' && preg_match('/\b(?:BULLISH|BEARISH|NEUTRAL|SIDEWAYS)\b/iu', $next)) {
        return $block;
    }
    array_splice($block, 1, 0, $trail);
    return $block;
}

function aiChatStripHeadingEmojiAndShortlist(string $heading): string
{
    $plain = preg_replace('/[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]/u', '', $heading) ?? $heading;
    $plain = preg_replace('/\(\s*shortlist\s*\)/iu', '', $plain) ?? $plain;
    $plain = preg_replace('/\bshortlist\b/iu', '', $plain) ?? $plain;
    return trim((string)preg_replace('/\s+/u', ' ', $plain));
}

function aiChatCollectionsToWatchHeadingEmoji(string $line): string
{
    if (!preg_match_all('/[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]/u', $line, $matches)) {
        return '';
    }
    $bits = array_values(array_filter(array_map('strval', $matches[0] ?? [])));
    return trim(implode(' ', $bits));
}

function aiChatIsCollectionsToWatchHeading(string $line): bool
{
    $heading = aiChatStripHeadingEmojiAndShortlist(aiChatPlainSectionHeading($line));
    if ($heading === '') {
        return false;
    }
    return (bool)preg_match('/^collections?\s+to\s+watch\b/iu', $heading);
}

function aiChatNormalizeCollectionsToWatchHeadingLine(string $line = ''): string
{
    $emoji = aiChatCollectionsToWatchHeadingEmoji($line);
    return '### Collections to watch' . ($emoji !== '' ? ' ' . $emoji : '');
}

function aiChatLooksLikeCollectionTitleName(string $name): bool
{
    $clean = trim((string)preg_replace('/\*+/u', '', $name));
    if ($clean === '' || str_contains($clean, '|') || mb_strlen($clean) > 70) {
        return false;
    }
    if (preg_match('/(?:€|\$|£)\s*\d/u', $clean)) {
        return false;
    }
    $canon = aiChatCanonicalTrackedCollection($clean);
    if ($canon !== '') {
        return true;
    }
    if (preg_match('/^(?:The\s+)?.+\s+Collection$/iu', $clean)) {
        return true;
    }
    return (bool)preg_match('/\bcollection\b/iu', $clean);
}

function aiChatParseNamedCollectionLine(string $line): ?array
{
    $trim = trim($line);
    if ($trim === '' || aiChatIsCollectionsToWatchHeading($trim)) {
        return null;
    }
    if (aiChatLooksLikeTerminalSectionHeading($trim) && !aiChatIsCollectionsToWatchHeading($trim)) {
        return null;
    }
    $trim = preg_replace('/^\s*[+\-−–]\s+/u', '', $trim) ?? $trim;
    $body = aiChatStripLeadingListMarker($trim);
    $name = '';
    $reason = '';
    if (preg_match('/^\*\*(.+?)\*\*\s*[—–]\s*(.*)$/u', $body, $parts)) {
        $name = trim((string)$parts[1]);
        $reason = trim((string)preg_replace('/\*+/u', '', (string)$parts[2]));
    } elseif (preg_match('/^(.+?)\s*[—–]\s*(.*)$/u', $body, $parts)) {
        $name = trim((string)preg_replace('/\*+/u', '', (string)$parts[1]));
        $reason = trim((string)preg_replace('/\*+/u', '', (string)$parts[2]));
    } else {
        $name = trim((string)preg_replace('/\*+/u', '', $body));
    }
    $name = trim($name, " \t*");
    if (!aiChatLooksLikeCollectionTitleName($name)) {
        return null;
    }
    $canon = aiChatCanonicalTrackedCollection($name);
    if ($canon === '') {
        $canon = $name;
    }
    return ['name' => $canon, 'reason' => $reason];
}

/**
 * ### Why these picks explains individual items only — collection titles never get a rationale line.
 */
function aiChatWhyLineNamesCollection(string $line): bool
{
    $body = aiChatStripLeadingListMarker(trim($line));
    if ($body === '') {
        return false;
    }
    $plain = trim((string)preg_replace('/\*\*/u', '', $body));
    $head = trim((string)((preg_split('/\s+[—–\-]\s+/u', $plain, 2)[0] ?? $plain)));
    if ($head !== '' && aiChatLooksLikeCollectionTitleName($head)) {
        return true;
    }
    $name = aiChatExtractWhyBulletItemName($body);
    return $name !== '' && aiChatLooksLikeCollectionTitleName($name);
}

function aiChatLooksLikeTerminalSectionHeading(string $line): bool
{
    $trim = trim($line);
    if ($trim === '') {
        return false;
    }
    if (preg_match('/^#{1,6}\s+\S/u', $trim)) {
        return true;
    }
    return aiChatIsNamedTerminalSectionHeading($trim);
}

/**
 * True for known terminal section titles (Item metrics, Items to buy, …).
 * Unlike aiChatLooksLikeTerminalSectionHeading, does NOT treat every ### line as a section.
 */
function aiChatIsNamedTerminalSectionHeading(string $line): bool
{
    if (aiChatIsCollectionsToWatchHeading($line)) {
        return true;
    }
    $heading = aiChatPlainSectionHeading($line);
    if ($heading === '') {
        return false;
    }
    if (preg_match('/^(?:AI market(?: verdict)?|AI sentiment|Market outlook)\b/iu', $heading)) {
        return true;
    }
    return (bool)preg_match(
        '/^(?:Notes?|Why(?: these picks| this mix| AI is bullish)?|Hold thesis|Thesis|Future outlook|Outlook|Analysis|Summary|Caveats?|Risks?|Disclaimer|Reason to buy|Why(?: to buy| it)?|Chart pick|Chart focus|Buy on|What to buy next|Items to buy|Key read|Key factors|Marketplace supply|Liquidity read|Price action|Metrics|Market metrics|Item metrics|Verdict|CS2 markets overview|Top opportunity)$/iu',
        $heading
    );
}

function aiChatLooksLikeMetricChipLine(string $line): bool
{
    $plain = trim(preg_replace('/\*\*/u', '', $line) ?? $line);
    $plain = preg_replace('/^\s*#+\s+/u', '', $plain) ?? $plain;
    $plain = preg_replace('/^\s*•\s+/u', '', $plain) ?? $plain;
    // Colon/dash form: Scarcity: High — … / **LIQUIDITY:** MEDIUM
    if (preg_match(
        '/^(SCARCITY|LIQUIDITY|DEMAND|VOLATILITY|RISK|TREND|SUPPLY|MOMENTUM|SENTIMENT|CONFIDENCE)\s*[:\-–—]\s*\S/iu',
        $plain
    )) {
        return true;
    }
    // Space form only when the value looks like a short level chip (not "Liquidity read").
    return (bool)preg_match(
        '/^(SCARCITY|LIQUIDITY|DEMAND|VOLATILITY|RISK|TREND|SUPPLY|MOMENTUM|SENTIMENT|CONFIDENCE)\s+(?:very\s+)?(?:high|low|medium|moderate|extreme|med)(?:[\s\-–—]*(?:to\s+)?(?:high|low|medium|moderate))?$/iu',
        $plain
    );
}

function aiChatNormalizeMetricLevel(string $level): string
{
    $s = trim($level);
    if ($s === '') {
        return '';
    }
    $s = preg_replace('/[–—]/u', '-', $s) ?? $s;
    $s = preg_replace('/\s+to\s+/iu', '-', $s) ?? $s;
    $s = preg_replace('/\s+/u', '-', $s) ?? $s;
    $s = preg_replace('/-+/u', '-', $s) ?? $s;
    $s = trim($s, '-');
    return strtoupper($s);
}

/**
 * Strip leftover "why…" / "Why:" prompt-placeholder prefixes from metric detail text.
 */
function aiChatSanitizeMetricDetail(string $detail): string
{
    $detail = trim($detail);
    if ($detail === '') {
        return '';
    }

    // why… / why... / Why: / why — / why-
    $detail = preg_replace('/^why\b\s*(?:[:\-–—…]|\.{1,3})?\s*/iu', '', $detail) ?? $detail;
    $detail = trim($detail);
    if ($detail === '' || preg_match('/^[\.…]{1,3}$/u', $detail)) {
        return '';
    }

    return $detail;
}

/**
 * Split a metric value into short chip level + required detail/why clause.
 *
 * @return array{value: string, detail: string}
 */
function aiChatSplitMetricValueAndDetail(string $raw): array
{
    $raw = trim($raw);
    if ($raw === '') {
        return ['value' => 'MEDIUM', 'detail' => ''];
    }

    if (preg_match('/^([A-Za-z][A-Za-z0-9%+\-.\/ ]{0,24})\s*[—–\-]\s+(.+)$/u', $raw, $m)
        && preg_match('/^(?:very\s+)?(?:high|low|medium|moderate|extreme)|medium[\s\-–—]*high|moderate[\s\-–—]*(?:to\s+)?high$/iu', trim((string)$m[1]))
    ) {
        return [
            'value' => aiChatNormalizeMetricLevel((string)$m[1]),
            'detail' => aiChatSanitizeMetricDetail(trim((string)$m[2])),
        ];
    }

    if (preg_match('/^[A-Z][A-Z0-9%+\-.\/ ]{0,18}$/u', $raw)) {
        return ['value' => strtoupper($raw), 'detail' => ''];
    }

    if (preg_match('/^(very\s+high|very\s+low|medium[\s\-–—]*high|med[\s\-–—]*high|moderate[\s\-–—]*(?:to\s+)?high|moderate|medium|extreme|high|low)\b\s*(.*)$/iu', $raw, $m)) {
        $detail = trim((string)$m[2]);
        $detail = preg_replace('/^[—–\-:,\s]+/u', '', $detail) ?? $detail;
        $detail = rtrim($detail);
        if (preg_match('/^\((.+)\)$/u', $detail, $wrapped)) {
            $detail = trim((string)$wrapped[1]);
        }
        return [
            'value' => aiChatNormalizeMetricLevel((string)$m[1]),
            'detail' => aiChatSanitizeMetricDetail($detail),
        ];
    }

    if (preg_match('/^(\S+)\s+(.+)$/u', $raw, $m)) {
        return [
            'value' => aiChatNormalizeMetricLevel((string)$m[1]),
            'detail' => aiChatSanitizeMetricDetail(trim((string)$m[2])),
        ];
    }

    return ['value' => aiChatNormalizeMetricLevel($raw), 'detail' => ''];
}

function aiChatFormatMetricChipLine(string $label, string $value, string $detail = ''): string
{
    $label = strtoupper(trim($label));
    $value = trim($value) !== '' ? strtoupper(trim($value)) : 'MEDIUM';
    if ($label === 'SCARCITY' && $value === 'MEDIUM') {
        $value = 'MODERATE';
    }
    $labelDisplay = aiChatTitleCaseMetricToken($label);
    $valueDisplay = aiChatTitleCaseMetricToken($value);
    $detail = aiChatSanitizeMetricDetail($detail);
    if ($detail !== '') {
        return '**' . $labelDisplay . ':** ' . $valueDisplay . ' — ' . $detail;
    }
    return '**' . $labelDisplay . ':** ' . $valueDisplay;
}

function aiChatTitleCaseMetricToken(string $token): string
{
    $token = trim($token);
    if ($token === '') {
        return '';
    }
    $parts = preg_split('/([\s\-–—\/]+)/u', $token, -1, PREG_SPLIT_DELIM_CAPTURE);
    if (!is_array($parts)) {
        $lower = mb_strtolower($token);
        return mb_strtoupper(mb_substr($lower, 0, 1)) . mb_substr($lower, 1);
    }
    $out = '';
    foreach ($parts as $part) {
        if ($part === '' || preg_match('/^[\s\-–—\/]+$/u', $part)) {
            $out .= $part;
            continue;
        }
        $lower = mb_strtolower($part);
        $out .= mb_strtoupper(mb_substr($lower, 0, 1)) . mb_substr($lower, 1);
    }
    return $out;
}

function aiChatIsItemMetricsHeading(string $line): bool
{
    $plain = trim(preg_replace('/\*\*/u', '', $line) ?? $line);
    $heading = trim(preg_replace('/^#+\s+/u', '', $plain) ?? $plain);
    $heading = rtrim($heading, " \t:");
    return (bool)preg_match('/^(?:metrics|market metrics|item metrics)$/iu', $heading);
}

/**
 * Parse a Scarcity / Liquidity / Volatility chip line into label + level + why.
 *
 * @return array{label:string,value:string,detail:string}|null
 */
function aiChatParseMetricChipLine(string $line): ?array
{
    if (!aiChatLooksLikeMetricChipLine($line)) {
        return null;
    }
    $plain = trim(preg_replace('/\*\*/u', '', $line) ?? $line);
    $plain = preg_replace('/^\s*#+\s+/u', '', $plain) ?? $plain;
    $plain = preg_replace('/^\s*•\s+/u', '', $plain) ?? $plain;
    if (!preg_match('/^([A-Za-z]+)\s*(?:[:\-–—]\s*)?(.*)$/u', trim($plain), $m)) {
        return null;
    }
    $split = aiChatSplitMetricValueAndDetail(trim((string)$m[2]));
    return [
        'label' => strtoupper(trim((string)$m[1])),
        'value' => (string)$split['value'],
        'detail' => (string)$split['detail'],
    ];
}

/**
 * Pull the ### Item metrics heading and every Scarcity / Liquidity / Volatility chip
 * line out of a reply, wherever the model put them.
 *
 * @return array{content: string, metrics: array<string, array{value:string,detail:string}>}
 */
function aiChatSplitItemMetricsSection(string $reply): array
{
    if ($reply === '') {
        return ['content' => $reply, 'metrics' => []];
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines) || $lines === []) {
        return ['content' => $reply, 'metrics' => []];
    }

    $kept = [];
    $metrics = [];
    $skipping = false;
    $changed = false;

    foreach ($lines as $line) {
        $line = (string)$line;
        if (aiChatIsItemMetricsHeading($line)) {
            $skipping = true;
            $changed = true;
            continue;
        }
        $parsed = aiChatParseMetricChipLine($line);
        if ($parsed) {
            $label = $parsed['label'];
            if ($label !== '' && !isset($metrics[$label])) {
                $metrics[$label] = ['value' => $parsed['value'], 'detail' => $parsed['detail']];
            } elseif ($label !== '' && $metrics[$label]['detail'] === '' && $parsed['detail'] !== '') {
                $metrics[$label]['detail'] = $parsed['detail'];
            }
            $changed = true;
            continue;
        }
        if ($skipping) {
            if (trim($line) === '') {
                continue;
            }
            if (aiChatLooksLikeTerminalSectionHeading($line) && !aiChatIsItemMetricsHeading($line)) {
                $skipping = false;
            } else {
                $changed = true;
                continue;
            }
        }
        $kept[] = $line;
    }

    if (!$changed) {
        return ['content' => $reply, 'metrics' => []];
    }

    $joined = implode("\n", $kept);
    $joined = preg_replace("/\n{3,}/u", "\n\n", $joined) ?? $joined;
    return ['content' => trim($joined), 'metrics' => $metrics];
}

/**
 * Rebuild a single ### Item metrics strip at the top of the reply.
 *
 * Chip lines are collected from wherever the model put them, merged with
 * $extraLines and the chart-derived $defaults, and re-emitted as exactly three
 * Scarcity / Liquidity / Volatility cards.
 *
 * @param list<string>                                            $extraLines
 * @param list<array{label:string,value:string,detail?:string}>|null $defaults
 */
function aiChatRebuildItemMetricsSection(
    string $reply,
    array $extraLines = [],
    ?array $defaults = null,
    bool $forceInsert = false
): string {
    if ($reply === '') {
        return $reply;
    }

    $split = aiChatSplitItemMetricsSection($reply);
    $metrics = $split['metrics'];
    foreach ($extraLines as $extraLine) {
        $parsed = aiChatParseMetricChipLine((string)$extraLine);
        if (!$parsed || $parsed['label'] === '' || isset($metrics[$parsed['label']])) {
            continue;
        }
        $metrics[$parsed['label']] = ['value' => $parsed['value'], 'detail' => $parsed['detail']];
    }

    if ($metrics === [] && !$forceInsert) {
        return $split['content'];
    }

    $defaultByLabel = [];
    foreach (is_array($defaults) ? $defaults : [] as $entry) {
        if (is_array($entry) && ($entry['label'] ?? '') !== '') {
            $defaultByLabel[strtoupper((string)$entry['label'])] = $entry;
        }
    }

    $block = ['### Item metrics', ''];
    foreach (['SCARCITY', 'LIQUIDITY', 'VOLATILITY'] as $label) {
        $value = trim((string)($metrics[$label]['value'] ?? ''));
        if ($value === '') {
            $value = trim((string)($defaultByLabel[$label]['value'] ?? ''));
        }
        if ($value === '') {
            $value = $label === 'SCARCITY' ? 'MODERATE' : 'MEDIUM';
        }
        $detail = aiChatResolveMetricDetail(
            $label,
            $value,
            (string)($metrics[$label]['detail'] ?? ''),
            is_array($defaults) ? $defaults : null
        );
        $block[] = aiChatFormatMetricChipLine($label, $value, $detail);
    }
    $block[] = '';

    $lines = preg_split("/\r\n|\n|\r/", $split['content']);
    if (!is_array($lines)) {
        $lines = [];
    }
    while ($lines !== [] && trim((string)$lines[0]) === '') {
        array_shift($lines);
    }

    $joined = implode("\n", array_merge($block, $lines));
    $joined = preg_replace("/\n{3,}/u", "\n\n", $joined) ?? $joined;
    return trim($joined);
}

/**
 * Final pass: fold stray SCARCITY/LIQUIDITY/VOLATILITY chip lines (including
 * ### SCARCITY: HIGH) back into the single ### Item metrics strip.
 */
function aiChatRelocateAllMetricChipLines(string $reply): string
{
    return aiChatRebuildItemMetricsSection($reply);
}

function aiChatStripLeadingListMarker(string $line): string
{
    $stripped = preg_replace('/^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+[.)])\s+/u', '', $line) ?? $line;
    return trim($stripped);
}

/**
 * Parse a • / markdown / unmarked content line.
 *
 * @return array{0: string, 1: string, 2: bool}|null indent, body, hadBullet
 */
function aiChatParseListContentLine(string $line, bool $allowUnmarked): ?array
{
    if (preg_match('/^(\s*)•\s+(.*)$/u', $line, $m)) {
        return [(string)$m[1], trim((string)$m[2]), true];
    }
    if (!$allowUnmarked) {
        return null;
    }
    $trim = trim($line);
    if ($trim === '') {
        return null;
    }
    $body = aiChatStripLeadingListMarker($trim);
    if ($body === '') {
        return null;
    }
    return ['', $body, false];
}

/**
 * Split a why-to-buy prose line into one or more plain lines (one idea per line).
 *
 * @return list<string>
 */
function aiChatSplitWhyProseIntoBullets(string $text): array
{
    $text = trim($text);
    $text = preg_replace('/^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+[.)])\s+/u', '', $text) ?? $text;
    $text = trim($text);
    if ($text === '') {
        return [];
    }

    $parts = preg_split('/(?<=[.!?])\s+(?=[A-Z0-9*"“‘])/u', $text);
    if (!is_array($parts) || $parts === []) {
        $parts = [$text];
    }

    $bullets = [];
    foreach ($parts as $part) {
        $part = trim((string)$part);
        if ($part === '') {
            continue;
        }
        if (mb_strlen($part) < 8 && $bullets !== []) {
            $last = array_key_last($bullets);
            $bullets[$last] = rtrim((string)$bullets[$last]) . ' ' . $part;
            continue;
        }
        $bullets[] = $part;
    }

    return $bullets !== [] ? $bullets : [$text];
}

/**
 * Normalize ### Why these picks (and similar why-to-buy sections) to **Name** — short why lines (no list markers).
 * Misplaced SCARCITY/LIQUIDITY/VOLATILITY lines (including ### SCARCITY) are stripped.
 * Unknown ### headings inside Why are stripped. Misplaced +/− factor chips are dropped.
 */
/**
 * Last pass over the Why section: a heading glued onto a bullet ("… — ### Why
 * these picks") gets its own line, and when the pipeline left two Why blocks
 * the later one is merged into the first (unique names) and dropped.
 */
/**
 * Bullet clauses that are model bookkeeping ("skip (not in list)", "out of budget")
 * and duplicated price chunks left behind by repair steps.
 */
function aiChatStripBookkeepingClauses(string $reply): string
{
    if ($reply === '') {
        return $reply;
    }
    $lines = preg_split("/\r\n|\n|\r/", $reply) ?: [];
    $changed = false;
    foreach ($lines as $i => $line) {
        if (!preg_match('/^(\s*(?:[-*•]|\d+[.)])\s+)(.+)$/u', (string)$line, $m)) {
            continue;
        }
        $segments = preg_split('/\s+(?:—|→|=>)\s+/u', (string)$m[2]) ?: [];
        if (count($segments) < 2) {
            continue;
        }
        $kept = [];
        $seenPrice = [];
        foreach ($segments as $idx => $segment) {
            $seg = trim((string)$segment);
            if ($seg === '') {
                continue;
            }
            if ($idx > 0 && preg_match('/\b(?:skip(?:ped|ping)?|not in (?:the )?list|out of budget|over budget|exceeds? (?:the )?budget|swap(?:ped)? below|placeholder|already (?:included|counted|listed)|remove if strict|price unknown)\b|^note:/iu', $seg)) {
                $changed = true;
                continue;
            }
            if ($idx > 0 && preg_match('/^\*{0,2}(?:€|\$|£)\s*([\d.,]+)\*{0,2}(?:\s*[x×]\s*\d+\s*=\s*(?:€|\$|£)\s*[\d.,]+)?$/u', $seg, $pm)) {
                $priceKey = (string)$pm[1];
                if (isset($seenPrice[$priceKey])) {
                    $changed = true;
                    continue;
                }
                $seenPrice[$priceKey] = true;
            }
            $kept[] = $seg;
        }
        $rebuilt = (string)$m[1] . implode(' — ', $kept);
        if ($rebuilt !== (string)$line) {
            $lines[$i] = $rebuilt;
            $changed = true;
        }
    }
    return $changed ? implode("\n", $lines) : $reply;
}

function aiChatTidyWhySections(string $reply): string
{
    if ($reply === '') {
        return $reply;
    }
    $reply = aiChatStripBookkeepingClauses($reply);
    // Bookkeeping paragraphs ("Note: to stay within €150…", "Revised, budget-friendly
    // expansion", "Total so far: €97") are process narration, not the answer.
    $reply = preg_replace('/^(?!#)(?:Note|Notes|Revised|Adjusted|Subtotal|Total so far|Final total|Rough total|Approx(?:imate)?\.? total|Running total|Grand total)\b[^\n]*\n?/imu', '', $reply) ?? $reply;
    // Stray trailing bullet glyphs the model appends to chip lines.
    $reply = preg_replace('/[ \t]+•\s*$/mu', '', $reply) ?? $reply;
    $reply = preg_replace('/[ \t]+[—–-][ \t]*(#{1,6}\s+\S)/u', "\n$1", $reply) ?? $reply;
    // Stacked bold from two steps each wrapping the same price: ****€20**** → **€20**
    $reply = preg_replace('/\*{3,}/u', '**', $reply) ?? $reply;
    // "× 1" → "×1" so every bullet reads the same way.
    $reply = preg_replace('/×\s+(\d)/u', '×$1', $reply) ?? $reply;
    // Model bookkeeping lines ("Notes:", "Prices are best-available estimates…").
    $reply = preg_replace('/^(?:Notes?|Caveats?)\s*:\s*$\n?/imu', '', $reply) ?? $reply;
    $reply = preg_replace('/^(?:•\s*)?Prices are (?:best[- ]available )?estimates[^\n]*\n?/imu', '', $reply) ?? $reply;
    // A heading with nothing under it (Item metrics whose chips were relocated, an
    // emptied Why) is noise — drop it.
    $reply = preg_replace('/^(#{1,6}\s+[^\n]*)\n+(?=#{1,6}\s+|\z)/mu', '', $reply) ?? $reply;
    $reply = preg_replace('/\n+(#{1,6}\s+[^\n]*)\s*\z/u', '', $reply) ?? $reply;
    // "**€20.11 — **" (empty bold tail left by a stripped clause)
    $reply = preg_replace('/\*\*((?:€|\$|£)\s*[\d.,]+)\s*[—–-]\s*\*\*/u', '**$1**', $reply) ?? $reply;

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }
    $whyStarts = [];
    foreach ($lines as $i => $line) {
        if (aiChatIsWhyToBuyHeading((string)$line)) {
            $whyStarts[] = $i;
        }
    }
    if (count($whyStarts) < 2) {
        return implode("\n", $lines);
    }

    $blockEnd = static function (int $start) use ($lines): int {
        $n = count($lines);
        for ($j = $start + 1; $j < $n; $j++) {
            if (preg_match('/^#{1,6}\s+/u', trim((string)$lines[$j]))) {
                return $j;
            }
        }
        return $n;
    };
    $nameKey = static function (string $line): string {
        $plain = trim((string)preg_replace('/\*+/u', '', $line));
        $parts = preg_split('/\s+[—–-]\s+/u', $plain, 2);
        return aiChatWhyNameKey(trim((string)($parts[0] ?? $plain)));
    };

    $first = $whyStarts[0];
    $firstEnd = $blockEnd($first);
    $seen = [];
    $merged = [];
    for ($j = $first + 1; $j < $firstEnd; $j++) {
        $line = (string)$lines[$j];
        if (trim($line) === '') {
            continue;
        }
        $seen[$nameKey($line)] = true;
        $merged[] = $line;
    }
    $remove = [];
    foreach (array_slice($whyStarts, 1) as $start) {
        $end = $blockEnd($start);
        for ($j = $start; $j < $end; $j++) {
            $remove[$j] = true;
            if ($j === $start) {
                continue;
            }
            $line = (string)$lines[$j];
            if (trim($line) === '') {
                continue;
            }
            $key = $nameKey($line);
            if ($key !== '' && isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $merged[] = $line;
        }
    }

    $out = [];
    foreach ($lines as $j => $line) {
        if (isset($remove[$j])) {
            continue;
        }
        if ($j === $first) {
            $out[] = $line;
            foreach ($merged as $mergedLine) {
                $out[] = $mergedLine;
            }
            continue;
        }
        if ($j > $first && $j < $firstEnd) {
            continue;
        }
        $out[] = $line;
    }
    $text = implode("\n", $out);
    return trim((string)preg_replace("/\n{3,}/", "\n\n", $text));
}

/**
 * Model wrote priced • picks under "### Why these picks" and no Items to buy at all:
 * that block IS the pick list — rename it so the price/quantity steps see it and a
 * proper Why section gets built below.
 */
function aiChatPromotePricedWhyToItems(string $reply): string
{
    if ($reply === '') {
        return $reply;
    }
    $lines = preg_split("/\r\n|\n|\r/", $reply) ?: [];
    foreach ($lines as $line) {
        if (aiChatIsItemsToBuyHeading((string)$line)) {
            return $reply;
        }
    }
    // Candidates: the Why heading itself, or any free-form heading the model
    // invented for its list ("### What I'd consider", "### Items to consider").
    $whyIndex = null;
    foreach ($lines as $i => $line) {
        $trim = trim((string)$line);
        if (!preg_match('/^#{1,6}\s+\S/u', $trim)) {
            continue;
        }
        $candidate = aiChatIsWhyToBuyHeading($trim)
            || (!aiChatIsNamedTerminalSectionHeading($trim)
                && !aiChatIsItemsToBuyHeading($trim)
                && !preg_match('/^#{1,6}\s*(?:item metrics|ai sentiment|key factors|collections to watch|summary|outlook)\b/iu', $trim));
        if (!$candidate) {
            continue;
        }
        $priced = 0;
        $total = 0;
        for ($j = $i + 1; $j < count($lines); $j++) {
            $t = trim((string)$lines[$j]);
            if ($t === '') {
                continue;
            }
            if (preg_match('/^#{1,6}\s+/u', $t)) {
                break;
            }
            $total++;
            if (preg_match('/(?:€|\$|£)\s*\d/u', $t)) {
                $priced++;
            }
        }
        if ($total > 0 && $priced >= max(1, (int)ceil($total / 2))) {
            $whyIndex = $i;
            break;
        }
    }
    if ($whyIndex === null) {
        return $reply;
    }
    $lines[$whyIndex] = '### Items to buy';
    for ($j = $whyIndex + 1; $j < count($lines); $j++) {
        $trim = trim((string)$lines[$j]);
        if ($trim === '') {
            continue;
        }
        if (preg_match('/^#{1,6}\s+/u', $trim)) {
            break;
        }
        $body = aiChatStripLeadingListMarker($trim);
        $lines[$j] = '• ' . $body;
    }
    return implode("\n", $lines);
}

/**
 * Pick list without any Why section: build one from the bullets' own clauses so
 * the layout is stable turn to turn.
 */
function aiChatEnsureWhySectionExists(string $reply): string
{
    if ($reply === '') {
        return $reply;
    }
    $lines = preg_split("/\r\n|\n|\r/", $reply) ?: [];
    $hasItems = false;
    foreach ($lines as $line) {
        if (aiChatIsWhyToBuyHeading((string)$line)) {
            return $reply;
        }
        if (aiChatIsItemsToBuyHeading((string)$line)) {
            $hasItems = true;
        }
    }
    if (!$hasItems) {
        return $reply;
    }
    $rows = [];
    $seen = [];
    $inItems = false;
    foreach ($lines as $line) {
        $trim = trim((string)$line);
        if (aiChatIsItemsToBuyHeading($trim)) {
            $inItems = true;
            continue;
        }
        if ($inItems && preg_match('/^#{1,6}\s+/u', $trim)) {
            $inItems = false;
            continue;
        }
        if (!$inItems || !preg_match('/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/u', $trim, $m)) {
            continue;
        }
        $body = (string)$m[1];
        $name = aiChatExtractWhyBulletItemName($body);
        if ($name === '') {
            continue;
        }
        $key = mb_strtolower(aiChatStripWear($name));
        if ($key === '' || isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $reason = aiChatExtractWhyClause($body, $name);
        // "30d -19.06%, 575 listings" is data, not a thesis — let the fallback speak.
        if ($reason !== '' && aiChatWhyLineHasCatalogNumbers($reason)) {
            $reason = '';
        }
        $rows[] = aiChatFormatWhyPickLine($name, $reason);
    }
    $rows = array_values(array_filter($rows, static fn(string $r): bool => $r !== ''));
    if ($rows === []) {
        return $reply;
    }
    return rtrim($reply) . "\n\n### Why these picks\n" . implode("\n", $rows);
}

function aiChatEnsureWhyPicksBullets(string $reply, array $cards = []): string
{
    if ($reply === '') {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines) || $lines === []) {
        return $reply;
    }

    $out = [];
    $inWhy = false;
    $inWhyNamesOnly = false;
    $whyNames = [];
    $pickEntries = [];
    $changed = false;
    $misplacedMetricLines = [];
    $cardLabels = [];
    $cardCollections = [];
    $groupByCollection = false;
    foreach ($cards as $card) {
        if (!is_array($card)) {
            continue;
        }
        if (($card['scope_type'] ?? '') === 'collection') {
            $groupByCollection = true;
        }
        $label = aiChatWhyPickCardLabel($card);
        if ($label !== '') {
            $cardLabels[] = $label;
            $market = trim((string)($card['market_hash_name'] ?? $card['name'] ?? $label));
            $cardCollections[$label] = aiChatCanonicalTrackedCollection(aiChatSkinOriginName($market !== '' ? $market : $label));
        }
    }

    $normalizeMetricLine = static function (string $trim): string {
        $clean = preg_replace('/^\s*#+\s+/u', '', $trim) ?? $trim;
        $clean = preg_replace('/^\s*•\s+/u', '', $clean) ?? $clean;
        return trim($clean);
    };

    $flushWhyNames = static function () use (&$out, &$whyNames, &$inWhyNamesOnly, $cardLabels, $cardCollections, $groupByCollection, &$pickEntries): void {
        if (!$inWhyNamesOnly) {
            $whyNames = [];
            return;
        }
        $rows = [];
        $seen = [];
        $pushRow = static function (string $name, string $reason) use (&$rows, &$seen): void {
            $name = aiChatSanitizeExtractedItemName($name);
            $name = trim((string)preg_replace('/\*+/u', '', $name));
            if ($name === '' || aiChatLooksLikeCollectionTitleName($name)) {
                return;
            }
            $key = aiChatWhyNameKey($name);
            if ($key === '') {
                $key = mb_strtolower($name);
            }
            if (isset($seen[$key])) {
                return;
            }
            $seen[$key] = true;
            $rows[] = ['name' => $name, 'reason' => $reason];
        };
        $themes = [];
        $seenThemes = [];
        foreach ($whyNames as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $themeName = (string)($entry['name'] ?? '');
            $themeReason = (string)($entry['reason'] ?? '');
            if (aiChatLooksLikeCollectionTitleName($themeName)) {
                continue;
            }
            if (!aiChatIsWhyThemeLabel($themeName, $themeReason, $cardLabels)) {
                continue;
            }
            $themeName = aiChatSanitizeExtractedItemName($themeName);
            $themeName = trim((string)preg_replace('/\*+/u', '', $themeName));
            if ($themeName === '') {
                continue;
            }
            $themeKey = aiChatWhyNameKey($themeName);
            if ($themeKey === '') {
                $themeKey = mb_strtolower($themeName);
            }
            if (isset($seenThemes[$themeKey])) {
                continue;
            }
            $seenThemes[$themeKey] = true;
            $themes[] = $themeName;
        }
        if ($cardLabels !== []) {
            foreach ($cardLabels as $label) {
                $reason = aiChatMatchWhyReason((string)$label, $whyNames);
                if ($reason === '') {
                    $reason = aiChatMatchWhyReason((string)$label, $pickEntries);
                }
                $pushRow((string)$label, $reason);
            }
            // Picks the model explained that did not become cards (card cap,
            // catalog miss) keep their own why line instead of vanishing —
            // but a wear-variant / short alias of a card ("Printstream
            // Field-Tested" for M4A1-S | Printstream) is the same pick.
            $wearless = static function (string $key): string {
                return (string)preg_replace('/(?:factorynew|minimalwear|fieldtested|wellworn|battlescarred)/u', '', $key);
            };
            foreach ($whyNames as $entry) {
                if (!is_array($entry)) {
                    continue;
                }
                $name = (string)($entry['name'] ?? '');
                $reason = (string)($entry['reason'] ?? '');
                if ($reason === '' || aiChatLooksLikeCollectionTitleName($name) || aiChatIsWhyThemeLabel($name, $reason, $cardLabels)) {
                    continue;
                }
                $probe = $wearless(aiChatWhyNameKey($name));
                if ($probe === '') {
                    continue;
                }
                $duplicate = false;
                foreach (array_keys($seen) as $seenKey) {
                    $seenProbe = $wearless((string)$seenKey);
                    if ($seenProbe !== '' && (str_contains($seenProbe, $probe) || str_contains($probe, $seenProbe))) {
                        $duplicate = true;
                        break;
                    }
                }
                if ($duplicate) {
                    continue;
                }
                $pushRow($name, $reason);
            }
            // Every pick bullet gets a Why line, even when the model explained only some.
            foreach ($pickEntries as $entry) {
                if (!is_array($entry)) {
                    continue;
                }
                $name = (string)($entry['name'] ?? '');
                $probe = $wearless(aiChatWhyNameKey($name));
                if ($probe === '' || aiChatLooksLikeCollectionTitleName($name)) {
                    continue;
                }
                $duplicate = false;
                foreach (array_keys($seen) as $seenKey) {
                    $seenProbe = $wearless((string)$seenKey);
                    if ($seenProbe !== '' && (str_contains($seenProbe, $probe) || str_contains($probe, $seenProbe))) {
                        $duplicate = true;
                        break;
                    }
                }
                if ($duplicate) {
                    continue;
                }
                $reason = (string)($entry['reason'] ?? '');
                if ($reason !== '' && aiChatWhyLineHasCatalogNumbers($reason)) {
                    $reason = '';
                }
                $pushRow(aiChatStripWear($name), $reason);
            }
        } else {
            foreach ($whyNames as $entry) {
                if (!is_array($entry)) {
                    continue;
                }
                $name = (string)($entry['name'] ?? '');
                $reason = (string)($entry['reason'] ?? '');
                if (aiChatLooksLikeCollectionTitleName($name) || aiChatIsWhyThemeLabel($name, $reason, $cardLabels)) {
                    continue;
                }
                if ($reason === '') {
                    $reason = aiChatMatchWhyReason($name, $pickEntries);
                }
                $pushRow($name, $reason);
            }
        }
        foreach ($themes as $theme) {
            $out[] = $theme;
        }
        if ($groupByCollection && $rows !== []) {
            $grouped = [];
            $unknown = [];
            foreach ($rows as $row) {
                $label = (string)($row['name'] ?? '');
                $origin = trim((string)($cardCollections[$label] ?? ''));
                if ($origin === '') {
                    $origin = aiChatCanonicalTrackedCollection(aiChatSkinOriginName($label));
                }
                if ($origin === '') {
                    $unknown[] = $row;
                    continue;
                }
                if (!isset($grouped[$origin])) {
                    $grouped[$origin] = [];
                }
                $grouped[$origin][] = $row;
            }
            foreach ($grouped as $groupRows) {
                foreach ($groupRows as $row) {
                    $line = aiChatFormatWhyPickLine((string)$row['name'], (string)$row['reason']);
                    if ($line !== '') {
                        $out[] = $line;
                    }
                }
            }
            foreach ($unknown as $row) {
                $line = aiChatFormatWhyPickLine((string)$row['name'], (string)$row['reason']);
                if ($line !== '') {
                    $out[] = $line;
                }
            }
        } else {
            foreach ($rows as $row) {
                $line = aiChatFormatWhyPickLine((string)$row['name'], (string)$row['reason']);
                if ($line !== '') {
                    $out[] = $line;
                }
            }
        }
        $whyNames = [];
        $inWhyNamesOnly = false;
    };

    $collectWhyName = static function (string $body) use (&$whyNames, $cardLabels): void {
        if (aiChatLooksLikeWhyIntroLine($body) || aiChatWhyLineNamesCollection($body)) {
            return;
        }
        $name = aiChatExtractWhyBulletItemName($body);
        if ($name === '' || aiChatLooksLikeCollectionTitleName($name)) {
            return;
        }
        // "Lower-cost AK options — …" / "gloves from smaller markets — …" are prose
        // dressed as a pick: a why name must be an actual item (or a card).
        $plainName = trim((string)preg_replace('/\*+/u', '', $name));
        $itemLike = str_contains($plainName, '|')
            || aiChatIsWeaponCaseItem($plainName)
            || aiChatIsStickerCapsuleItem($plainName)
            || aiChatIsKnifeItem($plainName)
            || aiChatIsGloveItem($plainName)
            || aiChatIsCharmItem($plainName)
            || aiChatIsWhyExactCard($plainName, $cardLabels)
            || preg_match('/\b(?:Case|Capsule|Package|Music Kit|Patch|Pin|Agent)\b/iu', $plainName);
        if (!$itemLike && (mb_strlen($plainName) > 40 || !preg_match('/^[★A-Z0-9]/u', $plainName) || str_word_count($plainName) > 5)) {
            return;
        }
        if (!$itemLike && (str_contains($plainName, ':') || str_contains($plainName, '/') || preg_match('/^(?:note|notes|tip|total|revised|adjusted|reminder|summary|overall|these|those)\b|\b(?:picks?|options?|items?|adds?|fillers?)$/iu', $plainName))) {
            return;
        }
        $whyNames[] = [
            'name' => $name,
            'reason' => aiChatExtractWhyClause($body, $name),
        ];
    };

    $factorLineIndexes = aiChatKeyFactorsLineIndexes(array_map('strval', $lines));
    foreach ($lines as $lineIndex => $line) {
        $line = (string)$line;

        if (aiChatIsWhyToBuyHeading($line)) {
            $flushWhyNames();
            $inWhy = true;
            $inWhyNamesOnly = aiChatIsWhyNamesOnlyHeading($line);
            if (trim($line) !== '### Why these picks') {
                $changed = true;
            }
            $out[] = $inWhyNamesOnly ? '### Why these picks' : $line;
            if ($inWhyNamesOnly) {
                $changed = true;
            }
            continue;
        }

        if ($inWhy && aiChatLooksLikeTerminalSectionHeading($line) && !aiChatIsWhyToBuyHeading($line)) {
            $trim = trim($line);
            // ### SCARCITY: HIGH (etc.) must relocate to Metrics — never end Why as a heading.
            if (aiChatLooksLikeMetricChipLine($trim)) {
                $misplacedMetricLines[] = $normalizeMetricLine($trim);
                $changed = true;
                continue;
            }
            // Named next sections (Metrics, Items to buy, …) end Why.
            if (aiChatIsNamedTerminalSectionHeading($line) || !preg_match('/^#{1,6}\s+/u', $trim)) {
                $flushWhyNames();
                $inWhy = false;
                $out[] = $line;
                continue;
            }
            // Strip unknown ### junk nested inside Why.
            $changed = true;
            continue;
        }

        if (!$inWhy) {
            $plainPick = aiChatStripLeadingListMarker(trim($line));
            // "- Some popular finishes may be above budget at FN/FT" is a risk chip, not a pick.
            if (isset($factorLineIndexes[$lineIndex])) {
                $plainPick = '';
            }
            if ($plainPick !== '' && (aiChatLooksLikeCatalogItemLine($plainPick) || aiChatLooksLikeRecommendItemLine($plainPick))) {
                $pickName = aiChatExtractWhyBulletItemName($plainPick);
                if ($pickName !== '') {
                    $pickEntries[] = [
                        'name' => $pickName,
                        'reason' => aiChatExtractWhyClause($plainPick, $pickName),
                    ];
                }
            }
            $out[] = $line;
            continue;
        }

        $trim = trim($line);
        if ($trim === '') {
            if (!$inWhyNamesOnly) {
                $out[] = $line;
            }
            continue;
        }

        // Why explains individual items only — collection titles get no rationale line here.
        if (aiChatWhyLineNamesCollection($trim)) {
            $changed = true;
            continue;
        }

        // Metric chips are stripped — never keep Scarcity/Liquidity/Volatility under Why.
        if (aiChatLooksLikeMetricChipLine($trim)) {
            $misplacedMetricLines[] = $normalizeMetricLine($trim);
            $changed = true;
            continue;
        }

        // "- **Gamma 2 Case** — cheap entry, rising interest" is a markdown why line,
        // not a negative factor chip: keep the model's own reason.
        if (preg_match('/^[-*]\s+\*\*[^*\n]+\*\*\s*[—–:-]\s+\S/u', $trim)) {
            $body = aiChatStripLeadingListMarker($trim);
            if ($inWhyNamesOnly) {
                $collectWhyName($body);
            } else {
                $out[] = $body;
            }
            $changed = true;
            continue;
        }

        // +/− factor chips are dropped — Why holds one plain why line per pick.
        // Markdown `- Item name` why-lines are not factor pills; keep them as plain why text.
        $factor = aiChatParseSignedFactorLine($trim);
        if ($factor) {
            $factorText = trim((string)($factor['text'] ?? ''));
            if ($factorText !== '' && (aiChatLooksLikeCatalogItemLine($factorText) || aiChatLooksLikeRecommendItemLine($factorText))) {
                if ($inWhyNamesOnly) {
                    $collectWhyName($factorText);
                } else {
                    $kept = aiChatStripLeadingListMarker($trim);
                    $out[] = $kept !== '' ? $kept : $factorText;
                }
                $changed = true;
                continue;
            }
            $changed = true;
            continue;
        }

        if ($inWhyNamesOnly) {
            $body = aiChatStripLeadingListMarker($trim);
            if ($body !== '') {
                $collectWhyName($body);
                $changed = true;
            }
            continue;
        }

        if (preg_match('/^\s*•\s+/u', $line)) {
            $body = aiChatStripLeadingListMarker($line);
            if ($body !== '') {
                $out[] = $body;
                $changed = true;
            }
            continue;
        }

        // Portfolio total / mix recap / wrap-up sentences are stripped (never a second item dump).
        if (aiChatLooksLikePortfolioTotalLine($trim) || aiChatLooksLikeBudgetAdjustEssay($trim) || aiChatLooksLikeItemRecapHeading($trim)) {
            $changed = true;
            continue;
        }
        if (preg_match('/^(?:These|Those|Anyway|So yeah|Quick take)\b/iu', $trim)) {
            $changed = true;
            continue;
        }

        // Normalize -/* / numbered markers into •
        if (preg_match('/^\s*(?:[-*●○◉▪▫◾∙·‣⁃]|\d+[.)])\s+(.+)$/u', $line, $marked)) {
            $body = trim((string)$marked[1]);
            if ($body !== '') {
                // Numbered/dashed lines that are actually +/− factor chips are dropped.
                if (aiChatParseSignedFactorLine($body)) {
                    $changed = true;
                    continue;
                }
                if (aiChatLooksLikeMetricChipLine($body)) {
                    $misplacedMetricLines[] = $normalizeMetricLine($body);
                    $changed = true;
                    continue;
                }
                $out[] = $body;
                $changed = true;
                continue;
            }
        }

        $bullets = aiChatSplitWhyProseIntoBullets($trim);
        if ($bullets === []) {
            $out[] = $trim;
            $changed = true;
            continue;
        }
        foreach ($bullets as $bullet) {
            if (aiChatParseSignedFactorLine($bullet)) {
                continue;
            }
            $bulletBody = preg_replace('/^\s*•\s+/u', '', $bullet) ?? $bullet;
            if (aiChatLooksLikeMetricChipLine($bulletBody)) {
                $misplacedMetricLines[] = $normalizeMetricLine($bulletBody);
                continue;
            }
            if (aiChatWhyLineNamesCollection($bulletBody)) {
                continue;
            }
            $out[] = $bulletBody;
        }
        $changed = true;
    }

    $flushWhyNames();

    if (!$changed) {
        return $reply;
    }

    $joined = implode("\n", $out);
    $joined = preg_replace("/\n{3,}/u", "\n\n", $joined) ?? $joined;
    $joined = trim($joined);

    if ($misplacedMetricLines !== []) {
        $joined = aiChatAbsorbMetricLinesIntoMetricsSection($joined, $misplacedMetricLines);
    }

    return $joined;
}

/**
 * Whether a Why bullet already cites concrete catalog figures (€ and/or 30d / listings).
 */
function aiChatWhyLineHasCatalogNumbers(string $body): bool
{
    $hasPrice = (bool)preg_match('/(?:€|\$|£)\s*\d/u', $body);
    $hasTrend = (bool)preg_match('/\b(?:30d|7d)\b/iu', $body)
        || (bool)preg_match('/[+\-−]\s*\d+(?:[.,]\d+)?\s*%/u', $body);
    $hasListings = (bool)preg_match('/\b[\d,]+\s+listings?\b/iu', $body)
        || (bool)preg_match('/\b24h\s+vol\b/iu', $body);
    return ($hasPrice && ($hasTrend || $hasListings)) || ($hasTrend && $hasListings);
}

/**
 * Leading item name on a Why bullet (before the first em dash / reason clause).
 */
function aiChatExtractWhyBulletItemName(string $body): string
{
    $body = trim(preg_replace('/^\s*•\s+/u', '', $body) ?? $body);
    $body = trim(preg_replace('/\*\*/u', '', $body) ?? $body);
    if ($body === '') {
        return '';
    }
    $parts = preg_split('/\s+[—–\-]\s+/u', $body, 2);
    $head = trim((string)($parts[0] ?? $body));
    return aiChatSanitizeExtractedItemName($head);
}

/**
 * Build real € / 30d / listings bits for a Why bullet from cards + catalog (never invent).
 *
 * @param list<array<string, mixed>> $items
 * @return list<string>
 */
function aiChatCatalogNumberBitsForWhy(string $name, array $items = []): array
{
    $name = aiChatSanitizeExtractedItemName($name);
    if ($name === '') {
        return [];
    }

    $price = null;
    $listingsForMatch = [];
    foreach ($items as $card) {
        if (!is_array($card)) {
            continue;
        }
        $cardName = trim((string)($card['market_hash_name'] ?? $card['name'] ?? ''));
        if ($cardName === '') {
            continue;
        }
        $cardPrice = 0.0;
        foreach (['cheapest_price', 'price', 'seed_sell_price'] as $key) {
            if (isset($card[$key]) && is_numeric($card[$key]) && (float)$card[$key] > 0) {
                $cardPrice = (float)$card[$key];
                break;
            }
        }
        if ($cardPrice <= 0) {
            continue;
        }
        $aliases = [$cardName, aiChatStripWear($cardName)];
        if (is_array($card['aliases'] ?? null)) {
            foreach ($card['aliases'] as $alias) {
                if (is_string($alias) && trim($alias) !== '') {
                    $aliases[] = trim($alias);
                }
            }
        }
        $listingsForMatch[] = [
            'name' => $cardName,
            'price' => $cardPrice,
            'aliases' => array_values(array_unique($aliases)),
        ];
    }
    $matched = aiChatMatchListingForText($name, $listingsForMatch);
    if (is_array($matched) && (float)($matched['price'] ?? 0) > 0) {
        $price = (float)$matched['price'];
    }

    $resolved = aiChatResolveCatalogCard($name);
    $resolvedName = is_array($resolved) ? trim((string)($resolved['market_hash_name'] ?? '')) : '';
    $tries = array_values(array_unique(array_filter([$name, aiChatStripWear($name), $resolvedName])));
    $change30 = null;
    $listings = null;
    $volume = null;
    $liveBudget = 0;

    foreach ($tries as $try) {
        $row = aiChatLoadPriceRow((string)$try, false, $liveBudget);
        if (!is_array($row)) {
            continue;
        }
        $rowPrice = (float)($row['current_price'] ?? 0);
        if ($price === null && $rowPrice > 0) {
            $price = $rowPrice;
        }
        $history = is_array($row['history'] ?? null) ? $row['history'] : [];
        if ($change30 === null && count($history) >= 4) {
            $baseline = aiChatHistoryBaseline($history, 30, $rowPrice > 0 ? $rowPrice : $price);
            if (is_numeric($baseline['change_pct'] ?? null)) {
                $change30 = (float)$baseline['change_pct'];
            }
        }
        if ($listings === null && isset($row['sell_orders']) && $row['sell_orders'] !== null) {
            $listings = (int)$row['sell_orders'];
        }
        if ($volume === null && isset($row['volume_24h']) && $row['volume_24h'] !== null) {
            $volume = (int)$row['volume_24h'];
        }
        if ($change30 !== null && ($listings !== null || $volume !== null) && $price !== null) {
            break;
        }
    }

    $bits = [];
    if ($price !== null && $price > 0) {
        $bits[] = aiChatFormatEuroAmount($price);
    }
    $tail = [];
    if (is_numeric($change30)) {
        $tail[] = '30d ' . aiChatFormatSignedPct((float)$change30);
    }
    if ($listings !== null && $listings > 0) {
        $tail[] = number_format($listings) . ' listings';
    } elseif ($volume !== null && $volume > 0) {
        $tail[] = '24h vol ' . number_format($volume);
    }
    if ($tail !== []) {
        $bits[] = implode(', ', $tail);
    }
    return $bits;
}

/**
 * Append catalog € / 30d / listings onto Why these picks bullets that lack concrete numbers.
 *
 * @param list<array<string, mixed>> $items
 */
function aiChatEnrichWhyPicksWithCatalogNumbers(string $reply, array $items = []): string
{
    if ($reply === '') {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines) || $lines === []) {
        return $reply;
    }

    $out = [];
    $inWhy = false;
    $changed = false;

    foreach ($lines as $line) {
        $line = (string)$line;

        if (aiChatIsWhyToBuyHeading($line)) {
            $inWhy = true;
            $out[] = $line;
            continue;
        }

        if ($inWhy && aiChatLooksLikeTerminalSectionHeading($line) && !aiChatIsWhyToBuyHeading($line)) {
            $inWhy = false;
            $out[] = $line;
            continue;
        }

        if (!$inWhy) {
            $out[] = $line;
            continue;
        }

        $parsedWhy = aiChatParseListContentLine($line, true);
        if ($parsedWhy === null) {
            $out[] = $line;
            continue;
        }

        $body = $parsedWhy[1];
        if (aiChatWhyLineHasCatalogNumbers($body)) {
            $out[] = $body;
            continue;
        }

        $itemName = aiChatExtractWhyBulletItemName($body);
        if ($itemName === '') {
            $out[] = $body;
            continue;
        }

        $bits = aiChatCatalogNumberBitsForWhy($itemName, $items);
        if ($bits === []) {
            $out[] = $body;
            continue;
        }

        $hasPrice = (bool)preg_match('/(?:€|\$|£)\s*\d/u', $body);
        $hasTrend = (bool)preg_match('/\b(?:30d|7d)\b/iu', $body)
            || (bool)preg_match('/[+\-−]\s*\d+(?:[.,]\d+)?\s*%/u', $body);
        $hasListings = (bool)preg_match('/\b[\d,]+\s+listings?\b/iu', $body)
            || (bool)preg_match('/\b24h\s+vol\b/iu', $body);

        $toAdd = [];
        foreach ($bits as $bit) {
            if (preg_match('/^(?:€|\$|£)/u', $bit)) {
                if (!$hasPrice) {
                    $toAdd[] = $bit;
                }
                continue;
            }
            // Combined "30d …, N listings" / "24h vol …"
            $piece = $bit;
            if ($hasTrend) {
                $piece = preg_replace('/\b30d\s+[+\-−]?\d+(?:[.,]\d+)?%\s*,?\s*/iu', '', $piece) ?? $piece;
                $piece = preg_replace('/\b7d\s+[+\-−]?\d+(?:[.,]\d+)?%\s*,?\s*/iu', '', $piece) ?? $piece;
            }
            if ($hasListings) {
                $piece = preg_replace('/\b[\d,]+\s+listings?\b/iu', '', $piece) ?? $piece;
                $piece = preg_replace('/\b24h\s+vol\s+[\d,]+\b/iu', '', $piece) ?? $piece;
            }
            $piece = trim($piece, " \t,;—–\-");
            if ($piece !== '') {
                $toAdd[] = $piece;
            }
        }

        if ($toAdd === []) {
            $out[] = $body;
            continue;
        }

        $suffix = implode(' — ', $toAdd);
        $out[] = rtrim($body, " \t—–\-") . ' — ' . $suffix;
        $changed = true;
    }

    if (!$changed) {
        return $reply;
    }

    $joined = implode("\n", $out);
    $joined = preg_replace("/\n{3,}/u", "\n\n", $joined) ?? $joined;
    return trim($joined);
}

/**
 * Invest/portfolio body order: ### AI market → ### Items to buy → ### Why these picks.
 * Leaves Metrics / other strips where they are relative to the insertion point.
 */
function aiChatReorderInvestBodySections(string $reply): string
{
    if ($reply === '') {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines) || $lines === []) {
        return $reply;
    }

    $n = count($lines);

    /** @var list<array{key:string,start:int,end:int,lines:list<string>}> $blocks */
    $blocks = [];
    $i = 0;
    while ($i < $n) {
        $start = $i;
        $key = 'chunk';
        if (aiChatIsMarketVerdictHeading((string)$lines[$i])) {
            $key = 'verdict';
        } elseif (preg_match('/^#{1,6}\s*key\s+factors\b/iu', trim((string)$lines[$i]))) {
            $key = 'factors';
        } elseif (aiChatIsItemsToBuyHeading((string)$lines[$i])) {
            $key = 'items';
        } elseif (aiChatIsWhyToBuyHeading((string)$lines[$i])) {
            $key = 'why';
        } elseif (aiChatLooksLikeTerminalSectionHeading((string)$lines[$i])) {
            $key = 'other';
        }

        $i++;
        if ($key !== 'chunk') {
            while ($i < $n && !aiChatLooksLikeTerminalSectionHeading((string)$lines[$i])) {
                $i++;
            }
            $blocks[] = [
                'key' => $key,
                'start' => $start,
                'end' => $i,
                'lines' => array_slice($lines, $start, $i - $start),
            ];
            continue;
        }

        while ($i < $n && !aiChatLooksLikeTerminalSectionHeading((string)$lines[$i])) {
            $i++;
        }
        $chunkLines = array_slice($lines, $start, $i - $start);

        // Split orphan catalog pick bullets out of a preamble chunk.
        $preamble = [];
        $picks = [];
        $pickStart = null;
        foreach ($chunkLines as $offset => $line) {
            $trim = trim((string)$line);
            $body = preg_replace('/^\s*•\s+/u', '', $trim) ?? $trim;
            $isPick = $trim !== ''
                && preg_match('/^\s*•\s+/u', (string)$line)
                && (aiChatLooksLikeCatalogItemLine($body) || aiChatLooksLikeRecommendItemLine($body));
            if ($isPick) {
                if ($pickStart === null) {
                    $pickStart = $start + (int)$offset;
                }
                $picks[] = $line;
                continue;
            }
            if ($picks !== [] && $trim === '') {
                // Keep blank lines inside the pick cluster until a non-pick resumes.
                $picks[] = $line;
                continue;
            }
            if ($picks !== []) {
                // Non-pick after picks — treat as trailing preamble after items.
                $preamble[] = $line;
                continue;
            }
            $preamble[] = $line;
        }

        if ($preamble !== [] && $picks === []) {
            $blocks[] = [
                'key' => 'preamble',
                'start' => $start,
                'end' => $i,
                'lines' => $preamble,
            ];
        } elseif ($picks !== []) {
            // Preamble lines before the first pick stay in place as preamble.
            $beforePicks = [];
            $afterPicks = [];
            $seenPick = false;
            foreach ($chunkLines as $line) {
                $trim = trim((string)$line);
                $body = preg_replace('/^\s*•\s+/u', '', $trim) ?? $trim;
                $isPick = $trim !== ''
                    && preg_match('/^\s*•\s+/u', (string)$line)
                    && (aiChatLooksLikeCatalogItemLine($body) || aiChatLooksLikeRecommendItemLine($body));
                if ($isPick) {
                    $seenPick = true;
                    continue;
                }
                if (!$seenPick) {
                    $beforePicks[] = $line;
                } elseif ($trim !== '') {
                    $afterPicks[] = $line;
                }
            }
            while ($picks !== [] && trim((string)end($picks)) === '') {
                array_pop($picks);
            }
            if ($beforePicks !== []) {
                $blocks[] = [
                    'key' => 'preamble',
                    'start' => $start,
                    'end' => $pickStart ?? $start,
                    'lines' => $beforePicks,
                ];
            }
            $blocks[] = [
                'key' => 'items',
                'start' => $pickStart ?? $start,
                'end' => $i - count($afterPicks),
                'lines' => array_merge(['### Items to buy', ''], $picks),
            ];
            if ($afterPicks !== []) {
                $blocks[] = [
                    'key' => 'preamble',
                    'start' => $i - count($afterPicks),
                    'end' => $i,
                    'lines' => $afterPicks,
                ];
            }
        }
    }

    $byKey = [];
    foreach ($blocks as $idx => $block) {
        $key = (string)($block['key'] ?? '');
        if (($key === 'verdict' || $key === 'factors' || $key === 'items' || $key === 'why') && !isset($byKey[$key])) {
            $byKey[$key] = $idx;
        }
    }

    if (count($byKey) < 2) {
        return $reply;
    }

    // Key factors stays glued under AI SENTIMENT; the buy list and its why
    // lines follow — not the other way round.
    $orderKeys = ['verdict', 'factors', 'items', 'why'];
    $present = [];
    foreach ($orderKeys as $key) {
        if (isset($byKey[$key])) {
            $present[] = $key;
        }
    }

    $alreadyOrdered = true;
    $lastPos = -1;
    foreach ($present as $key) {
        $pos = (int)$byKey[$key];
        if ($pos < $lastPos) {
            $alreadyOrdered = false;
            break;
        }
        $lastPos = $pos;
    }

    $itemsBlock = isset($byKey['items']) ? ($blocks[$byKey['items']] ?? null) : null;
    $needsItemsHeading = is_array($itemsBlock)
        && isset($itemsBlock['lines'][0])
        && !aiChatIsItemsToBuyHeading((string)$itemsBlock['lines'][0])
        && str_starts_with(trim((string)$itemsBlock['lines'][0]), '### Items to buy');
    // Synthetic items always start with ### Items to buy — detect by whether original line at start was a heading.
    if (is_array($itemsBlock)) {
        $origStart = (int)($itemsBlock['start'] ?? -1);
        $origLine = ($origStart >= 0 && $origStart < $n) ? (string)$lines[$origStart] : '';
        $needsItemsHeading = $origLine !== '' && !aiChatIsItemsToBuyHeading($origLine);
    }

    if ($alreadyOrdered && !$needsItemsHeading) {
        return $reply;
    }

    $insertAt = null;
    foreach ($present as $key) {
        $pos = (int)$blocks[$byKey[$key]]['start'];
        if ($insertAt === null || $pos < $insertAt) {
            $insertAt = $pos;
        }
    }
    if ($insertAt === null) {
        return $reply;
    }

    $remove = [];
    foreach ($present as $key) {
        $sec = $blocks[$byKey[$key]];
        for ($j = (int)$sec['start']; $j < (int)$sec['end']; $j++) {
            $remove[$j] = true;
        }
    }

    $bodyBlocks = [];
    foreach ($orderKeys as $key) {
        if (!isset($byKey[$key])) {
            continue;
        }
        $block = $blocks[$byKey[$key]]['lines'];
        if ($key === 'verdict') {
            $block = aiChatRewriteSentimentHeadingBlock($block);
        } elseif ($key === 'items') {
            if (!aiChatIsItemsToBuyHeading((string)($block[0] ?? '')) && trim((string)($block[0] ?? '')) !== '### Items to buy') {
                array_unshift($block, '### Items to buy', '');
            } else {
                $block[0] = '### Items to buy';
            }
        } elseif ($key === 'why') {
            $block[0] = '### Why these picks';
        }
        while ($block !== [] && trim((string)end($block)) === '') {
            array_pop($block);
        }
        $bodyBlocks[] = $block;
    }

    $out = [];
    $inserted = false;
    for ($j = 0; $j < $n; $j++) {
        if ($j === $insertAt && !$inserted) {
            foreach ($bodyBlocks as $bi => $block) {
                if ($bi > 0 || $out !== []) {
                    // Ensure a blank line between body parts / preamble.
                    if ($out !== [] && trim((string)end($out)) !== '') {
                        $out[] = '';
                    }
                }
                foreach ($block as $line) {
                    $out[] = $line;
                }
            }
            if ($out !== [] && trim((string)end($out)) !== '') {
                $out[] = '';
            }
            $inserted = true;
        }
        if (isset($remove[$j])) {
            continue;
        }
        $out[] = $lines[$j];
    }
    if (!$inserted) {
        if ($out !== [] && trim((string)end($out)) !== '') {
            $out[] = '';
        }
        foreach ($bodyBlocks as $bi => $block) {
            if ($bi > 0) {
                $out[] = '';
            }
            foreach ($block as $line) {
                $out[] = $line;
            }
        }
    }

    $joined = implode("\n", $out);
    $joined = preg_replace("/\n{3,}/u", "\n\n", $joined) ?? $joined;
    return trim($joined);
}

/**
 * Item metrics → ### AI SENTIMENT / ### AI market.
 * Moves a top-of-reply outlook/sentiment strip to sit immediately under Item metrics.
 */
function aiChatPlaceSentimentAfterMetrics(string $reply): string
{
    if ($reply === '') {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines) || $lines === []) {
        return $reply;
    }

    $n = count($lines);
    $verdictStart = null;
    $verdictEnd = null;
    $metricsLast = null;
    $current = 'body';

    for ($i = 0; $i < $n; $i++) {
        $line = (string)$lines[$i];
        if (aiChatIsMarketVerdictHeading($line)) {
            $current = 'verdict';
            if ($verdictStart === null) {
                $verdictStart = $i;
            }
        } elseif (aiChatIsItemsToBuyHeading($line) || aiChatIsWhyToBuyHeading($line) || aiChatIsCollectionsToWatchHeading($line)) {
            if ($current === 'verdict' && $verdictEnd === null) {
                $verdictEnd = $i;
            }
            $current = 'other';
        } elseif (aiChatIsNamedTerminalSectionHeading($line)) {
            $heading = aiChatPlainSectionHeading($line);
            if ($current === 'verdict' && $verdictEnd === null && !preg_match('/^(?:AI market(?: verdict)?|AI sentiment|Market outlook)\b/iu', $heading)) {
                $verdictEnd = $i;
            }
            if (preg_match('/^(?:item )?metrics$/iu', $heading)) {
                $current = 'metrics';
            } elseif (!aiChatIsMarketVerdictHeading($line)) {
                $current = 'other';
            }
        }
        if ($current === 'metrics') {
            $metricsLast = $i;
        }
        if ($current === 'verdict') {
            $verdictEnd = $i + 1;
        }
    }

    if ($verdictStart === null) {
        return $reply;
    }
    if ($verdictEnd === null || $verdictEnd <= $verdictStart) {
        $verdictEnd = $n;
    }

    $insertAt = $metricsLast !== null ? ($metricsLast + 1) : null;
    if ($insertAt === null || $insertAt === $verdictStart) {
        return $reply;
    }

    $onlyBlanks = true;
    $lo = min($insertAt, $verdictStart);
    $hi = max($insertAt, $verdictStart);
    for ($j = $lo; $j < $hi; $j++) {
        if (trim((string)$lines[$j]) !== '') {
            $onlyBlanks = false;
            break;
        }
    }
    if ($onlyBlanks && $verdictStart >= $insertAt) {
        return $reply;
    }

    $block = array_slice($lines, $verdictStart, $verdictEnd - $verdictStart);
    while ($block !== [] && trim((string)end($block)) === '') {
        array_pop($block);
    }
    if ($block === []) {
        return $reply;
    }
    if (isset($block[0]) && aiChatIsMarketVerdictHeading((string)$block[0])) {
        $block = aiChatRewriteSentimentHeadingBlock($block);
    }

    $out = [];
    $inserted = false;
    for ($i = 0; $i < $n; $i++) {
        if ($i === $insertAt && !$inserted) {
            if ($out !== [] && trim((string)end($out)) !== '') {
                $out[] = '';
            }
            foreach ($block as $row) {
                $out[] = $row;
            }
            $out[] = '';
            $inserted = true;
        }
        if ($i >= $verdictStart && $i < $verdictEnd) {
            continue;
        }
        $out[] = $lines[$i];
    }
    if (!$inserted) {
        if ($out !== [] && trim((string)end($out)) !== '') {
            $out[] = '';
        }
        foreach ($block as $row) {
            $out[] = $row;
        }
    }

    $joined = implode("\n", $out);
    $joined = preg_replace("/\n{3,}/u", "\n\n", $joined) ?? $joined;
    return trim($joined);
}

/**
 * Item metrics → ### AI SENTIMENT → ### Collections to watch → Items → Why.
 * Lifts a collections-first insert (including a "(shortlist)" heading) to sit after the outlook strip.
 */
function aiChatPlaceCollectionsWatchAfterOutlook(string $reply): string
{
    if ($reply === '') {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines) || $lines === []) {
        return $reply;
    }

    $n = count($lines);
    $sectionOf = [];
    $current = 'body';
    for ($i = 0; $i < $n; $i++) {
        $line = (string)$lines[$i];
        if (aiChatIsMarketVerdictHeading($line)) {
            $current = 'verdict';
        } elseif (aiChatIsItemsToBuyHeading($line)) {
            $current = 'items';
        } elseif (aiChatIsWhyToBuyHeading($line)) {
            $current = 'why';
        } elseif (aiChatIsCollectionsToWatchHeading($line)) {
            $current = 'collections';
        } elseif (aiChatIsNamedTerminalSectionHeading($line)) {
            $heading = aiChatPlainSectionHeading($line);
            if (preg_match('/^(?:item )?metrics$/iu', $heading)) {
                $current = 'metrics';
            } else {
                $current = 'other';
            }
        }
        $sectionOf[$i] = $current;
    }

    $watchIdx = [];
    $headingEmoji = '';
    $hadHeading = false;
    for ($i = 0; $i < $n; $i++) {
        $sec = (string)($sectionOf[$i] ?? '');
        if ($sec === 'items' || $sec === 'why' || $sec === 'verdict' || $sec === 'metrics') {
            continue;
        }
        $line = (string)$lines[$i];
        if (aiChatIsCollectionsToWatchHeading($line)) {
            $watchIdx[] = $i;
            $hadHeading = true;
            $emoji = aiChatCollectionsToWatchHeadingEmoji($line);
            if ($emoji !== '') {
                $headingEmoji = $emoji;
            }
            continue;
        }
        if (aiChatParseNamedCollectionLine($line) !== null) {
            $watchIdx[] = $i;
        }
    }

    if ($watchIdx === []) {
        return $reply;
    }

    $watchBody = [];
    $seenWatch = [];
    foreach ($watchIdx as $i) {
        $line = (string)$lines[$i];
        if (aiChatIsCollectionsToWatchHeading($line)) {
            continue;
        }
        $parsed = aiChatParseNamedCollectionLine($line);
        if ($parsed === null) {
            continue;
        }
        $key = aiChatNormalizeCollectionKey((string)$parsed['name']);
        if ($key === '') {
            $key = mb_strtolower((string)$parsed['name']);
        }
        if ($key === '' || isset($seenWatch[$key])) {
            continue;
        }
        $seenWatch[$key] = true;
        $watchLine = '**' . $parsed['name'] . '**';
        if ($parsed['reason'] !== '') {
            $watchLine .= ' — ' . $parsed['reason'];
        }
        $watchBody[] = $watchLine;
    }

    if ($watchBody === []) {
        return $reply;
    }

    $heading = aiChatNormalizeCollectionsToWatchHeadingLine($headingEmoji !== '' ? $headingEmoji : '');
    if ($headingEmoji !== '' && !str_contains($heading, $headingEmoji)) {
        $heading = '### Collections to watch ' . $headingEmoji;
    }
    $watchBlock = array_merge([$heading, ''], $watchBody);

    $verdictLast = null;
    $metricsLast = null;
    $itemsFirst = null;
    for ($i = 0; $i < $n; $i++) {
        $sec = (string)($sectionOf[$i] ?? '');
        if ($sec === 'verdict') {
            $verdictLast = $i;
        }
        if ($sec === 'metrics') {
            $metricsLast = $i;
        }
        if ($sec === 'items' && $itemsFirst === null) {
            $itemsFirst = $i;
        }
    }

    $insertAt = 0;
    if ($verdictLast !== null) {
        $insertAt = $verdictLast + 1;
    } elseif ($metricsLast !== null) {
        $insertAt = $metricsLast + 1;
    } elseif ($itemsFirst !== null) {
        $insertAt = $itemsFirst;
    }

    $remove = array_fill_keys($watchIdx, true);
    $alreadyPlaced = true;
    $cursor = $insertAt;
    while ($cursor < $n && trim((string)$lines[$cursor]) === '') {
        $cursor++;
    }
    foreach ($watchIdx as $idx) {
        if ($idx < $insertAt) {
            $alreadyPlaced = false;
            break;
        }
    }
    if ($alreadyPlaced && $hadHeading) {
        $firstWatch = $watchIdx[0];
        $headingLine = (string)$lines[$firstWatch];
        $normalized = aiChatNormalizeCollectionsToWatchHeadingLine($headingLine);
        if ($firstWatch >= $insertAt && $headingLine === $normalized) {
            return $reply;
        }
    }

    $out = [];
    $inserted = false;
    for ($i = 0; $i < $n; $i++) {
        if ($i === $insertAt && !$inserted) {
            if ($out !== [] && trim((string)end($out)) !== '') {
                $out[] = '';
            }
            foreach ($watchBlock as $watchLine) {
                $out[] = $watchLine;
            }
            $out[] = '';
            $inserted = true;
        }
        if (isset($remove[$i])) {
            continue;
        }
        $out[] = $lines[$i];
    }
    if (!$inserted) {
        if ($out !== [] && trim((string)end($out)) !== '') {
            $out[] = '';
        }
        foreach ($watchBlock as $watchLine) {
            $out[] = $watchLine;
        }
    }

    $joined = implode("\n", $out);
    $joined = preg_replace("/\n{3,}/u", "\n\n", $joined) ?? $joined;
    return trim($joined);
}

/**
 * Fold metric chips found outside the strip back into ### Item metrics.
 *
 * @param list<string> $metricLines
 */
function aiChatAbsorbMetricLinesIntoMetricsSection(string $reply, array $metricLines): string
{
    return aiChatRebuildItemMetricsSection($reply, $metricLines);
}

/**
 * When the user asked for souvenirs, rewrite eligible skin picks to Souvenir …
 * and drop regular skins / stickers / cases that are not souvenir.
 */
/**
 * Scope-correct refill for a pick list that scope enforcement just emptied.
 * Without it the reply reaches the generic invest fallback, which answers a
 * capsule / charm / souvenir ask with a list of gun skins.
 *
 * @param list<string> $out
 */
/**
 * True when the lines already carry at least one pick — a • catalog bullet or a
 * "**Name** — why" line under a Why heading — so no catalog refill is needed.
 *
 * @param list<string> $lines
 */
function aiChatLinesCarryAnyPick(array $lines): bool
{
    $inWhy = false;
    foreach ($lines as $line) {
        $trim = trim((string)$line);
        if ($trim === '') {
            continue;
        }
        if (aiChatIsWhyToBuyHeading($trim)) {
            $inWhy = true;
            continue;
        }
        if (preg_match('/^#{1,6}\s+/u', $trim)) {
            $inWhy = false;
            continue;
        }
        if (preg_match('/^•\s+(.+)$/u', $trim, $m)) {
            $body = (string)$m[1];
            if (aiChatLooksLikeCatalogItemLine($body) || aiChatLooksLikeRecommendItemLine($body)) {
                return true;
            }
        }
        if ($inWhy && preg_match('/^\*\*[^*]{3,}\*\*\s*[—–-]\s*\S/u', $trim)) {
            return true;
        }
    }
    return false;
}

function aiChatRefillEmptiedPicks(array $out, string $userMessage, bool $hasItemsHeading): string
{
    // The model already named picks (possibly only under Why) — padding in
    // catalog names it never mentioned is what made answers feel canned.
    if (aiChatLinesCarryAnyPick($out) || preg_match('/[\w\-]+\s*\|\s*\S/u', $userMessage)) {
        return implode("\n", $out);
    }
    $refill = aiChatCategoryRefillNames($userMessage, 5);
    if ($refill === []) {
        return implode("\n", $out);
    }

    $itemLines = [];
    $whyLines = [];
    foreach ($refill as $pick) {
        $itemLines[] = '• **' . $pick . '**';
        $why = aiChatFallbackWhyPickReason($pick);
        $whyLines[] = '**' . $pick . '**' . ($why !== '' ? ' — ' . $why : '');
    }

    if (!$hasItemsHeading) {
        $out[] = '';
        $out[] = '### Items to buy';
        $out[] = '';
    }

    $spliced = [];
    $injectedItems = false;
    $injectedWhy = false;
    foreach ($out as $line) {
        $spliced[] = $line;
        $trim = trim((string)$line);
        if (
            !$injectedItems
            && (preg_match('/^#{1,6}\s+Items to buy\b/iu', $trim) || preg_match('/^Items to buy\b/iu', aiChatPlainSectionHeading($trim)))
        ) {
            foreach ($itemLines as $itemLine) {
                $spliced[] = $itemLine;
            }
            $injectedItems = true;
        }
        if (!$injectedWhy && aiChatIsWhyToBuyHeading($trim)) {
            foreach ($whyLines as $whyLine) {
                $spliced[] = $whyLine;
            }
            $injectedWhy = true;
        }
    }
    if (!$injectedWhy) {
        $spliced[] = '';
        $spliced[] = '### Why these picks';
        $spliced[] = '';
        foreach ($whyLines as $whyLine) {
            $spliced[] = $whyLine;
        }
    }

    return implode("\n", $spliced);
}

function aiChatEnforceSouvenirReplyPicks(string $reply, string $userMessage): string
{
    if ($reply === '' || aiChatRequestedCardScope($userMessage)['type'] !== 'souvenir') {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }

    $out = [];
    $inItems = false;
    $inWhy = false;
    $hasItemsHeading = false;
    $keptItems = 0;
    $droppedItems = 0;
    foreach ($lines as $line) {
        $line = (string)$line;
        $trim = trim($line);
        if (preg_match('/^#{1,6}\s+Items to buy\b/iu', $trim) || preg_match('/^Items to buy\b/iu', aiChatPlainSectionHeading($trim))) {
            $inItems = true;
            $inWhy = false;
            $hasItemsHeading = true;
            $out[] = $line;
            continue;
        }
        if (aiChatIsWhyToBuyHeading($trim)) {
            $inItems = false;
            $inWhy = true;
            $out[] = $line;
            continue;
        }
        if (($inItems || $inWhy) && preg_match('/^#{1,6}\s+/u', $trim) && !aiChatIsWhyToBuyHeading($trim)) {
            $inItems = false;
            $inWhy = false;
            $out[] = $line;
            continue;
        }

        if (!($inItems || $inWhy)) {
            $out[] = $line;
            continue;
        }
        $parsed = aiChatParseListContentLine($line, $inWhy && !$inItems);
        if ($parsed === null) {
            $out[] = $line;
            continue;
        }

        $indent = (string)$parsed[0];
        $body = trim((string)$parsed[1]);
        $hadBullet = (bool)$parsed[2];
        $prefix = $hadBullet ? ($indent . '• ') : $indent;
        $name = '';
        $rest = '';
        if (preg_match('/^(.+?)\s*[—–]\s*(.*)$/u', $body, $parts)) {
            $name = trim((string)$parts[1]);
            $rest = trim((string)$parts[2]);
        } elseif (preg_match('/^(.+?)\s+((?:€|\$|£)\s*\d[\d.,]*.*)$/u', $body, $parts)) {
            $name = trim((string)$parts[1]);
            $rest = trim((string)$parts[2]);
        } else {
            // Bare "• Name" bullets must be scope-checked too, not waved through.
            $name = $body;
            $rest = '';
        }

        $namePlain = trim((string)preg_replace('/^\*\*(.+)\*\*$/u', '$1', $name));
        $namePlain = trim($namePlain, " \t*");
        if ($namePlain === '' || preg_match('/^(?:Portfolio\s+total|Total)\b/iu', $namePlain)) {
            $out[] = $line;
            continue;
        }

        if ($inWhy && !$inItems && aiChatIsWhyThemeLabel($namePlain, '', [])) {
            $out[] = $line;
            continue;
        }

        if (aiChatIsExplicitSouvenirName($namePlain) || preg_match('/\bSouvenir Package\b/iu', $namePlain)) {
            $keptItems += $inItems ? 1 : 0;
            $out[] = $line;
            continue;
        }

        if (aiChatIsSouvenirScopedItem($namePlain)) {
            $souvenirName = aiChatToSouvenirMarketName($namePlain);
            if ($souvenirName === '' || $souvenirName === $namePlain) {
                $droppedItems += $inItems ? 1 : 0;
                continue;
            }
            $keptItems += $inItems ? 1 : 0;
            $bold = '**' . $souvenirName . '**';
            $out[] = $rest !== ''
                ? ($prefix . $bold . ' — ' . $rest)
                : ($prefix . $bold);
            continue;
        }

        // Drop non-souvenir picks (regular stickers, cases, StatTrak, etc.).
        $droppedItems += $inItems ? 1 : 0;
    }

    if ($keptItems > 0 || ($droppedItems === 0 && !$hasItemsHeading)) {
        return implode("\n", $out);
    }

    return aiChatRefillEmptiedPicks($out, $userMessage, $hasItemsHeading);
}

/**
 * When the user asked for stickers/capsules, keep only catalog sticker or capsule
 * picks and drop weapon cases / gun skins (even if the model appends "Sticker").
 */
function aiChatEnforceStickerCapsuleReplyPicks(string $reply, string $userMessage): string
{
    $scopeType = aiChatRequestedCardScope($userMessage)['type'];
    if ($reply === '' || !aiChatIsStickerCardScope($scopeType)) {
        return $reply;
    }
    $capsulesOnly = $scopeType === 'sticker_capsule';

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }

    $out = [];
    $inItems = false;
    $inWhy = false;
    $hasItemsHeading = false;
    $keptItems = 0;
    $droppedItems = 0;
    foreach ($lines as $line) {
        $line = (string)$line;
        $trim = trim($line);
        if (preg_match('/^Items to buy\b/iu', aiChatPlainSectionHeading($trim))) {
            $inItems = true;
            $inWhy = false;
            $hasItemsHeading = true;
            $out[] = $line;
            continue;
        }
        if (aiChatIsWhyToBuyHeading($trim)) {
            $inItems = false;
            $inWhy = true;
            $out[] = $line;
            continue;
        }
        if (
            ($inItems || $inWhy)
            && preg_match('/^#{1,6}\s+/u', $trim)
            && !aiChatIsWhyToBuyHeading($trim)
            && !preg_match('/^Items to buy\b/iu', aiChatPlainSectionHeading($trim))
        ) {
            $inItems = false;
            $inWhy = false;
            $out[] = $line;
            continue;
        }

        if (!($inItems || $inWhy)) {
            $out[] = $line;
            continue;
        }
        $parsed = aiChatParseListContentLine($line, $inWhy && !$inItems);
        if ($parsed === null) {
            $out[] = $line;
            continue;
        }

        $indent = (string)$parsed[0];
        $body = trim((string)$parsed[1]);
        $hadBullet = (bool)$parsed[2];
        $prefix = $hadBullet ? ($indent . '• ') : $indent;
        $name = '';
        $rest = '';
        if (preg_match('/^(.+?)\s*[—–]\s*(.*)$/u', $body, $parts)) {
            $name = trim((string)$parts[1]);
            $rest = trim((string)$parts[2]);
        } elseif (preg_match('/^(.+?)\s+((?:€|\$|£)\s*\d[\d.,]*.*)$/u', $body, $parts)) {
            $name = trim((string)$parts[1]);
            $rest = trim((string)$parts[2]);
        } else {
            // A bare "• AK-47 | Redline (Field-Tested)" bullet still has to be
            // scope-checked — skipping it here is how gun skins reached a capsule ask.
            $name = $body;
            $rest = '';
        }

        $namePlain = trim((string)preg_replace('/^\*\*(.+)\*\*$/u', '$1', $name));
        $namePlain = trim($namePlain, " \t*");
        if ($namePlain === '' || preg_match('/^(?:Portfolio\s+total|Total)\b/iu', $namePlain)) {
            $out[] = $line;
            continue;
        }

        if ($inWhy && !$inItems && aiChatIsWhyThemeLabel($namePlain, '', [])) {
            $out[] = $line;
            continue;
        }

        if (
            aiChatIsWeaponCaseItem($namePlain)
            || aiChatLooksLikeGunSkinName($namePlain)
            || aiChatCatalogItemKind($namePlain) === 'skin'
        ) {
            $droppedItems += $inItems ? 1 : 0;
            continue;
        }

        $resolved = aiChatResolveStickerPickName($namePlain, $capsulesOnly);
        if (
            $resolved === null
            || aiChatIsWeaponCaseItem($resolved)
            || aiChatLooksLikeGunSkinName($resolved)
            || !aiChatIsStickerScopedItem($resolved, $capsulesOnly)
        ) {
            $droppedItems += $inItems ? 1 : 0;
            continue;
        }

        $keptItems += $inItems ? 1 : 0;
        if (mb_strtolower($resolved) !== mb_strtolower($namePlain)) {
            $bold = '**' . $resolved . '**';
            $out[] = $rest !== ''
                ? ($prefix . $bold . ' — ' . $rest)
                : ($prefix . $bold);
            continue;
        }

        $out[] = $line;
    }

    if ($keptItems > 0 || ($droppedItems === 0 && !$hasItemsHeading)) {
        return implode("\n", $out);
    }

    return aiChatRefillEmptiedPicks($out, $userMessage, $hasItemsHeading);
}

/**
 * When the user asked for charms, keep only Charm | / Souvenir Charm | picks and drop gun skins.
 */
function aiChatEnforceCharmReplyPicks(string $reply, string $userMessage): string
{
    if ($reply === '' || aiChatRequestedCardScope($userMessage)['type'] !== 'charm') {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }

    $out = [];
    $inItems = false;
    $inWhy = false;
    $hasItemsHeading = false;
    $keptItems = 0;
    $droppedItems = 0;
    foreach ($lines as $line) {
        $line = (string)$line;
        $trim = trim($line);
        if (preg_match('/^#{1,6}\s+Items to buy\b/iu', $trim) || preg_match('/^Items to buy\b/iu', aiChatPlainSectionHeading($trim))) {
            $inItems = true;
            $inWhy = false;
            $hasItemsHeading = true;
            $out[] = $line;
            continue;
        }
        if (aiChatIsWhyToBuyHeading($trim)) {
            $inItems = false;
            $inWhy = true;
            $out[] = $line;
            continue;
        }
        if (($inItems || $inWhy) && preg_match('/^#{1,6}\s+/u', $trim) && !aiChatIsWhyToBuyHeading($trim)) {
            $inItems = false;
            $inWhy = false;
            $out[] = $line;
            continue;
        }

        if (!($inItems || $inWhy)) {
            $out[] = $line;
            continue;
        }
        $parsed = aiChatParseListContentLine($line, $inWhy && !$inItems);
        if ($parsed === null) {
            $out[] = $line;
            continue;
        }

        $indent = (string)$parsed[0];
        $body = trim((string)$parsed[1]);
        $hadBullet = (bool)$parsed[2];
        $prefix = $hadBullet ? ($indent . '• ') : $indent;
        $name = '';
        $rest = '';
        if (preg_match('/^(.+?)\s*[—–]\s*(.*)$/u', $body, $parts)) {
            $name = trim((string)$parts[1]);
            $rest = trim((string)$parts[2]);
        } elseif (preg_match('/^(.+?)\s+((?:€|\$|£)\s*\d[\d.,]*.*)$/u', $body, $parts)) {
            $name = trim((string)$parts[1]);
            $rest = trim((string)$parts[2]);
        } else {
            // Bare "• Name" bullets must be scope-checked too, not waved through.
            $name = $body;
            $rest = '';
        }

        $namePlain = trim((string)preg_replace('/^\*\*(.+)\*\*$/u', '$1', $name));
        $namePlain = trim($namePlain, " \t*");
        if ($namePlain === '' || preg_match('/^(?:Portfolio\s+total|Total)\b/iu', $namePlain)) {
            $out[] = $line;
            continue;
        }

        if ($inWhy && !$inItems && aiChatIsWhyThemeLabel($namePlain, '', [])) {
            $out[] = $line;
            continue;
        }

        $resolved = aiChatResolveCharmPickName($namePlain);
        if ($resolved === null || !aiChatIsCharmItem($resolved)) {
            $droppedItems += $inItems ? 1 : 0;
            continue;
        }

        $keptItems += $inItems ? 1 : 0;
        if (mb_strtolower($resolved) !== mb_strtolower($namePlain)) {
            $bold = '**' . $resolved . '**';
            $out[] = $rest !== ''
                ? ($prefix . $bold . ' — ' . $rest)
                : ($prefix . $bold);
            continue;
        }

        $out[] = $line;
    }

    if ($keptItems > 0 || ($droppedItems === 0 && !$hasItemsHeading)) {
        return implode("\n", $out);
    }

    return aiChatRefillEmptiedPicks($out, $userMessage, $hasItemsHeading);
}

/**
 * When the user asked for collections to invest in, drop skins that belong to
 * other (or untracked case) origins so cards stay inside the named collections.
 */
function aiChatEnforceCollectionReplyPicks(string $reply, string $userMessage): string
{
    if ($reply === '' || aiChatRequestedCardScope($userMessage)['type'] !== 'collection') {
        return $reply;
    }

    $named = aiChatCollectionsNamedInReply($reply);
    $namedKeys = [];
    foreach ($named as $collection) {
        $key = aiChatNormalizeCollectionKey((string)$collection);
        if ($key !== '') {
            $namedKeys[$key] = true;
        }
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }

    $out = [];
    $inItems = false;
    $inWhy = false;
    $keptPicks = 0;
    foreach ($lines as $line) {
        $line = (string)$line;
        $trim = trim($line);
        if (preg_match('/^#{1,6}\s+Items to buy\b/iu', $trim)) {
            $inItems = true;
            $inWhy = false;
            $out[] = $line;
            continue;
        }
        if (aiChatIsWhyToBuyHeading($trim)) {
            $inItems = false;
            $inWhy = true;
            $out[] = $line;
            continue;
        }
        if (($inItems || $inWhy) && preg_match('/^#{1,6}\s+/u', $trim) && !aiChatIsWhyToBuyHeading($trim)) {
            $inItems = false;
            $inWhy = false;
            $out[] = $line;
            continue;
        }

        if (!($inItems || $inWhy)) {
            $out[] = $line;
            continue;
        }
        $parsed = aiChatParseListContentLine($line, $inWhy && !$inItems);
        if ($parsed === null) {
            $out[] = $line;
            continue;
        }

        $body = trim((string)$parsed[1]);
        $name = '';
        if (preg_match('/^(.+?)\s*[—–]\s*(.*)$/u', $body, $parts)) {
            $name = trim((string)$parts[1]);
        } elseif (preg_match('/^(.+?)\s+((?:€|\$|£)\s*\d[\d.,]*.*)$/u', $body, $parts)) {
            $name = trim((string)$parts[1]);
        } else {
            $name = $body;
        }

        $namePlain = trim((string)preg_replace('/^\*\*(.+)\*\*$/u', '$1', $name));
        $namePlain = trim($namePlain, " \t*");
        if ($namePlain === '' || preg_match('/^(?:Portfolio\s+total|Total)\b/iu', $namePlain)) {
            $out[] = $line;
            continue;
        }

        if ($inWhy && aiChatIsWhyThemeLabel($namePlain, '', [])) {
            $out[] = $line;
            continue;
        }

        if (aiChatIsWeaponCaseItem($namePlain) || aiChatIsStickerCapsuleItem($namePlain)) {
            continue;
        }

        $origin = aiChatSkinOriginName($namePlain);
        $canon = $origin !== '' ? aiChatCanonicalTrackedCollection($origin) : '';
        if ($origin !== '' && $canon === '') {
            continue;
        }
        if ($namedKeys !== [] && $canon !== '') {
            $originKey = aiChatNormalizeCollectionKey($canon);
            if ($originKey !== '' && !isset($namedKeys[$originKey])) {
                continue;
            }
        }

        if ($inItems) {
            $keptPicks++;
        }
        $out[] = $line;
    }

    if ($keptPicks < 1) {
        return $reply;
    }

    return implode("\n", $out);
}

function aiChatReplyShouldConstrainCategory(array $scope): bool
{
    $type = (string)($scope['type'] ?? '');
    if ($type === 'souvenir' || $type === 'charm' || $type === 'collection' || aiChatIsStickerCardScope($type)) {
        return false;
    }
    if (aiChatIsEquipmentCategoryScope($type) || $type === 'case') {
        return true;
    }
    if (trim((string)($scope['weapon'] ?? '')) !== '') {
        return true;
    }
    return !empty($scope['stattrak']);
}

/**
 * @return list<string>
 */
function aiChatCategoryRefillNames(string $userMessage, int $limit = 5): array
{
    $scope = aiChatRequestedCardScope($userMessage);
    $budgetEuro = aiChatExtractBudgetEuro($userMessage);
    $names = aiChatDiversifiedInvestCandidates(
        max(5, $limit),
        $scope['weapon'],
        $scope['type'],
        $budgetEuro > 0 ? $budgetEuro : 0.0,
        [],
        null,
        !empty($scope['stattrak'])
    );
    if ($names === []) {
        $names = match ($scope['type']) {
            'gloves' => aiChatDefaultGloveSuggestionNames(),
            'knife' => aiChatDefaultKnifeSuggestionNames(),
            default => [],
        };
    }
    $out = [];
    $seen = [];
    foreach ($names as $name) {
        $name = trim((string)$name);
        if ($name === '' || !aiChatCatalogNameMatchesScope($name, $scope['weapon'], $scope['type'], !empty($scope['stattrak']))) {
            continue;
        }
        $key = mb_strtolower($name);
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $out[] = $name;
        if (count($out) >= $limit) {
            break;
        }
    }
    return $out;
}

/**
 * When the user named a category (gloves, knives, rifles, AK-47, StatTrak, …),
 * keep only matching Items to buy / Why these picks lines. Refill from catalog
 * gloves/knives/etc. if stripping emptied the list — never inject random skins.
 */
function aiChatEnforceCategoryReplyPicks(string $reply, string $userMessage): string
{
    if ($reply === '') {
        return $reply;
    }
    $scope = aiChatRequestedCardScope($userMessage);
    if (!aiChatReplyShouldConstrainCategory($scope)) {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }

    $out = [];
    $inItems = false;
    $inWhy = false;
    $keptItemNames = [];
    $keptWhyNames = [];
    $hasItemsHeading = false;
    $hasWhyHeading = false;
    $weapon = (string)$scope['weapon'];
    $itemType = (string)$scope['type'];
    $wantStatTrak = !empty($scope['stattrak']);

    foreach ($lines as $line) {
        $line = (string)$line;
        $trim = trim($line);
        if (preg_match('/^#{1,6}\s+Items to buy\b/iu', $trim) || preg_match('/^Items to buy\b/iu', aiChatPlainSectionHeading($trim))) {
            $inItems = true;
            $inWhy = false;
            $hasItemsHeading = true;
            $out[] = $line;
            continue;
        }
        if (aiChatIsWhyToBuyHeading($trim)) {
            $inItems = false;
            $inWhy = true;
            $hasWhyHeading = true;
            $out[] = $line;
            continue;
        }
        if (
            ($inItems || $inWhy)
            && preg_match('/^#{1,6}\s+/u', $trim)
            && !aiChatIsWhyToBuyHeading($trim)
            && !preg_match('/^Items to buy\b/iu', aiChatPlainSectionHeading($trim))
        ) {
            $inItems = false;
            $inWhy = false;
            $out[] = $line;
            continue;
        }

        if (!($inItems || $inWhy)) {
            $out[] = $line;
            continue;
        }
        $parsed = aiChatParseListContentLine($line, $inWhy && !$inItems);
        if ($parsed === null) {
            $out[] = $line;
            continue;
        }

        $body = trim((string)$parsed[1]);
        $name = '';
        if (preg_match('/^(.+?)\s*[—–]\s*(.*)$/u', $body, $parts)) {
            $name = trim((string)$parts[1]);
        } elseif (preg_match('/^(.+?)\s+((?:€|\$|£)\s*\d[\d.,]*.*)$/u', $body, $parts)) {
            $name = trim((string)$parts[1]);
        } else {
            $name = $body;
        }

        $namePlain = trim((string)preg_replace('/^\*\*(.+)\*\*$/u', '$1', $name));
        $namePlain = trim($namePlain, " \t*");
        if ($namePlain === '' || preg_match('/^(?:Portfolio\s+total|Total)\b/iu', $namePlain)) {
            $out[] = $line;
            continue;
        }

        if ($inWhy && function_exists('aiChatIsWhyThemeLabel') && aiChatIsWhyThemeLabel($namePlain, '', [])) {
            $out[] = $line;
            continue;
        }

        if (!aiChatCatalogNameMatchesScope($namePlain, $weapon, $itemType, $wantStatTrak)) {
            continue;
        }

        if ($inItems) {
            $keptItemNames[mb_strtolower($namePlain)] = $namePlain;
        } else {
            $keptWhyNames[mb_strtolower($namePlain)] = $namePlain;
        }
        $out[] = $line;
    }

    if ($keptItemNames !== [] || $keptWhyNames !== [] || aiChatLinesCarryAnyPick($out)) {
        return implode("\n", $out);
    }
    // A question about one named item ("Should I buy AK-47 | Redline?") is not a
    // request for a category list — never pad it with unrelated catalog picks.
    if (preg_match('/[\w\-]+\s*\|\s*\S/u', $userMessage)) {
        return implode("\n", $out);
    }

    $refill = aiChatCategoryRefillNames($userMessage, 5);
    if ($refill === []) {
        return implode("\n", $out);
    }

    $itemLines = [];
    $whyLines = [];
    foreach ($refill as $skin) {
        $itemLines[] = '• **' . $skin . '**';
        $whyLines[] = '**' . $skin . '** — ' . aiChatFallbackWhyPickReason($skin);
    }

    if (!$hasItemsHeading) {
        $out[] = '';
        $out[] = '### Items to buy';
        $out[] = '';
    }
    $spliced = [];
    $injectedItems = false;
    $injectedWhy = false;
    foreach ($out as $line) {
        $spliced[] = $line;
        $trim = trim((string)$line);
        if (!$injectedItems && (preg_match('/^#{1,6}\s+Items to buy\b/iu', $trim) || preg_match('/^Items to buy\b/iu', aiChatPlainSectionHeading($trim)))) {
            foreach ($itemLines as $itemLine) {
                $spliced[] = $itemLine;
            }
            $injectedItems = true;
        }
        if (!$injectedWhy && aiChatIsWhyToBuyHeading($trim)) {
            foreach ($whyLines as $whyLine) {
                $spliced[] = $whyLine;
            }
            $injectedWhy = true;
        }
    }
    if (!$injectedWhy) {
        $spliced[] = '';
        $spliced[] = '### Why these picks';
        $spliced[] = '';
        foreach ($whyLines as $whyLine) {
            $spliced[] = $whyLine;
        }
    }

    return implode("\n", $spliced);
}

/**
 * Market-identity key for pick dedupe: lowercase weapon|skin + expanded wear,
 * or the case/capsule/sticker name. FN/Factory New collapse; FT stays distinct.
 */
function aiChatPickIdentityKey(string $name): string
{
    $clean = aiChatNormalizePickCatalogName(aiChatSanitizeExtractedItemName($name));
    $clean = trim((string)preg_replace('/\*+/u', '', $clean));
    $clean = (string)preg_replace('/\bstattrak™\b/iu', 'StatTrak', $clean);
    $clean = (string)preg_replace('/\s*\|\s*/u', ' | ', $clean);
    $clean = trim((string)preg_replace('/\s+/u', ' ', $clean));

    return mb_strtolower($clean);
}

function aiChatLooksLikeFailedDuplicateSelfCorrection(string $line): bool
{
    $plain = trim((string)preg_replace('/\*\*/u', '', $line));
    if ($plain === '') {
        return false;
    }

    return (bool)preg_match('/duplicate\s+line\s+not\s+allowed/iu', $plain);
}

function aiChatExtractReplyPickDisplayName(string $body): string
{
    $body = trim($body);
    if ($body === '') {
        return '';
    }

    $name = $body;
    if (preg_match('/^(.+?)\s*[—–]\s*(.*)$/u', $body, $parts)) {
        $name = trim((string)$parts[1]);
    } elseif (preg_match('/^(.+?)\s+((?:€|\$|£)\s*\d[\d.,]*.*)$/u', $body, $parts)) {
        $name = trim((string)$parts[1]);
    }
    $name = trim((string)preg_replace('/^\*\*(.+)\*\*$/u', '$1', $name));
    $name = trim($name, " \t*");

    return aiChatSanitizeExtractedItemName($name);
}

/**
 * After category filter: keep the first Items to buy / Why these picks line
 * per market identity; drop later copies and failed "duplicate line not allowed" self-corrections.
 */
function aiChatDeduplicateReplyPicks(string $reply): string
{
    if ($reply === '') {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }

    $out = [];
    $inItems = false;
    $inWhy = false;
    $seenItems = [];
    $seenWhy = [];

    foreach ($lines as $line) {
        $line = (string)$line;
        $trim = trim($line);

        if (aiChatIsItemsToBuyHeading($line) || preg_match('/^#{1,6}\s+Items to buy\b/iu', $trim)) {
            $inItems = true;
            $inWhy = false;
            $out[] = $line;
            continue;
        }
        if (aiChatIsWhyToBuyHeading($trim)) {
            $inItems = false;
            $inWhy = true;
            $out[] = $line;
            continue;
        }
        if (
            ($inItems || $inWhy)
            && preg_match('/^#{1,6}\s+/u', $trim)
            && !aiChatIsWhyToBuyHeading($trim)
            && !aiChatIsItemsToBuyHeading($line)
            && !preg_match('/^Items to buy\b/iu', aiChatPlainSectionHeading($trim))
        ) {
            $inItems = false;
            $inWhy = false;
            $out[] = $line;
            continue;
        }

        if (!($inItems || $inWhy)) {
            $out[] = $line;
            continue;
        }

        if ($trim === '') {
            $out[] = $line;
            continue;
        }

        if (aiChatLooksLikeFailedDuplicateSelfCorrection($line)) {
            continue;
        }

        $parsed = aiChatParseListContentLine($line, $inWhy && !$inItems);
        if ($parsed === null) {
            $out[] = $line;
            continue;
        }

        $body = trim((string)$parsed[1]);
        $namePlain = aiChatExtractReplyPickDisplayName($body);
        if ($namePlain === '' || preg_match('/^(?:Portfolio\s+total|Total)\b/iu', $namePlain)) {
            $out[] = $line;
            continue;
        }

        $hasWhyReason = (bool)preg_match('/\s*[—–]\s+\S/u', $body);
        if ($inWhy && !$hasWhyReason && function_exists('aiChatIsWhyThemeLabel') && aiChatIsWhyThemeLabel($namePlain, '', [])) {
            $out[] = $line;
            continue;
        }

        $key = aiChatPickIdentityKey($namePlain);
        if ($key === '') {
            $out[] = $line;
            continue;
        }

        if ($inItems) {
            if (isset($seenItems[$key])) {
                continue;
            }
            $seenItems[$key] = true;
        } else {
            if (isset($seenWhy[$key])) {
                continue;
            }
            $seenWhy[$key] = true;
        }

        $out[] = $line;
    }

    return implode("\n", $out);
}

/**
 * Strip CJK Unified Ideographs / Hiragana / Katakana / Hangul mixed into Latin-majority replies.
 * Preserves punctuation, €, and Latin item names. Leaves pure/CJK-majority replies untouched
 * so an intentional Chinese/Japanese/Korean answer is not emptied.
 */
function aiChatStripUnexpectedCjk(string $reply): string
{
    if ($reply === '' || !preg_match('/\p{Han}|\p{Hiragana}|\p{Katakana}|\p{Hangul}/u', $reply)) {
        return $reply;
    }

    $cjkCount = preg_match_all('/\p{Han}|\p{Hiragana}|\p{Katakana}|\p{Hangul}/u', $reply) ?: 0;
    $latinCount = preg_match_all('/[A-Za-z]/u', $reply) ?: 0;

    // Pure or CJK-majority text — do not blank the reply.
    if ($latinCount === 0 || $cjkCount >= $latinCount) {
        return $reply;
    }

    $clean = preg_replace('/\p{Han}|\p{Hiragana}|\p{Katakana}|\p{Hangul}/u', '', $reply) ?? $reply;
    $clean = preg_replace('/[ \t]{2,}/u', ' ', $clean) ?? $clean;
    $clean = preg_replace('/[ \t]+([,.;:!?])/u', '$1', $clean) ?? $clean;
    $clean = preg_replace("/[ \t]+\n/u", "\n", $clean) ?? $clean;
    $clean = preg_replace("/\n[ \t]+/u", "\n", $clean) ?? $clean;
    $clean = trim($clean);

    return $clean !== '' ? $clean : $reply;
}

/**
 * Ensure pick bullets bold the item name (and first € price) — including Case/Capsule names without `|`.
 */
function aiChatEnsurePickBulletBoldNames(string $reply): string
{
    if ($reply === '') {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }

    $changed = false;
    $inWhy = false;
    foreach ($lines as $i => $line) {
        $line = (string)$line;
        if (aiChatIsWhyToBuyHeading($line)) {
            $inWhy = true;
            continue;
        }
        if ($inWhy && aiChatLooksLikeTerminalSectionHeading($line) && !aiChatIsWhyToBuyHeading($line)) {
            // Named next sections end Why; metric-chip headings stay in Why relocation path.
            if (aiChatIsNamedTerminalSectionHeading($line) || !preg_match('/^#{1,6}\s+/u', trim($line))) {
                $inWhy = false;
            }
        }

        $parsed = aiChatParseListContentLine($line, $inWhy);
        if ($parsed === null) {
            continue;
        }
        $indent = (string)$parsed[0];
        $body = trim((string)$parsed[1]);
        $hadBullet = (bool)$parsed[2];
        if ($body === '') {
            continue;
        }
        // Always try Why lines; Items bullets still need catalog/recommend shape.
        if (!$inWhy && !aiChatLooksLikeCatalogItemLine($body) && !aiChatLooksLikeRecommendItemLine($body)) {
            continue;
        }

        $name = '';
        $rest = '';
        if (preg_match('/^(.+?)\s*[—–]\s*(.*)$/u', $body, $parts)) {
            $name = trim((string)$parts[1]);
            $rest = trim((string)$parts[2]);
        } elseif (preg_match('/^(.+?)\s+((?:€|\$|£)\s*\d[\d.,]*.*)$/u', $body, $parts)) {
            $name = trim((string)$parts[1]);
            $rest = trim((string)$parts[2]);
        } elseif ($inWhy && preg_match('/^([A-Za-z0-9][A-Za-z0-9|™★\-.\s]{1,60}?)\s{2,}(.+)$/u', $body, $parts)) {
            $name = trim((string)$parts[1]);
            $rest = trim((string)$parts[2]);
        } else {
            continue;
        }

        $namePlain = trim(preg_replace('/^\*\*(.+)\*\*$/u', '$1', $name) ?? $name);
        $namePlain = trim($namePlain, " \t*");
        if ($namePlain === '' || preg_match('/^(?:Portfolio\s+total|Total)\b/iu', $namePlain)) {
            continue;
        }
        $boldName = '**' . $namePlain . '**';

        // Bold the first currency amount if it is not already bold-wrapped.
        if ($rest !== '' && !preg_match('/^\*\*(?:€|\$|£)/u', $rest)) {
            $rest2 = preg_replace(
                '/((?:€|\$|£)\s*\d[\d.,]*)/u',
                '**$1**',
                $rest,
                1
            );
            if (is_string($rest2) && $rest2 !== '') {
                $rest = $rest2;
            }
        }

        $next = ($inWhy && !$hadBullet ? $indent : ($indent . '• '))
            . $boldName . ($rest !== '' ? ' — ' . $rest : '');
        if ($next !== $line) {
            $lines[$i] = $next;
            $changed = true;
        }
    }

    return $changed ? implode("\n", $lines) : $reply;
}

function aiChatLooksLikeItemRecapHeading(string $line): bool
{
    $heading = aiChatPlainSectionHeading($line);
    if ($heading === '') {
        $heading = trim((string)preg_replace('/\*\*/u', '', $line));
        $heading = trim((string)preg_replace('/^\s*(?:[-*•]|\d+[.)])\s+/u', '', $heading));
        $heading = rtrim($heading, " \t:");
    }
    return (bool)preg_match(
        '/^(?:proposed\s+(?:final\s+)?mix|final\s+mix(?:\s+near\s+budget)?|adjusted\s+(?:final\s+)?mix)\b/iu',
        $heading
    );
}

function aiChatLooksLikeBudgetAdjustEssay(string $line): bool
{
    $plain = trim((string)preg_replace('/\*\*/u', '', $line));
    $plain = trim((string)preg_replace('/^\s*(?:[-*•]|\d+[.)])\s+/u', '', $plain));
    if ($plain === '') {
        return false;
    }
    if (preg_match('/^to hit\b/iu', $plain) && preg_match('/(?:€|\$|£|total|budget)/iu', $plain)) {
        return true;
    }
    if (preg_match('/^if you want to stay\b/iu', $plain)) {
        return true;
    }
    if (preg_match('/^replace\b/iu', $plain) && preg_match('/\bwith\b/iu', $plain)) {
        return true;
    }
    if (preg_match('/\bwithout overshooting\b/iu', $plain)) {
        return true;
    }
    if (preg_match('/^keep\b.{0,80}\bas core\b/iu', $plain)) {
        return true;
    }
    if (preg_match('/^or alternative\b/iu', $plain)) {
        return true;
    }
    if (preg_match('/^add a heavier hitter\b/iu', $plain)) {
        return true;
    }
    if (preg_match('/\bstill under budget\b/iu', $plain)) {
        return true;
    }
    if (preg_match('/\bnear budget\b/iu', $plain) && preg_match('/\b(?:proposed|final|mix|adjust)\b/iu', $plain)) {
        return true;
    }
    return false;
}

function aiChatLooksLikePortfolioTotalLine(string $line): bool
{
    $plain = trim((string)preg_replace('/\*\*/u', '', $line));
    $plain = trim((string)preg_replace('/^\s*(?:[-*•]|\d+[.)])\s+/u', '', $plain));
    if ($plain === '') {
        return false;
    }
    if (preg_match('/^(?:Portfolio(?:\s+total)?|Final\s+total|Grand\s+total)\b/iu', $plain)) {
        return true;
    }
    if (preg_match('/^Total\b/iu', $plain) && preg_match('/(?:€|\$|£)\s*\d/u', $plain)) {
        return true;
    }
    return false;
}

/**
 * Drop a second pick dump / Proposed mix / Portfolio total recap. Keep Items to buy + Why once.
 */
function aiChatStripDuplicateItemRecap(string $reply): string
{
    if ($reply === '') {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines) || $lines === []) {
        return $reply;
    }

    $kept = [];
    $seenItemsHeading = false;
    $seenItemBullets = 0;
    $inWhy = false;
    $itemsClosed = false;
    $skippingRecap = false;

    $isKeptChrome = static function (string $line): bool {
        return aiChatIsMarketVerdictHeading($line)
            || aiChatIsCollectionsToWatchHeading($line)
            || aiChatIsNamedTerminalSectionHeading($line);
    };

    foreach ($lines as $line) {
        $trim = trim((string)$line);

        if (aiChatIsWhyToBuyHeading($line)) {
            $skippingRecap = false;
            $inWhy = true;
            $itemsClosed = true;
            $kept[] = $line;
            continue;
        }

        if (aiChatIsItemsToBuyHeading($line)) {
            if ($seenItemsHeading || $itemsClosed) {
                $skippingRecap = true;
                $inWhy = false;
                continue;
            }
            $seenItemsHeading = true;
            $skippingRecap = false;
            $inWhy = false;
            $kept[] = $line;
            continue;
        }

        if ($skippingRecap) {
            if ($trim === '') {
                continue;
            }
            if (aiChatIsWhyToBuyHeading($line)) {
                $skippingRecap = false;
                $inWhy = true;
                $itemsClosed = true;
                $kept[] = $line;
                continue;
            }
            if (
                $isKeptChrome($line)
                && !aiChatLooksLikeItemRecapHeading($line)
                && !aiChatIsItemsToBuyHeading($line)
            ) {
                $skippingRecap = false;
                $inWhy = false;
                $kept[] = $line;
                continue;
            }
            continue;
        }

        if (
            aiChatLooksLikePortfolioTotalLine($line)
            || aiChatLooksLikeItemRecapHeading($line)
            || aiChatLooksLikeBudgetAdjustEssay($line)
        ) {
            $skippingRecap = true;
            $inWhy = false;
            continue;
        }

        if ($inWhy) {
            if (aiChatIsNamedTerminalSectionHeading($line) && !aiChatIsWhyToBuyHeading($line)) {
                $inWhy = false;
                if (aiChatLooksLikeItemRecapHeading($line) || aiChatIsItemsToBuyHeading($line)) {
                    $skippingRecap = true;
                    continue;
                }
                $kept[] = $line;
                continue;
            }
            $whyBody = aiChatStripLeadingListMarker($trim);
            if (
                $whyBody !== ''
                && (aiChatLooksLikeCatalogItemLine($whyBody) || aiChatLooksLikeRecommendItemLine($whyBody))
                && preg_match('/(?:€|\$|£)\s*\d/u', $whyBody)
                && preg_match('/(?:[x×]\s*\d+|line[_\s-]?total|listings?)/iu', $whyBody)
            ) {
                continue;
            }
            $kept[] = $line;
            continue;
        }

        $body = preg_match('/^\s*•\s+(.*)$/u', (string)$line, $bullet)
            ? trim((string)$bullet[1])
            : aiChatStripLeadingListMarker($trim);
        $isPick = $body !== ''
            && (aiChatLooksLikeCatalogItemLine($body) || aiChatLooksLikeRecommendItemLine($body))
            && (
                preg_match('/^\s*•\s+/u', (string)$line)
                || preg_match('/(?:€|\$|£)\s*\d/u', $body)
            );

        if ($isPick) {
            if ($itemsClosed) {
                $skippingRecap = true;
                continue;
            }
            $seenItemBullets++;
            $kept[] = $line;
            continue;
        }

        $kept[] = $line;
    }

    $joined = implode("\n", $kept);
    $joined = preg_replace("/\n{3,}/u", "\n\n", $joined) ?? $joined;
    return trim($joined);
}

/**
 * Drop a model-emitted CS2 markets overview — the live widget is the only copy.
 */
function aiChatStripEmittedMarketOverview(string $reply): string
{
    if ($reply === '' || !preg_match('/CS2 markets overview|LIVE DATA/iu', $reply)) {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }

    $kept = [];
    $skipping = false;
    foreach ($lines as $line) {
        $plain = trim(preg_replace('/\*\*/u', '', (string)$line) ?? (string)$line);
        $heading = trim(preg_replace('/^#+\s+/u', '', $plain) ?? $plain);
        $heading = rtrim($heading, " \t:");
        if (preg_match('/^CS2 markets overview$/iu', $heading)) {
            $skipping = true;
            continue;
        }
        if ($skipping) {
            if ($plain === '') {
                $skipping = false;
                continue;
            }
            if (aiChatLooksLikeTerminalSectionHeading((string)$line) && !preg_match('/^CS2 markets overview$/iu', $heading)) {
                $skipping = false;
                $kept[] = $line;
                continue;
            }
            if (preg_match('/\bLIVE DATA\b/iu', $plain)
                || (preg_match('/\b(?:Market|24H Vol|24H Trend|7D Trend|30D Trend|1Y Trend|Items|AI Sentiment)\b/iu', $plain)
                    && preg_match('/(?:€|\$|%|[KMB]\b|BULLISH|BEARISH|NEUTRAL|[▲▼~])/u', $plain))
            ) {
                continue;
            }
            $skipping = false;
        }
        if (!$kept && (preg_match('/\bLIVE DATA\b/iu', $plain)
            || (preg_match('/\b(?:Market|24H Vol|24H Trend|7D Trend|Items|AI Sentiment)\b/iu', $plain)
                && preg_match('/(?:€|\$|%|[KMB]\b|BULLISH|BEARISH|NEUTRAL|[▲▼~])/u', $plain)))
        ) {
            continue;
        }
        $kept[] = $line;
    }

    return trim(implode("\n", $kept));
}

/**
 * Drop a lone ### Verdict / Verdict heading. Keep any body under it.
 */
function aiChatStripStandaloneVerdictHeading(string $reply): string
{
    if ($reply === '' || !preg_match('/(?:^|\n)\s*(?:#+\s*)?Verdict\s*:?\s*(?:\n|$)/iu', $reply)) {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }

    $kept = [];
    foreach ($lines as $line) {
        if (aiChatIsStandaloneVerdictHeading((string)$line)) {
            continue;
        }
        $kept[] = $line;
    }

    $out = implode("\n", $kept);
    $out = preg_replace("/\n{3,}/u", "\n\n", $out) ?? $out;
    return trim($out);
}

/**
 * Remove redundant Chart focus prose — the chart widget already shows Now/1y/outlook.
 */
function aiChatStripChartFocusSection(string $reply): string
{
    if ($reply === '' || !preg_match('/chart\s*focus/iu', $reply)) {
        return $reply;
    }

    // "### Top pick (chart focus)" is a real pick heading — keep the pick, drop
    // the chart wording (the widget renders on its own).
    $reply = preg_replace('/^(#{1,6}\s*Top pick)\s*\(\s*chart\s*focus\s*\)\s*:?\s*$/imu', '$1', $reply) ?? $reply;
    if (!preg_match('/chart\s*focus/iu', $reply)) {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }

    $out = [];
    $inFocus = false;
    foreach ($lines as $line) {
        $line = (string)$line;
        $plain = aiChatPlainSectionHeading($line);
        $isFocusHeading = (bool)preg_match('/^Chart focus\b/iu', $plain)
            || (bool)preg_match('/^#{0,6}\s*Chart focus\b/iu', trim(preg_replace('/\*\*/u', '', $line) ?? $line));

        if ($isFocusHeading) {
            $inFocus = true;
            continue;
        }

        if ($inFocus) {
            $trim = trim($line);
            if ($trim === '') {
                continue;
            }
            if (aiChatLooksLikeTerminalSectionHeading($line) && !preg_match('/^Chart focus\b/iu', $plain)) {
                $inFocus = false;
                $out[] = $line;
                continue;
            }
            // Drop Now / 1y / Outlook lines that belong to Chart focus.
            if (preg_match('/^(?:•\s*)?(?:Now\s*:|1y\s*:|Outlook\s*:)/iu', $trim)) {
                continue;
            }
            if (preg_match('/^(?:•\s*)?Now\b.*\b1y\b/iu', $trim)) {
                continue;
            }
            // Still inside focus block until next real section.
            continue;
        }

        $out[] = $line;
    }

    $joined = implode("\n", $out);
    $joined = preg_replace("/\n{3,}/u", "\n\n", $joined) ?? $joined;
    return trim($joined);
}

function aiChatIsChartOutlookStubHeading(string $line): bool
{
    $heading = aiChatPlainSectionHeading($line);
    if ($heading === '') {
        return false;
    }
    return (bool)preg_match('/^chart\s*\/\s*outlook$/iu', $heading)
        || (bool)preg_match('/^chart\s+outlook$/iu', $heading);
}

function aiChatIsHiddenMetadataHeading(string $line): bool
{
    $heading = aiChatPlainSectionHeading($line);
    return $heading !== '' && (bool)preg_match('/^hidden\s+metadata$/iu', $heading);
}

function aiChatIsFutureChartAvailableLine(string $line): bool
{
    $plain = trim((string)preg_replace('/\*\*/u', '', $line));
    $plain = trim((string)preg_replace('/^#+\s+/u', '', $plain));
    $plain = trim((string)preg_replace('/^\s*•\s+/u', '', $plain));
    return (bool)preg_match('/^(?:future\s+)?charts?\s+available\s*:/iu', $plain);
}

/**
 * Drop leftover Chart / outlook stubs, "Future chart available:…" lines, and Hidden metadata.
 * Interactive charts render from attached payload data — never keep this chrome in the reply body.
 */
function aiChatStripChartOutlookProse(string $reply): string
{
    if ($reply === '') {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }

    $out = [];
    $skipping = false;
    foreach ($lines as $line) {
        $line = (string)$line;
        if (aiChatIsChartOutlookStubHeading($line) || aiChatIsHiddenMetadataHeading($line)) {
            $skipping = true;
            continue;
        }
        if (aiChatIsFutureChartAvailableLine($line)) {
            continue;
        }
        // Offers to draw a chart / narration of what "the chart should track"
        // contradict the widget already rendered under the reply.
        if (preg_match('/^(?:if you want,?\s+i can (?:render|create|make|draw)|i can (?:render|draw|create) a (?:focused|new|quick)?\s*(?:future\s+)?chart|the chart (?:should|will|would) (?:track|show|follow)|want (?:me to|a) (?:render|chart|plot))/iu', trim($line))) {
            continue;
        }
        // Trailing offers ("If you want, I can pull…", "Want me to…?") read as
        // stalling; the assistant should do the work or stop.
        if (preg_match('/^(?:if you(?:\'d| would)? (?:want|like|prefer)\b[^.?!]{0,80}?,?\s*(?:i|we) can\b|(?:i|we) can (?:also |then )?(?:pull|list|run|compare|show|break|dig|scan|check|fetch|look|draw|build|put)\b|want me to\b|shall i\b|would you like (?:me to|a)\b|let me know if\b|just (?:say|tell me)\b)/iu', trim($line))) {
            continue;
        }
        if (aiChatIsFollowUpsMarkerLine($line)) {
            $skipping = true;
            continue;
        }
        if ($skipping) {
            $trim = trim($line);
            if ($trim === '' || preg_match('/^(?:-{3,}|\*{3,}|_{3,})$/u', $trim)) {
                continue;
            }
            if (
                (aiChatLooksLikeTerminalSectionHeading($line) || preg_match('/^#{1,6}\s+\S/u', $trim))
                && !aiChatIsChartOutlookStubHeading($line)
                && !aiChatIsHiddenMetadataHeading($line)
            ) {
                $skipping = false;
            } else {
                continue;
            }
        }
        $out[] = $line;
    }

    $joined = implode("\n", $out);
    $joined = aiChatStripFollowUpsTail($joined);
    $joined = preg_replace("/(?:\n[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*)+\s*$/u", "", $joined) ?? $joined;
    $joined = preg_replace("/\n{3,}/u", "\n\n", $joined) ?? $joined;
    return trim($joined);
}

function aiChatEnsurePickWhyClauses(string $reply): string
{
    if ($reply === '') {
        return $reply;
    }
    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }

    foreach ($lines as $i => $line) {
        if (!preg_match('/^(\s*)•\s+(.*)$/u', (string)$line, $matches)) {
            continue;
        }
        $indent = (string)$matches[1];
        if (mb_strlen($indent) >= 2) {
            continue;
        }
        $body = trim((string)$matches[2]);
        if (!aiChatLooksLikeCatalogItemLine($body) && !aiChatLooksLikeRecommendItemLine($body)) {
            continue;
        }
        // Bold-aware: "**Name** — **€3.40** ×5 = €17.00 — why". Without this the
        // head kept a dangling "— **" and the price got re-inserted after it.
        if (!preg_match('/^(.+?)(?:\*\*)?((?:€|\$|£)\s*\d[\d.,]*)(?:\*\*)?((?:\s*[x×]\s*\d+\s*=\s*(?:€|\$|£)\s*[\d.,]+)?)(.*)$/u', $body, $priced)) {
            continue;
        }
        $head = rtrim((string)$priced[1], " \t—–\-,;*");
        $price = '**' . trim((string)$priced[2]) . '**' . (string)$priced[3];
        $extra = trim((string)preg_replace('/^[\s*—–\-,;]+/u', '', (string)$priced[4]));
        if (!aiChatLooksLikeWeakPickWhy($extra)) {
            continue;
        }
        $name = aiChatSanitizeExtractedItemName($head);
        $why = aiChatComposePickWhy($name !== '' ? $name : $head);
        $lines[$i] = $indent . '• ' . $head . ' — ' . $price . ' — ' . $why;
    }

    return implode("\n", $lines);
}

function aiChatBulletHasExtraClause(string $body): bool
{
    if (!preg_match('/(?:€|\$|£)\s*\d[\d.,]*(.*)$/u', $body, $matches)) {
        return false;
    }
    return aiChatCapBulletExtra((string)$matches[1]) !== '';
}

function aiChatLooksLikeKeepableBulletExtra(string $line): bool
{
    $trim = trim($line);
    if ($trim === '' || aiChatLooksLikeWrapUpAfterList($trim) || aiChatLooksLikeEssayHeading($trim)) {
        return false;
    }
    if (preg_match('/^\s*•\s+/u', $line) && !preg_match('/^\s{2,}•\s+/u', $line)) {
        return false;
    }
    if (preg_match('/^\s{2,}•\s+(.*)$/u', $line, $nested)) {
        $nestedBody = trim((string)$nested[1]);
        if (aiChatLooksLikeRecommendItemLine($nestedBody)) {
            return false;
        }
        $trim = $nestedBody;
    }
    return aiChatCapBulletExtra($trim) !== '';
}

function aiChatTrimBulletBody(string $body): string
{
    $body = trim($body);
    $marketHint = '';
    if (preg_match('/Buy on ([^*\n]+?) for ((?:€|\$|£)\s*\d[\d.,]*)/iu', $body, $buyOn)) {
        $marketHint = trim((string)$buyOn[1]);
        $buyPrice = trim((string)$buyOn[2]);
        $body = preg_replace('/\s*(?:\*\*)?Buy on [^*\n]+? for (?:€|\$|£)\s*\d[\d.,]*(?:\*\*)?/iu', '', $body) ?? $body;
        $body = preg_replace('/^[\s—–\-]+|[\s—–\-]+$/u', '', $body) ?? $body;
        if (aiChatExtractListedPrice($body) === '' && $buyPrice !== '') {
            $body = $body === '' ? $buyPrice : ($body . ' — ' . $buyPrice);
        }
    }

    $body = preg_replace('/\s*(?:\*\*)?(?:Reason to buy|Why to buy)\s*:?\s*/iu', ' ', $body) ?? $body;
    $body = trim((string)preg_replace('/\s+/u', ' ', $body));

    if (!aiChatLooksLikeRecommendItemLine($body)) {
        return $body;
    }

    if (!preg_match('/^(.+?(?:€|\$|£)\s*\d[\d.,]*)(.*)$/u', $body, $matches)) {
        return $body;
    }

    $head = rtrim((string)$matches[1], " \t.,;");
    $extra = aiChatCapBulletExtra((string)$matches[2]);
    if ($extra === '') {
        return $head;
    }
    return $head . ' — ' . $extra;
}

/**
 * @param list<string> $out
 */
function aiChatPushFlattenedBullet(array &$out, string $body, string $harvestedPrice, string $keptExtraLine): void
{
    if ($harvestedPrice !== '' && aiChatExtractListedPrice($body) === '') {
        $body .= ' — ' . $harvestedPrice;
    }
    if ($keptExtraLine !== '' && !aiChatBulletHasExtraClause($body)) {
        $body .= ' — ' . $keptExtraLine;
    }
    $out[] = '• ' . $body;
}

function aiChatFlattenRecommendationLists(string $text): string
{
    $lines = preg_split("/\r\n|\n|\r/", $text);
    if (!is_array($lines) || $lines === []) {
        return $text;
    }

    $out = [];
    $count = count($lines);
    $i = 0;
    while ($i < $count) {
        $line = (string)$lines[$i];
        if (preg_match('/^(\s*)•\s+(.*)$/u', $line, $matches)) {
            $indent = (string)$matches[1];
            $body = aiChatTrimBulletBody((string)$matches[2]);
            if ($body === '') {
                $i++;
                continue;
            }
            // Nested non-item bullets become plain prose; nested catalog picks promote to top-level.
            if (mb_strlen($indent) >= 2 && !aiChatLooksLikeCatalogItemLine($body)) {
                $out[] = $body;
                $i++;
                continue;
            }
            if (!aiChatLooksLikeCatalogItemLine($body)) {
                $out[] = $body;
                $i++;
                continue;
            }
            $i++;
            $harvestedPrice = '';
            $keptExtraLine = '';
            while ($i < $count) {
                $next = (string)$lines[$i];
                $trimNext = trim($next);
                if ($trimNext === '') {
                    $j = $i;
                    while ($j < $count && trim((string)$lines[$j]) === '') {
                        $j++;
                    }
                    if ($j >= $count) {
                        $i = $j;
                        break;
                    }
                    $after = (string)$lines[$j];
                    if (preg_match('/^\s*•\s+/u', $after) && !preg_match('/^\s{2,}•\s+/u', $after)) {
                        $i = $j;
                        continue;
                    }
                    if (aiChatLooksLikeWrapUpAfterList($after)) {
                        aiChatPushFlattenedBullet($out, $body, $harvestedPrice, $keptExtraLine);
                        $out[] = '';
                        $i = $j;
                        $body = '';
                        break;
                    }
                    if (aiChatLooksLikeBulletContinuation($after) || aiChatLooksLikeKeepableBulletExtra($after)) {
                        if ($harvestedPrice === '') {
                            $harvestedPrice = aiChatExtractListedPrice($after);
                        }
                        $i = $j;
                        continue;
                    }
                    aiChatPushFlattenedBullet($out, $body, $harvestedPrice, $keptExtraLine);
                    $out[] = '';
                    $i = $j;
                    $body = '';
                    break;
                }
                if (preg_match('/^\s*•\s+/u', $next) && !preg_match('/^\s{2,}•\s+/u', $next)) {
                    break;
                }
                if (aiChatLooksLikeWrapUpAfterList($next)) {
                    break;
                }
                if (preg_match('/Buy on ([^*\n]+?) for ((?:€|\$|£)\s*\d[\d.,]*)/iu', $trimNext, $buyOn)) {
                    if ($harvestedPrice === '') {
                        $harvestedPrice = trim((string)$buyOn[2]);
                    }
                    $i++;
                    continue;
                }
                if (aiChatLooksLikeEssayHeading($trimNext)) {
                    $i++;
                    continue;
                }
                if ($keptExtraLine === '' && !aiChatBulletHasExtraClause($body) && aiChatLooksLikeKeepableBulletExtra($next)) {
                    if ($harvestedPrice === '') {
                        $harvestedPrice = aiChatExtractListedPrice($next);
                    }
                    $keptExtraLine = aiChatCapBulletExtra($trimNext);
                    $i++;
                    continue;
                }
                break;
            }
            if ($body !== '') {
                aiChatPushFlattenedBullet($out, $body, $harvestedPrice, $keptExtraLine);
            }
            continue;
        }
        $out[] = $line;
        $i++;
    }

    $joined = implode("\n", $out);
    $joined = preg_replace("/\n{3,}/u", "\n\n", $joined) ?? $joined;
    return trim($joined);
}

function aiChatLooksLikeCatalogItemLine(string $line): bool
{
    $plain = trim($line);
    $plain = preg_replace('/^\s*(?:[-*•]|\d+[.)])\s+/u', '', $plain) ?? $plain;
    $plain = preg_replace('/\*\*/u', '', $plain) ?? $plain;
    if ($plain === '') {
        return false;
    }
    return aiChatLooksLikeRecommendItemLine($plain);
}

function aiChatStripMarkdown(string $text): string
{
    $clean = $text;
    // Keep **bold** for the chat UI. Normalize __bold__ to the same markers.
    $clean = preg_replace('/__(.+?)__/s', '**$1**', $clean) ?? $clean;

    $lines = preg_split("/\r\n|\n|\r/", $clean);
    if (!is_array($lines)) {
        return $clean;
    }

    // Catalog picks keep • bullets. ### Why these picks rationale stays unmarked.
    // Other analysis markers become plain text.
    $out = [];
    $inWhy = false;
    $inKeyFactors = false;
    foreach ($lines as $line) {
        $line = (string)$line;

        if (aiChatIsWhyToBuyHeading($line)) {
            $inWhy = true;
            $inKeyFactors = false;
            $out[] = $line;
            continue;
        }
        if (aiChatLooksLikeTerminalSectionHeading($line)) {
            if ($inWhy && !aiChatIsWhyToBuyHeading($line)) {
                $inWhy = false;
            }
            $inKeyFactors = (bool)preg_match('/^#{1,6}\s*key\s+factors\b/iu', trim($line));
        }

        // Signed Key factors chips keep their markers — the UI reads `+ ` as a
        // positive and `- ` as a negative; stripping the dash turned every risk
        // into an unmarked line the panel could not classify.
        if ($inKeyFactors && preg_match('/^\s*[+\-]\s+\S/u', $line)) {
            $out[] = trim($line);
            continue;
        }

        if (preg_match('/^(\s*)(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+\.)\s+(.+)$/u', $line, $match)) {
            $body = (string)($match[2] ?? '');
            if ($inWhy) {
                $out[] = $body;
                continue;
            }
            if (aiChatLooksLikeCatalogItemLine($body)) {
                // Promote nested catalog bullets to top-level • for uniform lists.
                $out[] = '• ' . $body;
                continue;
            }
            $out[] = $body;
            continue;
        }

        $out[] = $line;
    }

    return implode("\n", $out);
}

/**
 * The follow-up marker as the model actually writes it. The prompt asks for
 * "---FOLLOWUPS---", but it comes back as "---\nFOLLOWUPS---", "--- FOLLOWUPS ---",
 * "—FOLLOWUPS—" or "FOLLOW-UPS:" often enough that the strict match leaked the
 * questions into the visible answer (rendered as a rule, then
 * "FOLLOWUPS---|How does…"). Upper case is required so a prose "follow-ups"
 * mid-answer is never cut. The client (shared-components.jsx) mirrors this.
 */
const AI_CHAT_FOLLOWUPS_MARKER = '(?:^|\n|-{3,})[ \t]*[-—–_*]*\s*FOLLOW[ \t_-]?UPS[ \t]*[-—–_*:]*';

function aiChatIsFollowUpsMarkerLine(string $line): bool
{
    return (bool)preg_match('/^[ \t]*[-—–_*]*[ \t]*FOLLOW[ \t_-]?UPS[ \t]*[-—–_*:]*/u', $line)
        || (bool)preg_match('/-{3,}[ \t]*FOLLOW[ \t_-]?UPS/u', $line);
}

/** [visible answer, raw follow-up tail] — the tail is '' when there is none. */
function aiChatSplitFollowUps(string $text): array
{
    if (!preg_match('/' . AI_CHAT_FOLLOWUPS_MARKER . '[ \t]*\n?(.*)$/su', $text, $m, PREG_OFFSET_CAPTURE)) {
        return [$text, ''];
    }
    $clean = substr($text, 0, (int)$m[0][1]);
    // A "---" rule the model left above the marker is chrome too.
    $clean = preg_replace("/(?:\n[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*)+\s*$/u", '', $clean) ?? $clean;
    return [trim($clean), trim((string)($m[1][0] ?? ''))];
}

function aiChatStripFollowUpsTail(string $text): string
{
    return aiChatSplitFollowUps($text)[0];
}

function aiChatParseFollowUps(string $reply): array
{
    $followups = [];
    $clean = trim($reply);

    $clean = preg_replace('/^#{0,6}\s*hidden\s+metadata\s*:?\s*$/imu', '', $clean) ?? $clean;
    $clean = trim($clean);
    [$clean, $tail] = aiChatSplitFollowUps($clean);
    if ($tail !== '') {
        // Pipes as asked, or one question per line when the model did that instead.
        $parts = preg_split('/\||\r?\n/', $tail) ?: [];
        foreach ($parts as $part) {
            $question = trim((string)$part);
            // "- ", "• ", "1. " list prefixes on a per-line list.
            $question = preg_replace('/^(?:[-•*]|\d+[.)])\s+/u', '', $question) ?? $question;
            $question = trim($question, " \t\n\r\0\x0B\"'");
            if ($question === '' || mb_strlen($question) > 120) {
                continue;
            }
            $followups[] = $question;
        }
        $followups = array_values(array_unique($followups));
        $followups = array_slice($followups, 0, 4);
    }

    if ($clean === '') {
        $clean = trim($reply);
    }

    $clean = aiChatStripMarkdown($clean);

    return [
        'reply' => $clean,
        'followups' => $followups,
    ];
}

function aiChatCheapFollowUps(array $messages, string $assistantReply, array $pageContext): array
{
    $cfg = aiChatConfig();
    $apiKey = trim((string)($cfg['api_key'] ?? ''));
    if ($apiKey === '') {
        return [];
    }

    $lastUser = '';
    foreach (array_reverse($messages) as $entry) {
        if (($entry['role'] ?? '') === 'user') {
            $lastUser = mb_substr(trim((string)($entry['content'] ?? '')), 0, 220);
            break;
        }
    }

    if ($lastUser === '') {
        return [];
    }

    // Chips are throwaway text: always the cheap model, never the main one.
    $model = trim((string)($cfg['cheap_model'] ?? $cfg['model'] ?? 'gpt-5-nano'));
    $baseUrl = rtrim(trim((string)($cfg['base_url'] ?? 'https://api.openai.com/v1')), '/');
    $timeout = max(10, (int)($cfg['timeout_seconds'] ?? 30));
    $mode = trim((string)($pageContext['mode'] ?? 'market'));
    $assistantSnippet = mb_substr(trim($assistantReply), 0, 420);

    try {
        $response = aiHttpPostJson(
            $baseUrl . '/chat/completions',
            array_merge([
                'model' => $model,
                'messages' => [
                    [
                        'role' => 'system',
                        'content' => 'Suggest four very short CS2 market follow-up questions, specific to the conversation. Reply with ONLY a JSON array of strings. Each question is 3–6 words and under 40 characters.',
                    ],
                    [
                        'role' => 'user',
                        'content' => "Mode: {$mode}\nUser: {$lastUser}\nAssistant: {$assistantSnippet}",
                    ],
                ],
            ], aiChatModelRequestParams($model, 220, 0.65)),
            [
                'Authorization: Bearer ' . $apiKey,
                'Accept: application/json',
            ],
            min($timeout, 20)
        );
    } catch (Throwable $error) {
        return [];
    }

    if ($response['status'] < 200 || $response['status'] >= 300) {
        return [];
    }

    $content = trim((string)($response['json']['choices'][0]['message']['content'] ?? ''));
    if ($content === '') {
        return [];
    }

    $decoded = json_decode($content, true);
    if (!is_array($decoded) && preg_match('/\[[\s\S]*\]/', $content, $matches)) {
        $decoded = json_decode((string)$matches[0], true);
    }

    if (!is_array($decoded)) {
        return [];
    }

    $followups = [];
    foreach ($decoded as $entry) {
        $question = trim((string)$entry);
        if ($question === '' || mb_strlen($question) > 120) {
            continue;
        }
        $followups[] = $question;
    }

    return array_slice(array_values(array_unique($followups)), 0, 4);
}

/**
 * Parse a signed `+ ` / `- ` factor chip line so it can be dropped from the reply.
 */
function aiChatParseSignedFactorLine(string $line): ?array
{
    $plain = trim(preg_replace('/\*\*/u', '', $line) ?? $line);
    $plain = preg_replace('/^\s*•\s+/u', '', $plain) ?? $plain;
    $plain = trim($plain);
    if (preg_match('/^\+\s+(.+)$/u', $plain, $m)) {
        return ['sign' => '+', 'text' => trim((string)$m[1])];
    }
    if (preg_match('/^[-−–]\s+(.+)$/u', $plain, $m)) {
        return ['sign' => '-', 'text' => trim((string)$m[1])];
    }
    return null;
}

/**
 * Remove a standalone ### Risks / ### Risk section — risk prose is not surfaced.
 */
function aiChatStripStandaloneRisksSection(string $reply): string
{
    if ($reply === '' || !preg_match('/^(?:#+\s*)?risks?\s*:?\s*$/imu', $reply)) {
        return $reply;
    }

    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return $reply;
    }

    $kept = [];
    $inRisks = false;
    $sawRiskBody = false;
    foreach ($lines as $line) {
        $plain = trim(preg_replace('/\*\*/u', '', (string)$line) ?? (string)$line);
        $heading = trim(preg_replace('/^#+\s+/u', '', $plain) ?? $plain);
        $heading = rtrim($heading, " \t:");
        if (preg_match('/^risks?$/iu', $heading)) {
            $inRisks = true;
            $sawRiskBody = false;
            continue;
        }
        if ($inRisks) {
            if (trim((string)$line) === '') {
                if ($sawRiskBody) {
                    $inRisks = false;
                }
                continue;
            }
            if (preg_match('/^(?:notes?|why(?: these picks| this mix)?|future outlook|outlook|analysis|summary|caveats?|disclaimer|key factors|key read|metrics|market metrics|item metrics|ai market(?: verdict)?|verdict|chart focus|marketplace supply|liquidity read|price action)$/iu', $heading)
                || preg_match('/^(?:not financial advice)\b/iu', $plain)
            ) {
                $inRisks = false;
                $kept[] = $line;
                continue;
            }
            $sawRiskBody = true;
            continue;
        }
        $kept[] = $line;
    }

    $out = implode("\n", $kept);
    $out = preg_replace("/\n{3,}/u", "\n\n", $out) ?? $out;
    return trim($out);
}

/**
 * @return list<array{label:string,value:string,detail?:string}>
 */
function aiChatInferDefaultMarketMetrics(?array $forecast = null, ?array $distribution = null, ?array $priceHistory = null): array
{
    $scarcity = 'MODERATE';
    $liquidity = 'MEDIUM';
    $volatility = 'MEDIUM';
    $scarcityWhy = '';
    $liquidityWhy = '';
    $volatilityWhy = '';

    $totalListings = (int)($distribution['total'] ?? 0);
    if ($totalListings > 0) {
        if ($totalListings < 40) {
            $scarcity = 'EXTREME';
            $liquidity = 'LOW';
            $scarcityWhy = 'Only ~' . number_format($totalListings) . ' tracked listings — supply is extremely thin.';
            $liquidityWhy = 'With ~' . number_format($totalListings) . ' listings, exits can slip fast.';
        } elseif ($totalListings < 150) {
            $scarcity = 'HIGH';
            $liquidity = 'LOW';
            $scarcityWhy = 'About ' . number_format($totalListings) . ' listings keep supply tight.';
            $liquidityWhy = 'Thin book (~' . number_format($totalListings) . ' listings) — size can move the ask.';
        } elseif ($totalListings < 800) {
            $scarcity = 'MODERATE';
            $liquidity = 'MEDIUM';
            $scarcityWhy = 'Roughly ' . number_format($totalListings) . ' listings — balanced supply.';
            $liquidityWhy = 'Decent depth (~' . number_format($totalListings) . ' listings); larger exits still take time.';
        } else {
            $scarcity = 'LOW';
            $liquidity = 'HIGH';
            $scarcityWhy = number_format($totalListings) . '+ listings — supply looks plentiful.';
            $liquidityWhy = 'Deep book (~' . number_format($totalListings) . ' listings) supports easier entry/exit.';
        }
    }

    $sd = strtolower(trim((string)($forecast['supply_demand'] ?? '')));
    if ($sd !== '') {
        if (preg_match('/\b(tight|scarce|thin|constrained)\b/u', $sd)) {
            $scarcity = $scarcity === 'LOW' ? 'MODERATE' : 'HIGH';
            if ($scarcityWhy === '') {
                $scarcityWhy = 'Supply/demand read leans tight vs demand.';
            }
        }
        if (preg_match('/\b(flood|oversupply|abundant|heavy supply)\b/u', $sd)) {
            $scarcity = 'LOW';
            $scarcityWhy = 'Supply/demand read points to abundant listings.';
            if ($liquidity === 'LOW') {
                $liquidity = 'MEDIUM';
                $liquidityWhy = 'Oversupply eases exit pressure vs a thin book.';
            }
        }
    }

    $changePct = abs((float)($forecast['change_pct'] ?? 0));
    if ($changePct >= 40) {
        $volatility = 'HIGH';
        $volatilityWhy = 'Projected/observed move ~' . number_format($changePct, 0) . '% — wide swings.';
    } elseif ($changePct >= 15) {
        $volatility = 'MEDIUM';
        $volatilityWhy = 'Move size around ' . number_format($changePct, 0) . '% — moderate churn.';
    } elseif ($changePct > 0 && $changePct < 8) {
        $volatility = 'LOW';
        $volatilityWhy = 'Move size under ~8% — price action stays calm.';
    }

    $histRows = is_array($priceHistory['rows'] ?? null) ? $priceHistory['rows'] : [];
    $maxAbsMove = 0.0;
    foreach ($histRows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $pct = $row['change_pct'] ?? $row['pct'] ?? null;
        if (is_numeric($pct)) {
            $maxAbsMove = max($maxAbsMove, abs((float)$pct));
        }
    }
    if ($maxAbsMove >= 35) {
        $volatility = 'HIGH';
        $volatilityWhy = 'Cross-market history shows swings up to ~' . number_format($maxAbsMove, 0) . '%.';
    } elseif ($maxAbsMove >= 18 && $volatility !== 'HIGH') {
        $volatility = 'MEDIUM';
        $volatilityWhy = 'Recent range ~' . number_format($maxAbsMove, 0) . '% — moderate volatility.';
    }

    $metrics = [
        ['label' => 'SCARCITY', 'value' => $scarcity, 'detail' => $scarcityWhy],
        ['label' => 'LIQUIDITY', 'value' => $liquidity, 'detail' => $liquidityWhy],
        ['label' => 'VOLATILITY', 'value' => $volatility, 'detail' => $volatilityWhy],
    ];

    foreach ($metrics as &$entry) {
        $detail = aiChatSanitizeMetricDetail((string)($entry['detail'] ?? ''));
        if ($detail === '') {
            $entry['detail'] = aiChatGenericMetricDetail($entry['label'], $entry['value']);
        } else {
            $entry['detail'] = $detail;
        }
    }
    unset($entry);

    return $metrics;
}

/**
 * Brief level-based why when chart numbers are missing.
 */
function aiChatGenericMetricDetail(string $label, string $value): string
{
    $label = strtoupper(trim($label));
    $value = strtoupper(trim($value));
    if ($label === 'SCARCITY' && $value === 'MEDIUM') {
        $value = 'MODERATE';
    }

    $map = [
        'SCARCITY' => [
            'EXTREME' => 'Listing supply looks extremely thin vs demand.',
            'HIGH' => 'Listings look scarce relative to demand.',
            'MODERATE' => 'Supply looks roughly balanced vs demand.',
            'MEDIUM' => 'Supply looks roughly balanced vs demand.',
            'LOW' => 'Plenty of listings relative to demand.',
        ],
        'LIQUIDITY' => [
            'HIGH' => 'Deep enough book for easier entry and exit.',
            'MEDIUM' => 'Decent depth; larger exits can still take time.',
            'LOW' => 'Thin books — size can slip the ask on exit.',
        ],
        'VOLATILITY' => [
            'HIGH' => 'Recent price swings look sharp.',
            'MEDIUM' => 'Moderate recent move size.',
            'LOW' => 'Price action has stayed relatively calm.',
        ],
    ];

    return $map[$label][$value]
        ?? ($label === 'SCARCITY'
            ? 'Inferred from listing supply vs demand.'
            : ($label === 'LIQUIDITY'
                ? 'Inferred from marketplace listing depth.'
                : 'Inferred from recent price move size.'));
}

/**
 * Prefer parsed AI why; else data-backed default when levels match; else generic level why.
 */
function aiChatResolveMetricDetail(
    string $label,
    string $value,
    string $parsedDetail = '',
    ?array $defaults = null
): string {
    $parsedDetail = aiChatSanitizeMetricDetail($parsedDetail);
    if ($parsedDetail !== '') {
        return $parsedDetail;
    }
    $label = strtoupper(trim($label));
    $value = strtoupper(trim($value));
    if ($label === 'SCARCITY' && $value === 'MEDIUM') {
        $value = 'MODERATE';
    }
    if (is_array($defaults)) {
        foreach ($defaults as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            if (strtoupper((string)($entry['label'] ?? '')) !== $label) {
                continue;
            }
            $defaultValue = strtoupper(trim((string)($entry['value'] ?? '')));
            if ($label === 'SCARCITY' && $defaultValue === 'MEDIUM') {
                $defaultValue = 'MODERATE';
            }
            $detail = trim((string)($entry['detail'] ?? ''));
            // Only reuse chart-derived why when the level matches the chip we keep.
            if ($detail !== '' && $defaultValue === $value) {
                return $detail;
            }
            break;
        }
    }
    return aiChatGenericMetricDetail($label, $value);
}

function aiChatReplyWantsMarketStrips(
    string $reply,
    string $lastUser,
    ?array $forecast = null,
    ?array $distribution = null,
    ?array $priceHistory = null
): bool {
    if (is_array($forecast) || is_array($distribution) || is_array($priceHistory)) {
        return true;
    }
    if ($lastUser !== '' && aiChatLooksLikeItemPickQuestion($lastUser)) {
        return true;
    }
    if (preg_match('/^(?:#+\s*)?(?:metrics|market metrics|item metrics|ai market(?: verdict)?|why these picks|chart focus)\s*:?\s*$/imu', $reply)) {
        return true;
    }
    if (preg_match('/\b(?:SCARCITY|LIQUIDITY|VOLATILITY)\s*[:\-–—]/u', $reply)) {
        return true;
    }
    if ($lastUser !== '' && preg_match('/\b(market|price|buy|invest|portfolio|trend|outlook|liquidity|scarce|case|skin|sticker|capsule|forecast|chart)\b/iu', $lastUser)) {
        return true;
    }
    return false;
}

function aiChatFindSectionInsertIndex(array $lines, array $beforeHeadings): int
{
    foreach ($lines as $i => $line) {
        $plain = trim(preg_replace('/\*\*/u', '', (string)$line) ?? (string)$line);
        $heading = trim(preg_replace('/^#+\s+/u', '', $plain) ?? $plain);
        $heading = rtrim($heading, " \t:");
        foreach ($beforeHeadings as $name) {
            if (strcasecmp($heading, $name) === 0) {
                return $i;
            }
        }
        if (preg_match('/^(?:not financial advice)\b/iu', $plain)) {
            return $i;
        }
    }
    return count($lines);
}

/**
 * Ensure ### Item metrics exists with Scarcity / Liquidity / Volatility chips,
 * backfilling any level or why the model left out from the chart data.
 */
function aiChatEnsureMarketMetricsSection(
    string $reply,
    bool $forceInsert = false,
    ?array $forecast = null,
    ?array $distribution = null,
    ?array $priceHistory = null
): string {
    return aiChatRebuildItemMetricsSection(
        $reply,
        [],
        aiChatInferDefaultMarketMetrics($forecast, $distribution, $priceHistory),
        $forceInsert
    );
}

/**
 * Keep ### Key factors / signed + Positives and - Negatives for the sentiment panel.
 * The frontend extracts that block; do not strip it here.
 */
function aiChatStripKeyFactorsSection(string $reply): string
{
    return $reply;
}

function aiChatStripChartPlaceholders(string $reply): string
{
    $reply = preg_replace('/\[\s*Interactive\s+ARIMA\s+chart\s+appears\s+here\s*\]/iu', '', $reply) ?? $reply;
    // Catch [Chart attached], [interactive chart below], [graph shown], etc.
    $reply = preg_replace(
        '/\[\s*(?:an?\s+)?(?:interactive\s+)?(?:ARIMA\s+)?(?:chart|graph|plot)(?:\s+(?:attached|appears|shown|here|below|above|ready)){0,3}\s*\]/iu',
        '',
        $reply
    ) ?? $reply;
    // Bare stub lines the model sometimes emits instead of real prose.
    $reply = preg_replace(
        '/(?:^|\n)\s*(?:\*\*)?(?:Future(?:\s+outlook)?|Market\s+Distribution|Price\s+History|Charts?)(?:\*\*)?\s*:?\s*(?=\n|$)/iu',
        "\n",
        $reply
    ) ?? $reply;
    $reply = preg_replace(
        '/(?:^|\n)\s*(?:chart|graph|plot)\s+(?:attached|appears|shown|below|here)\.?\s*(?=\n|$)/iu',
        "\n",
        $reply
    ) ?? $reply;
    $reply = preg_replace("/[ \t]+\n/", "\n", $reply) ?? $reply;
    $reply = preg_replace("/\n{3,}/", "\n\n", $reply) ?? $reply;
    $reply = aiChatStripChartOutlookProse(trim($reply));
    $reply = aiChatStripStandaloneVerdictHeading($reply);
    return aiChatStripFinancialDisclaimer(aiChatStripChartFocusSection($reply));
}

/**
 * Seed names already loaded for this invest ask (same pool the prompt used).
 *
 * @return list<string>
 */
function aiChatFallbackInvestSeedNames(string $userMessage): array
{
    $scope = aiChatRequestedCardScope($userMessage);
    $budgetEuro = aiChatExtractBudgetEuro($userMessage);
    $names = aiChatDiversifiedInvestCandidates(
        12,
        $scope['weapon'],
        $scope['type'],
        $budgetEuro > 0 ? $budgetEuro : 0.0,
        [],
        null,
        !empty($scope['stattrak'])
    );
    if (!$names && ($scope['type'] === 'collection' || aiChatWantsCollectionInvest($userMessage))) {
        $names = aiChatCollectionInvestSeedNames(12);
    }
    if (!$names) {
        $names = aiChatTrendingForecastCandidates(6);
    }
    $out = [];
    $seen = [];
    foreach ($names as $name) {
        $name = trim((string)$name);
        if ($name === '') {
            continue;
        }
        $key = mb_strtolower($name);
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $out[] = $name;
    }
    return $out;
}

/**
 * Catalog-backed markdown when the model or a strip left an empty body.
 *
 * @param list<string> $skinNames
 * @param list<array<string,mixed>> $cards
 */
function aiChatBuildFallbackReplyMarkdown(string $userMessage, array $skinNames = [], array $cards = []): string
{
    $wantsCollections = aiChatWantsCollectionInvest($userMessage)
        && !aiChatWantsSkinsInvestPortfolio($userMessage);

    $names = [];
    $seenName = [];
    $pushName = static function (string $name) use (&$names, &$seenName): void {
        $name = trim($name);
        if ($name === '') {
            return;
        }
        if (preg_match('/\bcollection\b/iu', $name) && !str_contains($name, '|')) {
            return;
        }
        $key = mb_strtolower($name);
        if (isset($seenName[$key])) {
            return;
        }
        $seenName[$key] = true;
        $names[] = $name;
    };
    foreach ($skinNames as $name) {
        $pushName((string)$name);
    }
    foreach ($cards as $card) {
        if (!is_array($card)) {
            continue;
        }
        $pushName((string)($card['market_hash_name'] ?? $card['display_name'] ?? ''));
    }
    if ($names === []) {
        foreach (aiChatFallbackInvestSeedNames($userMessage) as $name) {
            $pushName((string)$name);
        }
    }
    if ($names === []) {
        $fallbackScope = aiChatRequestedCardScope($userMessage);
        $scopeWeapon = (string)$fallbackScope['weapon'];
        $scopeType = (string)$fallbackScope['type'];
        foreach (aiChatDefaultSuggestionNames() as $name) {
            if ($scopeWeapon !== '' || $scopeType !== '') {
                // A capsule / sticker / charm ask must never bottom out in gun skins.
                if (!aiChatCatalogNameMatchesScope($name, $scopeWeapon, $scopeType)) {
                    continue;
                }
            } elseif (preg_match('/\b(?:Case|Capsule|Sticker)\b/iu', $name)) {
                continue;
            }
            $pushName((string)$name);
            if (count($names) >= 4) {
                break;
            }
        }
    }

    $collectionNames = [];
    if ($wantsCollections) {
        $seenCol = [];
        foreach ($names as $name) {
            $canon = aiChatCanonicalTrackedCollection(aiChatSkinOriginName($name));
            if ($canon === '') {
                continue;
            }
            $key = aiChatNormalizeCollectionKey($canon);
            if ($key === '' || isset($seenCol[$key])) {
                continue;
            }
            $seenCol[$key] = true;
            $collectionNames[] = $canon;
            if (count($collectionNames) >= 3) {
                break;
            }
        }
        if (count($collectionNames) < 3) {
            foreach (aiChatTrackedCollectionEntries() as $entry) {
                $cname = trim((string)($entry['name'] ?? ''));
                if ($cname === '' || !preg_match('/\bcollection\b/iu', $cname)) {
                    continue;
                }
                $key = aiChatNormalizeCollectionKey($cname);
                if ($key === '' || isset($seenCol[$key])) {
                    continue;
                }
                $seenCol[$key] = true;
                $collectionNames[] = $cname;
                if (count($collectionNames) >= 3) {
                    break;
                }
            }
        }
        $collectionNames = array_slice($collectionNames, 0, 3);
    }

    $priceByName = [];
    foreach ($cards as $card) {
        if (!is_array($card)) {
            continue;
        }
        $market = trim((string)($card['market_hash_name'] ?? ''));
        if ($market === '') {
            continue;
        }
        $price = (float)($card['cheapest_price'] ?? 0);
        if ($price <= 0) {
            $price = (float)($card['seed_sell_price'] ?? 0);
        }
        if ($price <= 0) {
            $price = aiChatCandidateSeedPrice($market);
        }
        $priceByName[mb_strtolower($market)] = $price;
    }

    $skins = array_slice($names, 0, 5);
    $itemLines = [];
    $whyLines = [];
    foreach ($skins as $skin) {
        $price = $priceByName[mb_strtolower($skin)] ?? aiChatCandidateSeedPrice($skin);
        $bullet = '• **' . $skin . '**';
        if ($price > 0) {
            $bullet .= ' — ' . aiChatFormatEuroAmount((float)$price);
        }
        $itemLines[] = $bullet;
        $whyLines[] = '**' . $skin . '** — ' . aiChatFallbackWhyPickReason($skin);
    }

    if ($wantsCollections && $collectionNames !== []) {
        $lines = ['### Collections to watch', ''];
        foreach ($collectionNames as $cname) {
            $lines[] = '**' . $cname . '** — ' . aiChatFallbackCollectionWatchReason();
        }
        if ($itemLines !== []) {
            $lines[] = '';
            $lines[] = '### Items to buy';
            $lines[] = '';
            foreach ($itemLines as $line) {
                $lines[] = $line;
            }
            $lines[] = '';
            $lines[] = '### Why these picks';
            $lines[] = '';
            foreach ($whyLines as $line) {
                $lines[] = $line;
            }
        }
        return trim(implode("\n", $lines));
    }

    if ($itemLines === []) {
        return '';
    }

    $lines = array_merge(
        ['### Items to buy', ''],
        $itemLines,
        ['', '### Why these picks', ''],
        $whyLines
    );
    return trim(implode("\n", $lines));
}

function aiChatReplyHasItemPicks(string $reply): bool
{
    if (trim($reply) === '') {
        return false;
    }
    $lines = preg_split("/\r\n|\n|\r/", $reply);
    if (!is_array($lines)) {
        return false;
    }
    foreach ($lines as $line) {
        $line = (string)$line;
        if (aiChatIsItemsToBuyHeading($line)) {
            return true;
        }
        $trim = trim($line);
        $body = preg_replace('/^\s*•\s+/u', '', $trim) ?? $trim;
        if (preg_match('/^\s*•\s+/u', $line)
            && (aiChatLooksLikeCatalogItemLine($body) || aiChatLooksLikeRecommendItemLine($body))
        ) {
            return true;
        }
    }
    return false;
}

/**
 * Invest/portfolio replies must include Items to buy. Append a portfolio block
 * when the model only emitted chrome (metrics / factors / sentiment).
 *
 * @param list<array<string,mixed>> $cards
 */
function aiChatEnsureInvestPicksInReply(string $reply, string $userMessage, array $cards = []): string
{
    if (!aiChatLooksLikeItemPickQuestion($userMessage)) {
        return $reply;
    }
    if (aiChatReplyHasItemPicks($reply)) {
        return $reply;
    }
    // The model already answered with named picks (e.g. only under Why), or the
    // user asked about one specific item — do not bolt a second list on.
    if (aiChatLinesCarryAnyPick(preg_split("/\r\n|\n|\r/", $reply) ?: []) || preg_match('/[\w\-]+\s*\|\s*\S/u', $userMessage)) {
        return $reply;
    }
    // A category ask (gloves, knives, cases…) with no in-scope cards must not get
    // a list of random rifles bolted on.
    $scope = aiChatRequestedCardScope($userMessage);
    if ((string)($scope['type'] ?? '') !== '' && !$cards) {
        return $reply;
    }
    $names = [];
    foreach ($cards as $card) {
        if (!is_array($card)) {
            continue;
        }
        $name = trim((string)($card['market_hash_name'] ?? ''));
        if ($name !== '') {
            $names[] = $name;
        }
    }
    if ($names === []) {
        $names = aiChatFallbackInvestSeedNames($userMessage);
    }
    $block = aiChatBuildFallbackReplyMarkdown($userMessage, $names, $cards);
    if (trim($block) === '') {
        return $reply;
    }
    if (trim($reply) === '') {
        return $block;
    }
    return trim($reply) . "\n\n" . $block;
}

/**
 * Never return a blank assistant body to the client.
 * Empty-body invest asks get a portfolio (skins + prices), not collection names.
 *
 * @param list<array<string,mixed>> $cards
 */
function aiChatEnsureNonEmptyReply(string $reply, string $userMessage, array $cards = [], bool $allowSynthesizedPicks = true): string
{
    if ($allowSynthesizedPicks) {
        $reply = aiChatEnsureInvestPicksInReply($reply, $userMessage, $cards);
    }
    if (trim($reply) !== '') {
        return $reply;
    }
    error_log('[ai-chat] empty reply; synthesizing portfolio fallback');
    $names = [];
    foreach ($cards as $card) {
        if (!is_array($card)) {
            continue;
        }
        $name = trim((string)($card['market_hash_name'] ?? ''));
        if ($name !== '') {
            $names[] = $name;
        }
    }
    if ($names === []) {
        $names = aiChatFallbackInvestSeedNames($userMessage);
    }
    $fallback = aiChatBuildFallbackReplyMarkdown($userMessage, $names, $cards);
    return $fallback !== '' ? $fallback : $reply;
}

function aiChatRequestCompletion(array $messages, array $pageContext, ?array $forecast = null, array $extraCharts = []): string
{
    $cfg = aiChatConfig();
    $apiKey = trim((string)($cfg['api_key'] ?? ''));
    if ($apiKey === '') {
        throw new RuntimeException('AI chat is not configured on this server.');
    }

    $model = trim((string)($cfg['model'] ?? 'gpt-5-nano'));
    $baseUrl = rtrim(trim((string)($cfg['base_url'] ?? 'https://api.openai.com/v1')), '/');
    $timeout = max(10, (int)($cfg['timeout_seconds'] ?? 30));

    $hasImage = false;
    foreach ($messages as $entry) {
        foreach ((array)($entry['media'] ?? []) as $mediaItem) {
            if (($mediaItem['kind'] ?? '') === 'image' && !empty($mediaItem['data_url'])) {
                $hasImage = true;
                break 2;
            }
        }
    }
    if ($hasImage) {
        $visionModel = trim((string)($cfg['vision_model'] ?? ''));
        if ($visionModel !== '') {
            $model = $visionModel;
        }
        $timeout = max($timeout, 60);
    }

    $lastUser = '';
    foreach (array_reverse($messages) as $entry) {
        if (($entry['role'] ?? '') === 'user') {
            $lastUser = (string)($entry['content'] ?? '');
            break;
        }
    }

    $pageType = trim((string)($pageContext['page_type'] ?? ''));
    $isInventoryAnalysis = $pageType === 'inventory';

    // Inventory analysis is latency-sensitive: use the priced snapshot + market pulse only.
    // Knowledge questions get no catalog rows either: item lists in context
    // are what turns "what is the economy like" into a pick list.
    $catalogContext = ($isInventoryAnalysis || !empty($pageContext['explainer_question']))
        ? ''
        : aiChatBuildCatalogContext($lastUser, $pageContext, $messages);
    $predictionContext = $isInventoryAnalysis
        ? ''
        : aiChatBuildPredictionContext($lastUser, $pageContext, $forecast, $messages);
    $marketPulseContext = aiChatBuildMarketPulseContext();
    $inventoryContext = aiChatBuildInventoryContext($pageContext);
    $livePriceContext = $isInventoryAnalysis ? '' : aiChatBuildLivePriceContext($lastUser, $pageContext);
    $wantsChart = !$isInventoryAnalysis && (
        aiChatShouldAttachForecast($lastUser, $messages)
        || aiChatShouldAttachDistribution($lastUser, $messages)
        || aiChatShouldAttachPriceHistory($lastUser, $messages)
    );
    $hasAnyChart = is_array($forecast)
        || is_array($extraCharts['distribution'] ?? null)
        || is_array($extraCharts['price_history'] ?? null);
    $attachedChartKinds = [];
    if (is_array($forecast)) {
        $attachedChartKinds[] = 'forecast';
    }
    if (is_array($extraCharts['distribution'] ?? null)) {
        $attachedChartKinds[] = 'distribution';
    }
    if (is_array($extraCharts['price_history'] ?? null)) {
        $attachedChartKinds[] = 'price_history';
    }
    $chartAttached = $wantsChart ? $hasAnyChart : null;
    $isInvest = !$isInventoryAnalysis && (aiChatLooksLikeItemPickQuestion($lastUser) || !empty($pageContext['invest_followup']));
    $systemPrompt = aiChatSystemPrompt(
        $pageContext,
        $catalogContext,
        $predictionContext,
        $marketPulseContext,
        $inventoryContext,
        $livePriceContext,
        $chartAttached,
        $lastUser,
        $attachedChartKinds
    );
    // The user's saved "AI personality" (profile page), if any. It goes at
    // the TOP of the system prompt, ahead of the long format rules, and is
    // repeated as a short reminder right before the user's latest turn below,
    // because a few lines at the end of a very long prompt were ignored.
    if (function_exists('aiPersonaPromptBlock')) {
        $personaBlock = aiPersonaPromptBlock();
        if ($personaBlock !== '') {
            $systemPrompt = ltrim($personaBlock) . "\n\n" . $systemPrompt;
        }
    }

    $extraChartContext = [];
    if (is_array($forecast)) {
        $forecastCtx = aiChatFormatForecastContext($forecast);
        if ($forecastCtx !== '') {
            $extraChartContext[] = $forecastCtx;
        }
    }
    if (is_array($extraCharts['distribution'] ?? null)) {
        $distCtx = aiChatFormatDistributionContext($extraCharts['distribution']);
        if ($distCtx !== '') {
            $extraChartContext[] = $distCtx;
        }
    }
    if (is_array($extraCharts['price_history'] ?? null)) {
        $histCtx = aiChatFormatPriceHistoryContext($extraCharts['price_history']);
        if ($histCtx !== '') {
            $extraChartContext[] = $histCtx;
        }
    }
    if ($extraChartContext) {
        $systemPrompt .= "\n\n" . implode("\n\n", $extraChartContext);
    }

    $maxTokens = $isInventoryAnalysis ? 420 : ($isInvest ? 1100 : 520);
    if (!empty($pageContext['continuation']) && $isInvest) {
        // "Make it bigger" answers carry the old list plus new picks.
        $maxTokens = max($maxTokens, 1700);
    }
    if ($hasAnyChart && !$isInvest) {
        $maxTokens = max($maxTokens, count($attachedChartKinds) > 1 ? 620 : 520);
    }
    if ($pageType === 'mark' && !$isInvest) {
        $maxTokens = $hasAnyChart ? max(480, $maxTokens) : 520;
    }

    if ($pageType === 'item') {
        $maxTokens = min($maxTokens, 450);
    }

    $payloadMessages = [
        ['role' => 'system', 'content' => $systemPrompt],
    ];

    foreach ($messages as $entry) {
        if (($entry['role'] ?? '') === 'system') {
            continue;
        }
        $payloadMessages[] = aiChatApiMessage($entry);
    }

    // Personal style reminder: once right before the latest user turn and once
    // after it, as the very last thing the model reads. The final message
    // carries the most weight with these models, and a reminder only ahead of
    // the question was still overridden by the long format rules above.
    if (function_exists('aiPersonaReminderMessage')) {
        $reminder = aiPersonaReminderMessage();
        if ($reminder !== '') {
            $lastIndex = count($payloadMessages) - 1;
            $insertAt = $lastIndex;
            for ($i = $lastIndex; $i >= 1; $i--) {
                if (($payloadMessages[$i]['role'] ?? '') === 'user') {
                    $insertAt = $i;
                    break;
                }
            }
            array_splice($payloadMessages, $insertAt, 0, [['role' => 'system', 'content' => $reminder]]);
            $payloadMessages[] = ['role' => 'system', 'content' => $reminder];
        }
    }

    $response = aiHttpPostJson(
        $baseUrl . '/chat/completions',
        array_merge([
            'model' => $model,
            'messages' => $payloadMessages,
        ], aiChatModelRequestParams($model, $maxTokens, $isInventoryAnalysis ? 0.35 : 0.55)),
        [
            'Authorization: Bearer ' . $apiKey,
            'Accept: application/json',
        ],
        $isInventoryAnalysis ? min($timeout, 22) : $timeout
    );

    if ($response['status'] < 200 || $response['status'] >= 300) {
        $error = (string)($response['json']['error']['message'] ?? $response['json']['error'] ?? 'AI provider error');
        throw new RuntimeException($error !== '' ? $error : 'AI provider returned HTTP ' . $response['status']);
    }

    $reply = trim((string)($response['json']['choices'][0]['message']['content'] ?? ''));
    if ($reply === '') {
        // Rare: reasoning still ate the budget. One retry with a larger ceiling.
        $retryTokens = max($maxTokens * 2, 1800);
        $retry = aiHttpPostJson(
            $baseUrl . '/chat/completions',
            array_merge([
                'model' => $model,
                'messages' => $payloadMessages,
            ], aiChatModelRequestParams($model, $retryTokens, $isInventoryAnalysis ? 0.35 : 0.55)),
            [
                'Authorization: Bearer ' . $apiKey,
                'Accept: application/json',
            ],
            $isInventoryAnalysis ? min($timeout, 22) : $timeout
        );
        if ($retry['status'] >= 200 && $retry['status'] < 300) {
            $reply = trim((string)($retry['json']['choices'][0]['message']['content'] ?? ''));
        }
    }
    if ($reply === '') {
        error_log('[ai-chat] OpenAI returned an empty completion; using catalog fallback');
        $GLOBALS['__AI_RAW_REPLIES'][] = '';
        return '';
    }

    $GLOBALS['__AI_RAW_REPLY'] = $reply;
    $GLOBALS['__AI_RAW_REPLIES'][] = $reply;
    $GLOBALS['__AI_SYSTEM_PROMPT'] = $systemPrompt;
    return aiChatStripChartPlaceholders($reply);
}

/**
 * Remove the ### Item metrics / ### AI SENTIMENT / ### Key factors blocks
 * (heading through the next heading).
 */
function aiChatStripMarketStripsBlocks(string $reply): string
{
    if ($reply === '') {
        return $reply;
    }
    $out = [];
    $skipping = false;
    foreach (preg_split("/\r\n|\n|\r/", $reply) ?: [] as $line) {
        $trim = trim((string)$line);
        if (preg_match('/^#{1,6}\s+/u', $trim)) {
            $skipping = (bool)preg_match('/^#{1,6}\s*(?:item\s+metrics|market\s+metrics|metrics|ai\s+sentiment|ai\s+market(?:\s+verdict)?|key\s+factors)\s*:?\s*$/iu', $trim);
            if ($skipping) {
                continue;
            }
        }
        if ($skipping) {
            continue;
        }
        $out[] = (string)$line;
    }
    return trim((string)preg_replace("/\n{3,}/", "\n\n", implode("\n", $out)));
}

/**
 * Short reaction to the previous answer ("make it bigger", "cheaper", "why?")
 * rather than a fresh question — the reply should build on the last turn, not
 * restart with the full metrics template.
 */
function aiChatLooksLikeContinuationFollowUp(array $messages, string $lastUser): bool
{
    $hasAssistant = false;
    foreach ($messages as $entry) {
        if (($entry['role'] ?? '') === 'assistant' && trim((string)($entry['content'] ?? '')) !== '') {
            $hasAssistant = true;
            break;
        }
    }
    if (!$hasAssistant) {
        return false;
    }
    $text = mb_strtolower(trim($lastUser));
    if ($text === '' || mb_strlen($text) > 90) {
        return false;
    }
    return (bool)preg_match(
        '/\b(bigger|larger|more|expand|extend|add|another|double|triple|again|cheaper|pricier|expensive|smaller|fewer|less|instead|swap|replace|remove|drop|without|only|also|why|explain|elaborate|detail|shorter|longer|riskier|safer|same|those|these|that|it)\b/u',
        $text
    );
}

function aiChatRespond(array $messages, array $pageContext): array
{
    $lastUser = '';
    foreach (array_reverse($messages) as $entry) {
        if (($entry['role'] ?? '') === 'user') {
            $lastUser = (string)($entry['content'] ?? '');
            break;
        }
    }

    // Team Fortress 2 (game switcher on TF2, or the thread talks TF2): answered
    // from the TF2 price index only (tf2_ai_helpers.php), never the CS2 flow.
    require_once __DIR__ . '/tf2_ai_helpers.php';
    if (($pageContext['page_type'] ?? '') !== 'inventory' && tf2AiIsRequest($messages, $pageContext)) {
        $tf2 = tf2AiRespond($messages, $pageContext);
        if (function_exists('aiPersonaRestyleReply')) {
            $tf2['reply'] = aiPersonaRestyleReply((string)$tf2['reply']);
        }
        return $tf2;
    }

    $pageType = trim((string)($pageContext['page_type'] ?? ''));
    $continuation = aiChatLooksLikeContinuationFollowUp($messages, $lastUser);
    if ($continuation) {
        $pageContext['continuation'] = true;
    }
    // "add 5 more items" after a pick list is still a pick-list turn even though
    // the sentence itself does not read like an invest question.
    $prevAssistantHadPicks = false;
    foreach (array_reverse($messages) as $entry) {
        if (($entry['role'] ?? '') === 'assistant') {
            $prevAssistantHadPicks = (bool)preg_match('/^#{1,6}\s*(?:items to buy|why these picks)\b/imu', (string)($entry['content'] ?? ''));
            break;
        }
    }
    $investTurn = aiChatLooksLikeItemPickQuestion($lastUser) || ($continuation && $prevAssistantHadPicks);
    // "explain the first one" wants reasoning, not another pick list.
    $explainTurn = $continuation
        && preg_match('/^(?:why|explain|elaborate|tell me more|what makes|how come|what does|what do you mean)\b|\b(?:explain|elaborate)\b/iu', trim($lastUser))
        && !preg_match('/\b(?:add|more items|bigger|cheaper|pricier|swap|replace|instead|list|picks?|alternatives?|options?|something else)\b/iu', $lastUser);
    if ($explainTurn) {
        $investTurn = false;
        $pageContext['explain_followup'] = true;
    } elseif ($investTurn && !aiChatLooksLikeItemPickQuestion($lastUser)) {
        $pageContext['invest_followup'] = true;
    }
    // "how does the cs2 economy work" / "how do stickers work" — a written
    // answer, no strips / picks / cards. Wins over the pick-question heuristics
    // ("what ... stickers" would otherwise read as a shopping ask).
    // A tapped follow-up chip is always an explainer turn. Without this the
    // chip reads as a continuation of a picks reply, and the answer comes back
    // as another Items to buy list with metric strips and cards.
    $followUpChipAsk = !empty($pageContext['follow_up']) && $pageType !== 'inventory';
    $explainerQuestion = $followUpChipAsk || (
        !$explainTurn
        && !($continuation && $prevAssistantHadPicks)
        && $pageType !== 'inventory'
        && $pageType !== 'item'
        && aiChatLooksLikeExplainerQuestion($lastUser)
    );
    // "Top market movers today" (often a tapped chip): a written answer that
    // names the real movers from CS Price data (aiChatBuildMoversContext),
    // with their cards, instead of the generic follow-up essay.
    $moversTurn = $pageType !== 'inventory' && $pageType !== 'item' && aiChatLooksLikeMoversQuestion($lastUser);
    if ($moversTurn) {
        $explainerQuestion = true;
        $pageContext['movers_question'] = true;
    }
    if ($explainerQuestion) {
        $investTurn = false;
        unset($pageContext['invest_followup']);
        $pageContext['explainer_question'] = true;
    }
    aiChatInvestRotationState($messages, $lastUser, true);

    // Inventory analysis should not build live market charts.
    $forecast = null;
    $distribution = null;
    $priceHistory = null;
    if ($pageType !== 'inventory') {
        $forecast = aiChatBuildArimaForecastPayload($lastUser, $pageContext, $messages);
        $distribution = aiChatBuildDistributionPayload($lastUser, $pageContext, $messages);
        $priceHistory = aiChatBuildPriceHistoryPayload($lastUser, $pageContext, $messages);
    }

    $rawReply = aiChatRequestCompletion($messages, $pageContext, $forecast, [
        'distribution' => $distribution,
        'price_history' => $priceHistory,
    ]);
    $parsed = aiChatParseFollowUps($rawReply);
    $parsed['reply'] = aiChatStripChartPlaceholders((string)($parsed['reply'] ?? ''));
    // "×2,500 = €50.00": thousands separators inside quantities break every later
    // regex ("×2" + ",500 = €50.00" leftovers) — flatten them up front.
    $parsed['reply'] = preg_replace('/([x×]\s*\d{1,3}),(\d{3})\b/u', '$1$2', (string)($parsed['reply'] ?? '')) ?? $parsed['reply'];
    // Model bookkeeping on bullets ("→ note: exceeds budget, swap below") must go
    // before the clause is harvested as a Why reason.
    $parsed['reply'] = aiChatStripBookkeepingClauses((string)($parsed['reply'] ?? ''));
    if ($continuation) {
        // A follow-up should read as a continuation, not a restart: drop the
        // repeated metrics / sentiment / key-factor strips the model tends to
        // re-emit verbatim from its previous answer.
        $parsed['reply'] = aiChatStripMarketStripsBlocks((string)($parsed['reply'] ?? ''));
    }
    if ($explainerQuestion) {
        // Explainer answers keep their Markdown (• bullets, ### subheadings,
        // **bold**, a bold TL;DR line). They are rebuilt from the raw model text
        // because the pick-list cleaner above turns every non-catalog bullet
        // into a plain line, which is exactly the "dense block" look to avoid.
        $explainerText = (string)$rawReply;
        $explainerText = aiChatStripFollowUpsTail($explainerText);
        $explainerText = preg_replace('/^#{0,6}\s*hidden\s+metadata\s*:?\s*$/imu', '', $explainerText) ?? $explainerText;
        $explainerText = preg_replace('/__(.+?)__/su', '**$1**', $explainerText) ?? $explainerText;
        // `- ` / `* ` bullets become • bullets (the UI treats leading dashes as
        // signed factor chips and drops them).
        $explainerText = preg_replace('/^([ \t]*)[-*]\s+(?=\S)/mu', '$1• ', $explainerText) ?? $explainerText;
        // Markdown "two trailing spaces" soft breaks are noise here.
        $explainerText = preg_replace('/[ \t]+$/mu', '', $explainerText) ?? $explainerText;
        // No TL;DR / summary line: drop it (heading, bullet or plain form) and,
        // when the model put the summary on the following line, that line too.
        $explainerText = preg_replace('/^[ \t]*(?:#{1,6}[ \t]*|[•\-*][ \t]+)?\**[ \t]*TL;DR[ \t]*:?[ \t]*\**[ \t]*\n+[^\n]*\n?/imu', '', $explainerText) ?? $explainerText;
        $explainerText = preg_replace('/^[ \t]*(?:#{1,6}[ \t]*|[•\-*][ \t]+)?\**[ \t]*TL;DR\b[^\n]*\n?/imu', '', $explainerText) ?? $explainerText;
        // Section headers are numbered bold lines: `### 1. Title` / `### **1. Title**`
        // → `**1. Title**`; a bare `1. Title` line that is not a list item stays a header too.
        $explainerText = preg_replace('/^[ \t]*#{1,6}[ \t]*\**[ \t]*(\d+)[.)][ \t]+(.+?)\**[ \t]*$/mu', '**$1. $2**', $explainerText) ?? $explainerText;
        // A header the model wrapped in a bullet (`• **2. Title**`) is still a header.
        $explainerText = preg_replace('/^[ \t]*[•\-*][ \t]+\*\*[ \t]*(\d+)[.)][ \t]+([^*\n]+?)[ \t]*\*\*[ \t]*:?[ \t]*$/mu', '**$1. $2**', $explainerText) ?? $explainerText;
        $explainerText = aiChatStripChartPlaceholders($explainerText);
        // Nothing re-adds strips, and any pick sections it still produced go.
        $explainerText = aiChatStripMarketStripsBlocks($explainerText);
        $explainerText = aiChatStripPickSections($explainerText);
        $parsed['reply'] = trim((string)preg_replace('/\n{3,}/u', "\n\n", $explainerText));
        // Restored verbatim at the end: the pick-list passes below would strip
        // the bullets again and re-file "**Term** — why" lines as picks.
        $explainerFinal = $parsed['reply'];
    }
    $cheapestListAsk = aiChatLooksLikeCheapestListAsk($lastUser);
    if ($cheapestListAsk) {
        $parsed['reply'] = aiChatStripMarketStripsBlocks((string)($parsed['reply'] ?? ''));
    }
    $wantsMarketStrips = !$explainerQuestion && !$cheapestListAsk && aiChatReplyWantsMarketStrips(
        (string)($parsed['reply'] ?? ''),
        $lastUser,
        is_array($forecast) ? $forecast : null,
        is_array($distribution) ? $distribution : null,
        is_array($priceHistory) ? $priceHistory : null
    );
    if (!$explainerQuestion) {
        $parsed['reply'] = aiChatEnsureMarketMetricsSection(
            (string)($parsed['reply'] ?? ''),
            $wantsMarketStrips && !$continuation,
            is_array($forecast) ? $forecast : null,
            is_array($distribution) ? $distribution : null,
            is_array($priceHistory) ? $priceHistory : null
        );
        $parsed['reply'] = aiChatStripKeyFactorsSection((string)($parsed['reply'] ?? ''));
    }

    $hasCharts = is_array($forecast) || is_array($distribution) || is_array($priceHistory);
    if ($pageType === 'mark' && count($parsed['followups']) < 2) {
        if ($hasCharts) {
            // Instant follow-ups — skip a second LLM round-trip after chart replies.
            $item = trim((string)(
                $forecast['item_name']
                ?? $distribution['item_name']
                ?? $priceHistory['item_name']
                ?? 'this item'
            ));
            $parsed['followups'] = array_values(array_filter([
                $item !== '' ? "Marketplace supply for {$item}?" : null,
                'Price history across markets?',
                'What else looks undervalued?',
                'Buy now or wait?',
            ]));
        } else {
            $fallback = aiChatCheapFollowUps($messages, $parsed['reply'], $pageContext);
            if ($fallback) {
                $parsed['followups'] = $fallback;
            }
        }
    }

    if (is_array($forecast)) {
        $parsed['forecast'] = $forecast;
    }
    if (is_array($distribution)) {
        $parsed['distribution'] = $distribution;
    }
    if (is_array($priceHistory)) {
        $parsed['price_history'] = $priceHistory;
    }

    $isInventoryAnalysis = $pageType === 'inventory';
    if (!$isInventoryAnalysis) {
        $parsed['reply'] = aiChatEnforceSouvenirReplyPicks((string)($parsed['reply'] ?? ''), $lastUser);
        $parsed['reply'] = aiChatEnforceStickerCapsuleReplyPicks((string)($parsed['reply'] ?? ''), $lastUser);
        $parsed['reply'] = aiChatEnforceCharmReplyPicks((string)($parsed['reply'] ?? ''), $lastUser);
        $parsed['reply'] = aiChatEnforceCollectionReplyPicks((string)($parsed['reply'] ?? ''), $lastUser);
        $parsed['reply'] = aiChatEnforceCategoryReplyPicks((string)($parsed['reply'] ?? ''), $lastUser);
        if ($cheapestListAsk && !$continuation) {
            $parsed['reply'] = aiChatForceCheapestPicks((string)($parsed['reply'] ?? ''), $lastUser);
        }
        $parsed['reply'] = aiChatDeduplicateReplyPicks((string)($parsed['reply'] ?? ''));
    }

    $items = $explainerQuestion ? [] : aiChatBuildItemCardsPayload(
        $lastUser,
        (string)($parsed['reply'] ?? ''),
        $pageContext,
        is_array($forecast) ? $forecast : null,
        is_array($distribution) ? $distribution : null,
        is_array($priceHistory) ? $priceHistory : null
    );
    if ($explainerQuestion) {
        $parsed['plain'] = true;
    }
    // Movers answers keep their written shape but get the cards of the items
    // they name, so each mover is one click from its page.
    if ($moversTurn) {
        $items = aiChatMoversCards((string)($explainerFinal ?? $parsed['reply'] ?? ''));
    }
    $parsed['reply'] = aiChatFillPlaceholderPrices(
        (string)($parsed['reply'] ?? ''),
        $items,
        $lastUser
    );
    $parsed['reply'] = aiChatApplyCheapestPricesToItemBullets(
        (string)($parsed['reply'] ?? ''),
        $items
    );
    if (!$isInventoryAnalysis) {
        // Keep per-item pick why names; collapse ### Why these picks to **Name** — short why (one line).
        $parsed['reply'] = aiChatPromotePricedWhyToItems((string)($parsed['reply'] ?? ''));
        if (!$investTurn) {
            $parsed['reply'] = aiChatFlattenRecommendationLists((string)($parsed['reply'] ?? ''));
        } else {
            $parsed['reply'] = aiChatEnsurePickWhyClauses((string)($parsed['reply'] ?? ''));
        }
        if ($continuation) {
            $parsed['reply'] = aiChatApplyQuantityMultiplier((string)($parsed['reply'] ?? ''), $lastUser, $messages);
        }
        if ($items) {
            // Invest bulk qty first (no-budget holds); portfolio budget always wins last.
            // "Cheapest X" lists are price lists, not a portfolio: no ×qty bookkeeping.
            $investQty = aiChatApplyInvestItemQuantities((string)($parsed['reply'] ?? ''), $items, $lastUser, $investTurn && !$cheapestListAsk);
            $parsed['reply'] = (string)($investQty['reply'] ?? $parsed['reply']);
            $items = is_array($investQty['cards'] ?? null) ? $investQty['cards'] : $items;
            $portfolio = aiChatApplyPortfolioBudget((string)($parsed['reply'] ?? ''), $items, $lastUser);
            $parsed['reply'] = (string)($portfolio['reply'] ?? $parsed['reply']);
            $items = is_array($portfolio['cards'] ?? null) ? $portfolio['cards'] : $items;
        }
        // "under €300": a €968 knife is wrong by definition, whatever the model says.
        // A €150 portfolio likewise has no room for a single €288 skin the model
        // mispriced at €6.50.
        $perItemCap = $investTurn ? aiChatThreadPerItemCap($messages, $lastUser) : 0.0;
        $capNote = '';
        if ($perItemCap <= 0 && $investTurn) {
            $threadBudget = aiChatThreadBudgetEuro($messages, $lastUser);
            if ($threadBudget >= 10.0) {
                $perItemCap = round($threadBudget * 0.75, 2);
            }
        } elseif ($perItemCap > 0) {
            $capNote = 'Nothing tracked sits under €' . number_format($perItemCap, 0, '.', '') . ' right now — these are the closest options above your cap:';
        }
        if ($perItemCap > 0) {
            $before = (string)($parsed['reply'] ?? '');
            $parsed['reply'] = aiChatDropPicksOverCap($before, $perItemCap, $capNote);
            if (is_array($items) && $parsed['reply'] !== $before && !str_contains((string)$parsed['reply'], $capNote !== '' ? $capNote : "\0")) {
                $items = array_values(array_filter($items, static function ($card) use ($perItemCap): bool {
                    if (!is_array($card)) {
                        return false;
                    }
                    $price = is_numeric($card['cheapest_price'] ?? null) ? (float)$card['cheapest_price'] : 0.0;
                    return $price <= 0 || $price <= $perItemCap * 1.05;
                }));
            }
        }
        if ($continuation && $investTurn) {
            $grown = aiChatAppendPicksOnExpand((string)($parsed['reply'] ?? ''), $messages, $lastUser, $pageContext);
            if ($grown !== (string)($parsed['reply'] ?? '')) {
                $parsed['reply'] = $grown;
                // Cards for the appended picks; existing cards keep their quantities.
                $rebuilt = aiChatBuildItemCardsPayload($lastUser, $grown, $pageContext, $forecast ?? null, $distribution ?? null, $priceHistory ?? null);
                $known = [];
                foreach ((is_array($items) ? $items : []) as $card) {
                    if (is_array($card)) {
                        $known[mb_strtolower((string)($card['market_hash_name'] ?? ''))] = true;
                    }
                }
                $items = is_array($items) ? $items : [];
                foreach ($rebuilt as $card) {
                    if (!is_array($card)) {
                        continue;
                    }
                    $nameKey = mb_strtolower((string)($card['market_hash_name'] ?? ''));
                    if ($nameKey !== '' && !isset($known[$nameKey])) {
                        $items[] = $card;
                        $known[$nameKey] = true;
                    }
                }
            }
        }
        if (is_array($items) && $items) {
            $items = aiChatFilterCardsToReplyPicks((string)($parsed['reply'] ?? ''), $items);
        }
        if ($cheapestListAsk) {
            $sorted = aiChatSortPicksCheapestFirst((string)($parsed['reply'] ?? ''), is_array($items) ? $items : []);
            $parsed['reply'] = $sorted['reply'];
            $items = $sorted['cards'];
        }
        if ($investTurn) {
            $parsed['reply'] = aiChatEnsureWhySectionExists((string)($parsed['reply'] ?? ''));
        }
        $parsed['reply'] = aiChatEnsureWhyPicksBullets(
            (string)($parsed['reply'] ?? ''),
            is_array($items) ? $items : []
        );
        $parsed['reply'] = aiChatEnsurePickBulletBoldNames((string)($parsed['reply'] ?? ''));
        if (is_array($items) && $items) {
            $parsed['reply'] = aiChatCanonicalizePickNames((string)($parsed['reply'] ?? ''), $items);
            // Text and cards name the same items: a listed pick with no card
            // is not a real item and goes (the cards were already cut to the
            // listed picks above).
            $parsed['reply'] = aiChatDropPicksWithoutCards((string)($parsed['reply'] ?? ''), $items);
        }
        if ($investTurn) {
            $parsed['reply'] = aiChatReorderInvestBodySections((string)($parsed['reply'] ?? ''));
        }
    }
    $parsed['reply'] = aiChatPlaceSentimentAfterMetrics((string)($parsed['reply'] ?? ''));
    $parsed['reply'] = aiChatPlaceCollectionsWatchAfterOutlook((string)($parsed['reply'] ?? ''));
    // Final pass: never leave ### SCARCITY / LIQUIDITY / VOLATILITY (or bare chip lines) in body/Why.
    $parsed['reply'] = aiChatRelocateAllMetricChipLines((string)($parsed['reply'] ?? ''));
    $parsed['reply'] = aiChatStripChartFocusSection((string)($parsed['reply'] ?? ''));
    $parsed['reply'] = aiChatStripChartOutlookProse((string)($parsed['reply'] ?? ''));
    $parsed['reply'] = aiChatStripEmittedMarketOverview((string)($parsed['reply'] ?? ''));
    $parsed['reply'] = aiChatStripStandaloneVerdictHeading((string)($parsed['reply'] ?? ''));
    $parsed['reply'] = aiChatStripDuplicateItemRecap((string)($parsed['reply'] ?? ''));
    if (!$isInventoryAnalysis) {
        $parsed['reply'] = aiChatDeduplicateReplyPicks((string)($parsed['reply'] ?? ''));
    }
    $parsed['reply'] = aiChatTidyWhySections((string)($parsed['reply'] ?? ''));
    // Strip accidental CJK glyphs mixed into English (Latin-majority) replies.
    $parsed['reply'] = aiChatStripUnexpectedCjk((string)($parsed['reply'] ?? ''));
    $parsed['reply'] = aiChatStripFinancialDisclaimer((string)($parsed['reply'] ?? ''));
    if ($isInventoryAnalysis) {
        $parsed['reply'] = aiChatStripInventoryBuySections((string)($parsed['reply'] ?? ''));
        if (trim((string)($parsed['reply'] ?? '')) === '') {
            $parsed['reply'] = "### Summary of your portfolio\nCould not finish the inventory review. Try AI analysis again.";
        }
    } elseif ($explainerQuestion) {
        // Prose answer: keep the Markdown built above; never swap in a
        // synthesized pick list.
        if (isset($explainerFinal) && trim((string)$explainerFinal) !== '') {
            $parsed['reply'] = aiChatStripFinancialDisclaimer(aiChatStripUnexpectedCjk((string)$explainerFinal));
        }
        if (trim((string)($parsed['reply'] ?? '')) === '') {
            $parsed['reply'] = 'Could not put that answer together just now — ask it once more.';
        }
    } else {
        $parsed['reply'] = aiChatEnsureNonEmptyReply(
            (string)($parsed['reply'] ?? ''),
            $lastUser,
            is_array($items) ? $items : [],
            !$continuation
        );
        $parsed['reply'] = aiChatTidyWhySections((string)($parsed['reply'] ?? ''));
    }
    if (!$explainerQuestion && trim((string)($parsed['reply'] ?? '')) !== '' && (!$items || $items === [])) {
        $rebuilt = aiChatBuildItemCardsPayload(
            $lastUser,
            (string)$parsed['reply'],
            $pageContext,
            is_array($forecast) ? $forecast : null,
            is_array($distribution) ? $distribution : null,
            is_array($priceHistory) ? $priceHistory : null
        );
        if ($rebuilt) {
            $items = $rebuilt;
        }
    }
    if ($items) {
        $parsed['items'] = $items;
    }

    // The user's saved AI personality, applied to the finished text as a
    // rewrite pass (ai_persona_helpers.php). Last, so the cards and every
    // price/quantity rule above worked on the plain wording.
    if (function_exists('aiPersonaRestyleReply')) {
        $parsed['reply'] = aiPersonaRestyleReply((string)($parsed['reply'] ?? ''));
    }
    // The restyle rewrites wording; re-check that it did not bring back a
    // pick with no card.
    if (!$isInventoryAnalysis && !$explainerQuestion && is_array($items) && $items) {
        $parsed['reply'] = aiChatDropPicksWithoutCards((string)($parsed['reply'] ?? ''), $items);
    }

    return $parsed;
}

function aiChatCompletion(array $messages, array $pageContext): string
{
    return aiChatRespond($messages, $pageContext)['reply'];
}

function aiChatTranscribeAudio(string $tmpPath, string $originalName, string $mimeType = 'audio/webm'): string
{
    $cfg = aiChatConfig();
    $apiKey = trim((string)($cfg['api_key'] ?? ''));
    if ($apiKey === '') {
        throw new RuntimeException('AI chat is not configured yet.');
    }

    if (!is_file($tmpPath) || !is_readable($tmpPath)) {
        throw new RuntimeException('Uploaded audio is missing.');
    }

    $size = (int)filesize($tmpPath);
    if ($size < 64) {
        throw new RuntimeException('Recording was too short. Hold the mic a bit longer.');
    }
    if ($size > 12 * 1024 * 1024) {
        throw new RuntimeException('Recording is too large. Try a shorter clip.');
    }

    $baseUrl = rtrim(trim((string)($cfg['base_url'] ?? 'https://api.openai.com/v1')), '/');
    $timeout = max(20, (int)($cfg['timeout_seconds'] ?? 30));
    $safeName = preg_replace('/[^a-zA-Z0-9._-]+/', '_', $originalName) ?: 'dictation.webm';
    $safeMime = preg_replace('/[^a-zA-Z0-9.+\-\/]+/', '', $mimeType) ?: 'audio/webm';

    // The configured model first, then the other OpenAI speech-to-text models.
    // A project-scoped API key can be allowed one model and not another
    // ("Project ... does not have access to model `whisper-1`" is what the
    // csprice.eu key answers), so a model-access error moves on to the next.
    $configured = trim((string)($cfg['transcribe_model'] ?? ''));
    $candidates = array_values(array_unique(array_filter([
        $configured,
        'gpt-4o-mini-transcribe',
        'gpt-4o-transcribe',
        'whisper-1',
    ])));

    $lastError = 'Transcription failed.';
    foreach ($candidates as $model) {
        $result = aiChatTranscribeWithModel($baseUrl, $apiKey, $tmpPath, $safeMime, $safeName, $model, $timeout);
        if ($result['ok']) {
            $text = trim((string)$result['text']);
            if ($text === '') {
                throw new RuntimeException('Could not understand that. Try again.');
            }
            return mb_substr($text, 0, 1200);
        }
        $lastError = (string)$result['error'];
        if (!$result['retry']) {
            throw new RuntimeException($lastError);
        }
    }

    throw new RuntimeException($lastError);
}

/**
 * One transcription request against a single model.
 * Returns ['ok' => bool, 'text' => string, 'error' => string, 'retry' => bool]
 * where retry=true means "this model is unavailable to the key, try another".
 */
function aiChatTranscribeWithModel(string $baseUrl, string $apiKey, string $tmpPath, string $mime, string $name, string $model, int $timeout): array
{
    $curl = curl_init($baseUrl . '/audio/transcriptions');
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => [
            'file' => new CURLFile($tmpPath, $mime, $name),
            'model' => $model,
            'language' => 'en',
            'response_format' => 'json',
        ],
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Accept: application/json',
        ],
        CURLOPT_TIMEOUT => min(90, max($timeout, 45)),
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $body = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    if ($body === false) {
        $error = curl_error($curl);
        curl_close($curl);
        return ['ok' => false, 'text' => '', 'retry' => false, 'error' => 'Transcription request failed: ' . $error];
    }
    curl_close($curl);

    $decoded = json_decode((string)$body, true);
    if (!is_array($decoded)) {
        return ['ok' => false, 'text' => '', 'retry' => false, 'error' => 'Transcription response was not valid JSON.'];
    }

    if ($status < 200 || $status >= 300) {
        $raw = $decoded['error']['message'] ?? $decoded['error'] ?? 'Transcription failed.';
        $message = trim(is_array($raw) ? (string)json_encode($raw) : (string)$raw);
        if ($message === '') {
            $message = 'Transcription failed.';
        }
        // Model-access / unknown-model answers: worth trying the next model.
        $retry = in_array($status, [400, 403, 404], true) && preg_match('/\bmodel\b/i', $message) === 1;
        return ['ok' => false, 'text' => '', 'retry' => $retry, 'error' => $message];
    }

    return ['ok' => true, 'text' => (string)($decoded['text'] ?? ''), 'retry' => false, 'error' => ''];
}
