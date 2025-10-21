export const DEFAULT_TOOL_DEFINITIONS = {
  ffmpeg: {
    title: 'FFmpeg',
    description: '動画・音声の変換や画像シーケンス処理に使用します。'
  },
  magick: {
    title: 'ImageMagick',
    description: '画像の変換・リサイズ・合成処理に使用します。'
  },
  exiftool: {
    title: 'ExifTool',
    description: 'メタデータの読み取り・編集に使用します。'
  },
  none: {
    title: '実行しない',
    description: '利用可能なツールで対応できない場合に選択します。'
  }
};

export const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5-nano';
