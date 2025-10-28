import OutputList from './common/OutputList.jsx';

export default function LatestOutputsPanel({
  isSubmitting,
  outputs,
  complaintText,
  complaintError,
  helperMessage,
  onComplaintChange,
  onComplaintSubmit,
  complaintButtonDisabled,
  isSubmittingComplaint,
  canSubmitRevision
}) {
  return (
    <section className="panel">
      <h2>生成物</h2>
      {isSubmitting ? (
        <p className="note">最新の生成結果が整い次第ここに表示されます。</p>
      ) : outputs.length > 0 ? (
        <OutputList outputs={outputs} />
      ) : (
        <p className="note">まだ表示できる生成物がありません。</p>
      )}
      <div className="complaint-section">
        <h3>修正リクエスト</h3>
        <p className="complaint-hint">{helperMessage}</p>
        <textarea
          value={complaintText}
          onChange={(event) => onComplaintChange(event.target.value)}
          placeholder="例: 出力された動画が指定より暗いので明るさを調整してください。"
          rows={4}
          disabled={isSubmittingComplaint || isSubmitting || !canSubmitRevision}
        />
        <div className="complaint-actions">
          <button type="button" onClick={onComplaintSubmit} disabled={complaintButtonDisabled}>
            {isSubmittingComplaint ? '送信中...' : '再編集を依頼'}
          </button>
          <span className="complaint-hint">最新の生成物をもとに再編集を依頼します。</span>
        </div>
        {complaintError && <div className="error">{complaintError}</div>}
      </div>
    </section>
  );
}
