import { useCallback, useEffect, useMemo, useState } from 'react';
import { extractFileExtension, formatFileSize } from '../../utils/formatters.js';

export default function FilePreviewList({ files, onClear, onAdd, disabled }) {
  const totalSize = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files]
  );
  const [previewItems, setPreviewItems] = useState([]);
  const hasFiles = files.length > 0;

  const handleAddClick = useCallback(() => {
    if (disabled) {
      return;
    }
    if (typeof onAdd === 'function') {
      onAdd();
    }
  }, [disabled, onAdd]);

  const handleClearClick = useCallback(() => {
    if (disabled || !hasFiles) {
      return;
    }
    if (typeof onClear === 'function') {
      onClear();
    }
  }, [disabled, hasFiles, onClear]);

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

  return (
    <div className={`file-preview ${hasFiles ? 'has-files' : 'is-empty'}`}>
      <div className="file-preview-header">
        <div className="file-preview-header-info">
          <strong>選択したファイル（{files.length}）</strong>
          {hasFiles && <span className="file-preview-total-size">{formatFileSize(totalSize)}</span>}
        </div>
        <button type="button" onClick={handleClearClick} disabled={disabled || !hasFiles}>
          クリア
        </button>
      </div>
      {hasFiles ? (
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
      ) : (
        <p className="file-preview-empty">ファイルが選択されていません</p>
      )}
      <div className="file-preview-footer">
        <button
          type="button"
          className="file-input-trigger file-preview-add-button"
          onClick={handleAddClick}
          disabled={disabled}
        >
          ファイルの追加
        </button>
      </div>
    </div>
  );
}
