# バックエンドサーバーガイド

このガイドは、はじめて MultiMediaWorker のバックエンドを触る方向けに、セットアップの基本手順とカスタマイズ時のポイントをまとめたものです。Express ベースの API サーバーと OpenAI を利用したメディアエージェントの構成を理解し、用途に合わせて調整できるようにすることを目指しています。

---

## 1. 何が動くのか

- `backend/src/server.js` がエントリポイントです。  
  - `.env.local` を読み込み、OpenAI クライアントと CLI ツールを組み合わせた `MediaAgent` を生成。  
  - `MediaAgentServer`（Express アプリ）を起動し、`/api/...` のエンドポイントを公開します。
- エージェントは **OpenAI Responses API** を使って実行用コマンドを計画し、`ffmpeg` / `magick` / `exiftool` などの CLI を実行して結果を返します。

---

## 2. 利用前の準備

1. **Node.js 18 以上** をインストールします。  
2. **CLI ツール** をローカルに用意し、`PATH` で呼び出せるようにしておきます。  
   - 必須: `ffmpeg`, `magick` (ImageMagick), `exiftool`  
3. **環境変数ファイル** を作成します。
   ```bash
   cp .env.example .env.local
   ```
   `.env.local` に OpenAI API キーなどを設定します。

---

## 3. 初回セットアップと起動手順

1. 依存パッケージをインストールします。
   ```bash
   npm install
   ```
2. バックエンドサーバーを起動します。
   ```bash
   npm run dev:server
   ```
3. サーバーはデフォルトで `http://localhost:3001` で待ち受けます。ログに「Agent server listening...」が表示されれば成功です。
4. Web UI も併用する場合は、別ターミナルでフロントエンドを起動します。
   ```bash
   npm run dev:client
   ```
5. 動作確認: ブラウザで `http://localhost:5173` を開き、タスクを送信してみてください。CLI が実行できない環境でも、`Dry run` を有効にすれば計画のみ確認できます。

---

## 4. API の使い方

| メソッド | パス | 説明 |
| --- | --- | --- |
| `GET` | `/api/tools` | 利用可能な CLI コマンド一覧を取得 |
| `POST` | `/api/tasks` | タスクと入力ファイルを送信してコマンド実行を依頼 |

`POST /api/tasks` は `multipart/form-data` 形式です。最低限、`task` フィールドにやりたいことを記述し、必要に応じて `files` を添付します。クエリパラメータで `dryRun=true` や `debug=verbose` などを指定すると振る舞いを変更できます。

応答例や詳細な JSON 構造は `README.md` と `backend/docs/execution-overview.md` に記載しています。

---

## 5. よく使う開発コマンド

- `npm test`  
  バックエンドのユニットテスト（プランナー周り）を実行します。
- `npm run dev:server` / `npm run dev:client`  
  開発用のサーバー・フロントエンドをそれぞれ起動します。
- `npm run build:client`  
  フロントエンドの本番ビルドを生成します。

---

## 6. カスタマイズ方法

### 6.1 CLI ツールの追加・変更

1. `backend/src/agent/config/constants.js` の `DEFAULT_TOOL_DEFINITIONS` に新しいツールを追加します。
2. 追加したコマンドが実際に実行できるよう、サーバーマシンに CLI をインストールし `PATH` に登録します。
3. 必要であれば、フロントエンド側（`App.jsx`）の説明文や UI を更新します。

### 6.2 OpenAI のモデルやプロンプトを調整する

- `.env.local` の `OPENAI_MODEL` を変更すると、サーバー起動時に使うモデルが切り替わります。
- より詳細なプロンプト制御を行いたい場合は `backend/src/agent/planning/PromptBuilder.js` や `PlanValidator.js` を編集します。JSdoc を参考にすると安全に変更できます。

### 6.3 実行タイムアウトや出力先ディレクトリを変える

- タイムアウトなどの実行オプションは `createMediaAgent` 呼び出し時に指定できます（`backend/src/server.js` を参照）。例:
  ```js
  const agent = createMediaAgent(openAIClient, {
    toolRegistry,
    executorOptions: { timeoutMs: 10 * 60 * 1000 } // 10 分に延長
  });
  ```
- 出力先ディレクトリを変更したい場合は `server.js` 内の `PUBLIC_ROOT` や `GENERATED_ROOT` の計算を編集します。  
  UI からダウンロードできるようにしたい場合は、合わせて `public/` 以下の構成も調整してください。

### 6.4 エンドポイントを増やす

- `MediaAgentServer` (`backend/src/server/MediaAgentServer.js`) に新しいルートを追加できます。`configureRoutes` メソッドを参考に、`this.app.get(...)` などを追記してください。
- セキュリティや認可を導入したい場合は Express のミドルウェア（`configureMiddleware`）に処理を差し込むと管理しやすくなります。

---

## 7. トラブルシューティング

| 症状 | 対応策 |
| --- | --- |
| `ffmpeg` が見つからない | CLI をインストールし、コマンドラインから直接 `ffmpeg -version` が実行できることを確認してください。 |
| `OPENAI_API_KEY` が設定されていないと警告 | `.env.local` にキーを記述し、サーバーを再起動します。 |
| Plan 生成で失敗する | `debug` オプションをオンにして `responseText` や `rawPlan` を確認。`PlanValidator` に引っかかった場合はエラーメッセージを参照し、prompt か tool 定義を調整します。 |
| 実行がタイムアウトする | `executorOptions.timeoutMs` を延長、またはコマンドが長時間かからないよう引数を調整します。 |

---

## 8. 参考ドキュメント

- `backend/docs/execution-overview.md` … バックエンド内部のフェーズ構造を時系列で確認できます。  
- `frontend/docs/ui-execution-overview.md` … UI からの呼び出しフローを追いたいときに参照してください。  
- `README.md` … プロジェクト全体のセットアップや利用コマンドを一覧しています。

このガイドを出発点に、必要な箇所のソースコードへ飛びながら自分の用途に合わせてカスタマイズしてみてください。
