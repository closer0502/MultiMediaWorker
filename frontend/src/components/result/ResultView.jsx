import { STATUS_LABELS } from '../../constants/app.js';
import { buildPlanSummary, normalizePlan } from '../../utils/plan.js';
import DebugDetails from '../common/DebugDetails.jsx';
import OutputList from '../common/OutputList.jsx';
import PhaseChecklist from '../common/PhaseChecklist.jsx';
import PlanStepList from '../common/PlanStepList.jsx';
import ProcessSummary from '../common/ProcessSummary.jsx';
import UploadedFileList from '../common/UploadedFileList.jsx';

export default function ResultView({ entry }) {
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
        {entry.parentSessionId && <span className="chip">再編集</span>}
        {entry.requestOptions?.dryRun && <span className="chip">ドライラン</span>}
        {entry.requestOptions?.debug && <span className="chip">デバッグ</span>}
      </div>

      {entry.error && <div className="error inline">{entry.error}</div>}
      {entry.complaint && (
        <div className="result-section">
          <h3>ユーザーからのクレーム内容</h3>
          <p>{entry.complaint}</p>
        </div>
      )}

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
