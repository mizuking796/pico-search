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
├── worker/
│   ├── worker.js        # Cloudflare Worker CORSプロキシ（オプション）
│   └── README.md        # デプロイ手順
├── robots.txt           # Disallow: /
└── REFERENCE.md         # このファイル
```

## 画面フロー
1. **APIキー設定**（初回のみ）→ Google AI Studioリンク付き3ステップガイド
2. **質問入力** → テキストエリア + 例文チップ5個
3. **PICO/PECO編集** → 分解結果の編集、MeSHタグ、検索クエリプレビュー
4. **検索結果** → 論文カード + 個別要約 + 横断的要約
5. **設定**（ヘッダー⚙から常時アクセス可）→ APIキー更新/削除、プロキシURL

## 技術スタック
- **フロントエンド**: Vanilla JS（IIFE）、外部依存なし
- **Gemini API**: gemini-2.0-flash、JSON Schema付き構造化出力
- **PubMed**: ESearch→ESummary→EFetch（XML→DOMParser）
- **CSS**: teal #2B8A7E、Hiragino書体、max-width 600px

## API仕様

### Gemini（PICO分解）
- エンドポイント: `generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
- 構造化出力: type, p, i_or_e, c, o, mesh_terms, search_query

### PubMed
- ESearch: `eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` → PMID取得
- ESummary: メタデータ取得（タイトル/著者/ジャーナル/年）
- EFetch: アブストラクトXML取得 → DOMParserでパース

## localStorage キー
- `pico_api_key`: Gemini APIキー
- `pico_worker_url`: Cloudflare Worker URL（オプション）

## 更新時の注意
- **更新時はgit pushまで実施すること**
- gan-rehaとは完全に独立したプロジェクト
