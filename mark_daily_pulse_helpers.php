<?php
declare(strict_types=1);

require_once __DIR__ . '/ai_chat_helpers.php';

function markDailyPulseCacheFile(): string
{
    return __DIR__ . '/assets/ai/daily_summary_cache.json';
}

function markDailyPulseLoadHomeRoi(): array
{
    $cacheFile = __DIR__ . '/assets/steam-market-cache/roi_home_cache.json';
    if (!is_file($cacheFile)) {
        return ['trending' => [], 'declining' => [], 'updated_at' => null];
    }

    $payload = json_decode((string)file_get_contents($cacheFile), true);
    if (!is_array($payload)) {
        return ['trending' => [], 'declining' => [], 'updated_at' => null];
    }

    return [
        'trending' => array_values(array_filter(is_array($payload['trending'] ?? null) ? $payload['trending'] : [], 'is_array')),
        'declining' => array_values(array_filter(is_array($payload['declining'] ?? null) ? $payload['declining'] : [], 'is_array')),
        'updated_at' => isset($payload['updated_at']) ? (string)$payload['updated_at'] : null,
    ];
}

function markDailyPulseFormatMover(array $entry): array
{
    $roi = is_numeric($entry['roi_pct'] ?? null) ? round((float)$entry['roi_pct'], 2) : null;
    $price = is_numeric($entry['price'] ?? null) ? round((float)$entry['price'], 2) : null;

    return [
        'market_hash_name' => (string)($entry['market_hash_name'] ?? ''),
        'display_name' => (string)($entry['display_name'] ?? $entry['market_hash_name'] ?? ''),
        'image' => (string)($entry['image'] ?? ''),
        'price' => $price,
        'roi_pct' => $roi,
    ];
}

function markDailyPulseBuildHeadline(array $trending, array $declining): string
{
    $top = is_array($trending[0] ?? null) ? markDailyPulseFormatMover($trending[0]) : null;
    $worst = is_array($declining[0] ?? null) ? markDailyPulseFormatMover($declining[0]) : null;

    if ($top && $worst && $top['display_name'] !== '' && $worst['display_name'] !== '') {
        return sprintf(
            '%s leads 30D gainers at +%s%% while %s is down %s%%.',
            $top['display_name'],
            number_format(abs((float)$top['roi_pct']), 1),
            $worst['display_name'],
            number_format(abs((float)$worst['roi_pct']), 1)
        );
    }

    if ($top && $top['display_name'] !== '') {
        return sprintf('%s is leading CS2 market momentum on our 30D tracker.', $top['display_name']);
    }

    return 'Daily CS2 market headlines from CS Price — trending skins, cases, and ROI movers.';
}

function markDailySummaryRead(): ?array
{
    $path = markDailyPulseCacheFile();
    if (!is_file($path)) {
        return null;
    }

    $payload = json_decode((string)file_get_contents($path), true);
    if (!is_array($payload)) {
        return null;
    }

    $date = trim((string)($payload['date'] ?? ''));
    $summary = trim((string)($payload['summary'] ?? ''));
    if ($date === '' || $summary === '') {
        return null;
    }

    return [
        'date' => $date,
        'summary' => $summary,
        'generated_at' => (string)($payload['generated_at'] ?? ''),
        'headline' => trim((string)($payload['headline'] ?? '')),
    ];
}

function markDailySummaryWrite(string $date, string $summary, string $headline = ''): void
{
    $dir = dirname(markDailyPulseCacheFile());
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }

    $payload = [
        'date' => $date,
        'summary' => mb_substr(trim($summary), 0, 4000),
        'headline' => mb_substr(trim($headline), 0, 400),
        'generated_at' => gmdate(DATE_ATOM),
    ];

    file_put_contents(
        markDailyPulseCacheFile(),
        json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        LOCK_EX
    );
}

function markDailyPulseContextLines(array $trending, array $declining): array
{
    $lines = ['CS2 market pulse (30D ROI from CS Price cache):'];

    foreach (array_slice($trending, 0, 5) as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $item = markDailyPulseFormatMover($entry);
        if ($item['display_name'] === '') {
            continue;
        }
        $lines[] = sprintf(
            '- Gainer: %s (%s%% 30D ROI%s)',
            $item['display_name'],
            $item['roi_pct'] !== null ? number_format($item['roi_pct'], 2) : '?',
            $item['price'] !== null ? ', ~€' . number_format($item['price'], 2) : ''
        );
    }

    foreach (array_slice($declining, 0, 5) as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $item = markDailyPulseFormatMover($entry);
        if ($item['display_name'] === '') {
            continue;
        }
        $lines[] = sprintf(
            '- Decliner: %s (%s%% 30D ROI%s)',
            $item['display_name'],
            $item['roi_pct'] !== null ? number_format($item['roi_pct'], 2) : '?',
            $item['price'] !== null ? ', ~€' . number_format($item['price'], 2) : ''
        );
    }

    return $lines;
}

function markDailySummaryGenerate(array $trending, array $declining, string $headline): string
{
    if (!aiChatEnabled()) {
        throw new RuntimeException('AI is not configured.');
    }

    $cfg = aiChatConfig();
    $apiKey = trim((string)($cfg['api_key'] ?? ''));
    $model = trim((string)($cfg['model'] ?? 'gpt-5-nano'));
    $baseUrl = rtrim(trim((string)($cfg['base_url'] ?? 'https://api.openai.com/v1')), '/');
    $timeout = max(15, (int)($cfg['timeout_seconds'] ?? 30));

    $context = implode("\n", markDailyPulseContextLines($trending, $declining));
    $prompt = implode("\n", [
        'Write a concise CS2 market daily pulse summary for CS Price users.',
        'Use 2 short paragraphs or 4-6 bullet points.',
        'Cover momentum, notable gainers/losers, and a neutral outlook tone.',
        'Do not invent prices beyond the provided data. Mention volatility and that this is not financial advice.',
        'Headline hint: ' . $headline,
        '',
        $context,
    ]);

    $response = aiHttpPostJson(
        $baseUrl . '/chat/completions',
        array_merge([
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => 'You are Mark, the CS Price market assistant. Be concise and practical.'],
                ['role' => 'user', 'content' => $prompt],
            ],
        ], aiChatModelRequestParams($model, 700, 0.45)),
        [
            'Authorization: Bearer ' . $apiKey,
            'Accept: application/json',
        ],
        $timeout
    );

    if ($response['status'] < 200 || $response['status'] >= 300) {
        $error = (string)($response['json']['error']['message'] ?? $response['json']['error'] ?? 'AI provider error');
        throw new RuntimeException($error !== '' ? $error : 'Daily summary generation failed.');
    }

    $summary = trim((string)($response['json']['choices'][0]['message']['content'] ?? ''));
    if ($summary === '') {
        throw new RuntimeException('AI returned an empty daily summary.');
    }

    return $summary;
}

function markDailySummaryEnsure(array $trending, array $declining, string $headline, bool $forceRefresh = false): array
{
    $today = gmdate('Y-m-d');
    $cached = markDailySummaryRead();
    if (!$forceRefresh && is_array($cached) && ($cached['date'] ?? '') === $today) {
        return [
            'status' => 'ready',
            'date' => $today,
            'summary' => (string)$cached['summary'],
            'generated_at' => (string)($cached['generated_at'] ?? ''),
        ];
    }

    if (!aiChatEnabled()) {
        return [
            'status' => 'disabled',
            'date' => $today,
            'summary' => '',
            'generated_at' => '',
        ];
    }

    try {
        $summary = markDailySummaryGenerate($trending, $declining, $headline);
        markDailySummaryWrite($today, $summary, $headline);
        return [
            'status' => 'ready',
            'date' => $today,
            'summary' => $summary,
            'generated_at' => gmdate(DATE_ATOM),
        ];
    } catch (Throwable $error) {
        if (is_array($cached) && ($cached['summary'] ?? '') !== '') {
            return [
                'status' => 'stale',
                'date' => (string)($cached['date'] ?? ''),
                'summary' => (string)$cached['summary'],
                'generated_at' => (string)($cached['generated_at'] ?? ''),
                'error' => $error->getMessage(),
            ];
        }

        return [
            'status' => 'error',
            'date' => $today,
            'summary' => '',
            'generated_at' => '',
            'error' => $error->getMessage(),
        ];
    }
}

function markDailyPulsePayload(bool $forceSummaryRefresh = false): array
{
    $home = markDailyPulseLoadHomeRoi();
    $trending = array_map('markDailyPulseFormatMover', array_slice($home['trending'], 0, 8));
    $declining = array_map('markDailyPulseFormatMover', array_slice($home['declining'], 0, 8));
    $headline = markDailyPulseBuildHeadline($home['trending'], $home['declining']);
    $summary = markDailySummaryEnsure($home['trending'], $home['declining'], $headline, $forceSummaryRefresh);

    return [
        'success' => true,
        'headline' => $headline,
        'trending' => $trending,
        'declining' => $declining,
        'summary' => $summary,
        'roi_updated_at' => $home['updated_at'],
        'updated_at' => gmdate(DATE_ATOM),
        'ai_enabled' => aiChatEnabled(),
    ];
}
