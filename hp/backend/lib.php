<?php
// アクセス計測・フォーム受付の共通処理（XServer の PHP + SQLite で動作）
declare(strict_types=1);

ini_set('display_errors', '0'); // 警告がJSON応答に混ざらないようにする
date_default_timezone_set('Asia/Tokyo');
mb_language('Japanese');
mb_internal_encoding('UTF-8');

const KCC_FORMS = [
    'form' => '無料診断・お申し込み',
    'diagnosis' => '無料診断フォーム',
    'contact' => 'お問い合わせ',
    'lp' => 'LP（法人向け口コミ非表示対策）',
];

function kcc_config(): array
{
    static $config = null;
    if ($config === null) {
        $file = __DIR__ . '/config.php';
        if (!is_file($file)) {
            kcc_json(500, ['ok' => false, 'error' => 'backend/config.php がありません。config.sample.php をコピーして作成してください。']);
        }
        $config = require $file;
    }
    return $config;
}

function kcc_db(): PDO
{
    static $db = null;
    if ($db !== null) {
        return $db;
    }
    $dir = __DIR__ . '/data';
    if (!is_dir($dir)) {
        mkdir($dir, 0700, true);
    }
    $db = new PDO('sqlite:' . $dir . '/analytics.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $db->exec('PRAGMA busy_timeout = 5000');
    $db->exec('PRAGMA journal_mode = WAL');
    $db->exec('CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        day TEXT NOT NULL,
        sid TEXT NOT NULL,
        type TEXT NOT NULL,
        path TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT \'\',
        ref_type TEXT NOT NULL DEFAULT \'\',
        ref TEXT NOT NULL DEFAULT \'\',
        detail TEXT NOT NULL DEFAULT \'\'
    )');
    $db->exec('CREATE INDEX IF NOT EXISTS events_day ON events(day, type)');
    $db->exec('CREATE INDEX IF NOT EXISTS events_sid ON events(sid, type, ts)');
    $db->exec('CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        day TEXT NOT NULL,
        sid TEXT NOT NULL,
        form TEXT NOT NULL,
        path TEXT NOT NULL,
        entry_ref_type TEXT NOT NULL DEFAULT \'\',
        entry_ref TEXT NOT NULL DEFAULT \'\',
        entry_path TEXT NOT NULL DEFAULT \'\',
        last_article TEXT NOT NULL DEFAULT \'\',
        fields TEXT NOT NULL,
        mailed INTEGER NOT NULL DEFAULT 0
    )');
    $db->exec('CREATE INDEX IF NOT EXISTS submissions_day ON submissions(day)');
    $db->exec('CREATE INDEX IF NOT EXISTS submissions_sid ON submissions(sid, ts)');
    return $db;
}

function kcc_json(int $status, array $data): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function kcc_require_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        kcc_json(405, ['ok' => false, 'error' => 'POST only']);
    }
}

function kcc_input(): array
{
    $raw = file_get_contents('php://input', false, null, 0, 200000);
    $data = json_decode($raw ?: '', true);
    return is_array($data) ? $data : [];
}

// 制御文字を除き、長さを制限した文字列にする
function kcc_str($value, int $max, bool $multiline = false): string
{
    if (!is_scalar($value)) {
        return '';
    }
    $s = (string) $value;
    $s = $multiline
        ? preg_replace('/[^\P{C}\n\t]/u', '', str_replace("\r\n", "\n", $s))
        : preg_replace('/\p{C}/u', '', $s);
    return mb_substr(trim((string) $s), 0, $max);
}

function kcc_sid($value): string
{
    $sid = kcc_str($value, 40);
    return preg_match('/^[A-Za-z0-9_-]{8,40}$/', $sid) ? $sid : '';
}

function kcc_path($value): string
{
    $path = kcc_str($value, 300);
    return str_starts_with($path, '/') ? $path : '';
}

function kcc_is_bot(): bool
{
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    return $ua === '' || (bool) preg_match('/bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget|python|php/i', $ua);
}
