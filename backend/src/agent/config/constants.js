export const DEFAULT_TOOL_DEFINITIONS = {
  ffmpeg: {
    title: 'FFmpeg',
    description: 'Use for video/audio transcoding and image sequence tasks.'
  },
  magick: {
    title: 'ImageMagick',
    description: 'Use for image conversion, resizing, and compositing workflows.'
  },
  exiftool: {
    title: 'ExifTool',
    description: 'Use for reading or editing media metadata.'
  },
  none: {
    title: 'No command',
    description: 'Select when the task cannot be solved with the available tools.'
  }
};

export const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5';
