import StepStatusBadge from './StepStatusBadge.jsx';
import { describeSkipReason, formatStepCommand } from '../../utils/plan.js';
import { MESSAGES } from '../../i18n/messages.js';

export default function PlanStepList({ steps, results }) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return null;
  }

  const planMessages = MESSAGES.plan;

  return (
    <ol className="plan-step-list">
      {steps.map((step, index) => {
        const stepResult = Array.isArray(results) ? results[index] : undefined;
        const title = step.title || planMessages.stepLabel(index);
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
            {Array.isArray(step.outputs) && step.outputs.length > 0 && (
              <ul className="plan-step-outputs">
                {step.outputs.map((output, outputIndex) => {
                  const outputKey = output.path || `${outputIndex}-${output.description || 'output'}`;
                  return (
                    <li key={outputKey}>
                      <span>{output.description || planMessages.outputFallback}:</span>{' '}
                      <span>{output.path}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {stepResult?.status === 'skipped' && (
              <p className="note">
                {planMessages.skipReasonPrefix}
                {describeSkipReason(stepResult.skipReason)}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
