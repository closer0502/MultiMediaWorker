import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';

import {
  TOOL_DEFINITIONS,
  createOpenAIClient,
  runAgentTask
} from '../OpenaiAgent.js';

const PORT = Number(process.env.PORT || 3001);
const ROOT_DIR = process.cwd();
const PUBLIC_ROOT = path.join(ROOT_DIR, 'public');
const GENERATED_ROOT = path.join(PUBLIC_ROOT, 'generated');
const STORAGE_ROOT = path.join(ROOT_DIR, 'storage');
const SESSION_INPUT_ROOT = path.join(STORAGE_ROOT, 'inputs');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/files', express.static(PUBLIC_ROOT, { extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'mov'] }));

/**
 * Ensure base directories exist on startup.
 */
await ensureDir(PUBLIC_ROOT);
await ensureDir(GENERATED_ROOT);
await ensureDir(STORAGE_ROOT);
await ensureDir(SESSION_INPUT_ROOT);

/**
 * Multer storage that relies on session information added by prepareSession middleware.
 */
const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, callback) {
      const session = req.agentSession;
      if (!session) {
        callback(new Error('セッションが初期化されていません。'), '');
        return;
      }
      callback(null, session.inputDir);
    },
    filename(req, file, callback) {
      callback(null, createSafeFileName(file.originalname));
    }
  })
});

app.get('/api/tools', (req, res) => {
  res.json({
    tools: Object.entries(TOOL_DEFINITIONS)
      .filter(([key]) => key !== 'none')
      .map(([key, value]) => ({
        id: key,
        title: value.title,
        description: value.description
      }))
  });
});

app.post(
  '/api/tasks',
  prepareSession,
  upload.array('files'),
  async (req, res) => {
    try {
      const task = (req.body?.task || '').trim();
      if (!task) {
        res.status(400).json({ error: 'task フィールドは必須です。' });
        return;
      }

      const session = req.agentSession;
      if (!session) {
        res.status(500).json({ error: 'セッションが初期化されませんでした。' });
        return;
      }

      const client = createOpenAIClient();
      const files = Array.isArray(req.files)
        ? req.files.map((file, index) => ({
            id: `${session.id}-file-${index}`,
            originalName: file.originalname,
            absolutePath: path.resolve(file.path),
            size: file.size,
            mimeType: file.mimetype
          }))
        : [];

      const agentRequest = {
        task,
        files,
        outputDir: session.outputDir
      };

      const { plan, result } = await runAgentTask(client, agentRequest, {
        cwd: session.inputDir,
        publicRoot: PUBLIC_ROOT
      });

      res.json({
        sessionId: session.id,
        task,
        plan,
        result,
        uploadedFiles: files
      });
    } catch (error) {
      res.status(500).json({
        error: 'コマンド生成に失敗しました。',
        detail: error.message
      });
    }
  }
);

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({
    error: 'サーバーエラーが発生しました。',
    detail: err.message
  });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Agent server listening on http://localhost:${PORT}`);
});

/**
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Next handler.
 * @returns {Promise<void>}
 */
async function prepareSession(req, res, next) {
  try {
    const sessionId = createSessionId();
    const inputDir = path.join(SESSION_INPUT_ROOT, sessionId);
    const outputDir = path.join(GENERATED_ROOT, sessionId);

    await ensureDir(inputDir);
    await ensureDir(outputDir);

    req.agentSession = {
      id: sessionId,
      inputDir,
      outputDir
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * @param {string} name - Original filename.
 * @returns {string} Sanitized filename.
 */
function createSafeFileName(name) {
  const baseName = path.basename(name);
  const sanitized = baseName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  if (!sanitized || sanitized.startsWith('.')) {
    const timestamp = Date.now();
    return `file_${timestamp}`;
  }
  return sanitized.slice(0, 200);
}

/**
 * @returns {string} Session identifier.
 */
function createSessionId() {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `session-${Date.now()}-${randomPart}`;
}

/**
 * @param {string} dir - Directory path.
 * @returns {Promise<void>}
 */
async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}
