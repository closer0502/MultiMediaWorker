import { STATUS_LABELS } from '../../constants/app.js';
import { buildPlanSummary } from '../../utils/plan.js';

export default function HistoryList({ entries }) {
  if (!entries.length) {
    return <p>過去の実行はありません。</p>;
  }
  return (
    <ul className="history-list">
      {entries.map((item) => (
        <li key={item.id}>
          <div className="history-row">
            <span className={`status-chip status-${item.status}`}>{STATUS_LABELS[item.status] || item.status}</span>
            {item.parentSessionId && <span className="chip">再編集</span>}
            <span>{new Date(item.submittedAt).toLocaleString()}</span>
          </div>
          <p className="history-task">{item.task}</p>
          {item.complaint && <p className="history-complaint">クレーム内容: {item.complaint}</p>}
          <code className="command-line small">{buildPlanSummary(item.plan ?? item.rawPlan) || '（プランなし）'}</code>
        </li>
      ))}
    </ul>
  );
}
