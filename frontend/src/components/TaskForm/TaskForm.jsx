import { useCallback } from 'react';
import FilePreviewList from './FilePreviewList.jsx';

export default function TaskForm({
  task,
  onTaskChange,
  isSubmitting,
  fileInputRef,
  onSubmit,
  selectedFiles,
  onFilesSelected,
  onClearFiles,
  showDebugOptions,
  onToggleDebugOptions,
  dryRun,
  onDryRunChange,
  debugEnabled,
  onDebugChange,
  onReset,
  error
}) {
  const handleTaskChange = useCallback(
    (event) => {
      onTaskChange(event.target.value);
    },
    [onTaskChange]
  );

  const handleFileChange = useCallback(
    (event) => {
      const { files } = event.target;
      const nextFiles = Array.from(files || []);
      if (nextFiles.length > 0) {
        onFilesSelected(nextFiles);
      }
      if (event.target) {
        event.target.value = '';
      }
    },
    [onFilesSelected]
  );

  return (
    <section className="panel task-panel">
      <h2>タスクを送信</h2>
      <form className="task-form" onSubmit={onSubmit}>
        <label className="field">
          <span>目的 / 指示</span>
          <textarea
            value={task}
            placeholder='例: 「135329973_p1.png を 512x512 の PNG にリサイズ」'
            onChange={handleTaskChange}
            rows={5}
            disabled={isSubmitting}
          />
        </label>

        <label className="field">
          <span>ファイルを添付</span>
          <div className="file-input-row">
            <input
              ref={fileInputRef}
              className="file-input"
              type="file"
              multiple
              onChange={handleFileChange}
              disabled={isSubmitting}
            />
            <button
              type="button"
              className="file-input-trigger"
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              disabled={isSubmitting}
            >
              ファイル選択
            </button>
          </div>
        </label>

        {selectedFiles.length > 0 && (
          <FilePreviewList files={selectedFiles} onClear={onClearFiles} disabled={isSubmitting} />
        )}

        <div className={`field options debug-options ${showDebugOptions ? 'is-expanded' : 'is-collapsed'}`}>
          <label className="debug-options-header">
            <input
              type="checkbox"
              checked={showDebugOptions}
              onChange={(event) => onToggleDebugOptions(event.target.checked)}
              disabled={isSubmitting}
            />
            <span className="debug-options-title">デバッグオプション</span>
          </label>
          {showDebugOptions && (
            <div className="debug-options-body">
              <label className="option">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(event) => onDryRunChange(event.target.checked)}
                  disabled={isSubmitting}
                />
                <span>ドライラン（コマンド実行をスキップ）</span>
              </label>
              <label className="option">
                <input
                  type="checkbox"
                  checked={debugEnabled}
                  onChange={(event) => onDebugChange(event.target.checked)}
                  disabled={isSubmitting}
                />
                <span>プラン生成のデバッグ情報を含める（生レスポンス含む）</span>
              </label>
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? '処理中…' : '送信する'}
          </button>
          <button type="button" onClick={onReset} disabled={isSubmitting}>
            リセット
          </button>
        </div>
      </form>
      {error && <div className="error">{error}</div>}
    </section>
  );
}
