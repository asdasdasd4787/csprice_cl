<?php
declare(strict_types=1);

require_once __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/ai_chat_helpers.php';

const SOCIAL_MODERATION_BUDGET_MS = 1600;
const SOCIAL_MODERATION_HTTP_MS = 800;
const SOCIAL_MODERATION_IMAGE_HTTP_MS = 1400;

function socialModerationLog(string $message, array $context = []): void
{
    $parts = [];
    foreach ($context as $key => $value) {
        if (is_bool($value)) {
            $parts[] = $key . '=' . ($value ? '1' : '0');
            continue;
        }
        if (is_scalar($value)) {
            $parts[] = $key . '=' . (string)$value;
        }
    }
    $suffix = $parts !== [] ? ' ' . implode(' ', $parts) : '';
    error_log('[social-moderation] ' . $message . $suffix);
}

function socialModerationElapsedMs(float $startedAt): int
{
    return (int)max(0, round((microtime(true) - $startedAt) * 1000));
}

function socialModerationRemainingMs(float $startedAt): int
{
    return max(0, SOCIAL_MODERATION_BUDGET_MS - socialModerationElapsedMs($startedAt));
}

/**
 * Conservative local denylist used as the first-pass (and fallback) filter.
 * Never echo matches to the client.
 */
function socialLocalDenylistHit(string $text): bool
{
    $haystack = mb_strtolower($text);
    if ($haystack === '') {
        return false;
    }

    $needles = [
        'kill yourself',
        'kys ',
        ' k ys',
        'how to make a bomb',
        'how to build a bomb',
        'pipe bomb',
        'buy explosives',
        'child porn',
        'child pornography',
        'csam',
        'loli porn',
        'preteen sex',
        'underage sex',
        'rape her',
        'gas the jews',
        'hang yourself',
        'how to commit suicide',
        'suicide tutorial',
        'doxx',
        'here is their address',
        'home address is',
        'credit card number',
        'nigger',
        'niggers',
        'faggot',
        'kike',
        'retard',
    ];

    foreach ($needles as $needle) {
        if ($needle !== '' && str_contains($haystack, $needle)) {
            return true;
        }
    }

    return false;
}

function socialLocalDenylistIsCsam(string $text): bool
{
    return (bool)preg_match('/child porn|csam|loli porn|preteen|underage sex/i', $text);
}

/**
 * @return array{allowed:bool, csam:bool, source:string, reason:string}
 */
function socialModerationAllow(string $source): array
{
    return [
        'allowed' => true,
        'csam' => false,
        'source' => $source,
        'reason' => 'allow',
    ];
}

/**
 * @return array{allowed:bool, csam:bool, source:string, reason:string}
 */
function socialModerationBlock(string $source, bool $csam = false): array
{
    return [
        'allowed' => false,
        'csam' => $csam,
        'source' => $source,
        'reason' => 'blocked',
    ];
}

/**
 * Safety check for posts/comments. Fast path only: local denylist, then a
 * short OpenAI Moderations call. Provider errors/timeouts do not block a
 * denylist-clean post, including image attachments. CSAM hits always reject.
 *
 * @return array{allowed:bool, csam:bool, source:string, reason:string}
 */
function socialModerateContent(string $text, ?string $imagePath = null, ?string $imageMime = null): array
{
    $startedAt = microtime(true);
    $text = trim($text);
    $hasImage = is_string($imagePath) && $imagePath !== '' && is_file($imagePath);

    if ($text !== '' && socialLocalDenylistHit($text)) {
        $csam = socialLocalDenylistIsCsam($text);
        socialModerationLog('local denylist reject', [
            'has_image' => $hasImage,
            'csam' => $csam,
            'text_len' => mb_strlen($text),
            'elapsed_ms' => socialModerationElapsedMs($startedAt),
        ]);
        return socialModerationBlock('local_denylist', $csam);
    }

    if (!aiChatEnabled()) {
        socialModerationLog('AI key missing; using local denylist only', [
            'has_image' => $hasImage,
            'text_len' => mb_strlen($text),
            'elapsed_ms' => socialModerationElapsedMs($startedAt),
        ]);
        return socialModerationAllow('local_denylist');
    }

    $remainingMs = socialModerationRemainingMs($startedAt);
    if ($remainingMs < 250) {
        socialModerationLog('budget exhausted before provider; allowing', [
            'has_image' => $hasImage,
            'elapsed_ms' => socialModerationElapsedMs($startedAt),
        ]);
        return socialModerationAllow('local_denylist_budget');
    }

    try {
        $aiResult = socialModerateWithOpenAI(
            $text,
            $hasImage ? $imagePath : null,
            $hasImage ? $imageMime : null,
            $remainingMs,
            $startedAt
        );
        socialModerationLog('provider result', [
            'allowed' => $aiResult['allowed'],
            'csam' => $aiResult['csam'],
            'source' => $aiResult['source'],
            'text_len' => mb_strlen($text),
            'has_image' => $hasImage,
            'elapsed_ms' => socialModerationElapsedMs($startedAt),
        ]);
        return $aiResult;
    } catch (Throwable $e) {
        socialModerationLog('provider error: ' . $e->getMessage(), [
            'has_image' => $hasImage,
            'text_len' => mb_strlen($text),
            'elapsed_ms' => socialModerationElapsedMs($startedAt),
        ]);
        return socialModerationAllow('local_denylist_fallback');
    }
}

function socialClientErrorForModeration(array $result): string
{
    return socialGenericBlockMessage();
}

/**
 * @return array{allowed:bool, csam:bool, source:string, reason:string}
 */
function socialModerateWithOpenAI(
    string $text,
    ?string $imagePath,
    ?string $imageMime,
    int $remainingMs,
    float $startedAt
): array {
    $cfg = aiChatConfig();
    $apiKey = trim((string)($cfg['api_key'] ?? ''));
    $baseUrl = rtrim(trim((string)($cfg['base_url'] ?? 'https://api.openai.com/v1')), '/');
    $headers = [
        'Authorization: Bearer ' . $apiKey,
        'Accept: application/json',
    ];

    $dataUrl = null;
    if (is_string($imagePath) && $imagePath !== '' && is_file($imagePath) && $remainingMs >= 400) {
        $mime = $imageMime ?: 'image/jpeg';
        $raw = @file_get_contents($imagePath);
        if (is_string($raw) && $raw !== '') {
            $dataUrl = 'data:' . $mime . ';base64,' . base64_encode($raw);
        }
    }

    $httpBudget = $dataUrl !== null ? SOCIAL_MODERATION_IMAGE_HTTP_MS : SOCIAL_MODERATION_HTTP_MS;
    $timeoutMs = min($httpBudget, max(250, $remainingMs));
    $moderation = socialTryModerationEndpoint($baseUrl, $headers, $timeoutMs, $text, $dataUrl);
    if ($moderation !== null) {
        return $moderation;
    }

    socialModerationLog('moderations unavailable; allowing after denylist', [
        'has_image' => $dataUrl !== null,
        'elapsed_ms' => socialModerationElapsedMs($startedAt),
    ]);
    return socialModerationAllow('local_denylist_fallback');
}

/**
 * @return array{allowed:bool, csam:bool, source:string, reason:string}|null
 */
function socialTryModerationEndpoint(
    string $baseUrl,
    array $headers,
    int $timeoutMs,
    string $text,
    ?string $dataUrl
): ?array {
    $input = [];
    if ($text !== '') {
        $input[] = ['type' => 'text', 'text' => mb_substr($text, 0, 4000)];
    }
    if ($dataUrl !== null) {
        $input[] = [
            'type' => 'image_url',
            'image_url' => ['url' => $dataUrl],
        ];
    }
    if ($input === []) {
        $input[] = ['type' => 'text', 'text' => '(empty)'];
    }

    $payload = [
        'model' => 'omni-moderation-latest',
        'input' => $dataUrl === null && $text !== '' ? $text : $input,
    ];

    try {
        $response = socialModerationHttpPostJson($baseUrl . '/moderations', $payload, $headers, $timeoutMs);
    } catch (Throwable $e) {
        socialModerationLog('moderations HTTP failed: ' . $e->getMessage());
        return null;
    }

    $status = (int)($response['status'] ?? 0);
    if ($status < 200 || $status >= 300) {
        socialModerationLog('moderations status ' . $status);
        return null;
    }

    $result = $response['json']['results'][0] ?? null;
    if (!is_array($result)) {
        return null;
    }

    $categories = is_array($result['categories'] ?? null) ? $result['categories'] : [];
    $csam = !empty($categories['sexual/minors'])
        || !empty($categories['sexual/minors/image']);
    $flagged = !empty($result['flagged']);

    return [
        'allowed' => !$flagged && !$csam,
        'csam' => $csam,
        'source' => 'openai_moderations',
        'reason' => $flagged || $csam ? 'blocked' : 'allow',
    ];
}

/**
 * Short-timeout JSON POST used only by community moderation.
 *
 * @return array{status:int, json:array}
 */
function socialModerationHttpPostJson(string $url, array $payload, array $headers, int $timeoutMs): array
{
    $timeoutMs = max(200, min(SOCIAL_MODERATION_BUDGET_MS, $timeoutMs));
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_THROW_ON_ERROR),
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers),
        CURLOPT_TIMEOUT_MS => $timeoutMs,
        CURLOPT_CONNECTTIMEOUT_MS => min(400, $timeoutMs),
        CURLOPT_NOSIGNAL => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $body = curl_exec($curl);
    $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);

    if ($body === false) {
        $error = curl_error($curl);
        curl_close($curl);
        throw new RuntimeException('moderation request failed: ' . $error);
    }

    curl_close($curl);

    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('moderation response was not valid JSON');
    }

    return [
        'status' => $status,
        'json' => $decoded,
    ];
}
