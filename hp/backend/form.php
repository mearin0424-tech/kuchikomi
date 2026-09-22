<?php
// 申し込み・お問い合わせフォームの受付（保存・メール通知・自動返信）
declare(strict_types=1);
require __DIR__ . '/lib.php';

kcc_require_post();
$config = kcc_config();
$in = kcc_input();

$form = array_key_exists($in['form'] ?? '', KCC_FORMS) ? $in['form'] : '';
if ($form === '') {
    kcc_json(400, ['ok' => false, 'error' => 'フォームの種類が不正です']);
}

// スパム対策：隠し項目に入力がある、または表示から3秒未満の送信は保存せずに成功扱いにする
if (kcc_str($in['website'] ?? '', 200) !== '' || (int) ($in['elapsed'] ?? 0) < 3000) {
    kcc_json(200, ['ok' => true]);
}

$fields = [];
$email = '';
$name = '';
foreach (array_slice(is_array($in['fields'] ?? null) ? $in['fields'] : [], 0, 60) as $field) {
    if (!is_array($field)) {
        continue;
    }
    $label = kcc_str($field['label'] ?? '', 100);
    $value = kcc_str($field['value'] ?? '', 5000, true);
    if ($label === '' || $value === '') {
        continue;
    }
    $fields[] = ['label' => $label, 'value' => $value];
    if ($email === '' && ($field['kind'] ?? '') === 'email' && filter_var($value, FILTER_VALIDATE_EMAIL)) {
        $email = $value;
    }
    if ($name === '' && preg_match('/お名前|担当者名|氏名/u', $label)) {
        $name = $value;
    }
}
if (!$fields) {
    kcc_json(400, ['ok' => false, 'error' => '入力内容が空です']);
}

$sid = kcc_sid($in['sid'] ?? '') ?: 'nosession-' . bin2hex(random_bytes(6));
$entry = is_array($in['entry'] ?? null) ? $in['entry'] : [];
$row = [
    'form' => $form,
    'path' => kcc_path($in['path'] ?? '') ?: '/',
    'entry_ref_type' => in_array($entry['refType'] ?? '', ['internal', 'external', 'direct', 'campaign'], true) ? $entry['refType'] : 'direct',
    'entry_ref' => kcc_str($entry['ref'] ?? '', 300),
    'entry_path' => kcc_path($entry['path'] ?? ''),
    'last_article' => kcc_path($in['lastArticle'] ?? ''),
];

$now = time();
try {
    $db = kcc_db();
    $stmt = $db->prepare('INSERT INTO submissions (ts, day, sid, form, path, entry_ref_type, entry_ref, entry_path, last_article, fields) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([$now, date('Y-m-d', $now), $sid, $row['form'], $row['path'], $row['entry_ref_type'], $row['entry_ref'], $row['entry_path'], $row['last_article'], json_encode($fields, JSON_UNESCAPED_UNICODE)]);
    $id = (int) $db->lastInsertId();
} catch (Throwable $e) {
    error_log('[kcc form] ' . $e->getMessage());
    kcc_json(500, ['ok' => false, 'error' => '送信を保存できませんでした。お手数ですがLINE（https://lin.ee/gVRUtOl）からご連絡ください。']);
}

// ---- メール通知 ----
$lines = [];
foreach ($fields as $f) {
    $lines[] = "■ {$f['label']}\n{$f['value']}\n";
}
$entryText = match ($row['entry_ref_type']) {
    'external' => '外部サイト: ' . $row['entry_ref'],
    'campaign' => '広告・キャンペーン: ' . $row['entry_ref'],
    'internal' => 'サイト内: ' . $row['entry_ref'],
    default => '直接アクセス（ブックマーク・URL入力など）',
};
$body = "サイトから「" . KCC_FORMS[$form] . "」が送信されました。\n\n"
    . implode("\n", $lines)
    . "\n----------------------------------------\n"
    . "受付番号: {$id}\n"
    . '受付日時: ' . date('Y/m/d H:i', $now) . "\n"
    . "送信ページ: {$row['path']}\n"
    . "サイトへの流入元: {$entryText}\n"
    . '最初に見たページ: ' . ($row['entry_path'] ?: '-') . "\n"
    . '直前に読んだ記事: ' . ($row['last_article'] ?: '-') . "\n";

$mailTo = (string) ($config['mail_to'] ?? '');
$mailFrom = (string) ($config['mail_from'] ?? '');
$fromName = (string) ($config['mail_from_name'] ?? '一般社団法人 口コミ対策センター');
$safe = fn (string $v): string => str_replace(["\r", "\n"], '', $v);
$fromHeader = 'From: ' . mb_encode_mimeheader($safe($fromName)) . ' <' . $safe($mailFrom) . '>';
$mailed = false;

if (filter_var($mailTo, FILTER_VALIDATE_EMAIL) && filter_var($mailFrom, FILTER_VALIDATE_EMAIL)) {
    $headers = $fromHeader . ($email !== '' ? "\r\nReply-To: " . $safe($email) : '');
    $subject = '【サイト受付】' . KCC_FORMS[$form] . ($name !== '' ? "（{$name} 様）" : '');
    $mailed = mb_send_mail($mailTo, $subject, $body, $headers, '-f' . $mailFrom);

    if ($email !== '' && !empty($config['auto_reply'])) {
        $reply = ($name !== '' ? "{$name} 様\n\n" : '')
            . "このたびは一般社団法人 口コミ対策センターへお問い合わせいただき、誠にありがとうございます。\n"
            . "以下の内容で受け付けました。担当者より1営業日以内にご連絡いたします。\n\n"
            . implode("\n", $lines)
            . "\n----------------------------------------\n"
            . "※本メールは送信専用アドレスから自動でお送りしています。\n"
            . "※お心当たりのない場合は、お手数ですが本メールを破棄してください。\n\n"
            . ($config['signature'] ?? "一般社団法人 口コミ対策センター\n");
        mb_send_mail($email, '【口コミ対策センター】お問い合わせを受け付けました', $reply, $fromHeader, '-f' . $mailFrom);
    }
}

try {
    kcc_db()->prepare('UPDATE submissions SET mailed = ? WHERE id = ?')->execute([$mailed ? 1 : 0, $id]);
} catch (Throwable $e) {
    error_log('[kcc form] ' . $e->getMessage());
}

kcc_json(200, ['ok' => true, 'id' => $id]);
