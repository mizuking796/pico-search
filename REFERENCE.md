# PICO Search - リファレンス

## 概要
臨床疑問を日本語で入力→PICO/PECOフレームワークに分解→PubMed検索→論文要約を行うツール。
医学教育を十分に積んでいないリハ職・看護師・医学生等が対象。
開発者: 特定非営利活動法人リハビリコラボレーション

## URL
- GitHub Pages: `https://mizuking796.github.io/pico-search/`（限定公開、noindex+robots.txt）
- リポジトリ: `mizuking796/pico-search`

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
4. **PICO/PECO編集** → 分解結果の編集、MeSHタグ、検索クエリプレビュー
5. **検索結果** → 論文カード（番号/ジャーナルバッジ/研究タイプ）+ 個別要約 + 横断的要約（引用付き）
6. **設定**（ヘッダー⚙から常時アクセス可）→ APIキー更新/削除、プロキシURL、利用規約再閲覧（同意日表示）

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

## UX機能

### プログレスオーバーレイ
- 各操作（PICO分析/PubMed検索/全体要約）に2ステップ進捗表示
- プログレスバー（0→100%）+ パーセント数値
- 医学豆知識600個を5秒ごとにフェード切替（15カテゴリ: PubMed/EBM/医学史/解剖/リハビリ/疫学/薬学/ノーベル賞/統計/脳神経/整形/内科/栄養/医療制度/テクノロジー）

### 論文カード強化
- **論文番号**: `[1]` `[2]` 表示（横断要約の引用番号と対応）
- **ジャーナルバッジ**: NEJM/Lancet/JAMA/Cochrane等16誌を金色pillで表示
- **研究タイプ自動検出**: タイトルからメタ分析/RCT/コホート等を判定し青バッジ表示

### 横断要約の引用
- プロンプトで `[1][2]` 形式の引用を指示
- `[N]` をPubMedリンク付き `<a class="cite-ref">` に自動変換
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

## セキュリティ対策
- `escapeHtml()`: innerHTML用（`<>&`エスケープ）
- `escapeAttr()`: HTML属性用（`<>&"'`エスケープ、XSS防止）
- Gemini応答の安全なプロパティアクセス（各階層でnullチェック）
- PubMed API全3エンドポイントで `r.ok` チェック
- ボタン連打防止（分析/検索/全体要約を処理中disabled化）
- Toast通知に `role="alert"`（アクセシビリティ）
- TRIVIA未定義時のフォールバック

## localStorage キー
- `pico_api_key`: Gemini APIキー
- `pico_worker_url`: Cloudflare Worker URL（オプション）
- `pico_usage`: `{"date":"YYYY-MM-DD","count":N}` — API使用回数（PT日付でリセット）
- `pico_consent`: ISO 8601日時 — 利用規約同意日時

## Gemini無料枠の目安（1日250回リセット）

```
操作                      消費   残り
─────────────────────────────────
（開始）                    -    250
PICO分析                   1    249   ← 毎回必ず消費
PubMed検索                 0    249   ← Gemini不使用
全体を要約する              1    248   ← 押した場合のみ
個別要約 ×1本              1    247   ← 1本ごとに1消費
個別要約 ×5本              5    242
個別要約 ×10本            10    237
─────────────────────────────────
```

**1テーマあたりの消費パターン:**
| やること | 消費 | 1日何テーマ |
|---------|-----|-----------|
| PICO分析だけ | 1 | 250テーマ |
| PICO → 全体要約 | 2 | 125テーマ |
| PICO → 全体要約 → 個別5本 | 7 | 35テーマ |
| PICO → 全体要約 → 個別10本 | 12 | 20テーマ |
| PICO → 全体要約 → 全20本 | 22 | 11テーマ |

※ gemini-2.5-flash無料枠。太平洋時間0時リセット（日本時間17時）

## 更新時の注意
- **更新時はgit pushまで実施すること**
- gan-rehaとは完全に独立したプロジェクト
