import StepStatusBadge from './StepStatusBadge.jsx';
import { describeSkipReason, formatStepCommand } from '../../utils/plan.js';

export default function PlanStepList({ steps, results }) {
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
