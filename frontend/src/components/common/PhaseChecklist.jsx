import {
  formatDateTime,
  formatPhaseMetaKey,
  formatPhaseMetaValue,
  statusLabel
} from '../../utils/formatters.js';

export default function PhaseChecklist({ phases }) {
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
