import { useCallback, useEffect, useMemo, useState } from 'react';
import './styles.css';

const INITIAL_HISTORY = [];

/**
 * @typedef {Object} ClientCommandPlan
 * @property {string} command
 * @property {string[]} arguments
 * @property {string} reasoning
 * @property {string} [followUp]
 */

/**
 * @returns {JSX.Element} Application component.
 */
export default function App() {
  const [task, setTask] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState(INITIAL_HISTORY);
  const [tools, setTools] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/tools')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('ツール情報の取得に失敗しました。');
        }
        const payload = await response.json();
        if (!cancelled) {
          setTools(Array.isArray(payload.tools) ? payload.tools : []);
        }
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resetForm = useCallback(() => {
    setTask('');
    setSelectedFiles([]);
  }, []);

  /**
   * @param {React.FormEvent<HTMLFormElement>} event - Form submission event.
   */
  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!task.trim()) {
        setError('課題を入力してください。');
        return;
      }
      setIsSubmitting(true);
      setError('');
      try {
        const formData = new FormData();
        formData.append('task', task);
        selectedFiles.forEach((file) => {
          formData.append('files', file);
        });

        const response = await fetch('/api/tasks', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          const message = detail?.error || 'コマンド生成に失敗しました。';
          throw new Error(message);
        }

        const payload = await response.json();
        setHistory((prev) => [
          {
            id: payload.sessionId,
            submittedAt: new Date().toISOString(),
            task: payload.task,
            plan: payload.plan,
            result: payload.result,
            uploadedFiles: payload.uploadedFiles
          },
          ...prev
        ]);
        resetForm();
      } catch (submitError) {
        setError(submitError.message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [resetForm, selectedFiles, task]
  );

  const latestEntry = history[0] || null;

  return (
    <div className="app">
      <header className="header">
        <h1>MultiMedia Worker</h1>
        <p>自然言語から ffmpeg / ImageMagick / ExifTool のコマンドを自動生成します。</p>
      </header>

      <main className="content">
        <section className="panel">
          <h2>利用可能なツール</h2>
          <ToolList tools={tools} />
        </section>

        <section className="panel">
          <h2>課題を送信</h2>
          <form className="task-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>手順や目的</span>
              <textarea
                value={task}
                placeholder='例: "135329973_p1.png を 512x512 の PNG にリサイズしてください"'
                onChange={(event) => setTask(event.target.value)}
                rows={5}
                disabled={isSubmitting}
              />
            </label>

            <label className="field">
              <span>ファイルを添付</span>
              <input
                type="file"
                multiple
                onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))}
                disabled={isSubmitting}
              />
            </label>

            {selectedFiles.length > 0 && (
              <FilePreviewList files={selectedFiles} onClear={() => setSelectedFiles([])} disabled={isSubmitting} />
            )}

            <div className="form-actions">
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? '処理中...' : 'コマンドを生成'}
              </button>
              <button type="button" onClick={resetForm} disabled={isSubmitting}>
                リセット
              </button>
            </div>
          </form>
          {error && <div className="error">{error}</div>}
        </section>

        {latestEntry && (
          <section className="panel">
            <h2>最新の結果</h2>
            <ResultView entry={latestEntry} />
          </section>
        )}

        {history.length > 1 && (
          <section className="panel">
            <h2>履歴</h2>
            <HistoryList entries={history.slice(1)} />
          </section>
        )}
      </main>
    </div>
  );
}

/**
 * @param {{tools: Array<{id: string, title: string, description: string}>}} props - Component props.
 * @returns {JSX.Element}
 */
function ToolList({ tools }) {
  if (!tools.length) {
    return <p>ツール情報を読み込み中...</p>;
  }
  return (
    <ul className="tool-list">
      {tools.map((tool) => (
        <li key={tool.id}>
          <strong>{tool.title}</strong>
          <span>{tool.description}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * @param {{ entry: any }} props - Component props.
 * @returns {JSX.Element}
 */
function ResultView({ entry }) {
  const outputList = entry?.result?.resolvedOutputs || [];

  return (
    <div className="result-view">
      <div className="result-section">
        <h3>コマンド</h3>
        <code className="command-line">{buildCommandString(entry.plan)}</code>
        <p className="note">{entry.plan.reasoning}</p>
      </div>

      {entry.plan.followUp && (
        <div className="result-section">
          <h3>追記事項</h3>
          <p>{entry.plan.followUp}</p>
        </div>
      )}

      <div className="result-section">
        <h3>出力ファイル</h3>
        <OutputList outputs={outputList} />
      </div>

      <div className="result-section">
        <h3>プロセスの状態</h3>
        <ProcessSummary result={entry.result} />
      </div>
    </div>
  );
}

/**
 * @param {{ outputs: Array<any> }} props - Output list props.
 * @returns {JSX.Element}
 */
function OutputList({ outputs }) {
  if (!outputs.length) {
    return <p>出力は宣言されていません。</p>;
  }
  return (
    <ul className="output-list">
      {outputs.map((item) => (
        <li key={item.path}>
          <div className="output-path">
            <strong>{item.description || 'ファイル'}</strong>
            <span>{item.absolutePath || item.path}</span>
          </div>
          <div className="output-meta">
            <span>{item.exists ? '生成済み' : '未生成'}</span>
            {item.size != null && <span>{formatFileSize(item.size)}</span>}
            {item.publicPath && (
              <a href={`/files/${item.publicPath}`} target="_blank" rel="noreferrer">
                表示 / ダウンロード
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * @param {{ result: any }} props - Process summary props.
 * @returns {JSX.Element}
 */
function ProcessSummary({ result }) {
  if (!result) {
    return <p>まだ実行されていません。</p>;
  }

  return (
    <div className="process-summary">
      <div className="process-row">
        <span>終了コード</span>
        <span>{result.exitCode === null ? '未実行' : result.exitCode}</span>
      </div>
      <div className="process-row">
        <span>タイムアウト</span>
        <span>{result.timedOut ? 'はい' : 'いいえ'}</span>
      </div>
      <details className="log-block">
        <summary>標準出力</summary>
        <pre>{result.stdout || '(なし)'}</pre>
      </details>
      <details className="log-block">
        <summary>標準エラー</summary>
        <pre className={result.stderr ? 'log-error' : ''}>{result.stderr || '(なし)'}</pre>
      </details>
    </div>
  );
}

/**
 * @param {{ entries: any[] }} props - History props.
 * @returns {JSX.Element}
 */
function HistoryList({ entries }) {
  if (!entries.length) {
    return <p>履歴はありません。</p>;
  }
  return (
    <ul className="history-list">
      {entries.map((item) => (
        <li key={item.id}>
          <h4>{item.task}</h4>
          <span>{new Date(item.submittedAt).toLocaleString()}</span>
          <code className="command-line small">{buildCommandString(item.plan)}</code>
        </li>
      ))}
    </ul>
  );
}

/**
 * @param {ClientCommandPlan} plan - Command plan.
 * @returns {string} Rendered command line.
 */
function buildCommandString(plan) {
  if (!plan?.command) {
    return '';
  }
  const args = (plan.arguments || []).map(quoteArgument).join(' ');
  return `${plan.command} ${args}`.trim();
}

/**
 * @param {File[]} files - Selected files.
 * @param {() => void} onClear - Clear handler.
 * @param {boolean} disabled - Disabled flag.
 * @returns {JSX.Element}
 */
function FilePreviewList({ files, onClear, disabled }) {
  const totalSize = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files]
  );

  if (!files.length) {
    return null;
  }

  return (
    <div className="file-preview">
      <div className="file-preview-header">
        <strong>選択中のファイル ({files.length} 件)</strong>
        <span>{formatFileSize(totalSize)}</span>
        <button type="button" onClick={onClear} disabled={disabled}>
          クリア
        </button>
      </div>
      <ul>
        {files.map((file) => (
          <li key={file.name + file.size}>
            <span>{file.name}</span>
            <span>{formatFileSize(file.size)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * @param {number} bytes - File size.
 * @returns {string} Human readable size.
 */
function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) {
    return '';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * @param {string} argument - Command argument.
 * @returns {string} Quoted argument when needed.
 */
function quoteArgument(argument) {
  if (!argument) {
    return '""';
  }
  if (/[\s"]/u.test(argument)) {
    return `"${argument.replace(/"/g, '\\"')}"`;
  }
  return argument;
}
