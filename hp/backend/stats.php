<?php
// 管理画面（admin/dashboard.html）向けの集計API。X-Stats-Token ヘッダーが必要
declare(strict_types=1);
require __DIR__ . '/lib.php';

$config = kcc_config();
$token = (string) ($config['stats_token'] ?? '');
$given = (string) ($_SERVER['HTTP_X_STATS_TOKEN'] ?? '');
if (strlen($token) < 24 || str_contains($token, 'CHANGE_ME') || !hash_equals($token, $given)) {
    kcc_json(403, ['ok' => false, 'error' => '集計用トークンが正しくありません']);
}

$isDay = fn ($v): bool => is_string($v) && (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $v);
$to = $isDay($_GET['to'] ?? null) ? $_GET['to'] : date('Y-m-d');
$from = $isDay($_GET['from'] ?? null) ? $_GET['from'] : date('Y-m-d', strtotime('-29 days'));
if ($from > $to) {
    [$from, $to] = [$to, $from];
}
$range = [$from, $to];
$formPaths = ['/form/', '/contact/', '/diagnosis-form/'];
$formIn = "'" . implode("','", $formPaths) . "'";

$db = kcc_db();
$q = function (string $sql, array $params = []) use ($db): array {
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
};
$one = fn (string $sql, array $params = []) => (int) ($q($sql, $params)[0]['n'] ?? 0);

// ---- 1ページの詳細（流入元・押されたボタン） ----
if (isset($_GET['page'])) {
    $page = kcc_path($_GET['page']);
    kcc_json(200, [
        'ok' => true,
        'page' => $page,
        'referrers' => $q("SELECT ref_type, ref, COUNT(*) AS views, COUNT(DISTINCT sid) AS sessions
            FROM events WHERE type = 'view' AND path = ? AND day BETWEEN ? AND ?
            GROUP BY ref_type, ref ORDER BY sessions DESC LIMIT 30", [$page, ...$range]),
        'next' => $q("SELECT n.path, MAX(n.title) AS title, COUNT(DISTINCT n.sid) AS sessions
            FROM events n WHERE n.type = 'view' AND n.ref_type = 'internal' AND n.ref = ? AND n.day BETWEEN ? AND ?
            GROUP BY n.path ORDER BY sessions DESC LIMIT 15", [$page, ...$range]),
        'cta' => $q("SELECT detail, COUNT(*) AS clicks, COUNT(DISTINCT sid) AS sessions
            FROM events WHERE type = 'cta' AND path = ? AND day BETWEEN ? AND ?
            GROUP BY detail ORDER BY clicks DESC", [$page, ...$range]),
    ]);
}

// ---- 全体 ----
$totals = [
    'views' => $one("SELECT COUNT(*) AS n FROM events WHERE type = 'view' AND day BETWEEN ? AND ?", $range),
    'sessions' => $one("SELECT COUNT(DISTINCT sid) AS n FROM events WHERE type = 'view' AND day BETWEEN ? AND ?", $range),
    'ctaSessions' => $one("SELECT COUNT(DISTINCT sid) AS n FROM events WHERE type = 'cta' AND day BETWEEN ? AND ?", $range),
    'ctaClicks' => $one("SELECT COUNT(*) AS n FROM events WHERE type = 'cta' AND day BETWEEN ? AND ?", $range),
    // フォームページを開いた、またはページ内フォーム（LPなど）に入力を始めた訪問
    'formSessions' => $one("SELECT COUNT(DISTINCT sid) AS n FROM events WHERE ((type = 'view' AND path IN ($formIn)) OR type = 'form_start') AND day BETWEEN ? AND ?", $range),
    'submitSessions' => $one('SELECT COUNT(DISTINCT sid) AS n FROM submissions WHERE day BETWEEN ? AND ?', $range),
    'submits' => $one('SELECT COUNT(*) AS n FROM submissions WHERE day BETWEEN ? AND ?', $range),
];

$daily = $q("SELECT d.day,
        (SELECT COUNT(*) FROM events e WHERE e.type = 'view' AND e.day = d.day) AS views,
        (SELECT COUNT(DISTINCT sid) FROM events e WHERE e.type = 'view' AND e.day = d.day) AS sessions,
        (SELECT COUNT(DISTINCT sid) FROM events e WHERE e.type = 'cta' AND e.day = d.day) AS cta,
        (SELECT COUNT(*) FROM submissions s WHERE s.day = d.day) AS submits
    FROM (SELECT DISTINCT day FROM events WHERE day BETWEEN ? AND ? UNION SELECT DISTINCT day FROM submissions WHERE day BETWEEN ? AND ?) d
    ORDER BY d.day", [...$range, ...$range]);

// ページ別：閲覧した訪問のうち、その後に申込ボタンを押した／送信まで至った訪問数
$pages = $q("WITH v AS (
        SELECT path, sid, MIN(ts) AS ts, COUNT(*) AS n, MAX(title) AS title
        FROM events WHERE type = 'view' AND day BETWEEN ? AND ? GROUP BY path, sid
    )
    SELECT v.path, MAX(v.title) AS title, SUM(v.n) AS views, COUNT(*) AS sessions,
        SUM(EXISTS(SELECT 1 FROM events c WHERE c.sid = v.sid AND c.type = 'cta' AND c.ts >= v.ts)) AS cta,
        SUM(EXISTS(SELECT 1 FROM submissions s WHERE s.sid = v.sid AND s.ts >= v.ts)) AS submits
    FROM v GROUP BY v.path ORDER BY views DESC LIMIT 500", $range);

// 流入元：各訪問の最初のページの参照元
$referrers = $q("WITH f AS (
        SELECT e.sid, e.ref_type, e.ref FROM events e
        JOIN (SELECT sid, MIN(id) AS id FROM events WHERE type = 'view' AND day BETWEEN ? AND ? GROUP BY sid) first ON first.id = e.id
    )
    SELECT f.ref_type, f.ref, COUNT(*) AS sessions,
        SUM(EXISTS(SELECT 1 FROM events c WHERE c.sid = f.sid AND c.type = 'cta')) AS cta,
        SUM(EXISTS(SELECT 1 FROM submissions s WHERE s.sid = f.sid)) AS submits
    FROM f GROUP BY f.ref_type, f.ref ORDER BY sessions DESC LIMIT 100", $range);

$cta = $q("SELECT path, MAX(title) AS title, detail, COUNT(*) AS clicks, COUNT(DISTINCT sid) AS sessions
    FROM events WHERE type = 'cta' AND day BETWEEN ? AND ?
    GROUP BY path, detail ORDER BY clicks DESC LIMIT 100", $range);

// 個人情報（入力内容）は返さない
$recent = $q('SELECT id, ts, form, path, entry_ref_type, entry_ref, entry_path, last_article, mailed
    FROM submissions WHERE day BETWEEN ? AND ? ORDER BY id DESC LIMIT 50', $range);
foreach ($recent as &$r) {
    $r['formLabel'] = KCC_FORMS[$r['form']] ?? $r['form'];
}
unset($r);

kcc_json(200, [
    'ok' => true,
    'from' => $from,
    'to' => $to,
    'totals' => $totals,
    'daily' => $daily,
    'pages' => $pages,
    'referrers' => $referrers,
    'cta' => $cta,
    'recent' => $recent,
]);
