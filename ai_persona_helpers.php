<?php
declare(strict_types=1);
/**
 * "AI personality": a short free-text instruction each account can save on
 * the profile page ("talk like a professor", "only memes"), stored in
 * users.ai_instructions and appended to Mark's system prompt for that user.
 *
 * The column is added on first use when the DB user may ALTER; when it may
 * not, profile_schema.sql documents the statement to run by hand and every
 * reader here degrades to "no instructions" instead of failing.
 */

const AI_PERSONA_MAX_CHARS = 600;

/** True when the request presents the access gate's admin key (X-CSPrice-Admin header). */
function aiPersonaAdminRequest(): bool
{
    $presented = trim((string)($_SERVER['HTTP_X_CSPRICE_ADMIN'] ?? ''));
    if ($presented === '' || !function_exists('cspriceGateConfig')) {
        return false;
    }
    $adminKey = trim((string)(cspriceGateConfig()['admin_key'] ?? ''));
    return $adminKey !== '' && hash_equals($adminKey, $presented);
}

/** How the last restyle went, for chat.php's response (ok / skipped / check_failed / http_N / error / empty). */
function aiPersonaRestyleStatus(?string $set = null): string
{
    static $status = 'skipped';
    if ($set !== null) {
        $status = $set;
    }
    return $status;
}

function aiPersonaColumnExists(PDO $pdo): bool
{
    static $known = null;
    if ($known !== null) {
        return $known;
    }
    try {
        $known = dbColumnExists($pdo, 'users', 'ai_instructions');
    } catch (Throwable) {
        $known = false;
    }
    return $known;
}

/** Adds users.ai_instructions when it is missing. Quiet when ALTER is refused. */
function aiPersonaColumnEnsure(PDO $pdo): bool
{
    if (aiPersonaColumnExists($pdo)) {
        return true;
    }
    try {
        $pdo->exec('ALTER TABLE users ADD COLUMN ai_instructions TEXT NULL');
    } catch (Throwable $exception) {
        error_log('ai_persona: could not add users.ai_instructions - ' . $exception->getMessage());
        return false;
    }
    // Re-check rather than assume: a race with another request is harmless.
    try {
        return dbColumnExists($pdo, 'users', 'ai_instructions');
    } catch (Throwable) {
        return false;
    }
}

/** Trims, drops control characters (newlines stay) and caps the length. */
function aiPersonaClean(string $raw): string
{
    $text = preg_replace('/[^\P{C}\n]+/u', '', $raw) ?? '';
    $text = preg_replace('/[ \t]+\n/', "\n", $text) ?? $text;
    $text = preg_replace('/\n{3,}/', "\n\n", $text) ?? $text;
    $text = trim($text);
    if (mb_strlen($text) > AI_PERSONA_MAX_CHARS) {
        $text = mb_substr($text, 0, AI_PERSONA_MAX_CHARS);
    }
    return $text;
}

/**
 * The saved instructions of the signed-in visitor, or "" when there is no
 * session, no row, or no column. Read-only: a Steam session that has never
 * opened the profile page has no row yet and simply gets "".
 */
function aiPersonaForCurrentUser(): string
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    $cached = '';
    // Test hook: a style set by the command line, or by chat.php for a
    // request that carries the gate's admin key (aiPersonaAdminRequest).
    if (isset($GLOBALS['__AI_PERSONA_TEST']) && is_string($GLOBALS['__AI_PERSONA_TEST'])
        && (PHP_SAPI === 'cli' || aiPersonaAdminRequest())) {
        return $cached = aiPersonaClean($GLOBALS['__AI_PERSONA_TEST']);
    }

    foreach (['/oauth_auth_helpers.php', '/steam_auth_helpers.php'] as $file) {
        if (!function_exists('steamSessionUser') && is_file(__DIR__ . $file)) {
            require_once __DIR__ . $file;
        }
    }
    if (!function_exists('steamSessionUser')) {
        return $cached;
    }

    try {
        $user = steamSessionUser();
        if (!is_array($user)) {
            return $cached;
        }
        $pdo = dbPdoConnection('accounts_db', 'db');
        if (!aiPersonaColumnExists($pdo)) {
            return $cached;
        }

        $provider = strtolower((string)($user['provider'] ?? ''));
        $providerId = trim((string)($user['provider_id'] ?? ''));
        if ($provider === 'email') {
            $stmt = $pdo->prepare('SELECT ai_instructions FROM users WHERE id = ? LIMIT 1');
            $stmt->execute([(int)($user['id'] ?? 0)]);
        } elseif (($provider === 'discord' || $provider === 'google') && $providerId !== '') {
            // Rows created by profileResolveUserId, keyed by the provider id.
            $column = $provider === 'google' ? 'google_id' : 'discord_id';
            if (!dbColumnExists($pdo, 'users', $column)) {
                return $cached;
            }
            $stmt = $pdo->prepare("SELECT ai_instructions FROM users WHERE $column = ? ORDER BY id LIMIT 1");
            $stmt->execute([$providerId]);
        } else {
            $steamId = preg_replace('/\D+/', '', (string)($user['steamid'] ?? '')) ?? '';
            if ($steamId === '') {
                return $cached;
            }
            $stmt = $pdo->prepare('SELECT ai_instructions FROM users WHERE steam_id = ? LIMIT 1');
            $stmt->execute([$steamId]);
        }
        $value = $stmt->fetchColumn();
        $cached = is_string($value) ? aiPersonaClean($value) : '';
    } catch (Throwable $exception) {
        error_log('ai_persona read: ' . $exception->getMessage());
        $cached = '';
    }

    return $cached;
}

/**
 * The block appended to the system prompt. The wording keeps the request in
 * its lane: tone, focus and format, never the facts, the tools or the rules
 * above it.
 */
function aiPersonaPromptBlock(): string
{
    $instructions = aiPersonaForCurrentUser();
    if ($instructions === '') {
        return '';
    }
    return "## Personal style set by this user (applies to every answer)\n"
        . "The signed-in user saved these instructions for how you should talk to them:\n"
        . "\"\"\"\n" . $instructions . "\n\"\"\"\n"
        . "Write every sentence of your answer in this voice: the tone, the humour, the focus and the "
        . "answer length come from these instructions. Keep the facts, the prices, the safety limits and "
        . "the section headings / bullet structure the format rules below require; the wording inside "
        . "them is where the style shows. If the instructions conflict with the data or the format, "
        . "keep the data and format and apply only the style.";
}

/**
 * Second pass: the finished answer, rewritten in the user's style.
 *
 * The main completion carries the style at the top of its prompt and as a
 * reminder, but the long format rules and the pick-list post-processing leave
 * little of it in the final text. A dedicated rewrite whose only instruction
 * is the style applies it reliably. Facts are protected: every heading, bold
 * item name and euro amount of the original must survive, or the original is
 * returned unchanged.
 */
function aiPersonaRestyleReply(string $reply, ?string $personaOverride = null): string
{
    // The override exists for testing a style without a signed-in session.
    $persona = $personaOverride ?? aiPersonaForCurrentUser();
    $reply = (string)$reply;
    if ($persona === '' || trim($reply) === '' || !function_exists('aiChatConfig') || !function_exists('aiHttpPostJson')) {
        return $reply;
    }

    $cfg = aiChatConfig();
    $apiKey = trim((string)($cfg['api_key'] ?? ''));
    if ($apiKey === '') {
        return $reply;
    }
    $model = trim((string)($cfg['model'] ?? 'gpt-5-nano'));
    $baseUrl = rtrim(trim((string)($cfg['base_url'] ?? 'https://api.openai.com/v1')), '/');
    // Long pick lists take the model 20-40 s to rewrite; 30 s dropped them
    // back to the plain answer without a word.
    $timeout = max(45, min(60, (int)($cfg['timeout_seconds'] ?? 30)));

    // Two tries. First the plain text with "keep every fact" rules: that gives
    // the strongest style, but on long pick lists the model sometimes rewords
    // a heading or drops a bold name, and the check below rejects it. Then a
    // masked copy: every heading line, bold span and number becomes a token
    // like [[F7]] that is put back afterwards, so facts cannot change - the
    // style is milder there, but it lands.
    [$masked, $facts] = aiPersonaMaskFacts($reply);

    $plainSystem = "You rewrite an answer from Mark, a market price assistant for CS2 and TF2 items, into the personal style this user chose:\n"
        . "\"\"\"\n" . $persona . "\n\"\"\"\n"
        . "Rules:\n"
        . "- The style must show in every sentence and every bullet: the tone, the humour, the wording. The reader must notice it at a glance.\n"
        . "- Keep, character for character: every Markdown heading line (### ...), every bold span (**...**), "
        . "every number, price, percentage, currency symbol, date and item name, and the order of the lines.\n"
        . "- Keep the same lines with the same bullet, +, - and heading markers at the start; change only the words around the facts.\n"
        . "- Do not add or remove items, prices, sections, lines, links, disclaimers or a closing line.\n"
        . "- No preamble and no explanation: output only the rewritten answer.";

    $system = "You rewrite an answer from Mark, a market price assistant for CS2 and TF2 items, into the personal style this user chose:\n"
        . "\"\"\"\n" . $persona . "\n\"\"\"\n"
        . "Rules:\n"
        . "- The style must show in every sentence and every bullet: the tone, the humour, the wording. "
        . "Reword every line that has words besides placeholders; a line left in its original wording is a mistake. "
        . "The reader must notice the style at a glance.\n"
        . "- The text contains placeholders like [[F12]]. Each stands for a fact (a heading, an item name, a price or a number). "
        . "Copy every placeholder exactly once, unchanged, in the same order. Never invent, merge, drop or explain a placeholder.\n"
        . "- Keep a line that is only a placeholder on its own line. Keep the bullet, +, - and number markers that start a line.\n"
        . "- Keep the same lines in the same order; you may reword a line, not add or remove sections, items, links or disclaimers.\n"
        . "- No preamble and no explanation: output only the rewritten answer.";

    // Room for the whole answer plus some style: a cut-off rewrite fails the
    // check below and the plain answer comes back.
    $maxTokens = (int)min(4000, max(500, ceil(mb_strlen($reply) / 1.6) + 400));
    $lastStatus = 'error';
    $weak = null;
    $nudge = '';
    for ($attempt = 1; $attempt <= 2; $attempt++) {
        $isMasked = $attempt === 2;
        try {
            $response = aiHttpPostJson(
                $baseUrl . '/chat/completions',
                array_merge([
                    'model' => $model,
                    'messages' => [
                        ['role' => 'system', 'content' => $isMasked ? $system . $nudge : $plainSystem],
                        ['role' => 'user', 'content' => $isMasked ? $masked : $reply],
                    ],
                ], function_exists('aiChatModelRequestParams') ? aiChatModelRequestParams($model, $maxTokens, 0.7) : ['max_tokens' => $maxTokens]),
                ['Authorization: Bearer ' . $apiKey, 'Accept: application/json'],
                $timeout
            );
        } catch (Throwable $exception) {
            error_log('ai_persona restyle: ' . $exception->getMessage());
            $lastStatus = 'error';
            break;
        }
        if (($response['status'] ?? 0) < 200 || ($response['status'] ?? 0) >= 300) {
            $lastStatus = 'http_' . (int)($response['status'] ?? 0);
            break;
        }
        $styled = trim((string)($response['json']['choices'][0]['message']['content'] ?? ''));
        if ($styled === '') {
            $lastStatus = 'empty';
            continue;
        }
        if (($response['json']['choices'][0]['finish_reason'] ?? '') === 'length') {
            $lastStatus = 'truncated';
            break;
        }
        // Models sometimes wrap the whole thing in a code fence.
        $styled = preg_replace('/^```[a-z]*\s*\n([\s\S]*?)\n```$/u', '$1', $styled) ?? $styled;
        $restored = $isMasked ? aiPersonaUnmaskFacts($styled, $facts) : $styled;
        if ($restored !== null && aiPersonaRestyleKeepsFacts($reply, $restored)) {
            aiPersonaRestyleStatus($isMasked ? 'ok_masked' : 'ok');
            return $restored;
        }
        $lastStatus = 'check_failed';
    }
    error_log('ai_persona restyle: ' . $lastStatus . '; original kept');
    aiPersonaRestyleStatus($lastStatus);
    return $reply;
}

/**
 * [masked text, facts]: heading lines, **bold** spans, and numbers (with a
 * currency sign, %, × or thousands separators attached) become [[F<n>]].
 */
function aiPersonaMaskFacts(string $text): array
{
    $facts = [];
    $token = static function (string $fact) use (&$facts): string {
        $facts[] = $fact;
        return '[[F' . count($facts) . ']]';
    };
    $lines = preg_split('/(\r\n|\n|\r)/', $text) ?: [];
    foreach ($lines as $i => $line) {
        if (preg_match('/^\s*#{1,6}\s+\S/u', $line)) {
            $lines[$i] = $token($line);
            continue;
        }
        $line = (string)preg_replace_callback('/\*\*[^*\n]{1,120}\*\*/u', static fn($m) => $token($m[0]), $line);
        // One pass that skips the tokens made above (their digits are not
        // numbers) and keeps the space before a number outside the token.
        $line = (string)preg_replace_callback(
            '/\[\[F\d+\]\]|(?:[€$£]\s?)?[+\-−]?\d(?:[\d.,]*\d)?(?:\s?[%×])?/u',
            static fn($m) => str_starts_with($m[0], '[[F') ? $m[0] : $token($m[0]),
            $line
        );
        $lines[$i] = $line;
    }
    return [implode("\n", $lines), $facts];
}

/** Puts the facts back; null when a token is missing, duplicated or out of order. */
function aiPersonaUnmaskFacts(string $styled, array $facts): ?string
{
    preg_match_all('/\[\[F(\d+)\]\]/u', $styled, $m);
    $seen = array_map('intval', $m[1]);
    if ($seen !== range(1, count($facts)) && !(count($facts) === 0 && $seen === [])) {
        return null;
    }
    return (string)preg_replace_callback('/\[\[F(\d+)\]\]/u', static fn($x) => $facts[(int)$x[1] - 1] ?? $x[0], $styled);
}

/** Every heading, bold name and euro amount of the original is still there, in order. */
function aiPersonaRestyleKeepsFacts(string $original, string $styled): bool
{
    $originalLines = preg_split('/\r\n|\n|\r/', $original) ?: [];
    $styledLines = preg_split('/\r\n|\n|\r/', $styled) ?: [];
    $countBefore = count(array_filter($originalLines, static fn($l) => trim((string)$l) !== ''));
    $countAfter = count(array_filter($styledLines, static fn($l) => trim((string)$l) !== ''));
    // A style may add a joke line or merge two; losing a third of the lines
    // or doubling them means sections went missing or got invented.
    if ($countBefore > 0 && ($countAfter < $countBefore * 0.65 || $countAfter > $countBefore * 2)) {
        return false;
    }

    foreach ($originalLines as $line) {
        $trim = trim((string)$line);
        if ($trim !== '' && preg_match('/^#{1,6}\s+/u', $trim) && !str_contains($styled, $trim)) {
            return false;
        }
    }

    preg_match_all('/\*\*([^*\n]{2,80})\*\*/u', $original, $bold);
    $cursor = 0;
    foreach ($bold[0] as $token) {
        $pos = mb_strpos($styled, $token, $cursor);
        if ($pos === false) {
            return false;
        }
        $cursor = $pos + mb_strlen($token);
    }

    preg_match_all('/€\s?\d[\d.,]*/u', $original, $amounts);
    preg_match_all('/€\s?\d[\d.,]*/u', $styled, $amountsAfter);
    $need = array_count_values(array_map(static fn($a) => preg_replace('/\s+/', '', $a), $amounts[0]));
    $have = array_count_values(array_map(static fn($a) => preg_replace('/\s+/', '', $a), $amountsAfter[0]));
    foreach ($need as $amount => $count) {
        if (($have[$amount] ?? 0) < $count) {
            return false;
        }
    }
    return true;
}

/** Short reminder placed right before the user's latest message. */
function aiPersonaReminderMessage(): string
{
    $instructions = aiPersonaForCurrentUser();
    if ($instructions === '') {
        return '';
    }
    return "Reminder of this user's personal style for your next answer: \"" . $instructions . "\". "
        . "Apply it to the wording of every sentence while keeping the required structure and the data exact.";
}
