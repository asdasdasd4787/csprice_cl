<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/ai_chat_helpers.php';
require_once __DIR__ . '/market_snapshot_helpers.php';
require_once __DIR__ . '/ai_persona_helpers.php';
require_once __DIR__ . '/tf2_ai_helpers.php';

/**
 * The markets-overview strip for the answer's game: TF2 turns (game switcher
 * or ?game=tf2 on the status call) get the TF2 snapshot, everything else the
 * CS2 one. The strip only renders a snapshot of the page's own game.
 */
function chatMarketSnapshotFor(string $game): ?array
{
    if ($game === 'tf2') {
        return tf2MarketSnapshot();
    }
    $snapshotPayload = marketSnapshotBuild(true);
    return ($snapshotPayload['success'] ?? false) && is_array($snapshotPayload['snapshot'] ?? null)
        ? $snapshotPayload['snapshot']
        : null;
}

// A chart reply decodes the full ROI catalog plus several marketplace bulk
// indexes and the price-history bundle in one process; the host's 256 MB
// default died with "Allowed memory size exhausted" and the chat showed
// "Chat request failed." (ini_set is allowed there; no-op where it is not.)
@ini_set('memory_limit', '1024M');
@set_time_limit(180);

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $cfg = aiChatConfig();
    respondJson([
        'success' => true,
        'enabled' => aiChatEnabled(),
        'model' => (string)($cfg['model'] ?? ''),
        'name' => (string)($cfg['assistant_name'] ?? 'CS Price Assistant'),
        'market_snapshot' => chatMarketSnapshotFor(strtolower(trim((string)($_GET['game'] ?? ''))) === 'tf2' ? 'tf2' : 'cs2'),
    ]);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respondJson(['success' => false, 'error' => 'Method not allowed'], 405);
}

if (!aiChatEnabled()) {
    respondJson([
        'success' => false,
        'error' => 'AI chat is not configured yet. Add your API key in config.local.php under the ai section.',
        'enabled' => false,
    ], 503);
}

$rawBody = file_get_contents('php://input');
$payload = json_decode($rawBody ?: '[]', true);
if (!is_array($payload)) {
    respondJson(['success' => false, 'error' => 'Invalid JSON body.'], 400);
}

// Lightweight chart fetch for the multi-pick switcher (no LLM).
$action = strtolower(trim((string)($payload['action'] ?? '')));
if ($action === 'forecast' || $action === 'charts') {
    $item = trim((string)($payload['item'] ?? $payload['item_name'] ?? ''));
    if ($item === '') {
        respondJson(['success' => false, 'error' => 'Item name is required.'], 400);
    }
    $pageContext = aiChatPageContext($payload['context'] ?? []);
    $includeRaw = is_array($payload['include'] ?? null) ? $payload['include'] : [];
    // Default: forecast-only for legacy action=forecast; all three for action=charts.
    $wantForecast = array_key_exists('forecast', $includeRaw)
        ? (bool)$includeRaw['forecast']
        : true;
    $wantDistribution = array_key_exists('distribution', $includeRaw)
        ? (bool)$includeRaw['distribution']
        : ($action === 'charts');
    $wantPriceHistory = array_key_exists('price_history', $includeRaw)
        ? (bool)$includeRaw['price_history']
        : ($action === 'charts');
    $distRange = trim((string)($payload['distribution_range'] ?? $payload['range'] ?? '1Y'));
    $historyRange = trim((string)($payload['price_history_range'] ?? $payload['range'] ?? '1Y'));
    if ($distRange === '') {
        $distRange = '1Y';
    }
    if ($historyRange === '') {
        $historyRange = '1Y';
    }

    try {
        $forecast = null;
        $distribution = null;
        $priceHistory = null;
        if ($wantForecast) {
            $forecast = aiChatBuildArimaForecastForItem($item, $pageContext);
        }
        if ($wantDistribution) {
            $distribution = aiChatBuildDistributionForItem($item, $distRange);
        }
        if ($wantPriceHistory) {
            $priceHistory = aiChatBuildPriceHistoryForItem($item, $pageContext, $historyRange);
        }
        respondJson([
            'success' => true,
            'enabled' => true,
            'forecast' => $forecast,
            'distribution' => $distribution,
            'price_history' => $priceHistory,
        ]);
    } catch (Throwable $error) {
        respondJson([
            'success' => false,
            'error' => $error->getMessage(),
        ], 500);
    }
}

$messages = aiChatNormalizeMessages($payload['messages'] ?? []);
if (!$messages) {
    respondJson(['success' => false, 'error' => 'At least one message is required.'], 400);
}

$hasUser = false;
foreach ($messages as $entry) {
    if (($entry['role'] ?? '') === 'user') {
        $hasUser = true;
        break;
    }
}
if (!$hasUser) {
    respondJson(['success' => false, 'error' => 'A user message is required.'], 400);
}

$pageContext = aiChatPageContext($payload['context'] ?? []);

// Admin-only test of an AI personality without a signed-in account: honoured
// only with the gate's admin key in X-CSPrice-Admin (ai_persona_helpers.php).
if (is_string($payload['persona_test'] ?? null) && function_exists('aiPersonaAdminRequest') && aiPersonaAdminRequest()) {
    $GLOBALS['__AI_PERSONA_TEST'] = (string)$payload['persona_test'];
}

try {
    $result = aiChatRespond($messages, $pageContext);
    $reply = trim((string)($result['reply'] ?? ''));
    if ($reply === '') {
        $lastUser = '';
        foreach (array_reverse($messages) as $entry) {
            if (($entry['role'] ?? '') === 'user') {
                $lastUser = (string)($entry['content'] ?? '');
                break;
            }
        }
        error_log('[ai-chat] chat.php refused empty reply; synthesizing catalog fallback');
        $cards = is_array($result['items'] ?? null) ? $result['items'] : [];
        $reply = aiChatEnsureNonEmptyReply('', $lastUser, $cards);
        if ($reply !== '' && (!$cards || $cards === [])) {
            $rebuilt = aiChatBuildItemCardsPayload($lastUser, $reply, $pageContext);
            if ($rebuilt) {
                $result['items'] = $rebuilt;
            }
        }
    }
    $followups = array_values(array_filter(
        is_array($result['followups'] ?? null) ? $result['followups'] : [],
        static fn($entry): bool => is_string($entry) && trim($entry) !== ''
    ));
    $marketSnapshot = chatMarketSnapshotFor((string)($pageContext['game'] ?? 'cs2'));
    $debugRaw = null;
    if (!empty($payload['debug_raw']) && in_array((string)($_SERVER['REMOTE_ADDR'] ?? ''), ['127.0.0.1', '::1'], true)) {
        $debugRaw = array_values(array_map('strval', (array)($GLOBALS['__AI_RAW_REPLIES'] ?? [])));
    }
    respondJson([
        'success' => true,
        'enabled' => true,
        'reply' => $reply,
        // Whether the signed-in user's saved AI personality went into this
        // answer's prompt (profile page). Handy when checking the feature.
        'persona_applied' => function_exists('aiPersonaForCurrentUser') && aiPersonaForCurrentUser() !== '',
        // ok | skipped (no style) | check_failed | truncated | error | http_N | empty
        'persona_restyle' => function_exists('aiPersonaRestyleStatus') ? aiPersonaRestyleStatus() : null,
        'debug_raw' => $debugRaw,
        'followups' => $followups,
        'forecast' => is_array($result['forecast'] ?? null) ? $result['forecast'] : null,
        'distribution' => is_array($result['distribution'] ?? null) ? $result['distribution'] : null,
        'price_history' => is_array($result['price_history'] ?? null) ? $result['price_history'] : null,
        'market_snapshot' => $marketSnapshot,
        'items' => array_values(array_filter(
            is_array($result['items'] ?? null) ? $result['items'] : [],
            static function ($entry): bool {
                if (!is_array($entry)) {
                    return false;
                }
                $name = trim((string)($entry['market_hash_name'] ?? ''));
                if ($name === '') {
                    return false;
                }
                $weapon = trim((string)($entry['scope_weapon'] ?? ''));
                $type = trim((string)($entry['scope_type'] ?? ''));
                if ($weapon === '' && $type === '') {
                    return true;
                }
                return aiChatCatalogNameMatchesScope($name, $weapon, $type);
            }
        )),
        // Explainer answers ("how does X work") are prose: no overview strip, no cards.
        'plain' => !empty($result['plain']),
        'message' => [
            'role' => 'assistant',
            'content' => $reply,
        ],
    ]);
} catch (Throwable $error) {
    respondJson([
        'success' => false,
        'error' => $error->getMessage(),
    ], 500);
}
