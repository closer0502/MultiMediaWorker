# フロントエンド実行プロセス解説

このドキュメントは `frontend/src` を中心とした UI 側の流れと主要コンポーネントを把握するためのものです。ユーザー操作からサーバー応答の表示まで、どの関数がどんな役割を担うかをステップ形式でまとめています。

## 1. 全体フロー（ステップバイステップ）

1. **エントリポイントの初期化**  
   - `main.jsx` (`frontend/src/main.jsx`)  
   - `ReactDOM.createRoot(...).render(<App />)` によりルートコンポーネント `App` をマウント。`React.StrictMode` 下で開発時の警告検知も行われる。

2. **初期状態のセットアップ**  
   - `App.jsx` (`frontend/src/App.jsx`) 内部の `useState` でフォームや履歴、ツールリストなどの状態を用意。  
   - `useEffect` がマウント時に `/api/tools` をフェッチして利用可能コマンド一覧を取得し、`tools` ステートへ格納。

3. **ユーザー入力の収集**  
   - タスク入力フィールドとファイル選択 (`<input type="file" multiple />`) を `App` が保持。  
   - `FilePreviewList` コンポーネントで選択済みファイルを表示し、合計サイズなどを算出。  
   - デバッグやドライランのフラグをトグルで設定可能。

4. **フォーム送信処理**  
   - `handleSubmit` が `<form onSubmit={handleSubmit}>` から呼ばれる。  
   - タスク文と選択ファイルを `FormData` に詰め、クエリパラメータ（`debug` / `dryRun` など）を付与した URL で `/api/tasks` に POST。  
   - 送信時刻と選択ファイル情報を保持し、レスポンス待ちの間は `isSubmitting` フラグで UI をロック。

5. **サーバー応答の処理**  
   - 応答 JSON を解析し、成功時は `history` ステートに新しいエントリを追加。プラン情報 (`plan` / `rawPlan`)、フェーズ履歴、生成物情報などをまとめて保持。  
   - 失敗時は `error` メッセージを表示しつつ履歴にも失敗エントリを追加。サーバー側で `debug` を返した場合は `debugDrawer` で閲覧可能。

6. **結果表示**  
   - メインビューでは直近の結果を `ResultPanel`（アプリ内関数）で可視化。  
   - `PhaseTimeline` がサーバーから返されたフェーズ進行状況をタイムライン表示。  
   - `OutputList` が生成ファイルの一覧をテーブルで表示し、公開パスがあればリンク化。  
   - 下部の `HistoryList` で過去実行の簡易履歴を参照可能。

7. **デバッグ情報の展開**  
   - `debugEnabled` がオンのとき、サーバーから返された `rawPlan` や `responseText` / `debug` 情報をサイドドロワーで表示。  
   - `PlanView` と `RawJsonViewer`（App.jsx 内のユーティリティ）が JSON を整形表示。

8. **フォームのリセットおよび再実行**  
   - 成功時は `resetForm` がタスクとファイル選択をクリア。失敗時は入力を保持して再送できるようにする。  
   - `history` に保存されたエントリをクリックすると詳細を再表示（`handleSelectHistoryEntry`）。

## 2. 主なコンポーネントと関数の役割

| 名称 | 位置 | 役割 |
| --- | --- | --- |
| `App` | `frontend/src/App.jsx` | UI 全体を統括するコンポーネント。入力フォーム、結果パネル、履歴、デバッグ表示をまとめて管理 |
| `FilePreviewList` | `App.jsx` 内 | 選択されたファイルの一覧と総サイズ表示、クリア操作を提供 |
| `PhaseTimeline` | `App.jsx` 内 | サーバーから返ってくるフェーズ状態をタイムライン表示 |
| `OutputList` | `App.jsx` 内 | 生成ファイルの有無や公開パスを一覧表示 |
| `HistoryList` | `App.jsx` 内 | 過去の実行履歴を簡易表示して再参照を可能にする |
| `PlanView` / `RawJsonViewer` | `App.jsx` 内 | 生成されたプランやデバッグ用の JSON を整形出力 |
| `main.jsx` | `frontend/src/main.jsx` | ルート要素への `App` マウントのみ担当 |
| `styles.css` | `frontend/src/styles.css` | UI レイアウトや状態に応じたスタイル定義 |

## 3. 送信から表示までの呼び出し関係（簡易マップ）

```
main.jsx
 └─ <App />
     ├─ useEffect(fetch /api/tools)
     ├─ handleSubmit(form submission)
     │   ├─ fetch('/api/tasks', FormData)
     │   ├─ setHistory([...])
     │   └─ setError / setIsSubmitting
     ├─ ResultPanel（関数内ローカルコンポーネント）
     │   ├─ PhaseTimeline
     │   ├─ OutputList
     │   └─ DebugDrawer (開発時)
     └─ HistoryList（過去結果の再表示）
```

## 4. 補足

- `fetch` のエラーハンドリングではレスポンス本文が JSON でなくても graceful に処理できるよう `response.json().catch(() => null)` としています。  
- 履歴ステートにはユーザー入力時点のファイル情報も保持しているため、`dryRun` で実行しても元データを振り返れる構造です。  
- フロントエンドで使用する文字列は英語が中心ですが、必要に応じて i18n 化しやすいようユーティリティ関数を分離する余地があります。

---

この資料を起点に `App.jsx` 内の補助関数を辿ると、ユーザー操作からサーバー連携までの流れをすばやく追うことができます。
