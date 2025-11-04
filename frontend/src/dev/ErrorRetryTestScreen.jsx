import { useMemo, useRef, useState } from 'react';
import TaskForm from '../components/TaskForm/TaskForm.jsx';
import LatestOutputsPanel from '../components/LatestOutputsPanel.jsx';
import { buildErrorRetryTask } from '../hooks/useTaskWorkflow.js';
import { MESSAGES } from '../i18n/messages.js';

const ORIGINAL_TASK_DEFAULT = 'sample.png を 256x256 にリサイズし、WebP に変換してください。';
const FAILURE_DETAIL_DEFAULT = 'Command "magick" exited with code 1.';
const STDERR_DETAIL_DEFAULT =
  `magick: unable to open image 'sample.png': No such file or directory @ error/blob.c/OpenBlob/3562\n` +
  "magick: no images found 'sample.png' @ error/convert.c/ConvertImageCommand/3322";
const AGGREGATED_STDERR_DEFAULT =
  `convert-im6.q16: not authorized \`sample.png' @ error/constitute.c/ReadImage/412.\n` +
  'convert-im6.q16: no images defined `output.webp\' @ error/convert.c/ConvertImageCommand/3250.';
const RESPONSE_TEXT_DEFAULT = [
  '1. 画像をリサイズしようとしましたが、入力ファイルが見つかりませんでした。',
  '2. ローカルにファイルを配置するか、パスを正しく指定してください。'
].join('\n');

/**
 * 開発用: エラー再編集プロンプトの生成結果を視覚的に確認するためのテスト画面。
 */
export default function ErrorRetryTestScreen() {
  const fileInputRef = useRef(null);

  const [originalTask, setOriginalTask] = useState(ORIGINAL_TASK_DEFAULT);
  const [failureDetail, setFailureDetail] = useState(FAILURE_DETAIL_DEFAULT);
  const [stepStderr, setStepStderr] = useState(STDERR_DETAIL_DEFAULT);
  const [aggregatedStderr, setAggregatedStderr] = useState(AGGREGATED_STDERR_DEFAULT);
  const [responseText, setResponseText] = useState(RESPONSE_TEXT_DEFAULT);

  const [taskValue, setTaskValue] = useState(ORIGINAL_TASK_DEFAULT);
  const [showErrorBanner, setShowErrorBanner] = useState(true);
  const [latestPrompt, setLatestPrompt] = useState('');

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [showDebugOptions, setShowDebugOptions] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [lastSubmittedTask, setLastSubmittedTask] = useState('');
  const [failureIteration, setFailureIteration] = useState(1);

  const appendAttemptNote = (text, label) => {
    if (failureIteration <= 1) {
      return text;
    }
    const base = typeof text === 'string' ? text : '';
    const note = `[試行${failureIteration}回目] ${label}`;
    if (!base) {
      return note;
    }
    return base.includes(note) ? base : `${base}\n${note}`;
  };

  const contextualFailureDetail = appendAttemptNote(failureDetail, '最新の失敗メッセージ');
  const contextualStepStderr = appendAttemptNote(stepStderr, 'コマンド stderr 抜粋');
  const contextualAggregatedStderr = appendAttemptNote(aggregatedStderr, '集約 stderr');
  const contextualResponseText = appendAttemptNote(responseText, 'AI からの応答要約');

  const failureContext = useMemo(
    () => ({
      message: contextualFailureDetail,
      payload: {
        detail: contextualFailureDetail,
        responseText: contextualResponseText,
        phases: [
          { id: 'plan', status: 'success', title: 'Plan' },
          { id: 'execute', status: 'failed', title: 'Execute' }
        ],
        plan: {
          steps: [
            {
              command: 'magick',
              arguments: ['convert', 'sample.png', '-resize', '256x256', 'output.webp']
            }
          ]
        },
        rawPlan: {
          steps: [
            {
              command: 'magick',
              arguments: ['convert', 'sample.png', '-resize', '256x256', 'output.webp']
            }
          ]
        },
        result: {
          exitCode: 1,
          timedOut: false,
          stdout: '',
          stderr: contextualAggregatedStderr,
          resolvedOutputs: [],
          dryRun: false,
          steps: [
            {
              status: 'executed',
              command: 'magick',
              arguments: ['convert', 'sample.png', '-resize', '256x256', 'output.webp'],
              exitCode: 1,
              timedOut: false,
              stdout: '',
              stderr: contextualStepStderr
            }
          ]
        }
      }
    }),
    [contextualAggregatedStderr, contextualFailureDetail, contextualResponseText, contextualStepStderr]
  );

  const helperMessages = MESSAGES.workflow.helper;

  const handleRetryFromError = () => {
    const baseTask = lastSubmittedTask || taskValue || originalTask;
    const prompt = buildErrorRetryTask(baseTask, failureContext);
    setTaskValue(prompt);
    setLatestPrompt(prompt);
    setShowErrorBanner(true);
  };

  const handleResetScenario = () => {
    setOriginalTask(ORIGINAL_TASK_DEFAULT);
    setFailureDetail(FAILURE_DETAIL_DEFAULT);
    setStepStderr(STDERR_DETAIL_DEFAULT);
    setAggregatedStderr(AGGREGATED_STDERR_DEFAULT);
    setResponseText(RESPONSE_TEXT_DEFAULT);
    setTaskValue(ORIGINAL_TASK_DEFAULT);
    setLatestPrompt('');
    setShowErrorBanner(true);
    setSelectedFiles([]);
    setLastSubmittedTask('');
    setFailureIteration(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTaskChange = (value) => {
    setTaskValue(value);
  };

  const handleFilesSelected = (files) => {
    setSelectedFiles(files);
  };

  const handleClearFiles = () => {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmitTaskForm = (event) => {
    event.preventDefault();
    setLastSubmittedTask(taskValue);
    setFailureIteration((previous) => previous + 1);
    setLatestPrompt('');
    setShowErrorBanner(true);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>エラー再編集テスト</h1>
        <p>
          クエリパラメータ <code>?error-retry-test</code> で表示される開発者向け画面です。
          下記フォームとエラーバナーを使って、再編集用に生成されるプロンプトを確認できます。
        </p>
      </header>

      <main className="content">
        <div className="panel" style={{ marginBottom: '1.5rem' }}>
          <h2>ダミーデータ設定</h2>
          <p className="note">
            各項目を編集すると次回「エラーから再編集」を押した際に反映されます。
          </p>
          <p className="note">現在の失敗回数: {failureIteration} 回</p>
          <label className="field">
            <span>元のタスク入力</span>
            <textarea
              value={originalTask}
              onChange={(event) => {
                const nextValue = event.target.value;
                setOriginalTask(nextValue);
                if (!latestPrompt) {
                  setTaskValue(nextValue);
                }
                if (!lastSubmittedTask) {
                  setLastSubmittedTask(nextValue);
                }
              }}
              rows={3}
            />
          </label>

          <label className="field">
            <span>失敗時のメッセージ</span>
            <textarea
              value={failureDetail}
              onChange={(event) => setFailureDetail(event.target.value)}
              rows={3}
            />
          </label>

          <label className="field">
            <span>失敗ステップの stderr 抜粋</span>
            <textarea
              value={stepStderr}
              onChange={(event) => setStepStderr(event.target.value)}
              rows={4}
            />
          </label>

          <label className="field">
            <span>集約 stderr</span>
            <textarea
              value={aggregatedStderr}
              onChange={(event) => setAggregatedStderr(event.target.value)}
              rows={4}
            />
          </label>

          <label className="field">
            <span>AI の返答ダミー</span>
            <textarea
              value={responseText}
              onChange={(event) => setResponseText(event.target.value)}
              rows={4}
            />
          </label>

          <div className="form-actions">
            <button type="button" onClick={handleResetScenario}>
              入力と状態をリセット
            </button>
          </div>
        </div>

        <div className="task-progress-layout">
          <TaskForm
            task={taskValue}
            onTaskChange={handleTaskChange}
            isSubmitting={false}
            fileInputRef={fileInputRef}
            onSubmit={handleSubmitTaskForm}
            selectedFiles={selectedFiles}
            onFilesSelected={handleFilesSelected}
            onClearFiles={handleClearFiles}
            showDebugOptions={showDebugOptions}
            onToggleDebugOptions={setShowDebugOptions}
            dryRun={dryRun}
            onDryRunChange={setDryRun}
            debugEnabled={debugEnabled}
            onDebugChange={setDebugEnabled}
            onReset={handleResetScenario}
            error=""
          />

          <LatestOutputsPanel
            isSubmitting={false}
            outputs={[]}
            showErrorBanner={showErrorBanner}
            errorMessage={contextualFailureDetail}
            onRetryFromError={handleRetryFromError}
            complaintText=""
            complaintError=""
            helperMessage={helperMessages.withoutOutputs}
            onComplaintChange={() => {}}
            onComplaintSubmit={() => {}}
            complaintButtonDisabled
            isSubmittingComplaint={false}
            canSubmitRevision={false}
          />
        </div>

        <section className="panel">
          <h2>生成された再編集用プロンプト</h2>
          <p className="note">
            実際のワークフローではこの内容がタスク入力欄に設定され、即座に送信されます。
          </p>
          <textarea value={latestPrompt || taskValue} readOnly rows={16} style={{ width: '100%' }} />
        </section>
      </main>
    </div>
  );
}
