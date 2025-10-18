# MultiMediaWorker

自然言語のリクエストを具体的なCLI操作に変換する、AI支援メディアコマンドランナーです。エージェントが`ffmpeg`、`magick`（ImageMagick）、`exiftool`から選択し、サーバー上でコマンドを実行し、生成されたアーティファクトをWeb UIを通じて公開します。

## 機能

- オプションのファイル添付が可能な自然言語タスク送信
- 検証済みのコマンドプランと期待される出力を返す、OpenAI駆動のプランナー
- タイムアウト処理と出力検査を備えたコマンド実行サンドボックス
- コマンド結果の監視と生成ファイルのダウンロードのための、Vite + Reactフロントエンド
- 拡張可能なツールカタログ（将来的にUIを変更せずにサーバー側でツールを追加可能）

## 前提条件

- Node.js 18以降
- 使用予定のCLIツール（例：`ffmpeg`、`magick`、`exiftool`）がインストールされ、`PATH`で利用可能であること
- `.env.local`にOpenAI APIキーを設定（`.env.example`を参照）

## セットアップ

```bash
npm install
```

`.env.local`を作成（`.env.example`をコピー）し、`OPENAI_API_KEY`を設定します。オプションの上書き設定：

```
OPENAI_MODEL=gpt-4o-mini
PORT=3001
```

## 開発ワークフロー

エージェントバックエンドを実行：

```bash
npm run dev:server
```

次に、別のターミナルでVite開発サーバーを起動：

```bash
npm run dev
```

Web UIは http://localhost:5173 で利用可能です（ポート3001のバックエンドにプロキシされます）。

## テストとビルド

```bash
# エージェントユーティリティのユニットテスト
npm test

# Webクライアントのプロダクションビルド
npm run build
```

## プロジェクト構造

```
OpenaiAgent.js       # コアエージェントロジック、OpenAI統合、コマンドランナー
server/index.js      # タスク用のRESTエンドポイントを公開するExpressサーバー
src/                 # Reactフロントエンド（Vite）
public/generated/    # UIに提供されるコマンド出力（.gitignore対象）
storage/             # セッション入力（.gitignore対象）
```

## HTTP API

- `GET /api/tools` – 表示に使用するツールカタログを返します
- `POST /api/tasks` – 以下を含む`multipart/form-data`を受け付けます：
  - `task`：自然言語による指示
  - `files`：1つ以上のファイルアップロード（オプション）

レスポンス例：

```json
{
  "sessionId": "session-...",
  "plan": {
    "command": "ffmpeg",
    "arguments": ["-i", "..."],
    "reasoning": "...",
    "outputs": [
      {
        "description": "Resized image",
        "absolutePath": "C:\\\\...\\\\public\\\\generated\\\\...\\\\output.png",
        "publicPath": "generated/.../output.png",
        "exists": true,
        "size": 123456
      }
    ]
  },
  "result": {
    "exitCode": 0,
    "stdout": "...",
    "stderr": "...",
    "timedOut": false
  }
}
```

## 新しいツールの追加

1. `OpenaiAgent.js`の`TOOL_DEFINITIONS`を新しいコマンド名と説明で更新します
2. コマンドが追加の制約を必要とする場合、検証スキーマ（enum）を拡張します
3. CLIがホストにインストールされ、`PATH`で利用可能であることを確認します
