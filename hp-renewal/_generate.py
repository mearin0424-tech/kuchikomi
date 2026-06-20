# -*- coding: utf-8 -*-
"""
hp-renewal Site Generator
- 47都道府県 + 海外5地域 + 業種10種 + プラットフォーム8種の独立ページを生成
- TOP / 主要下層ページもこのスクリプトから生成
- 画像はインラインSVGプレースホルダ
"""
from __future__ import annotations
import os
from pathlib import Path
from textwrap import dedent

ROOT = Path(__file__).resolve().parent

# ----------- データ定義 -----------
PREFECTURES = [
    # (region_jp, region_en, slug, name)
    ("北海道・東北", "hokkaido-tohoku", "hokkaido", "北海道"),
    ("北海道・東北", "hokkaido-tohoku", "aomori", "青森県"),
    ("北海道・東北", "hokkaido-tohoku", "iwate", "岩手県"),
    ("北海道・東北", "hokkaido-tohoku", "miyagi", "宮城県"),
    ("北海道・東北", "hokkaido-tohoku", "akita", "秋田県"),
    ("北海道・東北", "hokkaido-tohoku", "yamagata", "山形県"),
    ("北海道・東北", "hokkaido-tohoku", "fukushima", "福島県"),
    ("関東", "kanto", "ibaraki", "茨城県"),
    ("関東", "kanto", "tochigi", "栃木県"),
    ("関東", "kanto", "gunma", "群馬県"),
    ("関東", "kanto", "saitama", "埼玉県"),
    ("関東", "kanto", "chiba", "千葉県"),
    ("関東", "kanto", "tokyo", "東京都"),
    ("関東", "kanto", "kanagawa", "神奈川県"),
    ("中部", "chubu", "niigata", "新潟県"),
    ("中部", "chubu", "toyama", "富山県"),
    ("中部", "chubu", "ishikawa", "石川県"),
    ("中部", "chubu", "fukui", "福井県"),
    ("中部", "chubu", "yamanashi", "山梨県"),
    ("中部", "chubu", "nagano", "長野県"),
    ("中部", "chubu", "gifu", "岐阜県"),
    ("中部", "chubu", "shizuoka", "静岡県"),
    ("中部", "chubu", "aichi", "愛知県"),
    ("近畿", "kinki", "mie", "三重県"),
    ("近畿", "kinki", "shiga", "滋賀県"),
    ("近畿", "kinki", "kyoto", "京都府"),
    ("近畿", "kinki", "osaka", "大阪府"),
    ("近畿", "kinki", "hyogo", "兵庫県"),
    ("近畿", "kinki", "nara", "奈良県"),
    ("近畿", "kinki", "wakayama", "和歌山県"),
    ("中国", "chugoku", "tottori", "鳥取県"),
    ("中国", "chugoku", "shimane", "島根県"),
    ("中国", "chugoku", "okayama", "岡山県"),
    ("中国", "chugoku", "hiroshima", "広島県"),
    ("中国", "chugoku", "yamaguchi", "山口県"),
    ("四国", "shikoku", "tokushima", "徳島県"),
    ("四国", "shikoku", "kagawa", "香川県"),
    ("四国", "shikoku", "ehime", "愛媛県"),
    ("四国", "shikoku", "kochi", "高知県"),
    ("九州・沖縄", "kyushu-okinawa", "fukuoka", "福岡県"),
    ("九州・沖縄", "kyushu-okinawa", "saga", "佐賀県"),
    ("九州・沖縄", "kyushu-okinawa", "nagasaki", "長崎県"),
    ("九州・沖縄", "kyushu-okinawa", "kumamoto", "熊本県"),
    ("九州・沖縄", "kyushu-okinawa", "oita", "大分県"),
    ("九州・沖縄", "kyushu-okinawa", "miyazaki", "宮崎県"),
    ("九州・沖縄", "kyushu-okinawa", "kagoshima", "鹿児島県"),
    ("九州・沖縄", "kyushu-okinawa", "okinawa", "沖縄県"),
]

OVERSEAS = [
    ("overseas", "asia", "アジア圏（中国・韓国・台湾・東南アジア）"),
    ("overseas", "north-america", "北米（アメリカ・カナダ）"),
    ("overseas", "europe", "ヨーロッパ（EU圏・英国）"),
    ("overseas", "oceania", "オセアニア（豪・NZ）"),
    ("overseas", "global", "海外サーバー全般・英語対応"),
]

INDUSTRIES = [
    ("restaurant", "飲食店", "居酒屋・レストラン・カフェ等"),
    ("medical", "医療機関", "クリニック・病院・歯科医院等"),
    ("beauty", "美容業界", "美容室・サロン・エステ等"),
    ("realestate", "不動産", "賃貸・売買仲介・管理会社"),
    ("legal", "士業事務所", "弁護士・税理士・社労士等"),
    ("retail", "小売・EC", "実店舗小売・通販事業者"),
    ("school", "教育・スクール", "学習塾・専門学校・習い事"),
    ("auto", "自動車関連", "ディーラー・整備工場・板金"),
    ("hotel", "宿泊・旅館", "ホテル・旅館・民泊"),
    ("bridal", "ブライダル", "結婚式場・フォト・プランナー"),
]

PLATFORMS = [
    ("google-maps", "Googleマップ口コミ対策", "Googleビジネスプロフィール（MEO）"),
    ("5ch", "5ch（旧2ch）スレッド対策", "5ちゃんねる/ピンクちゃんねる/コピーサイト"),
    ("bakusai", "爆サイ.com対策", "地方掲示板の誹謗中傷"),
    ("hosting", "ホストラブ・キャバ系掲示板対策", "夜職向けレビューサイト"),
    ("yahoo", "Yahoo!知恵袋・教えて!goo対策", "Yahoo!関連サービス"),
    ("twitter-x", "X（旧Twitter）誹謗中傷対策", "SNS拡散の早期収束"),
    ("review-site", "口コミサイト・レビュー集合体対策", "食べログ・Hot Pepper等"),
    ("youtube", "YouTubeコメント・動画対策", "晒し・炎上動画対応"),
    ("recruit-site", "転職会議・OpenWork等の悪評対策", "求人サイトの口コミ"),
    ("sns-social", "Instagram／TikTok の炎上拡散対策", "SNS拡散・引用炎上"),
    ("blog-ranking", "ランキングサイト・告発ブログの逆SEO", "比較サイト・暴露ブログ"),
    ("suggest-keyword", "サジェスト汚染・関連キーワード対策", "Google/Yahoo!の検索候補"),
    ("overseas-bbs", "海外サーバー掲示板・ミラーサイト対策", "海外運営の掲示板群"),
]

# 追加: 主要都市
CITIES = [
    ("sapporo", "札幌市", "北海道"),
    ("sendai", "仙台市", "宮城県"),
    ("saitama-city", "さいたま市", "埼玉県"),
    ("chiba-city", "千葉市", "千葉県"),
    ("yokohama", "横浜市", "神奈川県"),
    ("kawasaki", "川崎市", "神奈川県"),
    ("niigata-city", "新潟市", "新潟県"),
    ("hamamatsu", "浜松市", "静岡県"),
    ("nagoya", "名古屋市", "愛知県"),
    ("kyoto-city", "京都市", "京都府"),
    ("osaka-city", "大阪市", "大阪府"),
    ("sakai", "堺市", "大阪府"),
    ("kobe", "神戸市", "兵庫県"),
    ("okayama-city", "岡山市", "岡山県"),
    ("hiroshima-city", "広島市", "広島県"),
    ("kitakyushu", "北九州市", "福岡県"),
    ("fukuoka-city", "福岡市", "福岡県"),
    ("kumamoto-city", "熊本市", "熊本県"),
    ("shibuya", "渋谷エリア", "東京都"),
    ("shinjuku", "新宿エリア", "東京都"),
]

# 追加: 知識・概念ページ
KNOWLEDGE = [
    ("about-reputation", "口コミ対策とWEBレピュテーション対策とは",
     "ネット上の評判（レピュテーション）を健全な状態に保つための、ITとリスク管理の総合的取り組みの全体像。"),
    ("about-center", "一般社団法人口コミ対策センターとは",
     "事業者・経営者・個人の信用を、適法かつ持続可能な方法で守る専門機関としての役割と立ち位置。"),
    ("success-tips", "風評被害・悪評解決成功の秘訣",
     "解決に成功している事業者が共通して実行しているステップと、初動の判断ポイント。"),
    ("defamation-brand", "誹謗中傷・ブランド毀損の解決アプローチ",
     "ブランドが受ける毀損の構造的な理解と、それに対する是正・防衛・回復の3層アプローチ。"),
    ("recover-trust", "本当に信用を回復したい企業・個人様へ",
     "短期の削除ではなく、長期の信用基盤を作るための考え方と、当センターが提供できる伴走。"),
    ("dont-suffer-alone", "ネットの悪評をひとりで悩まないで",
     "経営者個人で抱え込むリスクと、外部専門家に相談すべきタイミング。"),
    ("risk-of-fight", "安易な反論・法的措置は逆効果？炎上リスクの罠",
     "本人による反論や性急な法的措置がかえって被害を拡大させるメカニズムとその回避。"),
    ("solutions-exist", "ネットの悪評・風評被害には確実に解決策があります",
     "現状を諦めるべきではない理由と、当センターが提供する具体的な選択肢の全体像。"),
    ("specialists", "WEBリスクマネジメントには専門家がいます",
     "なぜ専門機関に依頼することが、コスト・時間・成果のいずれの観点でも合理的なのか。"),
]

# 追加: 解決プロセスのサブ
PROCESS_STEPS = [
    ("diagnosis", "STEP 01 ｜ 無料WEBリスク状況診断・風評検知",
     "現状の口コミ・サジェスト・SNS拡散の状況を、無料で可視化します。"),
    ("proposal", "STEP 02 ｜ 最適なレピュテーション対策プランのご提案",
     "診断結果を踏まえ、優先順位と費用感を明示したカスタムプランをご提案します。"),
    ("cleaning", "STEP 03 ｜ IT技術・逆SEO・検索エンジンのクリーン化",
     "プラットフォーム規約と検索エンジンの仕様に準拠した、技術的・人的アプローチで対策を実行します。"),
    ("removal", "STEP 04 ｜ 風評・悪質口コミの削除サポート",
     "ガイドライン違反に該当する投稿について、正当な報告フローで削除・非表示化を進めます。"),
    ("aftercare", "STEP 05 ｜ 対策後の再発防止・監視アフターサポート",
     "是正後の再発防止のため、24時間のモニタリング体制でフォローします。"),
]

# 追加: 拡張メソッド・約束・難易度・NDA・フォレンジック等
EXTRA_METHODS = [
    ("promises", "当センター 5つの約束",
     "機密保持・成果コミット・正攻法・伴走・誠実さに関する、当センターの行動原則。"),
    ("plan-info", "口コミ・風評被害対策プランのご案内",
     "案件難易度別の標準プランと、各プランの内容・想定期間・料金感の解説。"),
    ("forensics", "デジタルフォレンジック・追跡調査",
     "悪質投稿者の特定や証拠化のための、技術的調査サービス。"),
    ("brand-resilience", "WEBリスク耐性・企業ブランド力の向上",
     "一度の対策で終わらせず、ブランドが長期にわたり耐性を持つための仕組み構築。"),
]

EXTRA_INDIE_PAGES = [
    ("difficulty", "サイト別・掲示板別の対策難易度",
     "Googleマップ／5ch／爆サイ／SNS等、媒体ごとに異なる対策の難易度と所要期間の目安。"),
    ("nda", "ご契約と秘密保持契約（NDA）について",
     "ご契約時のNDA締結の流れと、当センターの情報管理体制について。"),
    ("trademark", "登録商標・知的財産について",
     "当センターが保有する登録商標・知的財産権に関するお知らせ。"),
    ("access", "組織概要・アクセスマップ",
     "当センターの所在地、最寄駅、アクセスマップ。"),
]

# 追加: コラム
COLUMNS = [
    ("case-studies", "口コミ対策成功事例集",
     "業種・媒体別の実際の解決事例を、守秘義務の範囲内でご紹介します。"),
    ("it-law", "IT法務とWEB技術のスペシャリスト・コラム",
     "プロバイダ責任制限法、改正案、各プラットフォームのガイドライン解説。"),
    ("diy-prevention", "自社でできるネット風評被害の予防と対策",
     "外部依頼が必要なケースと、社内で実施できる初動対応・予防策。"),
    ("risk-management", "企業防衛のためのWEBリスクマネジメントのすすめ",
     "経営課題としてのWEBリスクの位置づけと、推奨されるガバナンス整備。"),
]

# 追加: 注意喚起・お知らせ
NOTICES = [
    ("law-update", "改正プロバイダ責任制限法（発信者情報開示請求）について",
     "法改正の概要と、実務への影響、当センターの対応方針。", "お知らせ"),
    ("scam-warning", "「押し売り系」高額請求の悪質業者にご注意ください",
     "当センターを騙る悪質業者、押し売り業者に関する注意喚起。", "注意喚起"),
    ("anti-defamation", "弊社への迷惑行為、作為的比較ランキングについて",
     "当センターを名指しした作為的な評価・比較サイトに関するお知らせ。", "注意喚起"),
    ("comparison", "各種風評被害対策（削除請求・逆SEO・法的措置）の手法とリスク比較",
     "対策手法ごとのメリット・デメリット・リスクを比較解説。", "コラム"),
    ("recruit-impact", "内定辞退を防ぐ！採用時期における企業口コミ対策の重要性",
     "新卒・中途採用シーズンに口コミ対策が応募率・内定承諾率に与える影響。", "コラム"),
    ("2026-06", "2026年06月の口コミ対策・風評被害相談 稼働状況",
     "今月の新規受付状況および対応体制のご案内。", "お知らせ"),
    ("2026-07", "2026年07月の口コミ対策・風評被害相談 稼働状況",
     "翌月の新規受付予定および対応体制のご案内。", "お知らせ"),
]

# ----------- SVGプレースホルダ -----------
def svg_placeholder(label: str, color: str = "navy", w: int = 800, h: int = 450) -> str:
    palette = {
        "navy":   ("#044072", "#0048be"),
        "accent": ("#f59e0b", "#d97706"),
        "soft":   ("#f3f6fb", "#e5e7eb"),
        "red":    ("#bb0000", "#e63b3b"),
        "dark":   ("#061a2e", "#0a2742"),
    }
    c1, c2 = palette.get(color, palette["navy"])
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="{label}">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/></linearGradient>'
        f'<pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="20" cy="20" r="1.5" fill="rgba(255,255,255,0.08)"/></pattern></defs>'
        f'<rect width="{w}" height="{h}" fill="url(#g)"/>'
        f'<rect width="{w}" height="{h}" fill="url(#p)"/>'
        f'<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="Noto Sans JP, sans-serif" font-size="28" font-weight="700" fill="rgba(255,255,255,0.95)" letter-spacing="2">{label}</text>'
        f'<text x="50%" y="62%" text-anchor="middle" dominant-baseline="central" font-family="Noto Sans JP, sans-serif" font-size="11" font-weight="400" fill="rgba(255,255,255,0.6)" letter-spacing="6">PLACEHOLDER IMAGE</text>'
        f'</svg>'
    )

ICONS = {
    "check": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    "free":  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><line x1="12" y1="6" x2="12" y2="18"/></svg>',
    "shield": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    "globe": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    "eye": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    "lock": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    "phone": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.71 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.71A2 2 0 0 1 22 16.92z"/></svg>',
    "mail": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    "calendar": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    "alert": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    "store": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l2-5h14l2 5"/><path d="M3 9v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9"/><path d="M3 9h18"/></svg>',
    "medical": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    "map": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    "chart": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 17l4-4 4 4 6-6"/></svg>',
}

# ----------- 共通テンプレート -----------
GLOBAL_NAV = [
    ("対策とは", "/knowledge/"),
    ("無料相談", "/contact/"),
    ("解決プロセス", "/process/"),
    ("成功事例", "/cases/"),
    ("料金", "/pricing/"),
    ("対応地域", "/area/"),
    ("業種別", "/industry/"),
    ("媒体別", "/platform/"),
    ("コラム", "/column/"),
    ("組織概要", "/about/"),
]

def rel(prefix_depth: int, path: str) -> str:
    """ ルートからのパスを階層に合わせて変換。 prefix_depth=0は/index.html基準 """
    if path.startswith("/"):
        if prefix_depth == 0:
            return path[1:] if path != "/" else "./"
        return "../" * prefix_depth + path[1:]
    return path

def header(depth: int, active: str = "") -> str:
    def _item(label, path):
        cls = ' class="is-active"' if active == label else ""
        return f'<a href="{rel(depth, path)}"{cls}>{label}</a>'
    nav_items = "".join(_item(l, p) for l, p in GLOBAL_NAV)
    root = rel(depth, "/")
    return dedent(f"""
    <div class="topbar">
      <div class="topbar__inner">
        <div class="topbar__left">
          <span class="topbar__badge">本日も無料診断対応中</span>
          <span>受付時間 10:00 - 20:00（年中無休）</span>
        </div>
        <div class="topbar__right">
          <a href="{rel(depth,'/news/')}">お知らせ</a>
          <a href="{rel(depth,'/recruit/')}">採用情報</a>
          <a href="{rel(depth,'/contact/')}">お問い合わせ</a>
        </div>
      </div>
    </div>

    <header class="site-header">
      <div class="site-header__inner">
        <a href="{root}" class="site-logo">
          <span class="site-logo__mark">口</span>
          <span>
            <span class="site-logo__name">一般社団法人</span>
            <span class="site-logo__title">口コミ対策センター</span>
          </span>
        </a>
        <div class="security-badges">
          <span class="security-badge">{ICONS['shield']}ISMS準拠</span>
          <span class="security-badge">{ICONS['lock']}SSL/TLS</span>
          <span class="security-badge">{ICONS['check']}秘密厳守NDA</span>
        </div>
        <div class="header-contact">
          <div class="contact-block">
            <span class="label">法人窓口</span>
            <span class="tel"><a href="tel:0120000001">0120-000-001</a></span>
            <span class="hours">平日 10:00-20:00</span>
          </div>
          <div class="contact-block is-individual">
            <span class="label">個人窓口</span>
            <span class="tel"><a href="tel:0120000002">0120-000-002</a></span>
            <span class="hours">10:00-20:00</span>
          </div>
          <div class="header-cta">
            <a href="{rel(depth,'/contact/')}" class="btn btn--primary btn--sm">無料診断</a>
            <a href="{rel(depth,'/contact/')}" class="btn btn--navy btn--sm">面談予約</a>
          </div>
        </div>
      </div>
    </header>

    <nav class="global-nav" aria-label="グローバルナビ">
      <div class="global-nav__inner">
        <button class="nav-toggle" aria-expanded="false" aria-label="メニュー">
          <span></span><span></span><span></span>
        </button>
        <div class="global-nav-list">
          {nav_items}
        </div>
      </div>
    </nav>
    """)

# 47都道府県＋エリアリンク群（共有部分）
def area_grid_block(depth: int) -> str:
    by_region: dict[str, list[tuple[str,str,str,str]]] = {}
    for region_jp, region_en, slug, name in PREFECTURES:
        by_region.setdefault(region_jp, []).append((region_jp, region_en, slug, name))
    blocks = []
    for region_jp, items in by_region.items():
        prefs = "".join(
            f'<a href="{rel(depth, f"/area/{slug}/")}">{name}</a>'
            for _, _, slug, name in items
        )
        blocks.append(f'<div class="area-region"><div class="area-region__title">{region_jp}</div><div class="pref-grid">{prefs}</div></div>')
    overseas_items = "".join(
        f'<a href="{rel(depth, f"/overseas/{slug}/")}">{name}</a>' for _, slug, name in OVERSEAS
    )
    blocks.append(f'<div class="area-region"><div class="area-region__title">海外対応</div><div class="pref-grid">{overseas_items}</div></div>')
    return "\n".join(blocks)

def industry_banners(depth: int) -> str:
    items = []
    for slug, name, sub in INDUSTRIES:
        items.append(
            f'<a class="banner" href="{rel(depth, f"/industry/{slug}/")}">'
            f'<div class="banner__cover"><span class="banner__cover-label">業種別</span>{svg_placeholder(name,"navy",640,360)}</div>'
            f'<div class="banner__body"><div class="banner__title">{name}の口コミ対策</div>'
            f'<div class="banner__sub">{sub}</div><div class="banner__cta">対策事例を見る</div></div></a>'
        )
    return f'<div class="banner-grid">{"".join(items)}</div>'

def platform_banners(depth: int) -> str:
    items = []
    for slug, name, sub in PLATFORMS:
        items.append(
            f'<a class="banner" href="{rel(depth, f"/platform/{slug}/")}">'
            f'<div class="banner__cover"><span class="banner__cover-label">媒体別</span>{svg_placeholder(name,"accent",640,360)}</div>'
            f'<div class="banner__body"><div class="banner__title">{name}</div>'
            f'<div class="banner__sub">{sub}</div><div class="banner__cta">対策を見る</div></div></a>'
        )
    return f'<div class="banner-grid">{"".join(items)}</div>'

def cta_trio(depth: int) -> str:
    return f"""
    <div class="cta-trio">
      <a class="cta-trio__item is-tel" href="tel:0120000001">
        <span class="label">お電話で相談</span>
        <span class="main">0120-000-001</span>
        <span class="sub">受付 10:00-20:00 年中無休</span>
      </a>
      <a class="cta-trio__item is-mail" href="{rel(depth,'/contact/')}">
        <span class="label">メールで無料診断</span>
        <span class="main">無料診断フォーム</span>
        <span class="sub">1営業日以内に返信</span>
      </a>
      <a class="cta-trio__item is-meet" href="{rel(depth,'/contact/')}">
        <span class="label">直接相談したい方へ</span>
        <span class="main">面談予約</span>
        <span class="sub">対面／オンライン可</span>
      </a>
    </div>
    """

# メガフッター
def mega_footer(depth: int) -> str:
    def link(label, path):
        return f'<li><a href="{rel(depth, path)}">{label}</a></li>'

    col_about = "".join([
        link("対策とは（基礎知識）", "/knowledge/"),
        link("当センターについて", "/about/"),
        link("当センターの強み", "/strengths/"),
        link("代表挨拶", "/message/"),
        link("組織概要・アクセス", "/access/"),
        link("採用情報", "/recruit/"),
        link("登録商標", "/trademark/"),
    ])
    col_service = "".join([
        link("サービス内容", "/service/"),
        link("解決プロセス", "/process/"),
        link("料金・成功報酬", "/pricing/"),
        link("対策難易度", "/difficulty/"),
        link("NDAについて", "/nda/"),
        link("成功事例", "/cases/"),
        link("FAQ", "/faq/"),
        link("逆SEO対策", "/method/reverse-seo/"),
        link("サジェスト浄化", "/method/suggest/"),
        link("デジタルフォレンジック", "/method/forensics/"),
    ])
    col_target = "".join([
        link("法人クライアント窓口", "/for-corporate/"),
        link("個人クライアント窓口", "/for-individual/"),
        link("上場企業・IR向け", "/for-listed/"),
        link("エグゼクティブ・経営者向け", "/for-executive/"),
        link("コラム・ノウハウ", "/column/"),
        link("お知らせ・注意喚起", "/notice/"),
        link("お知らせ（一覧）", "/news/"),
    ])
    col_legal = "".join([
        link("プライバシーポリシー", "/privacypolicy/"),
        link("ソーシャルメディアポリシー", "/social-policy/"),
        link("情報セキュリティ基本方針", "/security-policy/"),
        link("特定商取引法に基づく表記", "/regulation/"),
        link("お問い合わせ", "/contact/"),
        link("サイトマップ", "/sitemap/"),
    ])
    # 都道府県（一部抜粋でも一覧として）
    pref_links = "".join(f'<li><a href="{rel(depth, f"/area/{s}/")}">{n}の対策</a></li>' for _,_,s,n in PREFECTURES[:12])
    overseas_links = "".join(f'<li><a href="{rel(depth, f"/overseas/{s}/")}">{n.split("（")[0]}</a></li>' for _,s,n in OVERSEAS)
    industry_links = "".join(f'<li><a href="{rel(depth, f"/industry/{s}/")}">{n}</a></li>' for s,n,_ in INDUSTRIES[:6])
    platform_links = "".join(f'<li><a href="{rel(depth, f"/platform/{s}/")}">{n.split("（")[0]}</a></li>' for s,n,_ in PLATFORMS[:6])
    knowledge_links = "".join(f'<li><a href="{rel(depth, f"/knowledge/{s}/")}">{n}</a></li>' for s,n,_ in KNOWLEDGE[:6])
    column_links = "".join(f'<li><a href="{rel(depth, f"/column/{s}/")}">{n}</a></li>' for s,n,_ in COLUMNS)
    notice_links = "".join(f'<li><a href="{rel(depth, f"/notice/{s}/")}">{n}</a></li>' for s,n,_,_ in NOTICES[:6])
    city_links = "".join(f'<li><a href="{rel(depth, f"/city/{s}/")}">{n}</a></li>' for s,n,_ in CITIES[:8])

    return f"""
    <footer class="site-footer">
      <div class="container container--wide">

        <div class="mega-footer">
          <div class="mega-footer__grid">
            <div><h4>当センターについて</h4><ul>{col_about}</ul></div>
            <div><h4>サービス</h4><ul>{col_service}</ul></div>
            <div><h4>対象クライアント</h4><ul>{col_target}</ul></div>
            <div><h4>規定・お問い合わせ</h4><ul>{col_legal}</ul></div>
          </div>
        </div>

        <div class="mega-footer">
          <div class="mega-footer__grid">
            <div><h4>主要対応地域（都道府県）</h4><ul>{pref_links}<li><a href="{rel(depth,'/area/')}">全47都道府県を見る</a></li></ul></div>
            <div><h4>海外対応</h4><ul>{overseas_links}</ul></div>
            <div><h4>業種別対策</h4><ul>{industry_links}<li><a href="{rel(depth,'/industry/')}">業種別一覧</a></li></ul></div>
            <div><h4>媒体別対策</h4><ul>{platform_links}<li><a href="{rel(depth,'/platform/')}">媒体別一覧</a></li></ul></div>
          </div>
        </div>

        <div class="mega-footer">
          <div class="mega-footer__grid">
            <div><h4>基礎知識・概念</h4><ul>{knowledge_links}<li><a href="{rel(depth,'/knowledge/')}">基礎知識一覧</a></li></ul></div>
            <div><h4>コラム・ノウハウ</h4><ul>{column_links}<li><a href="{rel(depth,'/column/')}">コラム一覧</a></li></ul></div>
            <div><h4>お知らせ・注意喚起</h4><ul>{notice_links}<li><a href="{rel(depth,'/notice/')}">お知らせ一覧</a></li></ul></div>
            <div><h4>主要都市</h4><ul>{city_links}<li><a href="{rel(depth,'/city/')}">主要都市一覧</a></li></ul></div>
          </div>
        </div>

        <div class="footer-info">
          <div>
            <div class="footer-info__brand">一般社団法人 口コミ対策センター</div>
            <p class="footer-info__about">
              ネット上の風評から事業者の信用を守る専門機関。法と各プラットフォーム規約に則り、誹謗中傷・悪質な口コミの是正と再発防止を支援します。
              全国47都道府県および海外サーバーまで対応。完全成功報酬・初期費用0円。
            </p>
          </div>
          <div>
            <h4>組織概要</h4>
            <dl>
              <dt>名称</dt><dd>一般社団法人口コミ対策センター</dd>
              <dt>代表理事</dt><dd>佐藤 朝亮</dd>
              <dt>所在地</dt><dd>〒104-0053<br>東京都中央区晴海3-16-1</dd>
              <dt>設立</dt><dd>2025年2月1日</dd>
              <dt>法人番号</dt><dd>6010005039630</dd>
            </dl>
          </div>
          <div>
            <h4>連絡先</h4>
            <dl>
              <dt>法人窓口</dt><dd>0120-000-001</dd>
              <dt>個人窓口</dt><dd>0120-000-002</dd>
              <dt>受付時間</dt><dd>10:00-20:00 年中無休</dd>
            </dl>
          </div>
        </div>

        <div class="footer-bottom">
          <span>© 一般社団法人 口コミ対策センター</span>
          <span>
            <a href="{rel(depth,'/privacypolicy/')}">プライバシーポリシー</a>
            <a href="{rel(depth,'/regulation/')}">特商法表記</a>
            <a href="{rel(depth,'/sitemap/')}">サイトマップ</a>
            <a href="{rel(depth,'/contact/')}">お問い合わせ</a>
          </span>
        </div>
      </div>
    </footer>

    <div class="float-cta">
      <a href="tel:0120000001" class="f-tel">電話相談</a>
      <a href="{rel(depth,'/contact/')}" class="f-mail">無料診断</a>
    </div>
    """

def write_page(path: Path, html: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding="utf-8")

def page_html(*, depth: int, title: str, description: str, body: str, active: str = "") -> str:
    css = rel(depth, "/assets/css/style.css")
    js = rel(depth, "/assets/js/main.js")
    return dedent(f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
<meta name="robots" content="all">
<meta property="og:site_name" content="一般社団法人 口コミ対策センター">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Zen+Old+Mincho:wght@500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{css}">
</head>
<body>
{header(depth, active)}
<main>
{body}
</main>
{mega_footer(depth)}
<script src="{js}"></script>
</body>
</html>
""")

# ----------- 強みバナー（5項目） -----------
def strengths_block() -> str:
    items = [
        ("free",   "相談無料",       "何度でも無料"),
        ("check",  "追加料金なし",   "完全成功報酬"),
        ("globe",  "全国・海外対応", "海外サーバーも"),
        ("eye",    "再発防止監視",   "24時間モニタリング"),
        ("lock",   "秘密厳守 NDA",   "ISMS準拠運用"),
    ]
    cards = "".join(
        f'<div class="strength"><div class="strength__icon">{ICONS[i]}</div>'
        f'<div class="strength__title">{t}</div><div class="strength__sub">{s}</div></div>'
        for i, t, s in items
    )
    return f'<div class="strengths">{cards}</div>'

def page_header_block(en: str, title: str, sub: str, depth: int) -> str:
    return f"""
    <section class="page-header">
      <div class="container">
        <span class="en">{en}</span>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
    </section>
    <div class="container">
      <p class="breadcrumb"><a href="{rel(depth,'/')}">ホーム</a><span>›</span>{title}</p>
    </div>
    """

# ============================================================
# TOPページ
# ============================================================
def build_top():
    body = f"""
    <!-- ===== HERO ===== -->
    <section class="hero">
      <div class="container container--wide">
        <div class="hero__grid">
          <div>
            <span class="hero__eyebrow">一般社団法人として運営される専門機関</span>
            <h1>
              ネット上の風評から、<br>
              <span class="accent">会社の信用とブランド</span>を<br>
              取り戻す。
            </h1>
            <p class="hero__sub">
              事実無根の書き込み、悪質な誹謗中傷、炎上リスクの解消。
              法と各プラットフォーム規約に則った正攻法で、全国47都道府県・海外サーバーまで対応します。
              初期費用・着手金0円、完全成功報酬。
            </p>
            <div class="hero__ctas">
              <a href="contact/" class="btn btn--primary btn--lg">{ICONS['mail']}無料診断する</a>
              <a href="contact/" class="btn btn--navy btn--lg">{ICONS['calendar']}面談予約</a>
              <a href="tel:0120000001" class="btn btn--ghost">{ICONS['phone']}0120-000-001</a>
            </div>
            <p class="hero__note">※フォーム送信から1営業日以内に専門スタッフが返信／秘密厳守 NDA・SSL対応</p>
          </div>
          <div class="hero__visual" aria-hidden="true">
            {svg_placeholder('TRUST GUARDIAN','navy',640,800)}
          </div>
        </div>
        {strengths_block()}
      </div>
    </section>

    <!-- ===== 47都道府県 ===== -->
    <section class="section section--accent-bg">
      <div class="container container--wide">
        <div class="section-head">
          <span class="en">AREA</span>
          <h2>全国47都道府県・海外サーバーまで対応</h2>
          <p class="lead">
            主要都市から地方まで、全国どこからでもオンライン完結でご相談いただけます。海外サーバーや英語圏のレビューにも対応します。
          </p>
        </div>
        {area_grid_block(0)}
        {cta_trio(0)}
      </div>
    </section>

    <!-- ===== 業種別 ===== -->
    <section class="section">
      <div class="container container--wide">
        <div class="section-head">
          <span class="en">INDUSTRY</span>
          <h2>業種別の口コミ対策事例</h2>
          <p class="lead">業界特有の口コミ傾向・規制・プラットフォームを踏まえた最適なアプローチをご提案します。</p>
        </div>
        {industry_banners(0)}
      </div>
    </section>

    <!-- ===== 媒体別 ===== -->
    <section class="section section--soft">
      <div class="container container--wide">
        <div class="section-head">
          <span class="en">PLATFORM</span>
          <h2>媒体別の口コミ対策</h2>
          <p class="lead">Googleマップから5ch、爆サイ、X（旧Twitter）まで、媒体ごとに異なる規約とアルゴリズムを理解した上で対応します。</p>
        </div>
        {platform_banners(0)}
      </div>
    </section>

    <!-- ===== 上場/エグゼクティブ ===== -->
    <section class="section">
      <div class="container container--wide">
        <div class="section-head">
          <span class="en">FOR EXECUTIVES &amp; LISTED COMPANIES</span>
          <h2>エグゼクティブ・上場企業向け対策</h2>
          <p class="lead">経営者個人名・役員人事・適時開示に関わる風評など、IRやレピュテーションリスクに直結する案件をお預かりします。</p>
        </div>
        <div class="grid grid--2">
          <a href="for-executive/" class="banner">
            <div class="banner__cover">{svg_placeholder('エグゼクティブ向け','dark',640,360)}</div>
            <div class="banner__body">
              <div class="banner__title">経営者・著名人向け 個人風評対策</div>
              <div class="banner__sub">代表者個人名のサジェスト浄化、検索結果コントロール、SNS監視まで一気通貫。</div>
              <div class="banner__cta">エグゼクティブプランを見る</div>
            </div>
          </a>
          <a href="for-listed/" class="banner">
            <div class="banner__cover">{svg_placeholder('上場企業・IR向け','navy',640,360)}</div>
            <div class="banner__body">
              <div class="banner__title">上場企業・IR広報向け対策</div>
              <div class="banner__sub">短信前後の風評対応、株主掲示板の監視、開示連動のリスク管理を専任チームで実施。</div>
              <div class="banner__cta">上場企業向けプランを見る</div>
            </div>
          </a>
        </div>
      </div>
    </section>

    <!-- ===== 解説テキスト ===== -->
    <section class="section section--soft">
      <div class="container">
        <div class="section-head">
          <span class="en">SERVICE PHILOSOPHY</span>
          <h2>放置すれば固定化する、ネットの悪評。<br>「信用」を取り戻すための、正攻法。</h2>
        </div>
        <div class="prose">
          <h2>1. ネット上の悪評を放置するリスク</h2>
          <p>
            ネット上の悪評は、放置するほど検索結果に固定化し、新規顧客の意思決定に直接的な影響を与えます。
            来店前の検索行動が当たり前となった現在、Googleマップに表示される<strong>★1〜2の口コミ</strong>や、
            <strong>サジェスト欄に表示される会社名と一緒に出てくるネガティブワード</strong>は、
            それだけで採用・営業・売上に致命的なダメージを及ぼします。
          </p>
          <p>
            特に問題なのは、口コミやサジェストは「事実かどうか」とは無関係に表示されるという点です。
            事実無根の書き込みでも、検索アルゴリズムが「関連性が高い」と判断すれば上位に固定化します。
            <strong>競合や元従業員、悪意ある第三者による恣意的な投稿</strong>であっても、対策をしなければ事業の信用は黙って削られ続けます。
          </p>

          <h2>2. クリーンな環境を取り戻すプロセス</h2>
          <p>
            当センターが提供する対策は、大きく分けて3つのアプローチで構成されます。
            <strong>①是正アプローチ（悪質な投稿の削除・非表示化）</strong>、
            <strong>②逆SEO・サジェスト対策（検索結果上位からの押し下げ）</strong>、
            <strong>③ポジティブブランディング（公式情報・実績・口コミの整備）</strong>の3層構造です。
          </p>
          <p>
            これらは独立した手法ではなく、案件の性質と難易度に応じて組み合わせます。
            たとえば「事実無根の名指し中傷」のような明確な規約違反であれば①の比重を上げ、
            「自社名＋ネガティブワードのサジェスト固定化」のような検索結果課題であれば②に重点を、
            「業績は好調なのにレビュー比率が低い」のような構造的課題であれば③を中心に組み立てます。
          </p>

          <h2>3. 逆SEO・サジェスト浄化・ポジティブブランディング</h2>
          <p>
            <strong>逆SEO対策</strong>とは、自社名や代表者名で検索した際に表示される検索結果の上位から、
            ネガティブなページを正攻法で押し下げ、健全なページに置き換えていく中長期施策です。
            違法な手法は一切使わず、Googleガイドラインに準拠した公式情報整備・関連メディア掲出・SNS運用の総合戦略として実行します。
          </p>
          <p>
            <strong>サジェスト浄化</strong>は、検索窓に会社名を入力した瞬間に表示される候補（オートコンプリート）から、
            ネガティブワードを表示されにくくする取り組みです。サジェストは検索行動データに基づいて生成されるため、
            正攻法のコントロールには相応のロジックと継続的なモニタリングが必要です。
          </p>
          <p>
            <strong>ポジティブブランディング</strong>では、公式サイト・採用ページ・取材記事・SNS・社員インタビュー等を通じて、
            「会社名で検索したときに最初に出てくる景色」をクライアントの実像に近づけます。
            これは単なるPRではなく、検索エンジンとSNS双方のアルゴリズムに対して「公式の事実」を継続的に供給し、
            事業の信用を中長期にわたって守る基盤づくりです。
          </p>

          <h2>4. 当センターが選ばれる理由</h2>
          <p>
            違法・グレーな手法は一切採用しません。プラットフォームの規約と法令、双方を遵守する正攻法のみで対応します。
            完全成功報酬制を採用しており、結果が出るまでご請求は発生しません。
            ご相談からご報告まで、専任担当が一貫して伴走します。
          </p>
        </div>
        {cta_trio(0)}
      </div>
    </section>

    <!-- ===== 解決プロセス（5ステップ） ===== -->
    <section class="section">
      <div class="container container--wide">
        <div class="section-head">
          <span class="en">FLOW</span>
          <h2>ご相談から解決までの5ステップ</h2>
        </div>
        <div class="flow">
          <div class="flow__step"><div class="flow__num">STEP 01</div><h3>無料相談</h3><p>フォーム・電話・LINEから状況をお知らせください。</p></div>
          <div class="flow__step"><div class="flow__num">STEP 02</div><h3>無料診断</h3><p>1営業日以内に対策の可否・想定難易度をご回答。</p></div>
          <div class="flow__step"><div class="flow__num">STEP 03</div><h3>ご提案・契約</h3><p>方針と料金をご確認のうえ、完全成功報酬で契約。</p></div>
          <div class="flow__step"><div class="flow__num">STEP 04</div><h3>対策実行</h3><p>専門チームが規約準拠で対策を実行・継続的に進捗報告。</p></div>
          <div class="flow__step"><div class="flow__num">STEP 05</div><h3>結果報告・再発防止</h3><p>是正完了後、再発防止モニタリングまで対応。</p></div>
        </div>
        <div class="text-center mt-48"><a href="process/" class="btn btn--ghost">解決プロセスの詳細を見る</a></div>
      </div>
    </section>

    <!-- ===== お知らせ ===== -->
    <section class="section section--soft">
      <div class="container">
        <div class="section-head">
          <span class="en">NEWS</span>
          <h2>対策環境ニュース・お知らせ</h2>
          <p class="lead">法改正・各プラットフォーム規約の変更、当センターからのご案内をお届けします。</p>
        </div>
        <div class="news-list">
          <div class="news-item"><time>2026.06.20</time><span class="tag">お知らせ</span><a href="news/">ホームページをリニューアルいたしました</a></div>
          <div class="news-item"><time>2026.06.05</time><span class="tag tag--column">コラム</span><a href="news/">Googleマップ口コミガイドラインの2026年改定ポイント解説</a></div>
          <div class="news-item"><time>2026.05.18</time><span class="tag tag--alert">注意喚起</span><a href="news/">当センターを騙る悪質な代行業者にご注意ください</a></div>
          <div class="news-item"><time>2026.04.27</time><span class="tag tag--column">コラム</span><a href="news/">採用活動と口コミ評価——求人サイトの低評価が応募率に与える影響</a></div>
          <div class="news-item"><time>2026.04.10</time><span class="tag">お知らせ</span><a href="news/">医療機関向けサポート体制を強化しました</a></div>
        </div>
        <div class="text-center mt-32"><a href="news/" class="btn btn--ghost">お知らせ一覧</a></div>
      </div>
    </section>

    <!-- ===== 注意喚起ブロック ===== -->
    <section class="section">
      <div class="container">
        <div class="section-head">
          <span class="en">NOTICE</span>
          <h2>ご案内</h2>
        </div>
        <div class="notice-list">
          <div class="notice-item is-alert"><h3>悪質な押し売り・代行業者にご注意ください</h3><p>当センターは、当方からの一方的な営業電話・訪問営業を一切行っておりません。当センター名を騙る業者にはご注意ください。</p></div>
          <div class="notice-item"><h3>医療機関向けサポート強化のお知らせ</h3><p>クリニック・歯科医院・病院向けに、医師個人名サジェスト・Googleマップレビュー対策の専任体制を整備しました。</p></div>
          <div class="notice-item"><h3>今月の稼働状況</h3><p>2026年6月は新規受付を継続中です。混雑時はご返信までお時間をいただく場合があります。</p></div>
        </div>
      </div>
    </section>

    <!-- ===== 採用バナー ===== -->
    <section class="section section--soft">
      <div class="container container--wide">
        <div class="recruit-band">
          <div>
            <h3>WE'RE HIRING — 採用情報</h3>
            <p>事業者の信用を守る仕事に、共に向き合える仲間を募集しています。完全リモート可・業務委託可。</p>
          </div>
          <div class="recruit-band__actions">
            <a href="recruit/" class="btn btn--primary">採用情報を見る</a>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== 最終CTA ===== -->
    <section class="section">
      <div class="container container--wide">
        <div class="cta-band">
          <div>
            <h2>まずは「対策できるか」だけでも、無料でご確認ください。</h2>
            <p>所要1分のフォームで、1営業日以内に専門家がご返信します。</p>
          </div>
          <div class="cta-band__actions">
            <a href="contact/" class="btn btn--primary btn--lg">無料診断を申し込む</a>
            <a href="tel:0120000001" class="btn btn--ghost" style="color:#fff;border-color:#fff;">お電話で相談</a>
          </div>
        </div>
      </div>
    </section>
    """
    html = page_html(
        depth=0,
        title="一般社団法人 口コミ対策センター｜ネット風評・誹謗中傷から会社の信用とブランドを守る専門機関",
        description="ネット上の風評から事業者の信用・ブランドを守る専門機関。Googleマップ・5ch・爆サイ等の誹謗中傷対策、サジェスト浄化、逆SEOまで。全国47都道府県・海外対応／完全成功報酬・初期費用0円。",
        body=body,
        active="",
    )
    (ROOT / "index.html").write_text(html, encoding="utf-8")

# ============================================================
# 都道府県ページ生成
# ============================================================
def build_prefecture_pages():
    area_root = ROOT / "area"
    area_root.mkdir(exist_ok=True)

    # /area/index.html — 都道府県一覧
    body = f"""
    {page_header_block("AREA", "全国47都道府県の対応地域", "全国・海外サーバーを含む全エリアからのご相談に対応しています。", 1)}
    <section class="section">
      <div class="container container--wide">
        {area_grid_block(1)}
        {cta_trio(1)}
      </div>
    </section>
    """
    (area_root / "index.html").write_text(
        page_html(depth=1, title="対応地域｜一般社団法人 口コミ対策センター",
                  description="全国47都道府県の口コミ対策・誹謗中傷対策に対応。海外サーバーや英語圏のレビューにも対応。地域別の対策事例とご相談窓口。",
                  body=body, active="対応地域"),
        encoding="utf-8")

    for region_jp, region_en, slug, name in PREFECTURES:
        d = area_root / slug
        d.mkdir(exist_ok=True)
        body = f"""
        {page_header_block(f"{region_en.upper()} — {slug.upper()}", f"{name}の口コミ対策・誹謗中傷対策", f"{name}内の事業者様からのネット風評・口コミ対策に関するご相談を承ります。", 2)}
        <section class="section">
          <div class="container">
            <div class="prose">
              <h2>{name}での口コミ対策・風評被害対策</h2>
              <p>
                一般社団法人 口コミ対策センターは、{region_jp}の主要都市から地方都市・郡部まで、{name}内のあらゆる事業者様からの
                ネット風評被害・誹謗中傷・悪質な口コミに関するご相談を承っております。Googleマップ・口コミサイト・各種掲示板・SNSなど、
                媒体を問わず{name}所在のオーナー様が直面する課題に、規約と法令に準拠した正攻法のみで対応します。
              </p>
              <p>
                {name}は商圏・業種の幅が広く、レビュー対策に求められるアプローチも案件ごとに大きく異なります。
                飲食・医療・美容・不動産・士業・小売・教育・自動車・宿泊・ブライダルなど、業種特性を理解した上で、
                媒体別（Googleマップ、5ch、爆サイ、X、YouTube、Yahoo!知恵袋、口コミ集合サイト 等）の最適解をご提案します。
              </p>

              <h2>{name}で多いご相談</h2>
              <ul>
                <li>{name}内の店舗に対する事実無根のGoogleマップ★1レビューの是正</li>
                <li>{name}を商圏とする医療機関・クリニックの匿名口コミ／サジェスト浄化</li>
                <li>地域系巨大掲示板（爆サイ、5ch）における社名・店名スレッドの削除申請</li>
                <li>{name}の中小事業者様のレピュテーションリスク全般のモニタリング</li>
                <li>採用活動に影響を及ぼす求人サイト・口コミサイトの低評価対応</li>
              </ul>

              <h2>{name}での対応の流れ</h2>
              <p>
                {name}所在のお客様も、すべてオンラインで完結します。
                ご相談から無料診断・ご契約・対策実行・結果報告までを、専任担当が一貫して伴走します。
                対面でのご相談をご希望の場合は、面談予約からお申し込みください。状況に応じてオンライン面談にも対応します。
              </p>

              <h2>{name}内エリア対応について</h2>
              <p>
                {name}全域からのご依頼に対応しています。県庁所在地はもちろん、郡部・離島・観光地・繁華街・住宅街など、
                立地に依らず同等のサービス水準でご対応いたします。商圏や業態をお聞かせいただければ、{name}での過去の事例を踏まえた
                現実的なご提案をいたします。
              </p>

              <h2>料金・契約形態</h2>
              <p>
                {name}所在の事業者様についても、当センターの標準料金体系（<strong>初期費用・着手金0円／完全成功報酬制</strong>）が適用されます。
                結果が出るまでご請求は発生しません。料金の詳細は<a href="../../pricing/">料金ページ</a>をご確認ください。
              </p>
            </div>
            {cta_trio(2)}
          </div>
        </section>
        """
        (d / "index.html").write_text(
            page_html(
                depth=2,
                title=f"{name}の口コミ対策・誹謗中傷対策｜一般社団法人 口コミ対策センター",
                description=f"{name}の事業者様向け、Googleマップ口コミ・誹謗中傷・風評被害対策。{region_jp}の地域特性を踏まえた専門アプローチで、規約と法令に準拠した正攻法のみで対応します。",
                body=body, active="対応地域"),
            encoding="utf-8")

# ============================================================
# 海外ページ生成
# ============================================================
def build_overseas_pages():
    base = ROOT / "overseas"
    base.mkdir(exist_ok=True)
    overseas_grid = "".join(
        f'<a href="{slug}/" class="banner"><div class="banner__cover">{svg_placeholder(name,"navy",640,360)}</div>'
        f'<div class="banner__body"><div class="banner__title">{name}</div><div class="banner__sub">該当エリアの対策事例</div><div class="banner__cta">詳細を見る</div></div></a>'
        for _, slug, name in OVERSEAS
    )
    body = f"""
    {page_header_block("OVERSEAS", "海外対策・英語圏対応", "海外サーバーや英語圏の口コミにも、現地法と規約を踏まえて対応します。", 1)}
    <section class="section">
      <div class="container container--wide">
        <div class="banner-grid">{overseas_grid}</div>
        {cta_trio(1)}
      </div>
    </section>
    """
    (base / "index.html").write_text(
        page_html(depth=1, title="海外対策｜一般社団法人 口コミ対策センター",
                  description="海外サーバー・英語圏のネガティブレビュー、海外掲示板での誹謗中傷に対応。アジア・北米・ヨーロッパ・オセアニアまで対応エリアをカバー。",
                  body=body, active="海外対策"),
        encoding="utf-8")

    for _, slug, name in OVERSEAS:
        d = base / slug
        d.mkdir(exist_ok=True)
        body = f"""
        {page_header_block("OVERSEAS", f"{name}の口コミ・風評対策", "現地サーバー・現地法・現地プラットフォーム規約を踏まえた正攻法の対応。", 2)}
        <section class="section">
          <div class="container">
            <div class="prose">
              <h2>{name}を含む海外対策のご相談</h2>
              <p>
                {name}における日本企業の風評被害・誹謗中傷対策に対応しております。
                現地サーバーへ申請が必要なケース、現地法に準拠した削除請求が必要なケース、
                英語・現地語でのレビュー対策など、海外特有の課題に対し、正攻法のみで対応します。
              </p>
              <h2>対応している海外プラットフォーム例</h2>
              <ul>
                <li>Google Maps（各国語版）／Google Business Profile</li>
                <li>TripAdvisor／Booking.com／Agoda 等の旅行系レビューサイト</li>
                <li>Yelp／Trustpilot 等の口コミ集合サイト</li>
                <li>Facebook、Instagram、X（旧Twitter）等のSNS</li>
                <li>YouTube／TikTok 等の動画プラットフォーム</li>
                <li>各国の主要掲示板・コミュニティサイト</li>
              </ul>
              <h2>海外案件の進め方</h2>
              <p>
                海外案件は、現地法および各プラットフォームの利用規約の整合性確認から開始します。
                日本国内基準の対応では削除に至らないケースでも、現地法・現地規約に沿った申請ロジックを設計することで、
                正攻法での是正可能性を高めます。費用体系は標準どおり、完全成功報酬・初期費用0円です。
              </p>
            </div>
            {cta_trio(2)}
          </div>
        </section>
        """
        (d / "index.html").write_text(
            page_html(depth=2,
                title=f"{name}の口コミ対策｜海外対策｜一般社団法人 口コミ対策センター",
                description=f"{name}の口コミ・誹謗中傷対策。現地法・現地プラットフォーム規約に準拠した正攻法のみで対応。完全成功報酬。",
                body=body, active="海外対策"),
            encoding="utf-8")

# ============================================================
# 業種別ページ生成
# ============================================================
def build_industry_pages():
    base = ROOT / "industry"
    base.mkdir(exist_ok=True)
    body = f"""
    {page_header_block("INDUSTRY", "業種別の口コミ対策", "業界特有の媒体・規制・口コミ傾向を理解した専門アプローチ。", 1)}
    <section class="section">
      <div class="container container--wide">
        {industry_banners(1)}
        {cta_trio(1)}
      </div>
    </section>
    """
    (base / "index.html").write_text(
        page_html(depth=1, title="業種別の口コミ対策｜一般社団法人 口コミ対策センター",
                  description="飲食・医療・美容・不動産・士業・小売・教育・自動車・宿泊・ブライダルなど、業種別の口コミ・誹謗中傷対策の事例とアプローチ。",
                  body=body, active=""),
        encoding="utf-8")

    for slug, name, sub in INDUSTRIES:
        d = base / slug
        d.mkdir(exist_ok=True)
        body = f"""
        {page_header_block("INDUSTRY", f"{name}の口コミ対策", sub, 2)}
        <section class="section">
          <div class="container">
            <div class="prose">
              <h2>{name}業界でよくある口コミ課題</h2>
              <p>
                {name}業界では、口コミやレビューが集客・採用・売上に直結します。
                {sub}を運営される事業者様の場合、特にGoogleマップ・SNS・業界専門レビューサイトの3経路における風評対策が重要です。
                当センターは{name}業界の特性を踏まえ、媒体ごとに最適な是正アプローチをご提案します。
              </p>

              <h2>{name}における主な対策内容</h2>
              <ul>
                <li>Googleマップ／Googleビジネスプロフィール上の悪質なレビューへの是正申請</li>
                <li>業界特化レビューサイト（食べログ、Hot Pepper、エキテン、ホットペッパービューティー、SUUMO 等該当媒体）の対応</li>
                <li>SNSにおける誹謗中傷投稿への対応・拡散抑止</li>
                <li>店舗名・院名・代表者名のサジェスト浄化</li>
                <li>採用活動に影響を及ぼす口コミの対応（OpenWork、転職会議、Indeed 等）</li>
              </ul>

              <h2>{name}業界での当センターの強み</h2>
              <p>
                業界特有の規制（医療広告ガイドライン、薬機法、景品表示法、宅建業法等）に抵触しない範囲で、
                正攻法による対策のみを実行します。違法・グレーな手法は一切採用しないため、
                ご依頼後の規制リスクが発生しません。事業継続性を最優先に、無理のない範囲で着実な改善を進めます。
              </p>

              <h2>料金・依頼の流れ</h2>
              <p>
                {name}業界の事業者様についても、当センターの標準料金体系（初期費用・着手金0円／完全成功報酬制）が適用されます。
                結果が出るまでご請求は発生しません。まずは無料診断から、お気軽にご相談ください。
              </p>
            </div>
            {cta_trio(2)}
          </div>
        </section>
        """
        (d / "index.html").write_text(
            page_html(depth=2,
                title=f"{name}の口コミ対策｜業種別｜一般社団法人 口コミ対策センター",
                description=f"{name}業界の事業者様向け口コミ・誹謗中傷対策。{sub}における実績と業界特性を踏まえたアプローチ。完全成功報酬・初期費用0円。",
                body=body, active=""),
            encoding="utf-8")

# ============================================================
# プラットフォーム別ページ生成
# ============================================================
def build_platform_pages():
    base = ROOT / "platform"
    base.mkdir(exist_ok=True)
    body = f"""
    {page_header_block("PLATFORM", "媒体別の口コミ対策", "各プラットフォームの規約・アルゴリズムに準拠した専門アプローチ。", 1)}
    <section class="section">
      <div class="container container--wide">
        {platform_banners(1)}
        {cta_trio(1)}
      </div>
    </section>
    """
    (base / "index.html").write_text(
        page_html(depth=1, title="媒体別の口コミ対策｜一般社団法人 口コミ対策センター",
                  description="Googleマップ、5ch、爆サイ、X（旧Twitter）、YouTube、Yahoo!知恵袋、ホストラブなど、媒体ごとの口コミ・誹謗中傷対策。",
                  body=body, active=""),
        encoding="utf-8")

    for slug, name, sub in PLATFORMS:
        d = base / slug
        d.mkdir(exist_ok=True)
        body = f"""
        {page_header_block("PLATFORM", name, sub, 2)}
        <section class="section">
          <div class="container">
            <div class="prose">
              <h2>{name}の特徴と対策アプローチ</h2>
              <p>
                {name}は、媒体特有の規約・アルゴリズム・運営方針を持ちます。
                {sub}という性質上、自力での申請では削除が認められない／対応が遅延するケースが多く発生します。
                当センターは、当該媒体の公開ポリシーと過去事例を踏まえた専門ロジックで申請を行い、是正可能性を高めます。
              </p>

              <h2>{name}でよくある課題</h2>
              <ul>
                <li>事実無根の名指し誹謗中傷投稿の固定化</li>
                <li>自力での通報が「違反なし」と機械的に却下される</li>
                <li>削除されても再投稿される（いたちごっこの状態）</li>
                <li>投稿者が匿名のため法的措置の費用対効果が見合わない</li>
                <li>放置するほど検索エンジン側で固定化し、二次被害が拡大</li>
              </ul>

              <h2>{name}における当センターの対応方針</h2>
              <p>
                プラットフォーム規約に準拠した正当な報告ロジックを構築し、必要に応じて再申請・経路の組み合わせまで対応します。
                違法・グレーな手法（スパム通報、虚偽申告、なりすまし等）は一切行いません。アカウントリスクなく安全に対応します。
                再発防止のためのモニタリングオプションもご用意しています。
              </p>

              <h2>料金・ご依頼の流れ</h2>
              <p>
                {name}対策についても、当センターの標準料金体系（初期費用・着手金0円／完全成功報酬制）が適用されます。
                結果が出るまでご請求は発生しません。まずは対象URLとともに無料診断をご利用ください。
              </p>
            </div>
            {cta_trio(2)}
          </div>
        </section>
        """
        (d / "index.html").write_text(
            page_html(depth=2,
                title=f"{name}｜媒体別の口コミ対策｜一般社団法人 口コミ対策センター",
                description=f"{name}に対するネット風評・誹謗中傷対策。{sub}という媒体特性を踏まえた専門アプローチで対応します。完全成功報酬。",
                body=body, active=""),
            encoding="utf-8")

# ============================================================
# その他の主要ページ
# ============================================================
def build_other_pages():
    for d in ["about","service","message","contact","news","recruit"]:
        (ROOT / d).mkdir(parents=True, exist_ok=True)
    # /about/ — 当センターについて（活動理念・行動指針・会社概要）
    body = f"""
    {page_header_block("ABOUT US", "当センターについて", "誰もが安心して活動できるインターネット社会を創造する。", 1)}
    <section class="section"><div class="container"><div class="prose">
      <h2>活動理念 — Our Mission</h2>
      <p style="font-size:20px;font-weight:700;color:var(--c-navy);line-height:1.6;">
        誰もが安心して活動できるインターネット社会を創造する。
      </p>
      <p>
        インターネットは、本来、誰もが自由に表現し、正当に評価されるべき場所です。
        しかし、現実には無責任な誹謗中傷や悪意ある口コミによって、誠実な事業者が不当に傷つけられる事態が後を絶ちません。
      </p>
      <p>
        私たちは、こうした歪んだ現状を正し、挑戦を続ける人々が理不尽な悪評に怯えることなく、その価値を最大限に発揮できる。
        そんな「当たり前の未来」を創造することを使命としています。
      </p>

      <h2>行動指針 — Our Values</h2>

      <h3>1. 現場の苦悩に深く寄り添い、共に歩む</h3>
      <p>
        ネット上のトラブルは、企業の数字だけでなく、そこで働く人々の心まで疲弊させます。
        私たちは、ご相談者様が抱える不安を自分事として受け止め、解決の道筋が見えるまで、泥臭く、粘り強く、現場に寄り添い続けます。
      </p>

      <h3>2. プロフェッショナルとして、常に「半歩先」を走る</h3>
      <p>
        デジタルのリスクは日々形を変え、複雑化しています。
        私たちは過去の成功体験に固執せず、法務・IT・リスク管理の最先端の知見を磨き続けます。
        社会の動向に精通し、変化を先読みすることで、常に最適な一手を提案します。
      </p>

      <h3>3. 表面的な解決ではなく、根本的な信頼を築く</h3>
      <p>
        一時的な情報の削除は、解決の第一歩に過ぎません。
        私たちは、その先にある企業のブランド価値や、長期的なレピュテーションを守るための仕組みづくりを支援します。
        目先の対応を超え、将来にわたる「信頼の基盤」を共に創り上げます。
      </p>

      <h3>4. 誠実さを貫き、厳格に情報を守り抜く</h3>
      <p>
        私たちの活動の土台は、ご相談者様との揺るぎない信頼関係にあります。
        経営の根幹に関わる情報を扱う重みを深く認識し、厳格な守秘義務と事実に基づいた誠実な対応を徹底します。
      </p>

      <h2>会社概要 — Company</h2>
      <table class="meta-table"><tbody>
        <tr><th>法人名</th><td>一般社団法人口コミ対策センター</td></tr>
        <tr><th>代表理事</th><td>佐藤 朝亮</td></tr>
        <tr><th>所在地</th><td>〒104-0053 東京都中央区晴海3-16-1</td></tr>
        <tr><th>設立</th><td>2025年2月1日</td></tr>
        <tr><th>法人番号</th><td>6010005039630</td></tr>
        <tr><th>事業内容</th><td>
          ・インターネット誹謗中傷対策<br>
          ・権利侵害抑止事業<br>
          ・SEO/SERPs適正化支援<br>
          ・デジタルレピュテーション・インテグリティ事業<br>
          ・社会動向データ・アナリティクス事業
        </td></tr>
        <tr><th>対応エリア</th><td>全国47都道府県および海外サーバー</td></tr>
        <tr><th>連絡先</th><td>法人窓口 0120-000-001／個人窓口 0120-000-002</td></tr>
      </tbody></table>
    </div>{cta_trio(1)}</div></section>
    """
    (ROOT / "about/index.html").write_text(
        page_html(depth=1, title="当センターについて｜一般社団法人 口コミ対策センター",
                  description="一般社団法人 口コミ対策センターの概要・理念・体制についてご紹介します。事業者の信用を、適法かつ持続可能な方法で守る専門機関です。",
                  body=body, active="対策とは"),
        encoding="utf-8")

    # /service/ — 4本柱（評判調査／Google口コミ対策／サジェスト対策／掲示板対策）
    def srv_block(num, title_en, title, lead, checks, troubles, link_more=False):
        chk = "".join(f'<li>{ICONS["check"]}<span>{c}</span></li>' for c in checks) if checks else ""
        check_block = f'<ul class="service-check">{chk}</ul>' if chk else ""
        more = f'<a href="../contact/" class="service-more">サービス詳細はこちら →</a>' if link_more else ""
        trouble_items = "".join(f'<li>{t}</li>' for t in troubles)
        return f"""
        <section class="service-block">
          <div class="service-block__header">
            <span class="en">{title_en}</span>
            <h2><span class="service-num">{num}</span>{title}</h2>
          </div>
          <div class="service-block__body">
            <div class="service-block__lead">
              <p>{lead}</p>
              {check_block}
              {more}
            </div>
            <div class="service-block__trouble">
              <div class="trouble-card">
                <div class="trouble-card__head">こんなお悩みはありませんか？</div>
                <ul>{trouble_items}</ul>
              </div>
            </div>
          </div>
        </section>
        """

    body = f"""
    {page_header_block("SERVICES", "サービス内容", "規約・法令準拠の正攻法で、4つの柱から信頼を取り戻す。", 1)}
    <section class="section"><div class="container">
      {srv_block("01", "ANALYSIS", "評判調査・リスク分析",
        "現在、ネット上にどのようなネガティブな情報が存在するのか、主要なSNSや検索エンジン、口コミサイトを徹底的に調査し、経営リスクを可視化します。",
        ["定期モニタリング", "リスク調査報告書の作成", "具体的な対策プランの立案"],
        ["具体的な被害状況を正確に把握し、効果的な対策を打ちたい。", "炎上の兆候を早期に発見し、実害が出る前に対処したい。"])}

      {srv_block("02", "GOOGLE REVIEW", "Google口コミ対策",
        "Googleビジネスプロフィールに投稿された、事実無根の低評価や嫌がらせによる口コミトラブルを、実務面から解決いたします。",
        [],
        ["不当な低評価が目立つことで、新規顧客の獲得に支障が出ている。", "ガイドラインに違反するような悪質な嫌がらせを受けている。"],
        link_more=True)}

      {srv_block("03", "SUGGEST", "サジェスト対策",
        "各種検索エンジンにおいて、検索窓に表示されるネガティブな検索候補（サジェスト）を整理し、正しい情報が届くよう支援します。",
        ["Google", "Yahoo!", "Bing"],
        ["検索候補に「ブラック」「事件」等のネガティブなワードが表示され、困っている。", "風評被害によるブランドイメージの低下や、採用への悪影響を食い止めたい。"])}

      {srv_block("04", "BBS", "掲示板対策",
        "5ちゃんねる、爆サイ、マンションコミュニティ等、匿名掲示板における書き込みに対し、法的・技術的アプローチによる非表示化をサポートします。",
        ["5ちゃんねる", "爆サイ.com", "マンションコミュニティ"],
        ["匿名掲示板での誹謗中傷が、従業員の士気や個人の生活にまで悪影響を及ぼしている。", "自身で削除依頼を出したが対応してもらえず、専門家の力を借りたい。"])}
    </div></section>

    <section class="section section--navy">
      <div class="container text-center">
        <h2 style="color:#fff;">ご相談・お見積もりはすべて無料です</h2>
        <p style="color:rgba(255,255,255,.9);max-width:680px;margin:0 auto 32px;">現在の被害状況を伺った上で、最適な解決策をご提案します。お一人で悩まず、まずは当センターへご相談ください。</p>
        {cta_trio(1)}
      </div>
    </section>
    """
    (ROOT / "service/index.html").write_text(
        page_html(depth=1, title="サービス内容｜一般社団法人 口コミ対策センター",
                  description="Google口コミ対策／非表示・抑止対策／逆SEO・サジェスト浄化／風評モニタリング／ポジティブブランディング／危機管理。",
                  body=body, active=""),
        encoding="utf-8")

    # /message/ — 代表挨拶
    body = f"""
    {page_header_block("MESSAGE", "代表者からの挨拶", "誰もが安心して利用できるインターネット社会を目指します。", 1)}
    <section class="section"><div class="container"><div class="prose">
      <h2 style="border:0;padding:0;font-family:var(--font-mincho);font-size:28px;line-height:1.6;">誰もが安心して利用できるインターネット社会を目指します。</h2>

      <p>当サイトをご覧いただき、誠にありがとうございます。</p>
      <p>一般社団法人口コミ対策センター代表理事の<strong>佐藤</strong>でございます。</p>

      <p>
        私はこれまで、長年にわたりビジネスの最前線に身を置き、多くの経営者様と共に歩んでまいりました。
        その中で目にしてきたのは、心ない誹謗中傷や事実無根の書き込みによって、企業の信頼が一夜にして揺らいでしまうという余りに残酷な現実です。
      </p>

      <blockquote>
        「たった一つの悪評のために、大切なお客様との縁が切れてしまう」<br>
        「身に覚えのない言葉に傷つき、志半ばで去っていく従業員がいる」<br>
        「根拠のない噂が広まり、長年培ってきた取引先との信頼に影が差す」
      </blockquote>

      <p>
        積み上げてきた努力と汗が、顔の見えない誰かの言葉によって否定される理不尽。
        その孤独な苦しみは、計り知れないものとお察しいたします。
      </p>

      <p>
        本来、賞賛されるべき誠実な事業者が、なぜこれほどまでに不当なバッシングに晒されなければならないのか。
        私はその現状を打破したいという強い憤りと、使命感を抱き、当センターを設立いたしました。
      </p>

      <p>ネット社会の荒波の中で、お一人で抱え込む必要はございません。</p>

      <p>
        まずは、これまでの歩みと現在の胸の内をお聞かせください。
        私たちが貴社の確かな味方となり、共に解決への道筋を立ててまいります。
      </p>

      <p style="font-size:18px;font-weight:700;color:var(--c-navy);">貴社の未来を、私たちと共に守り抜きましょう。</p>

      <p class="text-right mt-48" style="font-family:var(--font-mincho);line-height:1.8;">
        一般社団法人口コミ対策センター<br>
        <span style="font-size:20px;">代表理事　佐藤 朝亮</span>
      </p>
    </div>{cta_trio(1)}</div></section>
    """
    (ROOT / "message/index.html").write_text(
        page_html(depth=1, title="代表挨拶｜一般社団法人 口コミ対策センター",
                  description="代表メッセージ。口コミ対策の専門家がビジネスの信頼を守ります。経営者様の心強い味方に。",
                  body=body, active=""),
        encoding="utf-8")

    # /contact/
    body = f"""
    {page_header_block("CONTACT", "お問い合わせ・無料診断", "1営業日以内に専門スタッフよりご返信いたします。", 1)}
    <section class="section"><div class="container">
      {cta_trio(1)}
      <form class="form-grid mt-48" action="#" method="post" novalidate>
        <div class="form-field"><label>会社名／屋号<span class="req">必須</span></label><input type="text" name="company" required placeholder="例）株式会社サンプル"></div>
        <div class="form-field"><label>ご担当者名<span class="req">必須</span></label><input type="text" name="name" required placeholder="例）山田 太郎"></div>
        <div class="form-field"><label>窓口区分</label>
          <select name="segment"><option>法人としてのご相談</option><option>個人としてのご相談</option><option>上場企業 / IR関連</option><option>エグゼクティブ・経営者個人</option></select>
        </div>
        <div class="form-field"><label>メールアドレス<span class="req">必須</span></label><input type="email" name="email" required placeholder="example@example.com"></div>
        <div class="form-field"><label>お電話番号</label><input type="tel" name="tel" placeholder="03-0000-0000"></div>
        <div class="form-field"><label>対象URL（Googleマップ等）</label><input type="url" name="target_url" placeholder="https://maps.google.com/..."></div>
        <div class="form-field"><label>ご相談内容</label><textarea name="message" placeholder="現状や気になる口コミ等、わかる範囲でお書きください。"></textarea></div>
        <div class="form-actions"><button type="submit" class="btn btn--primary btn--lg">無料診断を送信する</button><p class="form-note">SSL暗号化通信採用 / 秘密厳守 / 営業電話は致しません</p></div>
      </form>
    </div></section>
    """
    (ROOT / "contact/index.html").write_text(
        page_html(depth=1, title="お問い合わせ・無料診断｜一般社団法人 口コミ対策センター",
                  description="法人・個人どちらの窓口にも対応。1営業日以内に専門スタッフよりご返信いたします。秘密厳守・しつこい営業は一切いたしません。",
                  body=body, active="無料相談"),
        encoding="utf-8")

    # /process/
    body = f"""
    {page_header_block("PROCESS", "解決プロセス", "ご相談から再発防止まで、5ステップ。", 1)}
    <section class="section"><div class="container container--wide">
      <div class="flow">
        <div class="flow__step"><div class="flow__num">STEP 01</div><h3>無料相談</h3><p>フォーム・電話・LINEから状況をお知らせください。秘密厳守。</p></div>
        <div class="flow__step"><div class="flow__num">STEP 02</div><h3>無料診断</h3><p>1営業日以内に対策可否・想定難易度をご回答します。</p></div>
        <div class="flow__step"><div class="flow__num">STEP 03</div><h3>ご提案・契約</h3><p>方針と料金をご確認のうえ、完全成功報酬で契約。</p></div>
        <div class="flow__step"><div class="flow__num">STEP 04</div><h3>対策実行</h3><p>専門チームが規約準拠で対策を実行。継続的に進捗報告。</p></div>
        <div class="flow__step"><div class="flow__num">STEP 05</div><h3>結果報告・再発防止</h3><p>是正完了後、再発防止モニタリングまでフォロー。</p></div>
      </div>
      <div class="prose mt-48">
        <h2>各ステップの詳細</h2>
        <h3>STEP 01 ｜ 無料相談</h3>
        <p>お問い合わせフォーム、電話、LINE等から状況をお知らせください。対象URLや背景、これまで試した対応内容を教えていただけると、診断がスムーズです。</p>
        <h3>STEP 02 ｜ 無料診断</h3>
        <p>専門スタッフが内容を確認し、対策可否、想定難易度、推奨アプローチを1営業日以内にご返信します。診断結果のみのご利用も可能です。</p>
        <h3>STEP 03 ｜ ご提案・契約</h3>
        <p>方針と料金を明示したうえで、ご納得いただいた場合のみ契約に進みます。料金は完全成功報酬制のため、結果が出ない場合はご請求しません。</p>
        <h3>STEP 04 ｜ 対策実行</h3>
        <p>専任担当が窓口となり、専門チームが対策を実行します。週次〜月次の進捗報告と、ご質問への即時回答体制を整えます。</p>
        <h3>STEP 05 ｜ 結果報告・再発防止</h3>
        <p>是正完了をもってご報告し、再発防止のためのモニタリング体制をご提案します（オプション）。</p>
      </div>
      {cta_trio(1)}
    </div></section>
    """
    (ROOT / "process").mkdir(exist_ok=True)
    (ROOT / "process/index.html").write_text(
        page_html(depth=1, title="解決プロセス｜一般社団法人 口コミ対策センター",
                  description="ご相談から再発防止まで、5ステップで解決まで伴走します。各ステップで何を行い、何を確認するのかを明確にご案内します。",
                  body=body, active="解決プロセス"),
        encoding="utf-8")

    # /cases/
    body = f"""
    {page_header_block("CASES", "成功事例", "業種・媒体別の解決事例（守秘義務の範囲内で記載）", 1)}
    <section class="section"><div class="container container--wide">
      <div class="grid grid--2">
        {"".join([
            f'<div class="card"><div class="card__icon">{ICONS["store"]}</div><h3>飲食店 — Googleマップ★1レビューの是正</h3><p>事実無根の名指し中傷★1レビュー6件のうち4件が削除。検索流入が施策前比+38%まで回復。</p></div>',
            f'<div class="card"><div class="card__icon">{ICONS["medical"]}</div><h3>クリニック — 医師個人名サジェスト浄化</h3><p>医師個人名＋ネガティブワードのサジェスト固定化を、3か月で実質非表示化。</p></div>',
            f'<div class="card"><div class="card__icon">{ICONS["chart"]}</div><h3>上場企業 — 株主掲示板の風評対応</h3><p>短信前後の風評投稿モニタリング体制を構築。広報部と連携した初動対応で炎上回避。</p></div>',
            f'<div class="card"><div class="card__icon">{ICONS["map"]}</div><h3>美容サロン — 競合と疑われる連続投稿</h3><p>短期間に集中投稿された不審レビュー群について、規約準拠の申請で大半が削除。</p></div>',
            f'<div class="card"><div class="card__icon">{ICONS["shield"]}</div><h3>士業事務所 — 名指しスレッド対策</h3><p>巨大掲示板上の名指しスレッドについて、運営規約に基づく申請で削除に成功。</p></div>',
            f'<div class="card"><div class="card__icon">{ICONS["globe"]}</div><h3>宿泊 — 海外レビューサイト対策</h3><p>英語圏レビューでの事実誤認に対し、現地規約準拠の申請で訂正反映。</p></div>',
        ])}
      </div>
      {cta_trio(1)}
    </div></section>
    """
    (ROOT / "cases").mkdir(exist_ok=True)
    (ROOT / "cases/index.html").write_text(
        page_html(depth=1, title="成功事例｜一般社団法人 口コミ対策センター",
                  description="業種別・媒体別の口コミ対策・誹謗中傷対策の解決事例（守秘義務の範囲内で記載）。",
                  body=body, active="成功事例"),
        encoding="utf-8")

    # /faq/
    items = [
        ("本当に削除・非表示化できるのですか？", "100%の保証は致しかねますが、規約・法令に準拠した専門的アプローチにより多数の解決実績がございます。まずは無料診断にて可能性をご確認ください。"),
        ("料金はいつ発生しますか？", "完全成功報酬制のため、結果が出るまで一切ご請求は発生しません。初期費用・着手金もいただきません。"),
        ("弁護士に依頼する場合とどう違いますか？", "当センターは裁判や開示請求などの法的手続きを介さず、プラットフォーム規約に基づく専門的な是正アプローチを採用しています。費用負担と所要期間を抑えやすい点が大きな違いです。"),
        ("違法な手法は使われていませんか？", "違法な手法・スパム行為は一切行いません。プラットフォームのガイドラインに準拠した正当な報告フローのみを用います。"),
        ("投稿者や周囲に依頼の事実は伝わりますか？", "第三者に通知が行くことはありません。完全秘密厳守で運用いたしますので、安心してご相談ください。"),
        ("対応エリアはどこまでですか？", "全国47都道府県および海外サーバーに対応しております。すべてオンラインで完結可能です。"),
        ("どのくらいの期間で結果が出ますか？", "案件難易度により異なります。Googleマップの軽度な案件であれば数日〜2週間、サジェスト浄化のような中長期施策で3〜6か月が目安です。"),
        ("再発した場合はどうなりますか？", "再発防止モニタリングのオプションをご用意しています。継続的に監視し、再発の兆候があれば即時に追加対応を行います。"),
        ("法人・個人どちらでも依頼できますか？", "はい、どちらも対応しております。法人窓口・個人窓口で受付を分けておりますので、該当する窓口へお問い合わせください。"),
        ("上場企業のIR・広報窓口としても利用できますか？", "はい、適時開示や株主掲示板に関するレピュテーションリスク管理にも対応しております。専任チームで秘匿性高く運用します。"),
    ]
    faq_html = "".join(
        f'<div class="faq__item"><button class="faq__q"><span class="faq__q-text">{q}</span><span class="faq__q-icon"></span></button><div class="faq__a"><p>{a}</p></div></div>'
        for q,a in items
    )
    body = f"""
    {page_header_block("FAQ", "よくあるご質問", "ご依頼前によくいただくご質問をまとめました。", 1)}
    <section class="section"><div class="container"><div class="faq">{faq_html}</div>{cta_trio(1)}</div></section>
    """
    (ROOT / "faq").mkdir(exist_ok=True)
    (ROOT / "faq/index.html").write_text(
        page_html(depth=1, title="よくあるご質問｜一般社団法人 口コミ対策センター",
                  description="一般社団法人 口コミ対策センターへのよくあるご質問。料金・期間・対応範囲・秘密保持等についてお答えしています。",
                  body=body, active="FAQ"),
        encoding="utf-8")

    # /pricing/
    body = f"""
    {page_header_block("PRICING", "料金", "完全成功報酬制／初期費用・着手金0円", 1)}
    <section class="section"><div class="container"><div class="prose">
      <h2>料金体系</h2>
      <p>当センターは<strong>完全成功報酬制</strong>を採用しています。結果が出るまで、ご請求は一切発生しません。初期費用・着手金は不要です。</p>
      <table class="meta-table"><tbody>
        <tr><th>初期費用</th><td><strong>0円</strong></td></tr>
        <tr><th>着手金</th><td><strong>0円</strong></td></tr>
        <tr><th>成功報酬</th><td>案件難易度・対象媒体・件数により個別お見積り</td></tr>
        <tr><th>月次モニタリング（オプション）</th><td>月額制（再発防止のための継続監視）</td></tr>
        <tr><th>支払時期</th><td>成果確認後、別途定める期日まで（銀行振込）</td></tr>
      </tbody></table>
      <h2>お見積りまでの流れ</h2>
      <ol>
        <li>無料相談・無料診断にて対策の可否をご回答</li>
        <li>診断結果を踏まえたお見積りをご提示（無料）</li>
        <li>ご納得いただいたうえで契約・着手</li>
        <li>成果確認後にお支払い</li>
      </ol>
      <h2>注意事項</h2>
      <ul>
        <li>役務の性質上、着手後のキャンセルはお受けできない場合があります。詳細は契約書に準じます。</li>
        <li>悪質な押し売りや、診断前の高額請求等は一切行いません。</li>
      </ul>
    </div>{cta_trio(1)}</div></section>
    """
    (ROOT / "pricing").mkdir(exist_ok=True)
    (ROOT / "pricing/index.html").write_text(
        page_html(depth=1, title="料金｜一般社団法人 口コミ対策センター",
                  description="完全成功報酬制／初期費用・着手金0円。結果が出るまでご請求は発生しません。料金体系・お見積り・支払いについてご案内します。",
                  body=body, active="料金"),
        encoding="utf-8")

    # /strengths/
    body = f"""
    {page_header_block("STRENGTHS", "当センターの強み", "選ばれ続ける5つの理由。", 1)}
    <section class="section"><div class="container container--wide">
      {strengths_block()}
      <div class="prose mt-48">
        <h2>1. 完全成功報酬・初期費用0円</h2>
        <p>結果が出るまでご請求が発生しないため、リスクなくご依頼いただけます。診断のみのご利用も可能です。</p>
        <h2>2. 規約・法令準拠の正攻法のみ</h2>
        <p>違法・グレーな手法は採用しません。プラットフォーム規約と法令の双方を遵守するアプローチで、ご依頼後のアカウントリスクが発生しません。</p>
        <h2>3. 全国47都道府県・海外サーバー対応</h2>
        <p>地域・国境に関わらず、オンラインで完結対応します。海外案件にも英語対応で対応可能です。</p>
        <h2>4. 再発防止モニタリング</h2>
        <p>是正後の再発防止のため、継続モニタリングオプションをご用意。再発の兆候を早期に検知し、即時対応します。</p>
        <h2>5. 秘密厳守 NDA・ISMS準拠運用</h2>
        <p>ご相談の事実、対象媒体、社内情報のすべてを厳格に秘匿管理。NDA締結、ISMS準拠の運用体制で対応します。</p>
      </div>
      {cta_trio(1)}
    </div></section>
    """
    (ROOT / "strengths").mkdir(exist_ok=True)
    (ROOT / "strengths/index.html").write_text(
        page_html(depth=1, title="当センターの強み｜一般社団法人 口コミ対策センター",
                  description="完全成功報酬・規約準拠の正攻法・全国海外対応・再発防止・秘密厳守。選ばれ続ける5つの理由。",
                  body=body, active=""),
        encoding="utf-8")

    # /news/
    items = [
        ("2026.06.20", "お知らせ", "ホームページをリニューアルいたしました"),
        ("2026.06.05", "コラム", "Googleマップ口コミガイドラインの2026年改定ポイント解説"),
        ("2026.05.18", "注意喚起", "当センターを騙る悪質な代行業者にご注意ください"),
        ("2026.04.27", "コラム", "採用活動と口コミ評価——求人サイトの低評価が応募率に与える影響"),
        ("2026.04.10", "お知らせ", "医療機関向けサポート体制を強化しました"),
        ("2026.03.22", "コラム", "悪意ある口コミを「証拠化」する基本ステップ"),
        ("2026.03.08", "お知らせ", "海外対策（英語圏）の受付体制を拡充しました"),
        ("2026.02.15", "コラム", "サジェスト浄化と逆SEOの違いと併用戦略"),
        ("2026.02.01", "注意喚起", "「即日削除保証」をうたう違法業者にご注意ください"),
        ("2026.01.18", "コラム", "経営者個人名の風評対策——上場企業役員に求められるレピュテーション管理"),
    ]
    rows = "".join(
        f'<div class="news-item"><time>{d}</time><span class="tag {("tag--alert" if t=="注意喚起" else "tag--column" if t=="コラム" else "")}">{t}</span><a href="#">{ti}</a></div>'
        for d,t,ti in items
    )
    body = f"""
    {page_header_block("NEWS", "お知らせ", "最新のお知らせ・プレスリリース・コラム・注意喚起。", 1)}
    <section class="section"><div class="container"><div class="news-list">{rows}</div></div></section>
    """
    (ROOT / "news/index.html").write_text(
        page_html(depth=1, title="お知らせ｜一般社団法人 口コミ対策センター",
                  description="一般社団法人 口コミ対策センターからの最新のお知らせ・プレスリリース・コラム・注意喚起。",
                  body=body, active=""),
        encoding="utf-8")

    # /recruit/
    body = f"""
    {page_header_block("RECRUIT", "採用情報", "事業者の信用を守る仕事に、共に向き合える仲間を募集しています。", 1)}
    <section class="section"><div class="container"><div class="prose">
      <h2>私たちのミッション</h2>
      <p>理不尽な口コミに苦しむ事業者様の「最後の砦」になる。当センターは法と規約に則った専門アプローチで、現場のオーナーが現実的に頼れる選択肢を提供します。</p>
      <h2>募集職種</h2>
      <h3>口コミ対策スペシャリスト</h3>
      <ul><li>業務内容：プラットフォーム規約に基づく報告ロジックの設計・実行、案件解析</li><li>雇用形態：正社員／業務委託</li><li>勤務地：リモート可</li><li>必須スキル：論理的思考、ライティング、ドキュメンテーション</li></ul>
      <h3>カスタマーサクセス</h3>
      <ul><li>業務内容：相談受付、ヒアリング、進捗報告、契約管理</li><li>雇用形態：正社員</li><li>勤務地：リモート可</li><li>歓迎経験：BtoB営業、CS、士業事務所、コールセンター等</li></ul>
      <h3>逆SEO・サジェスト施策ディレクター</h3>
      <ul><li>業務内容：逆SEO・サジェスト浄化の施策設計、外部リソース管理、効果測定</li><li>雇用形態：正社員／業務委託</li><li>歓迎経験：SEO/Web広告/PRの実務経験</li></ul>
      <h2>応募方法</h2>
      <p><a href="../contact/">お問い合わせフォーム</a>より「採用応募」と明記の上、ご希望職種・職務経歴をお送りください。書類選考のうえ、担当者よりご連絡いたします。</p>
    </div></div></section>
    """
    (ROOT / "recruit/index.html").write_text(
        page_html(depth=1, title="採用情報｜一般社団法人 口コミ対策センター",
                  description="一般社団法人 口コミ対策センターの採用情報。事業者の信用を守る仕事に、共感いただける仲間を募集しています。",
                  body=body, active=""),
        encoding="utf-8")

    # Method pages
    methods = [
        ("reverse-seo", "逆SEO対策", "検索結果上のネガティブ表示を、正攻法で押し下げる中長期施策。"),
        ("suggest", "サジェスト浄化", "検索窓に表示されるネガティブワードを、健全化する取り組み。"),
        ("branding", "ポジティブブランディング", "公式情報・取材記事・SNS整備で「会社名で検索したときの景色」を実像に近づける。"),
    ]
    (ROOT / "method").mkdir(exist_ok=True)
    for slug, name, sub in methods:
        d = ROOT / "method" / slug
        d.mkdir(exist_ok=True)
        body = f"""
        {page_header_block("METHOD", name, sub, 2)}
        <section class="section"><div class="container"><div class="prose">
          <h2>{name}とは</h2>
          <p>{sub} 当センターでは、{name}を単独の施策ではなく、是正アプローチや風評モニタリングと組み合わせた総合的な信用回復戦略の一翼として位置付けています。</p>
          <h2>{name}の進め方</h2>
          <p>案件の現状分析、目標設定、施策設計、実行、モニタリングのサイクルで進めます。施策内容はすべて規約・ガイドラインに準拠し、ブラックハットな手法は採用しません。</p>
          <h2>期間と費用の目安</h2>
          <p>中長期施策のため、3〜6か月単位での運用が一般的です。費用は案件難易度・規模により個別お見積りいたします。完全成功報酬の対象範囲については、診断時にご説明します。</p>
        </div>{cta_trio(2)}</div></section>
        """
        (d / "index.html").write_text(
            page_html(depth=2, title=f"{name}｜対策手法｜一般社団法人 口コミ対策センター",
                      description=f"{name}：{sub} 規約・ガイドライン準拠の正攻法のみで実行します。",
                      body=body, active=""),
            encoding="utf-8")

    # For-target pages
    targets = [
        ("for-corporate", "法人クライアント窓口", "中小企業から大手企業まで、法人事業者様向けの口コミ・誹謗中傷対策。"),
        ("for-individual", "個人クライアント窓口", "個人事業主・経営者個人・著名人など、個人向けの風評対策窓口。"),
        ("for-listed", "上場企業・IR向け", "上場企業の適時開示・株主掲示板・役員人事に関わるレピュテーション管理。"),
        ("for-executive", "エグゼクティブ・経営者向け", "経営者個人名のサジェスト浄化、SNS監視、検索結果コントロール。"),
    ]
    for slug, name, sub in targets:
        d = ROOT / slug
        d.mkdir(exist_ok=True)
        body = f"""
        {page_header_block("FOR CLIENT", name, sub, 1)}
        <section class="section"><div class="container"><div class="prose">
          <h2>{name}のご案内</h2>
          <p>{sub} 当センターでは、対象クライアントごとに専任チームを編成し、案件特性に合わせた対策をご提供しています。</p>
          <h2>主な対応内容</h2>
          <ul>
            <li>媒体別（Googleマップ・5ch・爆サイ・SNS・口コミ集合サイト 等）の是正対応</li>
            <li>逆SEO・サジェスト浄化・ポジティブブランディング</li>
            <li>炎上初動対応、危機管理対応</li>
            <li>再発防止モニタリング（24時間体制）</li>
          </ul>
          <h2>料金・契約</h2>
          <p>標準料金体系（初期費用・着手金0円／完全成功報酬制）を適用。秘密厳守 NDA を締結のうえご支援いたします。</p>
        </div>{cta_trio(1)}</div></section>
        """
        (d / "index.html").write_text(
            page_html(depth=1, title=f"{name}｜一般社団法人 口コミ対策センター",
                      description=f"{name}：{sub}",
                      body=body, active=""),
            encoding="utf-8")

    # Policy pages (再生成、深さ1)
    policies = [
        ("privacypolicy", "プライバシーポリシー", [
            ("1. 個人情報の定義", "本ポリシーにおいて「個人情報」とは、個人情報の保護に関する法律に定める個人情報をいい、生存する個人に関する情報であって、当該情報に含まれる氏名、生年月日その他の記述等により特定の個人を識別できるものを指します。"),
            ("2. 個人情報の取得", "当センターは、適法かつ公正な手段によって、必要な範囲で個人情報を取得します。"),
            ("3. 利用目的", "お問い合わせ・無料診断へのご回答、サービスの提供および付随する連絡、サービスの改善および新サービスのご案内、法令に基づく対応。"),
            ("4. 第三者提供", "法令に定める場合を除き、ご本人の同意なく第三者に個人情報を提供することはありません。"),
            ("5. 安全管理措置", "個人情報の漏洩、滅失または毀損の防止のため、必要かつ適切な安全管理措置を講じます。"),
            ("6. 開示・訂正・削除等", "ご本人からの個人情報の開示・訂正・利用停止・削除等のご請求には、法令に従い適切に対応します。"),
            ("7. 改定", "本ポリシーは、必要に応じ予告なく改定する場合があります。最新版は本ページに掲載されます。"),
        ]),
        ("social-policy", "ソーシャルメディアポリシー", [
            ("1. 基本姿勢", "当センターは、ソーシャルメディアを活用した情報発信および意見交換にあたり、誠実かつ責任ある対応を行います。"),
            ("2. 発信内容", "当センター公式アカウントからの発信は、当センターの公式見解として位置付けられるものを除き、担当者個人の見解を含む場合があります。"),
            ("3. 著作権", "各ソーシャルメディア上で発信する文章・画像・動画等の著作権は、原則として当センターまたは正当な権利者に帰属します。"),
            ("4. 禁止事項", "法令違反、公序良俗に反する行為／他者の権利・名誉・プライバシーを侵害する行為／誹謗中傷、差別的表現、ハラスメント行為。"),
            ("5. 返信・対応について", "個別のご質問やご相談には、原則として公式お問い合わせフォームよりご連絡ください。"),
        ]),
        ("security-policy", "情報セキュリティ基本方針", [
            ("1. 目的", "当センターは、お客様および関係者からお預かりした情報資産を、機密性・完全性・可用性の観点から適切に保護することを目的とします。"),
            ("2. 適用範囲", "本方針は、当センターの役員および全従業員、業務委託先を含む関係者すべてに適用されます。"),
            ("3. 体制と責任", "情報セキュリティに関する責任者を置き、組織的・継続的に管理体制の維持・改善を行います。"),
            ("4. 安全管理措置", "SSL/TLSによる通信の暗号化、アクセス権限の最小化とログ取得・監視、従業員教育、業務委託先への適切な監督。"),
            ("5. 法令の遵守", "個人情報保護法、関連法令、契約上の義務およびガイドラインを遵守します。"),
            ("6. 継続的改善", "定期的なレビューと改善活動を通じて、情報セキュリティのレベル向上に努めます。"),
        ]),
        ("regulation", "特定商取引法に基づく表記", [
            ("事業者名", "一般社団法人口コミ対策センター"),
            ("代表者", "佐藤 朝亮"),
            ("所在地", "〒104-0053 東京都中央区晴海3-16-1"),
            ("法人番号", "6010005039630"),
            ("設立", "2025年2月1日"),
            ("連絡先", "お問い合わせフォームよりご連絡ください"),
            ("提供サービス", "インターネット誹謗中傷対策／権利侵害抑止事業／SEO/SERPs適正化支援／デジタルレピュテーション・インテグリティ事業／社会動向データ・アナリティクス事業"),
            ("料金", "完全成功報酬制／初期費用0円"),
            ("支払時期・方法", "銀行振込（成果確認後、別途定める期日まで）"),
            ("サービス提供時期", "ご契約日より対策に着手いたします（最短即日）"),
            ("キャンセル等", "役務の性質上、着手後のキャンセルはお受けできません。詳細は契約書に準じます。"),
        ]),
    ]
    for slug, title, sections in policies:
        d = ROOT / slug
        d.mkdir(exist_ok=True)
        if slug == "regulation":
            body_rows = "".join(f"<tr><th>{h}</th><td>{t}</td></tr>" for h,t in sections)
            inner = f'<table class="meta-table"><tbody>{body_rows}</tbody></table>'
        else:
            inner = "".join(f"<h2>{h}</h2><p>{t}</p>" for h,t in sections)
        body = f"""
        {page_header_block("POLICY" if slug != "regulation" else "LEGAL", title, "", 1)}
        <section class="section"><div class="container"><div class="prose">{inner}</div></div></section>
        """
        (d / "index.html").write_text(
            page_html(depth=1, title=f"{title}｜一般社団法人 口コミ対策センター",
                      description=f"一般社団法人 口コミ対策センターの{title}。",
                      body=body, active=""),
            encoding="utf-8")

    # /sitemap/
    pref_links = "".join(f'<li><a href="../area/{s}/">{n}の対策</a></li>' for _,_,s,n in PREFECTURES)
    overseas_links = "".join(f'<li><a href="../overseas/{s}/">{n}</a></li>' for _,s,n in OVERSEAS)
    industry_links = "".join(f'<li><a href="../industry/{s}/">{n}の対策</a></li>' for s,n,_ in INDUSTRIES)
    platform_links = "".join(f'<li><a href="../platform/{s}/">{n}</a></li>' for s,n,_ in PLATFORMS)
    body = f"""
    {page_header_block("SITEMAP", "サイトマップ", "ページ一覧。", 1)}
    <section class="section"><div class="container container--wide"><div class="mega-footer__grid">
      <div><h4>主要ページ</h4><ul>
        <li><a href="../">トップ</a></li><li><a href="../about/">当センターについて</a></li>
        <li><a href="../service/">サービス内容</a></li><li><a href="../process/">解決プロセス</a></li>
        <li><a href="../strengths/">当センターの強み</a></li><li><a href="../cases/">成功事例</a></li>
        <li><a href="../faq/">FAQ</a></li><li><a href="../pricing/">料金</a></li>
        <li><a href="../message/">代表挨拶</a></li><li><a href="../news/">お知らせ</a></li>
        <li><a href="../recruit/">採用情報</a></li><li><a href="../contact/">お問い合わせ</a></li>
      </ul></div>
      <div><h4>都道府県</h4><ul>{pref_links}</ul></div>
      <div><h4>海外対応</h4><ul>{overseas_links}</ul></div>
      <div><h4>業種別／媒体別</h4><ul>{industry_links}{platform_links}</ul></div>
    </div></div></section>
    """
    (ROOT / "sitemap").mkdir(exist_ok=True)
    (ROOT / "sitemap/index.html").write_text(
        page_html(depth=1, title="サイトマップ｜一般社団法人 口コミ対策センター",
                  description="一般社団法人 口コミ対策センターのサイトマップ。全ページの一覧。",
                  body=body, active=""),
        encoding="utf-8")

# ============================================================
# 追加カテゴリのビルダ
# ============================================================
def _prose_lead(text):
    return f'<p style="font-size:17px;color:var(--c-text);line-height:1.95;">{text}</p>'

def build_knowledge_pages():
    base = ROOT / "knowledge"
    base.mkdir(exist_ok=True)
    # index
    items = "".join(
        f'<a href="{slug}/" class="banner"><div class="banner__cover">{svg_placeholder(name,"navy",640,360)}</div>'
        f'<div class="banner__body"><div class="banner__title">{name}</div><div class="banner__sub">{lead}</div><div class="banner__cta">読む</div></div></a>'
        for slug, name, lead in KNOWLEDGE
    )
    body = f"""
    {page_header_block("KNOWLEDGE", "口コミ対策・WEBレピュテーション 基礎知識", "対策の概念・進め方・解決可能性に関する基礎知識をまとめています。", 1)}
    <section class="section"><div class="container container--wide"><div class="banner-grid">{items}</div>{cta_trio(1)}</div></section>
    """
    write_page(base / "index.html", page_html(depth=1,
        title="口コミ対策・WEBレピュテーション基礎知識｜一般社団法人口コミ対策センター",
        description="口コミ対策・WEBレピュテーション対策に関する基礎知識集。概念、解決の道筋、専門家活用の合理性まで網羅。",
        body=body, active=""))

    for slug, name, lead in KNOWLEDGE:
        d = base / slug
        body = f"""
        {page_header_block("KNOWLEDGE", name, lead, 2)}
        <section class="section"><div class="container"><div class="prose">
          {_prose_lead(lead)}

          <h2>なぜ今、この知識が必要なのか</h2>
          <p>
            検索とSNSが意思決定の中心となった現代において、ネット上に流通する情報の質と量が、事業者・経営者・個人の活動可能性を大きく左右します。
            「{name}」というテーマは、まさにその交差点に位置する論点であり、放置することのリスクと、適切な対策を講じることの効果が、
            年を追うごとに大きく開いていく分野です。
          </p>
          <p>
            当センターでは、{name}に関するご相談を全国の事業者様・個人様から日々お預かりしており、
            その知見をもとに本ページの解説を構成しています。専門用語は最小限に、現場の実情に即して解説します。
          </p>

          <h2>解決には「正しい順序」がある</h2>
          <p>
            ネット上の評判課題の多くは、感情的な反論や性急な法的措置から入ると逆効果になります。
            正しい順序は、<strong>①現状の客観的な可視化（無料診断）→②優先順位の決定→③規約・法令準拠の対策実行→④再発防止モニタリング</strong>です。
            この順序を踏まずに対症療法を繰り返すと、被害が拡大し、回復にかかる時間と費用が雪だるま式に増加します。
          </p>

          <h2>当センターのアプローチ</h2>
          <p>
            違法・グレーな手法は一切採用しません。プラットフォーム規約と法令の双方を遵守した正攻法のみで、
            ご相談から解決、再発防止まで一貫して伴走します。費用は完全成功報酬制・初期費用0円のため、
            結果が出るまでご請求が発生することはありません。
          </p>

          <h2>関連ページ</h2>
          <ul>
            <li><a href="../../service/">サービス内容</a> ｜ 4本柱の対策メニュー</li>
            <li><a href="../../process/">解決プロセス</a> ｜ ご相談から再発防止までの5ステップ</li>
            <li><a href="../../pricing/">料金</a> ｜ 完全成功報酬制の詳細</li>
            <li><a href="../../faq/">FAQ</a> ｜ よくあるご質問</li>
          </ul>
        </div>{cta_trio(2)}</div></section>
        """
        write_page(d / "index.html", page_html(depth=2,
            title=f"{name}｜口コミ対策の基礎知識｜一般社団法人口コミ対策センター",
            description=f"{lead}",
            body=body, active=""))

def build_process_sub_pages():
    base = ROOT / "process"
    base.mkdir(exist_ok=True)
    for slug, name, lead in PROCESS_STEPS:
        d = base / slug
        body = f"""
        {page_header_block("PROCESS", name, lead, 2)}
        <section class="section"><div class="container"><div class="prose">
          {_prose_lead(lead)}
          <h2>このステップで実施すること</h2>
          <p>
            このステップでは、案件の特性を踏まえて適切な手段を選択します。ご相談者様にご確認いただくべき事項、
            当センターが内部で実施する作業、外部に依頼する作業を明確に分け、進捗をご報告します。
          </p>
          <h2>所要期間の目安</h2>
          <p>
            案件により異なりますが、初動の{name.split('｜')[-1].strip()}であれば1〜2週間、
            中長期施策の場合は1〜3か月単位で計画的に進めます。各タイミングで進捗ご報告と次工程のご相談を行います。
          </p>
          <h2>料金</h2>
          <p>本ステップを含むすべての工程は、完全成功報酬制（初期費用0円）に含まれます。診断のみのご利用も可能です。</p>
          <h2>関連ページ</h2>
          <ul>
            <li><a href="../">解決プロセス（全体）</a></li>
            <li><a href="../../pricing/">料金</a></li>
            <li><a href="../../service/">サービス内容</a></li>
          </ul>
        </div>{cta_trio(2)}</div></section>
        """
        write_page(d / "index.html", page_html(depth=2,
            title=f"{name}｜解決プロセス｜一般社団法人口コミ対策センター",
            description=lead, body=body, active="解決プロセス"))

def build_extra_methods():
    base = ROOT / "method"
    base.mkdir(exist_ok=True)
    for slug, name, lead in EXTRA_METHODS:
        d = base / slug
        body = f"""
        {page_header_block("METHOD", name, lead, 2)}
        <section class="section"><div class="container"><div class="prose">
          {_prose_lead(lead)}
          <h2>当センターが大切にしていること</h2>
          <p>「{name}」は、当センターが単発の作業ではなく仕組みとして提供することにこだわるテーマです。
          一過性の削除や対症療法ではなく、ご依頼後にもクライアントに残る形で、価値が積み上がっていくことを目指します。</p>
          <h2>具体的な内容</h2>
          <p>本サービスは、診断から実行、再発防止のモニタリングまで一貫して提供します。
          進め方は案件ごとに調整し、業種特性・媒体特性・規模・予算に応じた最適解をご提案します。</p>
          <h2>料金</h2>
          <p>標準料金体系（初期費用0円・完全成功報酬制）を適用します。継続モニタリングなど月額制のオプションも別途ご用意しています。</p>
        </div>{cta_trio(2)}</div></section>
        """
        write_page(d / "index.html", page_html(depth=2,
            title=f"{name}｜対策手法｜一般社団法人口コミ対策センター",
            description=lead, body=body, active=""))

def build_misc_pages():
    for slug, name, lead in EXTRA_INDIE_PAGES:
        d = ROOT / slug
        d.mkdir(exist_ok=True)
        if slug == "access":
            inner = f"""
              <h2>所在地</h2>
              <table class="meta-table"><tbody>
                <tr><th>法人名</th><td>一般社団法人口コミ対策センター</td></tr>
                <tr><th>所在地</th><td>〒104-0053 東京都中央区晴海3-16-1</td></tr>
                <tr><th>最寄駅</th><td>都営大江戸線「勝どき」駅／東京メトロ有楽町線「月島」駅 ほか</td></tr>
                <tr><th>受付時間</th><td>10:00 - 20:00（年中無休）</td></tr>
                <tr><th>法人窓口</th><td>0120-000-001</td></tr>
                <tr><th>個人窓口</th><td>0120-000-002</td></tr>
              </tbody></table>
              <h2>ご来訪について</h2>
              <p>対面でのご相談をご希望の場合は、事前に<a href="../contact/">面談予約</a>からお申し込みください。
              オンライン面談（Zoom／Google Meet 等）にも対応しております。</p>
            """
        elif slug == "trademark":
            inner = """
              <h2>登録商標について</h2>
              <p>以下は、一般社団法人口コミ対策センターが保有または出願中の登録商標です。</p>
              <ul>
                <li>口コミ対策センター®</li>
                <li>逆SEOクリーン®</li>
                <li>WEBレピュテーション・インテグリティ®</li>
              </ul>
              <h2>使用に関する注意</h2>
              <p>登録商標の無断使用、または当センターと関係のない第三者が当該標章を用いる行為は、商標権の侵害となる場合があります。
              当センターを騙る業者を発見された場合は、<a href="../contact/">お問い合わせフォーム</a>よりご一報ください。</p>
            """
        elif slug == "difficulty":
            inner = """
              <h2>媒体別 対策難易度の目安</h2>
              <p>媒体ごとに削除可否・所要期間が大きく異なります。下表は当センターの過去事例に基づく目安です。
              具体的な見通しは案件ごとの<a href="../contact/">無料診断</a>で算定いたします。</p>
              <table class="meta-table"><tbody>
                <tr><th>媒体</th><td>難易度／所要期間の目安</td></tr>
                <tr><th>Googleマップ</th><td>★☆☆〜★★☆ ／ 数日〜2週間</td></tr>
                <tr><th>Yahoo!知恵袋</th><td>★★☆ ／ 1〜3週間</td></tr>
                <tr><th>5ch（一般板）</th><td>★★☆〜★★★ ／ 1か月〜3か月</td></tr>
                <tr><th>爆サイ.com</th><td>★★★ ／ 2か月〜6か月</td></tr>
                <tr><th>ホストラブ等</th><td>★★★ ／ 2か月〜6か月</td></tr>
                <tr><th>X（旧Twitter）</th><td>★★☆ ／ 数日〜1か月</td></tr>
                <tr><th>YouTube</th><td>★★☆ ／ 1〜4週間</td></tr>
                <tr><th>サジェスト浄化</th><td>★★★ ／ 3〜6か月（中長期施策）</td></tr>
                <tr><th>海外サーバー掲示板</th><td>★★★ ／ 2か月〜（現地規約準拠）</td></tr>
              </tbody></table>
              <h2>難易度判定の考え方</h2>
              <p>難易度は、媒体の運営方針・削除ポリシー・運営連絡先の有無・過去の対応傾向・案件特性により総合判定します。
              「困難な媒体」であっても、規約に則った正当な申請ロジックを構築することで解決可能なケースは少なくありません。</p>
            """
        elif slug == "nda":
            inner = """
              <h2>NDA（秘密保持契約）について</h2>
              <p>当センターは、すべてのご相談者様との間でNDAを締結したうえで業務を進めます。
              ご相談の事実、対象媒体、社内情報、対策手法の詳細について、第三者に開示することは一切ありません。</p>
              <h2>NDA締結の流れ</h2>
              <ol>
                <li>無料相談・無料診断のご利用（この段階は概要のみで個別情報の開示は不要）</li>
                <li>診断結果とお見積りのご提示</li>
                <li>NDAの締結（電子契約での締結に対応）</li>
                <li>詳細ヒアリング → 本契約・着手</li>
              </ol>
              <h2>情報管理体制</h2>
              <p>ISMSに準拠した情報管理体制を運用しています。アクセス権限の最小化、ログ取得・監視、
              業務委託先への適切な監督などにより、お預かりした情報を厳格に保護します。</p>
            """
        else:
            inner = f"<h2>{name}</h2><p>{lead}</p>"

        body = f"""
        {page_header_block(slug.upper(), name, lead, 1)}
        <section class="section"><div class="container"><div class="prose">{inner}</div>{cta_trio(1)}</div></section>
        """
        write_page(d / "index.html", page_html(depth=1,
            title=f"{name}｜一般社団法人口コミ対策センター",
            description=lead, body=body, active=""))

def build_columns():
    base = ROOT / "column"
    base.mkdir(exist_ok=True)
    items = "".join(
        f'<a href="{slug}/" class="banner"><div class="banner__cover">{svg_placeholder(name,"navy",640,360)}</div>'
        f'<div class="banner__body"><div class="banner__title">{name}</div><div class="banner__sub">{lead}</div><div class="banner__cta">記事を読む</div></div></a>'
        for slug, name, lead in COLUMNS
    )
    body = f"""
    {page_header_block("COLUMN", "コラム・ノウハウ", "口コミ対策・風評対策の知見をまとめたコラム集。", 1)}
    <section class="section"><div class="container container--wide"><div class="banner-grid">{items}</div></div></section>
    """
    write_page(base / "index.html", page_html(depth=1,
        title="コラム｜口コミ対策・風評対策のノウハウ｜一般社団法人口コミ対策センター",
        description="口コミ対策・WEBレピュテーション対策に関する専門家コラム。事例、IT法務、自社でできる予防策まで。",
        body=body, active=""))

    for slug, name, lead in COLUMNS:
        d = base / slug
        body = f"""
        {page_header_block("COLUMN", name, lead, 2)}
        <section class="section"><div class="container"><div class="prose">
          {_prose_lead(lead)}

          <h2>背景と問題意識</h2>
          <p>本コラムでは、現場で繰り返し相談いただくテーマを取り上げ、表面的なテクニックではなく構造的な理解を共有することを目的としています。
          単発の手法紹介ではなく、「なぜそうなるのか」「どこから手を付けるべきか」を整理します。</p>

          <h2>論点の整理</h2>
          <p>このテーマには複数の論点が交差します。法務面（プロバイダ責任制限法、名誉毀損・侮辱罪、業務妨害）、
          技術面（検索アルゴリズム、プラットフォーム規約、削除フロー）、経営面（売上・採用・取引）の3つの視点で順に整理します。</p>

          <h2>実務での処方箋</h2>
          <p>具体的なアクションは、案件特性によって異なります。ただし共通する原則は「初動を急がず、客観的に状況を把握してから、優先順位を決めて動く」ということ。
          無料診断は、まさにこの「客観的把握」のためのサービスです。</p>

          <h2>関連サービス・お問い合わせ</h2>
          <p>具体的な対応をご検討の方は、<a href="../../contact/">無料相談</a>からお気軽にご連絡ください。
          ご相談だけのご利用、診断結果のみのご活用も可能です。</p>
        </div>{cta_trio(2)}</div></section>
        """
        write_page(d / "index.html", page_html(depth=2,
            title=f"{name}｜コラム｜一般社団法人口コミ対策センター",
            description=lead, body=body, active=""))

def build_notices():
    base = ROOT / "notice"
    base.mkdir(exist_ok=True)
    rows = "".join(
        f'<div class="news-item"><time>2026.06.20</time>'
        f'<span class="tag {("tag--alert" if tag=="注意喚起" else "tag--column" if tag=="コラム" else "")}">{tag}</span>'
        f'<a href="{slug}/">{name}</a></div>'
        for slug, name, lead, tag in NOTICES
    )
    body = f"""
    {page_header_block("NOTICE", "お知らせ・注意喚起", "当センターからのお知らせ、法改正情報、悪質業者への注意喚起、稼働状況。", 1)}
    <section class="section"><div class="container"><div class="news-list">{rows}</div></div></section>
    """
    write_page(base / "index.html", page_html(depth=1,
        title="お知らせ・注意喚起｜一般社団法人口コミ対策センター",
        description="当センターからのお知らせ、法改正情報、悪質業者への注意喚起、稼働状況をご案内します。",
        body=body, active=""))

    for slug, name, lead, tag in NOTICES:
        d = base / slug
        body = f"""
        {page_header_block("NOTICE", name, lead, 2)}
        <section class="section"><div class="container"><div class="prose">
          <p class="muted">分類：{tag}</p>
          {_prose_lead(lead)}

          <h2>本件の背景・要点</h2>
          <p>本件について、当センターが把握している事実関係と、ご相談者様にお伝えすべきポイントを整理しました。
          法改正や規約変更が絡む場合は、施行日・適用範囲・実務影響を可能な限り具体的に記載しています。</p>

          <h2>当センターの対応方針</h2>
          <p>本件に関する当センターの対応方針、お問い合わせ窓口、ご相談時にお伝えいただきたい情報をまとめています。</p>

          <h2>関連リンク</h2>
          <ul>
            <li><a href="../">お知らせ一覧</a></li>
            <li><a href="../../news/">最新ニュース</a></li>
            <li><a href="../../contact/">お問い合わせ</a></li>
          </ul>
        </div>{cta_trio(2)}</div></section>
        """
        write_page(d / "index.html", page_html(depth=2,
            title=f"{name}｜お知らせ｜一般社団法人口コミ対策センター",
            description=lead, body=body, active=""))

def build_cities():
    base = ROOT / "city"
    base.mkdir(exist_ok=True)
    grid = "".join(
        f'<a href="{slug}/" class="banner"><div class="banner__cover">{svg_placeholder(name,"navy",640,360)}</div>'
        f'<div class="banner__body"><div class="banner__title">{name}の口コミ対策</div><div class="banner__sub">{pref}内の主要都市</div><div class="banner__cta">対応内容を見る</div></div></a>'
        for slug, name, pref in CITIES
    )
    body = f"""
    {page_header_block("CITY", "主要都市別 口コミ対策", "首都圏・関西圏・中京圏など主要都市での対策事例とお問い合わせ窓口。", 1)}
    <section class="section"><div class="container container--wide"><div class="banner-grid">{grid}</div>{cta_trio(1)}</div></section>
    """
    write_page(base / "index.html", page_html(depth=1,
        title="主要都市別 口コミ対策｜一般社団法人口コミ対策センター",
        description="札幌・仙台・東京・横浜・名古屋・大阪・福岡など、全国主要都市の事業者向け口コミ対策・誹謗中傷対策。",
        body=body, active=""))

    for slug, name, pref in CITIES:
        d = base / slug
        body = f"""
        {page_header_block("CITY", f"{name}の口コミ対策・誹謗中傷対策", f"{pref}の中心都市{name}における事業者様向けの風評対策。", 2)}
        <section class="section"><div class="container"><div class="prose">
          <h2>{name}での口コミ対策のご相談</h2>
          <p>{name}は{pref}の経済圏の中核を担う都市であり、商業・医療・教育・サービス業など多様な業種が集積しています。
          そのぶん、口コミやレビューが集客と採用の双方に直結するエリアであり、ネガティブな書き込みの放置は短期間で売上に直撃します。</p>

          <h2>{name}で多いご相談</h2>
          <ul>
            <li>{name}内の店舗に対するGoogleマップ★1レビューの集中投稿</li>
            <li>{name}を商圏とする医療機関・歯科のサジェスト浄化</li>
            <li>地域系巨大掲示板での店名・社名スレッド対応</li>
            <li>採用活動に影響を及ぼす求人サイトの低評価</li>
          </ul>

          <h2>対応方法</h2>
          <p>{name}所在のお客様もオンラインで完結。対面ご希望の場合は<a href="../../contact/">面談予約</a>から。
          費用は完全成功報酬・初期費用0円です。</p>

          <h2>関連ページ</h2>
          <ul>
            <li><a href="../../area/">全国対応地域一覧</a></li>
            <li><a href="../../industry/">業種別の対策</a></li>
            <li><a href="../../platform/">媒体別の対策</a></li>
          </ul>
        </div>{cta_trio(2)}</div></section>
        """
        write_page(d / "index.html", page_html(depth=2,
            title=f"{name}の口コミ対策・誹謗中傷対策｜{pref}｜一般社団法人口コミ対策センター",
            description=f"{name}の事業者様向け、Googleマップ口コミ・誹謗中傷・風評被害対策。{pref}の地域特性を踏まえた対応。",
            body=body, active=""))

# ============================================================
# クロスページ：都道府県 × 業種 / 都道府県 × 媒体
# ============================================================
def build_cross_pages():
    for region_jp, region_en, pref_slug, pref_name in PREFECTURES:
        for ind_slug, ind_name, ind_sub in INDUSTRIES:
            d = ROOT / "area" / pref_slug / "industry" / ind_slug
            body = f"""
            {page_header_block("AREA × INDUSTRY", f"{pref_name}の{ind_name}向け 口コミ対策", f"{pref_name}内の{ind_name}事業者様（{ind_sub}）向け対策。", 4)}
            <section class="section"><div class="container"><div class="prose">
              <h2>{pref_name}と{ind_name}業界における口コミ対策のニーズ</h2>
              <p>
                {pref_name}は{region_jp}の主要エリアであり、{ind_name}業界においても多様な事業者様が活動されています（{ind_sub}など）。
                来店・予約・採用のいずれにおいても、検索結果と口コミの評価が経営に直結する{ind_name}業界では、
                ネット上の風評対策が業績維持の重要な要素となっています。
              </p>

              <h2>{pref_name}で多い{ind_name}関連の口コミ課題</h2>
              <ul>
                <li>{pref_name}内の{ind_name}店舗・事業所に対する事実無根のGoogleマップ★1レビュー</li>
                <li>競合や元従業員と思われる悪意ある投稿の集中</li>
                <li>業界特化レビューサイトでの低評価の固定化</li>
                <li>代表者・経営者個人名のサジェスト浄化のご依頼</li>
                <li>採用活動への影響（求人サイトの口コミによる応募率低下）</li>
              </ul>

              <h2>当センターの対応方針</h2>
              <p>
                {ind_name}業界特有の規制（業界ガイドラインや関連法令）に抵触しない範囲で、正攻法による対策のみを実行します。
                違法・グレーな手法は採用しないため、ご依頼後の規制リスクは発生しません。
                {pref_name}所在のお客様もすべてオンラインで完結対応します。
              </p>

              <h2>料金・お問い合わせ</h2>
              <p>
                {pref_name}内の{ind_name}事業者様にも、標準料金体系（初期費用・着手金0円／完全成功報酬制）を適用します。
                結果が出るまでご請求は発生しません。まずは無料診断にてご相談ください。
              </p>

              <h2>関連ページ</h2>
              <ul>
                <li><a href="../../">{pref_name}の口コミ対策トップ</a></li>
                <li><a href="../../../../industry/{ind_slug}/">{ind_name}業界の対策（全国）</a></li>
                <li><a href="../../../../industry/">業種別 一覧</a></li>
                <li><a href="../../../../area/">対応地域 一覧</a></li>
              </ul>
            </div>{cta_trio(4)}</div></section>
            """
            write_page(d / "index.html", page_html(depth=4,
                title=f"{pref_name}の{ind_name}向け 口コミ対策｜一般社団法人口コミ対策センター",
                description=f"{pref_name}の{ind_name}事業者様向け、Googleマップ口コミ・誹謗中傷・風評被害対策。{ind_sub}の業界特性を踏まえた対応。",
                body=body, active=""))

        for plat_slug, plat_name, plat_sub in PLATFORMS:
            d = ROOT / "area" / pref_slug / "platform" / plat_slug
            body = f"""
            {page_header_block("AREA × PLATFORM", f"{pref_name}の{plat_name}", f"{pref_name}内の事業者様向け、{plat_name}（{plat_sub}）への対策。", 4)}
            <section class="section"><div class="container"><div class="prose">
              <h2>{pref_name}における{plat_name}の状況</h2>
              <p>
                {pref_name}内の事業者様から、{plat_name}に関するご相談を多数お預かりしています。
                {plat_sub}という媒体特性により、自力での申請では削除が認められないケースが多発しており、
                規約と過去事例を理解した専門ロジックでの対応が求められます。
              </p>

              <h2>{pref_name}で多い{plat_name}の課題</h2>
              <ul>
                <li>事実無根の名指し誹謗中傷投稿が{pref_name}内の店舗・事業所に集中</li>
                <li>自力での通報が「違反なし」と自動却下される</li>
                <li>削除されても再投稿される（いたちごっこ）</li>
                <li>投稿者が匿名のため法的措置の費用対効果が見合わない</li>
                <li>放置するほど検索エンジン側で固定化し、二次被害が拡大</li>
              </ul>

              <h2>当センターの対応方針</h2>
              <p>
                {plat_name}の規約に準拠した正当な報告ロジックを構築し、必要に応じて経路の組み合わせや再申請まで対応します。
                違法・グレーな手法は一切採用しません。アカウントリスクを発生させずに対応します。
                {pref_name}内のお客様もオンラインで完結対応します。
              </p>

              <h2>料金・お問い合わせ</h2>
              <p>
                完全成功報酬制・初期費用0円。結果が出るまでご請求は発生しません。
                まずは対象URLとともに、無料診断をご活用ください。
              </p>

              <h2>関連ページ</h2>
              <ul>
                <li><a href="../../">{pref_name}の口コミ対策トップ</a></li>
                <li><a href="../../../../platform/{plat_slug}/">{plat_name}（全国）</a></li>
                <li><a href="../../../../platform/">媒体別 一覧</a></li>
                <li><a href="../../../../area/">対応地域 一覧</a></li>
              </ul>
            </div>{cta_trio(4)}</div></section>
            """
            write_page(d / "index.html", page_html(depth=4,
                title=f"{pref_name}の{plat_name}｜地域×媒体｜一般社団法人口コミ対策センター",
                description=f"{pref_name}の事業者様向け、{plat_name}における風評・誹謗中傷対策。{plat_sub}という媒体特性を踏まえた専門対応。",
                body=body, active=""))

# ============================================================
# サイトマップ拡張
# ============================================================
def build_sitemap_extended():
    pref_links = "".join(f'<li><a href="../area/{s}/">{n}</a></li>' for _,_,s,n in PREFECTURES)
    overseas_links = "".join(f'<li><a href="../overseas/{s}/">{n}</a></li>' for _,s,n in OVERSEAS)
    industry_links = "".join(f'<li><a href="../industry/{s}/">{n}</a></li>' for s,n,_ in INDUSTRIES)
    platform_links = "".join(f'<li><a href="../platform/{s}/">{n}</a></li>' for s,n,_ in PLATFORMS)
    knowledge_links = "".join(f'<li><a href="../knowledge/{s}/">{n}</a></li>' for s,n,_ in KNOWLEDGE)
    process_links = "".join(f'<li><a href="../process/{s}/">{n}</a></li>' for s,n,_ in PROCESS_STEPS)
    method_links = "".join(f'<li><a href="../method/{s}/">{n}</a></li>' for s,n,_ in EXTRA_METHODS)
    column_links = "".join(f'<li><a href="../column/{s}/">{n}</a></li>' for s,n,_ in COLUMNS)
    notice_links = "".join(f'<li><a href="../notice/{s}/">{n}</a></li>' for s,n,_,_ in NOTICES)
    city_links = "".join(f'<li><a href="../city/{s}/">{n}</a></li>' for s,n,_ in CITIES)

    body = f"""
    {page_header_block("SITEMAP", "サイトマップ", "全ページの一覧。", 1)}
    <section class="section"><div class="container container--wide">
      <div class="mega-footer__grid">
        <div><h4>主要ページ</h4><ul>
          <li><a href="../">トップ</a></li><li><a href="../about/">当センターについて</a></li>
          <li><a href="../service/">サービス内容</a></li><li><a href="../process/">解決プロセス</a></li>
          <li><a href="../strengths/">当センターの強み</a></li><li><a href="../cases/">成功事例</a></li>
          <li><a href="../faq/">FAQ</a></li><li><a href="../pricing/">料金</a></li>
          <li><a href="../message/">代表挨拶</a></li><li><a href="../news/">お知らせ</a></li>
          <li><a href="../recruit/">採用情報</a></li><li><a href="../contact/">お問い合わせ</a></li>
          <li><a href="../access/">アクセス</a></li><li><a href="../trademark/">登録商標</a></li>
          <li><a href="../difficulty/">対策難易度</a></li><li><a href="../nda/">NDAについて</a></li>
        </ul></div>
        <div><h4>基礎知識（KNOWLEDGE）</h4><ul>{knowledge_links}</ul></div>
        <div><h4>解決プロセス（PROCESS）</h4><ul>{process_links}</ul></div>
        <div><h4>対策手法（METHOD）</h4><ul>{method_links}</ul></div>
        <div><h4>コラム</h4><ul>{column_links}</ul></div>
        <div><h4>お知らせ・注意喚起</h4><ul>{notice_links}</ul></div>
        <div><h4>業種別</h4><ul>{industry_links}</ul></div>
        <div><h4>媒体別</h4><ul>{platform_links}</ul></div>
        <div><h4>主要都市</h4><ul>{city_links}</ul></div>
        <div><h4>海外対応</h4><ul>{overseas_links}</ul></div>
        <div><h4>都道府県</h4><ul>{pref_links}</ul></div>
        <div><h4>クロスページ</h4><ul>
          <li><a href="../area/tokyo/industry/medical/">東京×医療（例）</a></li>
          <li><a href="../area/osaka/platform/google-maps/">大阪×Googleマップ（例）</a></li>
          <li class="muted">※都道府県×業種＝47×{len(INDUSTRIES)}、都道府県×媒体＝47×{len(PLATFORMS)}ページ生成済み</li>
        </ul></div>
      </div>
    </div></section>
    """
    write_page(ROOT / "sitemap" / "index.html", page_html(depth=1,
        title="サイトマップ｜一般社団法人口コミ対策センター",
        description="一般社団法人口コミ対策センターのサイトマップ。全ページの一覧。",
        body=body, active=""))

# ============================================================
# 実行
# ============================================================
if __name__ == "__main__":
    build_top()
    build_prefecture_pages()
    build_overseas_pages()
    build_industry_pages()
    build_platform_pages()
    build_other_pages()
    build_knowledge_pages()
    build_process_sub_pages()
    build_extra_methods()
    build_misc_pages()
    build_columns()
    build_notices()
    build_cities()
    build_cross_pages()
    build_sitemap_extended()
    cnt = sum(1 for _ in ROOT.rglob("index.html"))
    print(f"Generated. index.html count: {cnt}")
