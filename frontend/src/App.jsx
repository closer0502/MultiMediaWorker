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
 * Main application component.
 * @returns {JSX.Element}
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
          throw new Error('Failed to fetch tool information.');
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
   * @param {React.FormEvent<HTMLFormElement>} event
   */
  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!task.trim()) {
        setError('Please describe the task.');
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
          const message = detail?.error || 'Failed to generate command.';
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
        <p>Ask in natural language and get ready-to-run ffmpeg / ImageMagick / ExifTool commands.</p>
      </header>

      <main className="content">
        <section className="panel">
          <h2>Available Tools</h2>
          <ToolList tools={tools} />
        </section>

        <section className="panel">
          <h2>Submit a Task</h2>
          <form className="task-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Goal / Instructions</span>
              <textarea
                value={task}
                placeholder='Example: "Resize 135329973_p1.png to 512x512 PNG."'
                onChange={(event) => setTask(event.target.value)}
                rows={5}
                disabled={isSubmitting}
              />
            </label>

            <label className="field">
              <span>Attach Files</span>
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
                {isSubmitting ? 'Working…' : 'Generate Command'}
              </button>
              <button type="button" onClick={resetForm} disabled={isSubmitting}>
                Reset
              </button>
            </div>
          </form>
          {error && <div className="error">{error}</div>}
        </section>

        {latestEntry && (
          <section className="panel">
            <h2>Latest Result</h2>
            <ResultView entry={latestEntry} />
          </section>
        )}

        {history.length > 1 && (
          <section className="panel">
            <h2>History</h2>
            <HistoryList entries={history.slice(1)} />
          </section>
        )}
      </main>
    </div>
  );
}

/**
 * @param {{tools: Array<{id: string, title: string, description: string}>}} props
 * @returns {JSX.Element}
 */
function ToolList({ tools }) {
  if (!tools.length) {
    return <p>Loading tool catalogue…</p>;
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
 * @param {{ entry: any }} props
 * @returns {JSX.Element}
 */
function ResultView({ entry }) {
  const outputList = entry?.result?.resolvedOutputs || [];

  return (
    <div className="result-view">
      <div className="result-section">
        <h3>Command</h3>
        <code className="command-line">{buildCommandString(entry.plan)}</code>
        <p className="note">{entry.plan.reasoning}</p>
      </div>

      {entry.plan.followUp && (
        <div className="result-section">
          <h3>Follow-up Notes</h3>
          <p>{entry.plan.followUp}</p>
        </div>
      )}

      <div className="result-section">
        <h3>Outputs</h3>
        <OutputList outputs={outputList} />
      </div>

      <div className="result-section">
        <h3>Process Details</h3>
        <ProcessSummary result={entry.result} />
      </div>
    </div>
  );
}

/**
 * @param {{ outputs: Array<any> }} props
 * @returns {JSX.Element}
 */
function OutputList({ outputs }) {
  if (!outputs.length) {
    return <p>No outputs were declared.</p>;
  }
  return (
    <ul className="output-list">
      {outputs.map((item) => (
        <li key={item.path}>
          <div className="output-path">
            <strong>{item.description || 'File'}</strong>
            <span>{item.absolutePath || item.path}</span>
          </div>
          <div className="output-meta">
            <span>{item.exists ? 'Ready' : 'Pending'}</span>
            {item.size != null && <span>{formatFileSize(item.size)}</span>}
            {item.publicPath && (
              <a href={`/files/${item.publicPath}`} target="_blank" rel="noreferrer">
                Open
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * @param {{ result: any }} props
 * @returns {JSX.Element}
 */
function ProcessSummary({ result }) {
  if (!result) {
    return <p>Command has not been executed yet.</p>;
  }

  return (
    <div className="process-summary">
      <div className="process-row">
        <span>Exit Code</span>
        <span>{result.exitCode === null ? 'not run' : result.exitCode}</span>
      </div>
      <div className="process-row">
        <span>Timed Out</span>
        <span>{result.timedOut ? 'yes' : 'no'}</span>
      </div>
      <details className="log-block">
        <summary>Standard Output</summary>
        <pre>{result.stdout || '(empty)'}</pre>
      </details>
      <details className="log-block">
        <summary>Standard Error</summary>
        <pre className={result.stderr ? 'log-error' : ''}>{result.stderr || '(empty)'}</pre>
      </details>
    </div>
  );
}

/**
 * @param {{ entries: any[] }} props
 * @returns {JSX.Element}
 */
function HistoryList({ entries }) {
  if (!entries.length) {
    return <p>No previous runs.</p>;
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
 * @param {ClientCommandPlan} plan
 * @returns {string}
 */
function buildCommandString(plan) {
  if (!plan?.command) {
    return '';
  }
  const args = (plan.arguments || []).map(quoteArgument).join(' ');
  return `${plan.command} ${args}`.trim();
}

/**
 * @param {File[]} files
 * @param {() => void} onClear
 * @param {boolean} disabled
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
        <strong>Selected files ({files.length})</strong>
        <span>{formatFileSize(totalSize)}</span>
        <button type="button" onClick={onClear} disabled={disabled}>
          Clear
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
 * @param {number} bytes
 * @returns {string}
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
 * @param {string} argument
 * @returns {string}
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
