<?php
// ページ閲覧・申込ボタンのクリックを記録する（assets/js/track.js から送信）
declare(strict_types=1);
require __DIR__ . '/lib.php';

kcc_require_post();
if (kcc_is_bot()) {
    http_response_code(204);
    exit;
}

$in = kcc_input();
$type = in_array($in['type'] ?? '', ['view', 'cta', 'form_start'], true) ? $in['type'] : '';
$sid = kcc_sid($in['sid'] ?? '');
$path = kcc_path($in['path'] ?? '');
if ($type === '' || $sid === '' || $path === '') {
    kcc_json(400, ['ok' => false]);
}

$refType = in_array($in['refType'] ?? '', ['internal', 'external', 'direct', 'campaign'], true) ? $in['refType'] : 'direct';

try {
    $stmt = kcc_db()->prepare('INSERT INTO events (ts, day, sid, type, path, title, ref_type, ref, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $now = time();
    $stmt->execute([
        $now,
        date('Y-m-d', $now),
        $sid,
        $type,
        $path,
        kcc_str($in['title'] ?? '', 200),
        $refType,
        kcc_str($in['ref'] ?? '', 300),
        kcc_str($in['detail'] ?? '', 300),
    ]);
} catch (Throwable $e) {
    error_log('[kcc track] ' . $e->getMessage());
    kcc_json(500, ['ok' => false]);
}

http_response_code(204);
