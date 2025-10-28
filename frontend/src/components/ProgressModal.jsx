import { PROGRESS_STEPS } from '../constants/app.js';

export default function ProgressModal({ stage, percent }) {
  return (
    <div className="progress-modal" role="dialog" aria-modal="true" aria-labelledby="progress-modal-title">
      <div className="progress-modal-backdrop" />
      <div className="progress-modal-dialog">
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
      </div>
    </div>
  );
}
