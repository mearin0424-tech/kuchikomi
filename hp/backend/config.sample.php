<?php
// このファイルを config.php という名前でコピーし、値を書き換えてから XServer にアップロードしてください。
// config.php には秘密の値が入るため、GitHub には登録されません（.gitignore 済み）。
return [
    // 申し込み・お問い合わせの通知を受け取るメールアドレス
    'mail_to' => 'info@example.com',

    // 送信元アドレス。XServer で作成した、公開ドメインのメールアドレスにしてください（迷惑メール判定を避けるため）
    'mail_from' => 'no-reply@example.com',
    'mail_from_name' => '一般社団法人 口コミ対策センター',

    // 送信者への自動返信メールを送るか
    'auto_reply' => true,
    'signature' => "一般社団法人 口コミ対策センター\n〒104-0053 東京都中央区晴海3-16-1\n",

    // 管理画面のアクセス解析が集計データを読み出すための合言葉（24文字以上のランダムな文字列）
    // 例: PowerShell で  -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})
    'stats_token' => 'CHANGE_ME_TO_A_LONG_RANDOM_STRING',
];
