import { useCallback, useEffect, useMemo, useState } from 'react';
import './styles.css';

const INITIAL_HISTORY = [];

const STATUS_LABELS = {
  success: 'Success',
  failed: 'Failed'
};

/**
 * @typedef {Object} ClientCommandOutput
 * @property {string} path
 * @property {string} description
 */

/**
 * @typedef {Object} ClientCommandStep
 * @property {string} command
 * @property {string[]} arguments
 * @property {string} reasoning
 * @property {ClientCommandOutput[]} outputs
 * @property {string|undefined} id
 * @property {string|undefined} title
 * @property {string|undefined} note
 */

/**
 * @typedef {Object} ClientCommandPlan
 * @property {ClientCommandStep[]} steps
 * @property {string|undefined} overview
 * @property {string|undefined} followUp
 */

/**
 * @typedef {Object} ClientCommandStepResult
 * @property {'executed'|'skipped'} status
 * @property {string} command
 * @property {string[]} arguments
 * @property {string} reasoning
 * @property {number|null} exitCode
 * @property {boolean} timedOut
 * @property {string} stdout
 * @property {string} stderr
 * @property {string|undefined} skipReason
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
                rawPlan: payload.rawPlan ?? payload.plan ?? null,
                result: payload.result || null,
                phases: payload.phases || [],
                uploadedFiles: payload.uploadedFiles || pendingUploads,
                status: payload.status || 'failed',
                error: payload.detail || message,
                debug: payload.debug || null,
                responseText: payload.responseText ?? null,
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
            rawPlan: payload.rawPlan ?? payload.plan ?? null,
            result: payload.result,
            phases: payload.phases || [],
            uploadedFiles: payload.uploadedFiles || pendingUploads,
            status: payload.status || 'success',
            error: payload.detail || null,
            debug: payload.debug || null,
            responseText: payload.responseText ?? null,
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
  const plan = normalizePlan(entry.plan ?? entry.rawPlan);
  const followUp = plan?.followUp || '';
  const overview = plan?.overview || '';
  const planSteps = plan?.steps || [];
  const stepResults = Array.isArray(entry?.result?.steps) ? entry.result.steps : [];

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
        <h3>Command Plan</h3>
        {plan ? (
          <>
            <code className="command-line">{buildPlanSummary(plan)}</code>
            {overview && <p className="note">{overview}</p>}
            <PlanStepList steps={planSteps} results={stepResults} />
          </>
        ) : (
          <p>Command plan is not available.</p>
        )}
      </div>

      {followUp && (
        <div className="result-section">
          <h3>Follow-up Notes</h3>
          <p>{followUp}</p>
        </div>
      )}

      {entry.rawPlan && (
        <div className="result-section">
          <h3>Planner Raw Output</h3>
          <details className="debug-block">
            <summary>View JSON</summary>
            <pre>{JSON.stringify(entry.rawPlan, null, 2)}</pre>
          </details>
        </div>
      )}

      {entry.responseText && (
        <div className="result-section">
          <h3>Raw Response Text</h3>
          <details className="debug-block">
            <summary>View Response</summary>
            <pre>{entry.responseText}</pre>
          </details>
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
 * @param {{ steps: ClientCommandStep[], results: ClientCommandStepResult[] }} props
 * @returns {JSX.Element|null}
 */
function PlanStepList({ steps, results }) {
  if (!steps.length) {
    return null;
  }

  return (
    <ol className="plan-step-list">
      {steps.map((step, index) => {
        const stepResult = Array.isArray(results) ? results[index] : undefined;
        const title = step.title || `Step ${index + 1}`;
        const key = step.id || `${step.command || 'unknown'}-${index}`;

        return (
          <li key={key} className="plan-step-item">
            <div className="plan-step-header">
              <strong>{title}</strong>
              <StepStatusBadge result={stepResult} />
            </div>
            <code className="command-line small">{formatStepCommand(step)}</code>
            {step.reasoning && <p className="note">{step.reasoning}</p>}
            {step.note && <p className="note">{step.note}</p>}
            {step.outputs && step.outputs.length > 0 && (
              <ul className="plan-step-outputs">
                {step.outputs.map((output) => (
                  <li key={`${output.path}-${output.description || 'output'}`}>
                    <span>{output.description || 'Output'}:</span> <span>{output.path}</span>
                  </li>
                ))}
              </ul>
            )}
            {stepResult?.status === 'skipped' && stepResult.skipReason && (
              <p className="note">Skipped because {describeSkipReason(stepResult.skipReason)}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * @param {{ result: ClientCommandStepResult|undefined }} props
 * @returns {JSX.Element|null}
 */
function StepStatusBadge({ result }) {
  if (!result) {
    return null;
  }

  const statusLabel = result.status === 'executed' ? 'Executed' : 'Skipped';
  const extras = [];
  if (result.status === 'executed') {
    if (result.exitCode !== null && result.exitCode !== undefined) {
      extras.push(`exit ${result.exitCode}`);
    }
    if (result.timedOut) {
      extras.push('timed out');
    }
  }

  const text = extras.length ? `${statusLabel} (${extras.join(', ')})` : statusLabel;
  return <span className={`chip step-status-${result.status}`}>{text}</span>;
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

  const stepResults = Array.isArray(result.steps) ? result.steps : [];

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
      {stepResults.length > 0 && (
        <div className="process-steps">
          <h4>Per-step Details</h4>
          <ol className="process-step-list">
            {stepResults.map((step, index) => {
              const key = `${step.command || 'step'}-${index}`;
              return (
                <li key={key} className="process-step-item">
                  <div className="process-row">
                    <span>{`Step ${index + 1}`}</span>
                    <span>{formatStepStatus(step)}</span>
                  </div>
                  <code className="command-line small">{formatStepCommand(step)}</code>
                  {step.reasoning && <p className="note">{step.reasoning}</p>}
                  {step.status === 'skipped' && step.skipReason && (
                    <p className="note">Skipped because {describeSkipReason(step.skipReason)}</p>
                  )}
                  {step.status === 'executed' && (
                    <>
                      <details className="log-block">
                        <summary>Standard Output</summary>
                        <pre>{step.stdout || '(empty)'}</pre>
                      </details>
                      <details className="log-block">
                        <summary>Standard Error</summary>
                        <pre className={step.stderr ? 'log-error' : ''}>{step.stderr || '(empty)'}</pre>
                      </details>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
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
          <code className="command-line small">
            {buildPlanSummary(item.plan ?? item.rawPlan) || '(no plan)'}
          </code>
        </li>
      ))}
    </ul>
  );
}

/**
 * @param {ClientCommandPlan|any} plan
 * @returns {string}
 */
function buildPlanSummary(plan) {
  const normalized = normalizePlan(plan);
  if (!normalized || !normalized.steps.length) {
    return '';
  }

  return normalized.steps
    .map((step, index) => `${index + 1}) ${formatStepCommand(step)}`)
    .join('; ');
}

/**
 * @param {ClientCommandPlan|any} plan
 * @returns {ClientCommandPlan|null}
 */
function normalizePlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return null;
  }

  if (Array.isArray(plan.steps)) {
    return {
      steps: plan.steps.map((step) => normalizePlanStep(step)),
      overview: typeof plan.overview === 'string' ? plan.overview : '',
      followUp: typeof plan.followUp === 'string' ? plan.followUp : ''
    };
  }

  if (typeof plan.command === 'string') {
    const legacyStep = normalizePlanStep(plan);
    return {
      steps: [legacyStep],
      overview: typeof plan.reasoning === 'string' ? plan.reasoning : '',
      followUp: typeof plan.followUp === 'string' ? plan.followUp : ''
    };
  }

  return null;
}

/**
 * @param {any} step
 * @returns {ClientCommandStep}
 */
function normalizePlanStep(step) {
  const command = typeof step?.command === 'string' ? step.command : '';
  const args = Array.isArray(step?.arguments) ? step.arguments.filter((arg) => typeof arg === 'string') : [];
  const outputs = Array.isArray(step?.outputs)
    ? step.outputs
        .map((output) => ({
          path: typeof output?.path === 'string' ? output.path : '',
          description: typeof output?.description === 'string' ? output.description : ''
        }))
        .filter((output) => output.path)
    : [];

  const id = typeof step?.id === 'string' && step.id.trim() ? step.id.trim() : undefined;
  const title = typeof step?.title === 'string' && step.title.trim() ? step.title.trim() : undefined;
  const note = typeof step?.note === 'string' && step.note.trim() ? step.note.trim() : undefined;

  return {
    command,
    arguments: args,
    reasoning: typeof step?.reasoning === 'string' ? step.reasoning : '',
    outputs,
    id,
    title,
    note
  };
}

/**
 * @param {{command?: string, arguments?: string[]}} step
 * @returns {string}
 */
function formatStepCommand(step) {
  if (!step?.command) {
    return '';
  }
  const args = Array.isArray(step.arguments) ? step.arguments.map(quoteArgument).join(' ') : '';
  return `${step.command} ${args}`.trim();
}

/**
 * @param {ClientCommandStepResult} step
 * @returns {string}
 */
function formatStepStatus(step) {
  if (!step || !step.status) {
    return 'Unknown';
  }

  if (step.status === 'executed') {
    const parts = [];
    if (step.exitCode !== null && step.exitCode !== undefined) {
      parts.push(`exit ${step.exitCode}`);
    }
    if (step.timedOut) {
      parts.push('timed out');
    }
    return parts.length ? `Executed (${parts.join(', ')})` : 'Executed';
  }

  if (step.status === 'skipped') {
    return 'Skipped';
  }

  return step.status;
}

/**
 * @param {string} reason
 * @returns {string}
 */
function describeSkipReason(reason) {
  switch (reason) {
    case 'dry_run':
      return 'dry run mode is enabled.';
    case 'previous_step_failed':
      return 'a previous step failed.';
    case 'no_op_command':
      return 'the command was set to "none".';
    default:
      return reason ? reason.replace(/_/g, ' ') : 'no additional details were provided.';
  }
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
