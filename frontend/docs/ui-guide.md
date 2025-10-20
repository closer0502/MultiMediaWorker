# オプション解説

## 📋 ドライラン（コマンド実行をスキップ）

**概要**: コマンドを実際には実行せず、プランの生成のみを行うモードです。

### フロー

1. **UI側の設定**
   - `frontend/src/App.jsx:245` のチェックボックスで `dryRun` フラグを有効化
   - `/api/tasks` にリクエストを送信

2. **サーバー側の処理**
   - `parseBoolean` が `dryRun=true` を解釈
   - 実行フェーズに渡す（`backend/src/server/MediaAgentServer.js:167`）

3. **エージェント側の動作**
   - プランのみを生成
   - `CommandExecutor` が実コマンドをスキップ処理
   - 結果に **「ドライラン」** タグとスキップ理由を記録
   - 参照: `backend/src/agent/execution/CommandExecutor.js:34`, `CommandExecutor.js:158`

---

## 🐛 プラン生成のデバッグ情報を含める

**概要**: プラン生成プロセスの詳細情報を取得します。

### フロー

1. **UI側の設定**
   - `frontend/src/App.jsx:259` のチェックで `debugEnabled` を有効化
   - クエリに `debug=true` を付与
   - 後続の詳細オプションが利用可能に

2. **サーバー側の処理**
   - `parseDebugMode` でフラグを解釈
     - 参照: `backend/src/server/MediaAgentServer.js:166`, `MediaAgentServer.js:334`
   - プランナーに `debug: true` を渡す

3. **プランナー側の動作**
   - OpenAI プランナーが以下の情報を付与:
     - 開発者プロンプト
     - パース結果
     - その他デバッグ情報
   - 参照: `backend/src/agent/planning/OpenAIPlanner.js:33`, `OpenAIPlanner.js:70`

4. **UI側の表示**
   - 「デバッグ」セクションで確認可能（`frontend/src/App.jsx:416`）

---

## 🔍 生レスポンスを含める（詳細）

**概要**: LLMの生レスポンス全体を取得する詳細デバッグモードです。

> ⚠️ **注意**: このオプションは「デバッグ情報を含める」が有効な場合のみ使用可能です。

### フロー

1. **UI側の設定**
   - `frontend/src/App.jsx:271` の入れ子チェックボックス
   - デバッグがオンの時のみ有効
   - `debugVerbose` を `true` にすると `debug=verbose` モードに切り替え

2. **サーバー側の処理**
   - `debug=verbose` または `debug=full` を受け取る
   - `includeRaw` を `true` に設定（`backend/src/server/MediaAgentServer.js:336`）
   - エージェントへ `includeRawResponse` を渡す（`MediaAgentServer.js:191`）

3. **プランナー側の動作**
   - LLMの生レスポンス全体を安全にシリアライズ
   - デバッグ payload に同梱（`backend/src/agent/planning/OpenAIPlanner.js:38`）

4. **UI側の表示**
   - 「生レスポンス」ビューで JSON 全体を確認可能
   - 参照: `frontend/src/App.jsx:391`

---

## 💡 使い方のヒント

- **開発中**: ドライランとデバッグを併用すると、コマンド実行なしでプラン生成の問題を特定できます
- **トラブルシューティング**: 生レスポンスを含めると、LLMの出力を詳細に分析できます
- **本番環境**: デバッグオプションは無効化し、必要な場合のみドライランを使用してください
