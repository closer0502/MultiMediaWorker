import './styles.css';

import LatestOutputsPanel from './components/LatestOutputsPanel.jsx';
import HistoryList from './components/common/HistoryList.jsx';
import ProgressModal from './components/ProgressModal.jsx';
import ResultView from './components/result/ResultView.jsx';
import TaskForm from './components/TaskForm/TaskForm.jsx';
import { useTaskWorkflow } from './hooks/useTaskWorkflow.js';

export default function App() {
  const {
    task,
    setTask,
    selectedFiles,
    handleFilesSelected,
    handleClearFiles,
    fileInputRef,
    isSubmitting,
    error,
    history,
    debugEnabled,
    setDebugEnabled,
    showDebugOptions,
    setShowDebugOptions,
    dryRun,
    setDryRun,
    progressStage,
    progressPercent,
    handleSubmit,
    resetForm,
    latestEntry,
    latestOutputs,
    complaintText,
    complaintError,
    complaintButtonDisabled,
    complaintHelperMessage,
    canSubmitRevision,
    isSubmittingComplaint,
    handleComplaintSubmit,
    handleComplaintChange,
    liveLogs
  } = useTaskWorkflow();

  return (
    <div className="app">
      <header className="header">
        <h1>MultiMedia Worker</h1>
        <p>自然言語で指示すると、実行可能な ffmpeg / ImageMagick / ExifTool / yt-dlp コマンドを生成します。</p>
      </header>

      <main className="content">
        <div className="task-progress-layout">
          <TaskForm
            task={task}
            onTaskChange={setTask}
            isSubmitting={isSubmitting}
            fileInputRef={fileInputRef}
            onSubmit={handleSubmit}
            selectedFiles={selectedFiles}
            onFilesSelected={handleFilesSelected}
            onClearFiles={handleClearFiles}
            showDebugOptions={showDebugOptions}
            onToggleDebugOptions={setShowDebugOptions}
            dryRun={dryRun}
            onDryRunChange={setDryRun}
            debugEnabled={debugEnabled}
            onDebugChange={setDebugEnabled}
            onReset={resetForm}
            error={error}
          />
        </div>

        <LatestOutputsPanel
          isSubmitting={isSubmitting}
          outputs={latestOutputs}
          complaintText={complaintText}
          complaintError={complaintError}
          helperMessage={complaintHelperMessage}
          onComplaintChange={handleComplaintChange}
          onComplaintSubmit={handleComplaintSubmit}
          complaintButtonDisabled={complaintButtonDisabled}
          isSubmittingComplaint={isSubmittingComplaint}
          canSubmitRevision={canSubmitRevision}
        />

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

      {isSubmitting && <ProgressModal stage={progressStage} percent={progressPercent} logs={liveLogs} />}
    </div>
  );
}
