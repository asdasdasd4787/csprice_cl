<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || $raw === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function normalizeNewsletterEmail(string $email): string
{
    return strtolower(trim($email));
}

function isValidNewsletterEmail(string $email): bool
{
    return $email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

function newsletterStorePath(): string
{
    $dir = __DIR__ . '/assets/newsletter';
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }

    return $dir . '/subscribers.json';
}

function loadNewsletterStore(string $path): array
{
    if (!is_file($path)) {
        return ['updated_at' => null, 'subscribers' => []];
    }

    $decoded = json_decode((string) file_get_contents($path), true);
    if (!is_array($decoded)) {
        return ['updated_at' => null, 'subscribers' => []];
    }

    $rows = is_array($decoded['subscribers'] ?? null) ? $decoded['subscribers'] : [];
    return [
        'updated_at' => $decoded['updated_at'] ?? null,
        'subscribers' => $rows,
    ];
}

function saveNewsletterStore(string $path, array $subscribers): void
{
    $payload = [
        'updated_at' => gmdate('c'),
        'total_count' => count($subscribers),
        'subscribers' => array_values($subscribers),
    ];

    file_put_contents(
        $path,
        json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
        LOCK_EX
    );
}

$body = readJsonBody();
$email = normalizeNewsletterEmail((string) ($body['email'] ?? $_POST['email'] ?? ''));

if (!isValidNewsletterEmail($email)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => 'Enter a valid email address.']);
    exit;
}

$path = newsletterStorePath();
$store = loadNewsletterStore($path);
$subscribers = is_array($store['subscribers']) ? $store['subscribers'] : [];
$existingIndex = null;

foreach ($subscribers as $index => $row) {
    $stored = normalizeNewsletterEmail((string) ($row['email'] ?? ''));
    if ($stored === $email) {
        $existingIndex = $index;
        break;
    }
}

if ($existingIndex !== null) {
    echo json_encode([
        'success' => true,
        'already_subscribed' => true,
        'message' => 'You are already subscribed.',
    ]);
    exit;
}

$subscribers[] = [
    'email' => $email,
    'subscribed_at' => gmdate('c'),
    'source' => trim((string) ($body['source'] ?? 'footer')),
    'ip_hash' => hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown')),
];

saveNewsletterStore($path, $subscribers);

echo json_encode([
    'success' => true,
    'already_subscribed' => false,
    'message' => 'Thanks — you are on the list.',
]);
