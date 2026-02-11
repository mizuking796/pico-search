# Cloudflare Worker デプロイ手順

Gemini API はブラウザからの直接呼び出しで CORS エラーになる場合があります。
その場合は以下の手順で CORS プロキシをデプロイしてください。

## 前提

- Cloudflare アカウント（無料）
- Node.js 18+

## 手順

### 1. Wrangler インストール

```bash
npm install -g wrangler
wrangler login
```

### 2. プロジェクト作成

```bash
cd worker
wrangler init pico-proxy --type javascript
# wrangler.toml が生成される
```

### 3. worker.js を配置

`worker.js` を `src/index.js`（または wrangler.toml の main で指定されたパス）にコピー。

### 4. デプロイ

```bash
wrangler deploy
```

デプロイ完了後、`https://pico-proxy.<your-subdomain>.workers.dev` のような URL が表示されます。

### 5. アプリに設定

PICO Search の設定画面 → プロキシURL に上記 URL を入力して保存。

## 無料枠

- 10万リクエスト/日
- 個人利用には十分

## セキュリティ

- Worker はリクエストをそのまま転送するだけ
- API キーは Worker を通過するが保存しない
- 必要に応じて `Access-Control-Allow-Origin` を自分のドメインに制限可能
