# PICO Search - リファレンス

## 概要
臨床疑問を日本語で入力→PICO/PECOフレームワークに分解→PubMed検索→論文要約を行うツール。
医学教育を十分に積んでいないリハ職・看護師・医学生等が対象。
開発者: 特定非営利活動法人リハビリコラボレーション

## URL
- GitHub Pages: `https://mizuking796.github.io/pico-search/`（限定公開、noindex+robots.txt）
- リポジトリ: `mizuking796/pico-search`
- コーポレートサイト: `mizuking796/reha-collab`（プロダクト一覧にPICO Search掲載）

## アーキテクチャ
```
GitHub Pages（静的サイト）
  ├─ PubMed E-utilities → ブラウザから直接呼び出し（CORS対応済み・無料）
  └─ Gemini API → 直接呼び出し or Cloudflare Worker経由（CORSプロキシ）
```

## 完全BYOK
- ユーザーが自分のGemini APIキーを持ち込む
- APIキーはlocalStorageに保存（サーバー送信なし）
- 運営者コストゼロ

## ファイル構成
```
pico-search/
├── index.html           # エントリポイント
├── css/style.css        # 外部CSS
├── js/app.js            # 全アプリケーションロジック（IIFE）
├── js/trivia.js         # 医学豆知識600個（プログレス表示用）
├── img/
│   ├── guide-welcome.png    # セットアップガイド: Welcome to AI Studio画面
│   ├── guide-create-btn.png # セットアップガイド: APIキーを作成ボタン
│   ├── guide-key-list.png   # セットアップガイド: キー一覧画面
│   └── guide-key-detail.png # セットアップガイド: APIキーの詳細画面（墨消し済み）
├── worker/
│   ├── worker.js        # Cloudflare Worker CORSプロキシ（オプション）
│   └── README.md        # デプロイ手順
├── robots.txt           # Disallow: /
└── REFERENCE.md         # このファイル
```

## 画面フロー
1. **利用規約同意**（初回のみ）→ 7条の利用規約、チェック+「同意して始める」で先へ
2. **APIキー設定**（初回のみ）→ Google AI Studioスクリーンショット付きステップガイド
3. **質問入力** → テキストエリア + 例文チップ5個
4. **PICO/PECO編集** → 分解結果の編集、MeSHタグ、検索クエリプレビュー+再生成ボタン
5. **検索結果** → 論文カード（番号/ジャーナルバッジ/研究タイプ）+ 個別要約 + 横断的要約（ポイントまとめ+引用付き）
6. **設定**（ヘッダー⚙から常時アクセス可）→ APIキー更新/削除、検索フィルタ、プロキシURL、利用規約再閲覧（同意日表示）

## 利用規約（7条）
1. サービスの概要
2. AI（LLM）の利用について — ハルシネーション耐性設計の説明+ゼロではない旨
3. 免責事項 — 損害の免責、医学的助言ではない
4. APIキー・個人情報の取り扱い — ローカル保存のみ、サーバー送信なし
5. 知的財産権 — PubMed E-utilities APIの公式性とNCBI利用規約準拠
6. サービスの変更・停止
7. 開発者情報 — 特定非営利活動法人リハビリコラボレーション

同意日時を `pico_consent` に保存。設定画面から利用規約を再閲覧可能。

## 技術スタック
- **フロントエンド**: Vanilla JS（IIFE）、外部依存なし
- **Gemini API**: gemini-2.5-flash、JSON Schema付き構造化出力
- **PubMed**: ESearch→ESummary+EFetch並列（XML→DOMParser）、tool/emailパラメータ付き
- **CSS**: teal #2B8A7E、Hiragino書体、max-width 600px

## API仕様

### Gemini（PICO分解・要約）
- エンドポイント: `generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- 構造化出力: type, p, i_or_e, c, o, mesh_terms, search_query
- 横断要約プロンプトに`[N]`形式の引用指示を含む

### PubMed
- ESearch: `eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` → PMID取得
- ESummary: メタデータ取得（タイトル/著者/ジャーナル/年）
- EFetch: アブストラクトXML取得 → DOMParserでパース
- **ESummary+EFetchはPromise.allで並列実行**（検索結果表示時にabstract取得済み）
- 全リクエストに `tool=pico-search&email=pico-search@example.com` 付与（NCBI規約準拠）
- **検索フィルタ**: `buildFilterTerms()` でユーザー設定をクエリにAND結合

## UX機能

### 検索クエリ生成
- プロンプトでPubMed検索式の構造ルールを明示指示:
  - PICO要素ごとに括弧()でグループ化、AND結合
  - MeSH用語に`[MeSH]`タグ必須
  - フリーテキストに`[tiab]`タグ + 同義語展開
  - 長短両方のフレーズを含める（例: "residential care facility" + "residential care"）— tiabは完全フレーズ一致のため短い部分フレーズも必須
  - Cが「なし」の場合はCグループ省略
  - 具体的な検索式の例をプロンプトに含む
- **クエリ再生成ボタン**: PICO編集後に「PICO/PECOからクエリを再生成」で検索式だけ再構築（Gemini 1回消費）

### 検索フィルタ（設定画面）
PubMed検索時にユーザークエリにAND結合で自動付与。`pico_filters` に永続化。

| フィルタ | 選択肢 | PubMedクエリ |
|---------|--------|-------------|
| 発表時期 | 指定なし / 直近5年 / 直近10年 | `"2021"[PDAT]:"3000"[PDAT]` |
| 言語 | 指定なし / 英語のみ / 英語＋日本語 | `english[la]` / `(english[la] OR japanese[la])` |
| 研究タイプ | 指定なし / RCT・メタ分析のみ / レビュー含む | `"Randomized Controlled Trial"[pt]` 等 |
| 対象 | 指定なし / ヒトのみ | `"Humans"[MeSH]` |

### プログレスオーバーレイ
- 各操作（PICO分析/PubMed検索/全体要約/クエリ再生成）に2ステップ進捗表示
- プログレスバー（0→100%）+ パーセント数値
- 医学豆知識600個を5秒ごとにフェード切替（15カテゴリ: PubMed/EBM/医学史/解剖/リハビリ/疫学/薬学/ノーベル賞/統計/脳神経/整形/内科/栄養/医療制度/テクノロジー）

### 論文カード強化
- **論文番号**: `[1]` `[2]` 表示（横断要約の引用番号と対応）
- **ジャーナルバッジ**: NEJM/Lancet(+5サブジャーナル)/JAMA/Cochrane等21誌を金色pillで表示
- **研究タイプ自動検出**: タイトルからメタ分析/RCT/コホート等を判定し青バッジ表示

### 横断要約（ポイントまとめ + 引用）
- **冒頭5行ポイントまとめ**: プロンプトで `===ポイント===` / `===本文===` セクション分離を指示し、冒頭にteal左ボーダー付きカードで要点5行を表示
- マーカー未検出時はフォールバックで全文表示（壊れない）
- プロンプトで `[1][2]` 形式の引用を指示
- `[N]` をPubMedリンク付き `<a class="cite-ref">` に自動変換（ポイント・本文両方対応）
- ホバーで論文タイトル表示（title属性）

### API残りクォータ表示
- ヘッダー右に「本日の残りAPIリクエスト回数 N」バッジをリアルタイム表示
- localStorage (`pico_usage`) で日別使用回数をトラッキング
- 太平洋時間0時（日本時間17時）で自動リセット
- `callGemini()` 成功時に自動カウント
- Gemini APIレスポンスヘッダーからレート制限情報を読み取り同期（CORS公開時）
- 429エラー時に残り0を即時反映
- 残り20回以下で赤色警告表示

### セットアップガイドのスクリーンショット
- Step 2（利用規約同意）: Welcome to AI Studio画面
- Step 3（APIキーコピー）: キー一覧/作成ボタン/キー詳細の3枚
- APIキー・プロジェクト番号は墨消し済み

## 設定画面の構成（並び順）
1. **Gemini APIキー** — 更新/削除
2. **検索フィルタ** — 発表時期/言語/研究タイプ/対象
3. **プロキシURL** — Cloudflare Worker（オプション）
4. **利用規約** — 同意日表示/利用規約再閲覧

## セキュリティ対策
- `escapeHtml()`: innerHTML用（`<>&`エスケープ、null/undefinedガード付き）、文字列replace方式
- `escapeAttr()`: HTML属性用（`<>&"'`エスケープ、XSS防止）
- **CSP（Content Security Policy）**: index.htmlにmetaタグで設定。script-src/connect-srcを制限
- Gemini応答の安全なプロパティアクセス（各階層でnullチェック）
- PubMed API全3エンドポイントで `r.ok` チェック
- ボタン連打防止（分析/検索/全体要約/クエリ再生成を処理中disabled化）
- **AbortController**: 画面遷移時に進行中のAPIリクエストをキャンセル（stale応答防止）
- Toast通知に `role="alert"`（アクセシビリティ）
- TRIVIA未定義時のフォールバック
- **Worker CORS制限**: `mizuking796.github.io` + localhost のみ許可（`*`廃止）
- **Worker HTTPメソッド制限**: GET/POST/OPTIONS以外は405拒否
- **Workerレート制限ヘッダー透過**: `x-ratelimit-remaining-requests`等をCORS Exposeして通過

## localStorage キー
- `pico_api_key`: Gemini APIキー
- `pico_worker_url`: Cloudflare Worker URL（オプション）
- `pico_usage`: `{"date":"YYYY-MM-DD","count":N}` — API使用回数（PT日付でリセット）
- `pico_consent`: ISO 8601日時 — 利用規約同意日時
- `pico_filters`: `{"dateRange":"","lang":"","studyType":"","species":""}` — 検索フィルタ設定

## Gemini無料枠の目安（1日250回リセット）

```
操作                      消費   残り
─────────────────────────────────
（開始）                    -    250
PICO分析                   1    249   ← 毎回必ず消費
クエリ再生成               1    248   ← PICO編集後に押した場合
PubMed検索                 0    248   ← Gemini不使用
全体を要約する              1    247   ← 押した場合のみ
個別要約 ×1本              1    246   ← 1本ごとに1消費
個別要約 ×5本              5    241
個別要約 ×10本            10    236
─────────────────────────────────
```

**1テーマあたりの消費パターン:**
| やること | 消費 | 1日何テーマ |
|---------|-----|-----------|
| PICO分析だけ | 1 | 250テーマ |
| PICO → 全体要約 | 2 | 125テーマ |
| PICO → クエリ再生成 → 全体要約 | 3 | 83テーマ |
| PICO → 全体要約 → 個別5本 | 7 | 35テーマ |
| PICO → 全体要約 → 個別10本 | 12 | 20テーマ |
| PICO → 全体要約 → 全20本 | 22 | 11テーマ |

※ gemini-2.5-flash無料枠。太平洋時間0時リセット（日本時間17時）

## 内部設計メモ

### ナビゲーション
- `navStack`（配列）で画面遷移履歴を管理。`goBack(fallback)`でpop。
- 画面遷移時に`abortActiveRequest()`で進行中のGemini APIリクエストをキャンセル。

### プロンプトテンプレート
- 検索クエリ形式ルール（5項目+例）は `QUERY_FORMAT_RULES` 定数に一元化。
- `analyzePico()` と `regenerateQuery()` が共有参照。

### Worker設計
- CORS: オリジン制限（`ALLOWED_ORIGIN` 定数）。localhost開発も許可。
- レスポンスボディはストリーミングパススルー（`res.body`直接転送）。
- レート制限ヘッダーを`Access-Control-Expose-Headers`で公開。

## 2026-02-12 包括レビュー修正ログ
| ID | 種別 | 修正内容 |
|----|------|---------|
| BUG-1 | バグ | `showToast`再生成成功時のタイプを`'success'`に修正 |
| BUG-2 | バグ | `prevScreen`(1段)→`navStack`(配列)+`goBack()`で戻る連鎖修正 |
| BUG-3 | バグ | Workerがレート制限ヘッダーを透過するよう修正 |
| BUG-4 | バグ | `escapeHtml(null/undefined)`→空文字列を返すよう修正 |
| BUG-5 | バグ | `summarizeAll`成功後にボタン再有効化 |
| SEC-1 | セキュリティ | Worker HTTPメソッド制限（GET/POST/OPTIONSのみ） |
| SEC-3 | セキュリティ | Worker CORS `*`→オリジン制限 |
| SEC-4 | セキュリティ | CSP metaタグ追加（index.html） |
| PERF-1 | 高速化 | `getResetDate()`呼び出しを1回にキャッシュ |
| PERF-2 | 高速化 | `escapeHtml` DOM生成→文字列replace方式 |
| PERF-3 | 高速化 | `summarizeAll` PMID検索をO(n)Map化 |
| PERF-4 | 高速化 | `AbortController`で画面遷移時リクエストキャンセル |
| PERF-5 | 保守性 | 検索クエリ形式ルールの重複プロンプトを定数化 |
| PERF-6 | 高速化 | Workerレスポンスをストリーミングパススルー |

## 更新時の注意
- **更新時はgit pushまで実施すること**
- gan-rehaとは完全に独立したプロジェクト
