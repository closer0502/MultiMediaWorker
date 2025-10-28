import { deriveDownloadName, determinePreviewType, formatFileSize, resolvePublicHref } from '../../utils/formatters.js';

export default function OutputList({ outputs, showPreview = true }) {
  if (!outputs.length) {
    return <p>生成ファイルはありません。</p>;
  }

  return (
    <ul className="output-list">
      {outputs.map((item) => {
        const href = showPreview ? resolvePublicHref(item.publicPath) : '';
        const downloadName = showPreview ? deriveDownloadName(item) : undefined;
        const previewElement =
          showPreview && href && item.exists
            ? renderOutputPreview(href, { filename: downloadName, description: item.description })
            : null;
        return (
          <li key={item.path}>
            <div className="output-path">
              <strong>{item.description || '出力'}</strong>
              <span>{item.absolutePath || item.path}</span>
            </div>
            <div className="output-meta">
              <span>{item.exists ? '存在' : '未作成'}</span>
              {item.size != null && <span>{formatFileSize(item.size)}</span>}
              {showPreview && href && (
                <a className="button-link" href={href} download={downloadName} rel="noreferrer">
                  ダウンロード
                </a>
              )}
            </div>
            {showPreview && previewElement && <div className="output-preview">{previewElement}</div>}
          </li>
        );
      })}
    </ul>
  );
}

function renderOutputPreview(href, { filename, description }) {
  const previewType = determinePreviewType(filename);
  if (previewType === 'image') {
    return <img src={href} alt={description || filename || '生成物プレビュー'} className="output-preview-media" />;
  }
  if (previewType === 'audio') {
    return <audio controls preload="metadata" src={href} className="output-preview-media" />;
  }
  if (previewType === 'video') {
    return <video controls preload="metadata" src={href} className="output-preview-media" />;
  }
  return null;
}
