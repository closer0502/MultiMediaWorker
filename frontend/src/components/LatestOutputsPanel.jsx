import OutputList from './common/OutputList.jsx';

export default function LatestOutputsPanel({
  isSubmitting,
  outputs,
  showErrorBanner,
  errorMessage,
  onRetryFromError,
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
      <h2>������</h2>
      {showErrorBanner && (
        <div className="error-banner">
          <div className="error-banner__content">
            <p className="error-banner__title">プラン実行でエラーが発生しました。</p>
            {errorMessage && <p className="error-banner__message">{errorMessage}</p>}
            <button
              type="button"
              onClick={onRetryFromError}
              disabled={isSubmitting}
              className="error-banner__action"
            >
              エラーから再編集
            </button>
          </div>
        </div>
      )}
      {isSubmitting ? (
        <p className="note">�ŐV�̐������ʂ��������悱���ɕ\������܂��B</p>
      ) : outputs.length > 0 ? (
        <OutputList outputs={outputs} />
      ) : (
        <p className="note">�܂��\���ł��鐶����������܂���B</p>
      )}
      <div className="complaint-section">
        <h3>�C�����N�G�X�g</h3>
        <p className="complaint-hint">{helperMessage}</p>
        <textarea
          value={complaintText}
          onChange={(event) => onComplaintChange(event.target.value)}
          placeholder="��: �o�͂��ꂽ���悪�w����Â��̂Ŗ��邳�𒲐����Ă��������B"
          rows={4}
          disabled={isSubmittingComplaint || isSubmitting || !canSubmitRevision}
        />
        <div className="complaint-actions">
          <button type="button" onClick={onComplaintSubmit} disabled={complaintButtonDisabled}>
            {isSubmittingComplaint ? '���M��...' : '�ĕҏW���˗�'}
          </button>
          <span className="complaint-hint">�ŐV�̐����������ƂɍĕҏW���˗����܂��B</span>
        </div>
        {complaintError && <div className="error">{complaintError}</div>}
      </div>
    </section>
  );
}
