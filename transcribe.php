<?php
declare(strict_types=1);

require __DIR__ . '/app_bootstrap.php';
require_once __DIR__ . '/ai_chat_helpers.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respondJson(['success' => false, 'error' => 'Method not allowed'], 405);
}

if (!aiChatEnabled()) {
    respondJson([
        'success' => false,
        'error' => 'Voice dictation needs AI configured. Add your API key under ai in config.local.php.',
        'enabled' => false,
    ], 503);
}

$file = $_FILES['audio'] ?? null;
if (!is_array($file) || (int)($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    respondJson(['success' => false, 'error' => 'Audio upload is required.'], 400);
}

$tmpPath = (string)($file['tmp_name'] ?? '');
$originalName = (string)($file['name'] ?? 'dictation.webm');
$mimeType = (string)($file['type'] ?? 'audio/webm');

try {
    $text = aiChatTranscribeAudio($tmpPath, $originalName, $mimeType);
    respondJson([
        'success' => true,
        'text' => $text,
    ]);
} catch (Throwable $error) {
    $message = $error->getMessage();
    // "Project `proj_...` does not have access to model `whisper-1`": the API
    // key belongs to an OpenAI project whose allowed-model list has no
    // speech-to-text model. Say what to do instead of echoing the raw error.
    if (preg_match('/does not have access to model/i', $message)) {
        $message = 'Voice dictation is off: this OpenAI project key has no speech-to-text model enabled. '
            . 'In the OpenAI dashboard open Settings > Project > Limits and allow "gpt-4o-mini-transcribe" (or "whisper-1").';
    }
    respondJson([
        'success' => false,
        'error' => $message,
    ], 500);
}
