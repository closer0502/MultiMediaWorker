import { useCallback, useEffect, useMemo, useState } from 'react';
import './styles.css';

const INITIAL_HISTORY = [];

const STATUS_LABELS = {
  success: '成功',
  failed: '失敗'
};

const PROGRESS_STEPS = [
  {
    title: 'ご依頼を確認しています',
    description: '入力いただいた内容を丁寧に読み取っています。'
  },
  {
    title: '手順を準備しています',
    description: '最適な進め方をAIが組み立てています。'
  },
  {
    title: 'ツールを動かしています',
    description: '必要なコマンドを実行し、処理を進めています。'
  },
  {
    title: '仕上がりを整えています',
    description: '結果をまとめてお届けできる形にしています。'
  }
];

const PROGRESS_ROTATION_MS = 2400;

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
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [showDebugOptions, setShowDebugOptions] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [progressStage, setProgressStage] = useState(0);

  useEffect(() => {
    if (!isSubmitting) {
      setProgressStage(0);
      return;
    }
    setProgressStage(0);
    const timer = setInterval(() => {
      setProgressStage((prev) => {
        if (prev >= PROGRESS_STEPS.length - 1) {
          return prev;
        }
        return prev + 1;
      });
    }, PROGRESS_ROTATION_MS);
    return () => clearInterval(timer);
  }, [isSubmitting]);

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
        setError('タスク内容を入力してください。');
        return;
      }
      setIsSubmitting(true);
      setError('');

      const params = new URLSearchParams();
      if (debugEnabled) {
        params.append('debug', 'verbose');
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
          const message = payload?.error || '実行中に問題が発生しました。';
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
                  verbose: debugEnabled,
                  dryRun
                }
              },
              ...prev
            ]);
          }
          return;
        }

        if (!payload) {
          throw new Error('サーバーから空の応答が返されました。');
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
              verbose: debugEnabled,
              dryRun
            }
          },
          ...prev
        ]);

      } catch (submitError) {
        setError(submitError.message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [task, selectedFiles, debugEnabled, dryRun]
  );

  const latestEntry = isSubmitting ? null : (history[0] || null);
  const latestOutputsEntry = isSubmitting ? null : (history[0] || null);
  const latestOutputs = latestOutputsEntry?.result?.resolvedOutputs || [];
  const progressPercent = useMemo(() => {
    if (!isSubmitting) {
      return 0;
    }
    const currentStep = Math.min(progressStage + 1, PROGRESS_STEPS.length);
    return Math.min(100, Math.round((currentStep / PROGRESS_STEPS.length) * 100));
  }, [progressStage, isSubmitting]);

  return (
    <div className="app">
      <header className="header">
        <h1>MultiMedia Worker</h1>
        <p>自然言語で指示すると、実行可能な ffmpeg / ImageMagick / ExifTool コマンドを生成します。</p>
      </header>

      <main className="content">
        <div className="task-progress-layout">
          <section className="panel task-panel">
            <h2>タスクを送信</h2>
            <form className="task-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>目的 / 指示</span>
              <textarea
                value={task}
                placeholder='例: 「135329973_p1.png を 512x512 の PNG にリサイズ」'
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

            <div className={`field options debug-options ${showDebugOptions ? 'is-expanded' : 'is-collapsed'}`}>
              <label className="debug-options-header">
                <input
                  type="checkbox"
                  checked={showDebugOptions}
                  onChange={(event) => setShowDebugOptions(event.target.checked)}
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
                      onChange={(event) => setDryRun(event.target.checked)}
                      disabled={isSubmitting}
                    />
                    <span>ドライラン（コマンド実行をスキップ）</span>
                  </label>
                  <label className="option">
                    <input
                      type="checkbox"
                      checked={debugEnabled}
                      onChange={(event) => setDebugEnabled(event.target.checked)}
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
              <button type="button" onClick={resetForm} disabled={isSubmitting}>
                リセット
              </button>
            </div>
          </form>
          {error && <div className="error">{error}</div>}
          </section>

          {isSubmitting && (
            <section className="panel progress-panel">
              <h2>ただいま処理しています</h2>
              <p className="progress-lead">仕上がりまで少々お待ちください。</p>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
              </div>
              <ul className="progress-steps">
                {PROGRESS_STEPS.map((step, index) => {
                  let statusClass = '';
                  if (index === progressStage) {
                    statusClass = 'is-active';
                  } else if (index < progressStage) {
                    statusClass = 'is-complete';
                  }
                  return (
                    <li key={step.title} className={`progress-step ${statusClass}`}>
                      <span className="progress-step-index">{index + 1}</span>
                      <div className="progress-step-body">
                        <strong>{step.title}</strong>
                        <span>{step.description}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <section className="panel">
          <h2>生成物</h2>
          {isSubmitting ? (
            <p className="note">最新の生成結果が整い次第ここに表示されます。</p>
          ) : latestOutputs.length > 0 ? (
            <OutputList outputs={latestOutputs} />
          ) : (
            <p className="note">まだ表示できる生成物がありません。</p>
          )}
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
 * @param {{ entry: any }} props
 * @returns {JSX.Element}
 */
function ResultView({ entry }) {
  const outputList = entry?.result?.resolvedOutputs || [];
  const statusLabel = STATUS_LABELS[entry.status] || entry.status || '不明';
  const plan = normalizePlan(entry.plan ?? entry.rawPlan);
  const followUp = plan?.followUp || '';
  const overview = plan?.overview || '';
  const planSteps = plan?.steps || [];
  const stepResults = Array.isArray(entry?.result?.steps) ? entry.result.steps : [];

  return (
    <div className="result-view">
      <div className="result-header">
        <span className={`status-chip status-${entry.status}`}>{statusLabel}</span>
        {entry.requestOptions?.dryRun && <span className="chip">ドライラン</span>}
        {entry.requestOptions?.debug && <span className="chip">デバッグ</span>}
      </div>

      {entry.error && <div className="error inline">{entry.error}</div>}

      <div className="result-section">
        <h3>ワークフロー</h3>
        <PhaseChecklist phases={entry.phases} />
      </div>

      <div className="result-section">
        <h3>コマンドプラン</h3>
        {plan ? (
          <>
            <code className="command-line">{buildPlanSummary(plan)}</code>
            {overview && <p className="note">{overview}</p>}
            <PlanStepList steps={planSteps} results={stepResults} />
          </>
        ) : (
          <p>コマンドプランが利用できません。</p>
        )}
      </div>

      {followUp && (
        <div className="result-section">
          <h3>追加メモ</h3>
          <p>{followUp}</p>
        </div>
      )}

      {entry.rawPlan && (
        <div className="result-section">
          <h3>プランナー出力（生データ）</h3>
          <details className="debug-block">
            <summary>JSON を表示</summary>
            <pre>{JSON.stringify(entry.rawPlan, null, 2)}</pre>
          </details>
        </div>
      )}

      {entry.responseText && (
        <div className="result-section">
          <h3>生レスポンス</h3>
          <details className="debug-block">
            <summary>レスポンスを表示</summary>
            <pre>{entry.responseText}</pre>
          </details>
        </div>
      )}

      <div className="result-section">
        <h3>アップロードしたファイル</h3>
        <UploadedFileList files={entry.uploadedFiles} />
      </div>

      <div className="result-section">
        <h3>出力ファイル</h3>
        <OutputList outputs={outputList} showPreview={false} />
      </div>

      <div className="result-section">
        <h3>実行詳細</h3>
        <ProcessSummary result={entry.result} />
      </div>

      {entry.debug && (
        <div className="result-section">
          <h3>デバッグ情報</h3>
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
    return <p>フェーズ情報はありません。</p>;
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
                {phase.startedAt && <span>開始: {formatDateTime(phase.startedAt)}</span>}
                {phase.finishedAt && <span>終了: {formatDateTime(phase.finishedAt)}</span>}
              </div>
            )}
            {metaEntries.length > 0 && (
              <ul className="phase-meta">
                {metaEntries.map(([key, value]) => (
                  <li key={key}>
                    <strong>{formatPhaseMetaKey(key)}</strong>
                    <span>{formatPhaseMetaValue(value)}</span>
                  </li>
                ))}
              </ul>
            )}
            {phase.error && (
              <div className="phase-error">
                <strong>{phase.error.name || 'エラー'}:</strong> {phase.error.message}
              </div>
            )}
            {Array.isArray(phase.logs) && phase.logs.length > 0 && (
              <details className="log-block">
                <summary>ログ ({phase.logs.length})</summary>
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
        const title = step.title || `ステップ ${index + 1}`;
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
                    <span>{output.description || '出力'}:</span> <span>{output.path}</span>
                  </li>
                ))}
              </ul>
            )}
            {stepResult?.status === 'skipped' && stepResult.skipReason && (
              <p className="note">スキップ理由: {describeSkipReason(stepResult.skipReason)}</p>
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

  const statusLabel = result.status === 'executed' ? '実行済み' : 'スキップ';
  const extras = [];
  if (result.status === 'executed') {
    if (result.exitCode !== null && result.exitCode !== undefined) {
      extras.push(`終了コード ${result.exitCode}`);
    }
    if (result.timedOut) {
      extras.push('タイムアウト');
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
    return <p>アップロードされたファイルはありません。</p>;
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
 * @param {{ outputs: Array<any>, showPreview?: boolean }} props
 * @returns {JSX.Element}
 */
function OutputList({ outputs, showPreview = true }) {
  if (!outputs.length) {
    return <p>生成ファイルはありません。</p>;
  }
  return (
    <ul className="output-list">
      {outputs.map((item) => {
        const href = showPreview ? resolvePublicHref(item.publicPath) : '';
        const downloadName = showPreview ? deriveDownloadName(item) : undefined;
        const previewElement =
          showPreview && href && item.exists
            ? renderOutputPreview(href, { filename: downloadName, description: item.description })
            : null;
        return (
          <li key={item.path}>
            <div className="output-path">
              <strong>{item.description || 'ファイル'}</strong>
              <span>{item.absolutePath || item.path}</span>
            </div>
            <div className="output-meta">
              <span>{item.exists ? '存在' : '未作成'}</span>
              {item.size != null && <span>{formatFileSize(item.size)}</span>}
              {showPreview && href && (
                <a className="button-link" href={href} download={downloadName} rel="noreferrer">
                  ダウンロード
                </a>
              )}
            </div>
            {showPreview && previewElement && <div className="output-preview">{previewElement}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * @param {{ result: any }} props
 * @returns {JSX.Element}
 */
function ProcessSummary({ result }) {
  if (!result) {
    return <p>コマンドはまだ実行されていません。</p>;
  }

  const stepResults = Array.isArray(result.steps) ? result.steps : [];

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
      <div className="process-row">
        <span>ドライラン</span>
        <span>{result.dryRun ? 'はい' : 'いいえ'}</span>
      </div>
      {stepResults.length > 0 && (
        <div className="process-steps">
          <h4>ステップ別の詳細</h4>
          <ol className="process-step-list">
            {stepResults.map((step, index) => {
              const key = `${step.command || 'step'}-${index}`;
              return (
                <li key={key} className="process-step-item">
                  <div className="process-row">
                    <span>{`ステップ ${index + 1}`}</span>
                    <span>{formatStepStatus(step)}</span>
                  </div>
                  <code className="command-line small">{formatStepCommand(step)}</code>
                  {step.reasoning && <p className="note">{step.reasoning}</p>}
                  {step.status === 'skipped' && step.skipReason && (
                    <p className="note">スキップ理由: {describeSkipReason(step.skipReason)}</p>
                  )}
                  {step.status === 'executed' && (
                    <>
                      <details className="log-block">
                        <summary>標準出力</summary>
                        <pre>{step.stdout || '（空）'}</pre>
                      </details>
                      <details className="log-block">
                        <summary>標準エラー</summary>
                        <pre className={step.stderr ? 'log-error' : ''}>{step.stderr || '（空）'}</pre>
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
        <summary>標準出力</summary>
        <pre>{result.stdout || '（空）'}</pre>
      </details>
      <details className="log-block">
        <summary>標準エラー</summary>
        <pre className={result.stderr ? 'log-error' : ''}>{result.stderr || '（空）'}</pre>
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
    return <p>デバッグ情報は返されませんでした。</p>;
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
    return <p>過去の実行はありません。</p>;
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
            {buildPlanSummary(item.plan ?? item.rawPlan) || '（プランなし）'}
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
    .map((step, index) => `${index + 1}）${formatStepCommand(step)}`)
    .join(' / ');
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
    return '不明';
  }

  if (step.status === 'executed') {
    const parts = [];
    if (step.exitCode !== null && step.exitCode !== undefined) {
      parts.push(`終了コード ${step.exitCode}`);
    }
    if (step.timedOut) {
      parts.push('タイムアウト');
    }
    return parts.length ? `実行済み（${parts.join(' / ')}）` : '実行済み';
  }

  if (step.status === 'skipped') {
    return 'スキップ';
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
      return 'ドライランモードが有効です。';
    case 'previous_step_failed':
      return '前のステップが失敗しました。';
    case 'no_op_command':
      return 'コマンドが "none" に設定されています。';
    default:
      return reason ? reason.replace(/_/g, ' ') : '追加情報はありません。';
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
        <strong>選択したファイル（{files.length}）</strong>
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
    return '保留';
  }
  if (STATUS_LABELS[status]) {
    return STATUS_LABELS[status];
  }
  if (status === 'in_progress') {
    return '進行中';
  }
  if (status === 'pending') {
    return '保留';
  }
  return status;
}

function formatPhaseMetaKey(key) {
  const mapping = {
    taskPreview: 'タスク概要',
    fileCount: 'ファイル数',
    dryRun: 'ドライラン',
    debug: 'デバッグ',
    command: 'コマンド',
    commands: 'コマンド',
    timedOut: 'タイムアウト',
    exitCode: '終了コード',
    steps: 'ステップ数',
    outputs: '出力数'
  };
  return mapping[key] || key;
}

function formatPhaseMetaValue(value) {
  if (typeof value === 'boolean') {
    return value ? 'はい' : 'いいえ';
  }
  return String(value);
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

function deriveDownloadName(item) {
  if (!item) {
    return undefined;
  }
  const source = item.publicPath || item.absolutePath || item.path;
  if (!source) {
    return undefined;
  }
  const parts = String(source).replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : undefined;
}

function resolvePublicHref(publicPath) {
  if (!publicPath) {
    return '';
  }
  const normalized = String(publicPath).trim();
  if (!normalized) {
    return '';
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    return normalized;
  }
  const cleaned = normalized.replace(/\\/g, '/').replace(/^\.\//, '');
  if (cleaned.startsWith('/files/')) {
    return cleaned;
  }
  if (cleaned.startsWith('/')) {
    return cleaned;
  }
  if (cleaned.startsWith('files/')) {
    return `/${cleaned}`;
  }
  return `/files/${cleaned}`;
}

const IMAGE_PREVIEW_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff']);
const AUDIO_PREVIEW_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac']);
const VIDEO_PREVIEW_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'm4v', 'mkv']);

function renderOutputPreview(href, { filename, description }) {
  const previewType = determinePreviewType(filename);
  if (previewType === 'image') {
    return <img src={href} alt={description || filename || '生成物プレビュー'} className="output-preview-media" />;
  }
  if (previewType === 'audio') {
    return <audio controls preload="metadata" src={href} className="output-preview-media" />;
  }
  if (previewType === 'video') {
    return <video controls preload="metadata" src={href} className="output-preview-media" />;
  }
  return null;
}

function determinePreviewType(filename) {
  const extension = extractFileExtension(filename);
  if (!extension) {
    return null;
  }
  if (IMAGE_PREVIEW_EXTENSIONS.has(extension)) {
    return 'image';
  }
  if (AUDIO_PREVIEW_EXTENSIONS.has(extension)) {
    return 'audio';
  }
  if (VIDEO_PREVIEW_EXTENSIONS.has(extension)) {
    return 'video';
  }
  return null;
}

function extractFileExtension(filename) {
  if (!filename) {
    return '';
  }
  const withoutQuery = String(filename).split('?')[0].split('#')[0];
  const lastDot = withoutQuery.lastIndexOf('.');
  if (lastDot === -1) {
    return '';
  }
  return withoutQuery.slice(lastDot + 1).toLowerCase();
}
