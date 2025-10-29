import { useEffect, useMemo, useRef } from 'react';
import { PROGRESS_STEPS } from '../constants/app.js';

export default function ProgressModal({ stage, percent, logs = [] }) {
  const logViewerRef = useRef(null);
  const displayText = useMemo(() => {
    if (!Array.isArray(logs) || logs.length === 0) {
      return '出力はまだありません。';
    }
    return logs.join('\n');
  }, [logs]);

  useEffect(() => {
    if (logViewerRef.current) {
      logViewerRef.current.scrollTop = logViewerRef.current.scrollHeight;
    }
  }, [displayText]);

  return (
    <div className="progress-modal" role="dialog" aria-modal="true" aria-labelledby="progress-modal-title">
      <div className="progress-modal-backdrop" />
      <div className="progress-modal-dialog">
        <div className="progress-modal-layout">
          <section className="panel progress-panel">
            <h2 id="progress-modal-title">ただいま処理しています</h2>
            <p className="progress-lead">仕上がりまで少々お待ちください。</p>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
            </div>
            <ul className="progress-steps">
              {PROGRESS_STEPS.map((step, index) => {
                let statusClass = '';
                if (index === stage) {
                  statusClass = 'is-active';
                } else if (index < stage) {
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
          <section className="panel progress-log-panel" aria-label="実行内容">
            <h3 className="progress-log-title">実行内容</h3>
            <pre ref={logViewerRef} className="progress-log-viewer" aria-live="polite">{displayText}</pre>
          </section>
        </div>
      </div>
    </div>
  );
}
