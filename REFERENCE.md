# PICO Search - リファレンス

## 概要
臨床疑問を日本語で入力→PICO/PECOフレームワークに分解→PubMed検索→論文要約を行うツール。
医学教育を十分に積んでいないリハ職・看護師・医学生等が対象。

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
├── worker/
│   ├── worker.js        # Cloudflare Worker CORSプロキシ（オプション）
│   └── README.md        # デプロイ手順
├── robots.txt           # Disallow: /
└── REFERENCE.md         # このファイル
```

## 画面フロー
1. **APIキー設定**（初回のみ）→ Google AI Studioリンク付きステップガイド
2. **質問入力** → テキストエリア + 例文チップ5個
3. **PICO/PECO編集** → 分解結果の編集、MeSHタグ、検索クエリプレビュー
4. **検索結果** → 論文カード（番号/ジャーナルバッジ/研究タイプ）+ 個別要約 + 横断的要約（引用付き）
5. **設定**（ヘッダー⚙から常時アクセス可）→ APIキー更新（バリデーション付き）/削除、プロキシURL

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

## Gemini無料枠の目安
- gemini-2.5-flash: 1日250リクエスト（10 RPM / 250K TPM）
- 最小フロー（PICO分析+全体要約）: Gemini 2回 → **1日125回**
- フル利用（+個別要約5本）: Gemini 7回 → **1日35回**

## 更新時の注意
- **更新時はgit pushまで実施すること**
- gan-rehaとは完全に独立したプロジェクト
