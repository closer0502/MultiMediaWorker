import { describeSkipReason, formatStepCommand, formatStepStatus } from '../../utils/plan.js';

export default function ProcessSummary({ result }) {
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
          <h4>ステップ詳細</h4>
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
