export default function StepStatusBadge({ result }) {
  if (!result) {
    return null;
  }

  const statusLabel = result.status === 'executed' ? '実行済み' : 'スキップ';
  const extras = [];
  if (result.status === 'executed') {
    if (result.exitCode !== null && result.exitCode !== undefined) {
      extras.push(`終了コード ${result.exitCode}`);
    }
    if (result.timedOut) {
      extras.push('タイムアウト');
    }
  }

  const text = extras.length ? `${statusLabel} (${extras.join(', ')})` : statusLabel;
  return <span className={`chip step-status-${result.status}`}>{text}</span>;
}
