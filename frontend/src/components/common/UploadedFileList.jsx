import { formatFileSize } from '../../utils/formatters.js';

export default function UploadedFileList({ files }) {
  if (!files || !files.length) {
    return <p>アップロードされたファイルはありません。</p>;
  }
  return (
    <ul className="uploaded-files">
      {files.map((file, index) => (
        <li key={file.id || `${file.originalName}-${index}`}>
          <span>{file.originalName || file.name}</span>
          {file.size != null && <span>{formatFileSize(file.size)}</span>}
        </li>
      ))}
    </ul>
  );
}
