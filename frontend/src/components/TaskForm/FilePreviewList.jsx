import { useEffect, useMemo, useState } from 'react';
import { extractFileExtension, formatFileSize } from '../../utils/formatters.js';

export default function FilePreviewList({ files, onClear, disabled }) {
  const totalSize = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files]
  );
  const [previewItems, setPreviewItems] = useState([]);

  useEffect(() => {
    const canUseObjectURL =
      typeof globalThis !== 'undefined' &&
      typeof globalThis.URL !== 'undefined' &&
      typeof globalThis.URL.createObjectURL === 'function';
    const canRevoke =
      typeof globalThis !== 'undefined' &&
      typeof globalThis.URL !== 'undefined' &&
      typeof globalThis.URL.revokeObjectURL === 'function';

    if (!files.length) {
      setPreviewItems([]);
      return undefined;
    }

    const nextItems = files.map((file) => {
      const key = `${file.name}-${file.size}-${file.lastModified ?? ''}`;
      const isImage = typeof file.type === 'string' ? file.type.startsWith('image/') : false;
      const previewUrl = canUseObjectURL && isImage ? globalThis.URL.createObjectURL(file) : null;
      const extension = (extractFileExtension(file.name) || '').toUpperCase();
      return {
        key,
        file,
        previewUrl,
        fallbackLabel: extension || (file.type ? file.type.split('/')[0].toUpperCase() : 'FILE')
      };
    });

    setPreviewItems(nextItems);

    return () => {
      if (!canRevoke) {
        return;
      }
      nextItems.forEach((item) => {
        if (item.previewUrl) {
          globalThis.URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, [files]);

  if (!files.length) {
    return null;
  }

  return (
    <div className="file-preview">
      <div className="file-preview-header">
        <strong>選択したファイル（{files.length}）</strong>
        <span>{formatFileSize(totalSize)}</span>
        <button type="button" onClick={onClear} disabled={disabled}>
          クリア
        </button>
      </div>
      <ul>
        {previewItems.map(({ key, file, previewUrl, fallbackLabel }) => (
          <li key={key}>
            <div className="file-preview-thumb">
              {previewUrl ? (
                <img src={previewUrl} alt={`${file.name}のプレビュー`} />
              ) : (
                <span>{fallbackLabel}</span>
              )}
            </div>
            <div className="file-preview-info">
              <span className="file-preview-name" title={file.name}>
                {file.name}
              </span>
              <span className="file-preview-size">{formatFileSize(file.size)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
