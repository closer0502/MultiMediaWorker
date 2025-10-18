import { useCallback, useEffect, useMemo, useState } from 'react';
import './styles.css';

const INITIAL_HISTORY = [];

const STATUS_LABELS = {
  success: 'Success',
  failed: 'Failed'
};

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
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [debugVerbose, setDebugVerbose] = useState(false);
  const [dryRun, setDryRun] = useState(false);

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

      const params = new URLSearchParams();
      if (debugEnabled) {
        params.append('debug', debugVerbose ? 'verbose' : 'true');
      }
      if (dryRun) {
        params.append('dryRun', 'true');
      }

      const url = `/api/tasks${params.toString() ? `?${params.toString()}` : ''}`;
      const formData = new FormData();
      formData.append('task', task);
      selectedFiles.forEach((file) => {
        formData.append('files', file);
      });

      const submittedAt = new Date().toISOString();
      const pendingUploads = selectedFiles.map((file, index) => ({
        id: `local-${index}`,
        originalName: file.name,
        size: file.size,
        mimeType: file.type
      }));

      try {
        const response = await fetch(url, {
          method: 'POST',
          body: formData
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          const message = payload?.error || 'Failed to generate command.';
          setError(message);
          if (payload) {
            setHistory((prev) => [
              {
                id: payload.sessionId || `error-${Date.now()}`,
                submittedAt,
                task,
                plan: payload.plan || null,
                result: payload.result || null,
                phases: payload.phases || [],
                uploadedFiles: payload.uploadedFiles || pendingUploads,
                status: payload.status || 'failed',
                error: payload.detail || message,
                debug: payload.debug || null,
                requestOptions: {
                  debug: debugEnabled,
                  verbose: debugVerbose,
                  dryRun
                }
              },
              ...prev
            ]);
          }
          return;
        }

        if (!payload) {
          throw new Error('Received an empty response from the server.');
        }

        setHistory((prev) => [
          {
            id: payload.sessionId,
            submittedAt,
            task: payload.task,
            plan: payload.plan,
            result: payload.result,
            phases: payload.phases || [],
            uploadedFiles: payload.uploadedFiles || pendingUploads,
            status: payload.status || 'success',
            error: payload.detail || null,
            debug: payload.debug || null,
            requestOptions: {
              debug: debugEnabled,
              verbose: debugVerbose,
              dryRun
            }
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
    [task, selectedFiles, debugEnabled, debugVerbose, dryRun, resetForm]
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

            <fieldset className="field options">
              <legend>Options</legend>
              <label className="option">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(event) => setDryRun(event.target.checked)}
                  disabled={isSubmitting}
                />
                <span>Dry run (skip command execution)</span>
              </label>
              <label className="option">
                <input
                  type="checkbox"
                  checked={debugEnabled}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setDebugEnabled(enabled);
                    if (!enabled) {
                      setDebugVerbose(false);
                    }
                  }}
                  disabled={isSubmitting}
                />
                <span>Return planning debug info</span>
              </label>
              <label className="option nested">
                <input
                  type="checkbox"
                  checked={debugVerbose}
                  onChange={(event) => setDebugVerbose(event.target.checked)}
                  disabled={isSubmitting || !debugEnabled}
                />
                <span>Include raw response (verbose)</span>
              </label>
            </fieldset>

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
  const statusLabel = STATUS_LABELS[entry.status] || entry.status || 'Unknown';

  return (
    <div className="result-view">
      <div className="result-header">
        <span className={`status-chip status-${entry.status}`}>{statusLabel}</span>
        {entry.requestOptions?.dryRun && <span className="chip">Dry run</span>}
        {entry.requestOptions?.debug && <span className="chip">Debug</span>}
      </div>

      {entry.error && <div className="error inline">{entry.error}</div>}

      <div className="result-section">
        <h3>Workflow</h3>
        <PhaseChecklist phases={entry.phases} />
      </div>

      <div className="result-section">
        <h3>Command</h3>
        {entry.plan ? (
          <>
            <code className="command-line">{buildCommandString(entry.plan)}</code>
            <p className="note">{entry.plan.reasoning}</p>
          </>
        ) : (
          <p>Command plan is not available.</p>
        )}
      </div>

      {entry.plan?.followUp && (
        <div className="result-section">
          <h3>Follow-up Notes</h3>
          <p>{entry.plan.followUp}</p>
        </div>
      )}

      <div className="result-section">
        <h3>Uploaded Files</h3>
        <UploadedFileList files={entry.uploadedFiles} />
      </div>

      <div className="result-section">
        <h3>Outputs</h3>
        <OutputList outputs={outputList} />
      </div>

      <div className="result-section">
        <h3>Process Details</h3>
        <ProcessSummary result={entry.result} />
      </div>

      {entry.debug && (
        <div className="result-section">
          <h3>Debug Details</h3>
          <DebugDetails debug={entry.debug} />
        </div>
      )}
    </div>
  );
}

/**
 * @param {{ phases: Array<any> }} props
 * @returns {JSX.Element}
 */
function PhaseChecklist({ phases }) {
  if (!phases || !phases.length) {
    return <p>No phase information available.</p>;
  }
  return (
    <ol className="phase-list">
      {phases.map((phase) => {
        const status = phase.status || 'pending';
        const title = phase.title || phase.id;
        const metaEntries = Object.entries(phase.meta || {});
        return (
          <li key={phase.id} className={`phase phase-${status}`}>
            <div className="phase-header">
              <span className="phase-title">{title}</span>
              <span className={`phase-status phase-status-${status}`}>{statusLabel(status)}</span>
            </div>
            {(phase.startedAt || phase.finishedAt) && (
              <div className="phase-timestamps">
                {phase.startedAt && <span>start: {formatDateTime(phase.startedAt)}</span>}
                {phase.finishedAt && <span>end: {formatDateTime(phase.finishedAt)}</span>}
              </div>
            )}
            {metaEntries.length > 0 && (
              <ul className="phase-meta">
                {metaEntries.map(([key, value]) => (
                  <li key={key}>
                    <strong>{key}</strong>
                    <span>{String(value)}</span>
                  </li>
                ))}
              </ul>
            )}
            {phase.error && (
              <div className="phase-error">
                <strong>{phase.error.name || 'Error'}:</strong> {phase.error.message}
              </div>
            )}
            {Array.isArray(phase.logs) && phase.logs.length > 0 && (
              <details className="log-block">
                <summary>Logs ({phase.logs.length})</summary>
                <ul className="phase-logs">
                  {phase.logs.map((log, index) => (
                    <li key={`${phase.id}-log-${index}`}>
                      <time>{formatDateTime(log.at)}</time>
                      <span>{log.message}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * @param {{ files: Array<any> }} props
 * @returns {JSX.Element}
 */
function UploadedFileList({ files }) {
  if (!files || !files.length) {
    return <p>No files were uploaded.</p>;
  }
  return (
    <ul className="uploaded-files">
      {files.map((file, index) => (
        <li key={file.id || `${file.originalName}-${index}`}>
          <span>{file.originalName || file.name}</span>
          {file.size != null && <span>{formatFileSize(file.size)}</span>}
        </li>
      ))}
    </ul>
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
      <div className="process-row">
        <span>Dry Run</span>
        <span>{result.dryRun ? 'yes' : 'no'}</span>
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
 * @param {{ debug: Record<string, any> }} props
 * @returns {JSX.Element}
 */
function DebugDetails({ debug }) {
  if (!debug) {
    return null;
  }
  const printable = Object.entries(debug).filter(([, value]) => value !== undefined && value !== null);

  if (!printable.length) {
    return <p>No debug information was returned.</p>;
  }

  return (
    <div className="debug-details">
      {printable.map(([key, value]) => {
        if (typeof value === 'string') {
          return (
            <details key={key} className="debug-block">
              <summary>{key}</summary>
              <pre>{value}</pre>
            </details>
          );
        }
        return (
          <details key={key} className="debug-block">
            <summary>{key}</summary>
            <pre>{JSON.stringify(value, null, 2)}</pre>
          </details>
        );
      })}
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
          <div className="history-row">
            <span className={`status-chip status-${item.status}`}>{STATUS_LABELS[item.status] || item.status}</span>
            <span>{new Date(item.submittedAt).toLocaleString()}</span>
          </div>
          <p className="history-task">{item.task}</p>
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

function statusLabel(status) {
  if (!status) {
    return 'Pending';
  }
  if (STATUS_LABELS[status]) {
    return STATUS_LABELS[status];
  }
  if (status === 'in_progress') {
    return 'In Progress';
  }
  if (status === 'pending') {
    return 'Pending';
  }
  return status;
}

function formatDateTime(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
