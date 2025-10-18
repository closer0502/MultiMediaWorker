import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Express based API server that wires the media agent to HTTP endpoints.
 */
export class MediaAgentServer {
  /**
   * @param {{agent: import('../agent/MediaAgent.js').MediaAgent, toolRegistry: import('../agent/ToolRegistry.js').ToolRegistry, publicRoot: string, generatedRoot: string, storageRoot: string, sessionInputRoot: string}} options
   */
  constructor(options) {
    this.agent = options.agent;
    this.toolRegistry = options.toolRegistry;
    this.publicRoot = path.resolve(options.publicRoot);
    this.generatedRoot = path.resolve(options.generatedRoot);
    this.storageRoot = path.resolve(options.storageRoot);
    this.sessionInputRoot = path.resolve(options.sessionInputRoot);

    this.app = express();
    this.upload = this.createUploader();

    this.prepareSession = this.prepareSession.bind(this);
    this.handleTaskRequest = this.handleTaskRequest.bind(this);
    this.handleGetTools = this.handleGetTools.bind(this);
  }

  /**
   * @param {number} port
   * @returns {Promise<void>}
   */
  async start(port) {
    await this.ensureBaseDirectories();
    this.configureMiddleware();
    this.configureRoutes();
    await new Promise((resolve) => {
      this.serverInstance = this.app.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log(`Agent server listening on http://localhost:${port}`);
        resolve();
      });
    });
  }

  /**
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.serverInstance) {
      return;
    }
    await new Promise((resolve, reject) => {
      this.serverInstance.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  configureMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(
      '/files',
      express.static(this.publicRoot, {
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'mov', 'wav', 'mp3']
      })
    );
  }

  configureRoutes() {
    this.app.get('/api/tools', this.handleGetTools);
    this.app.post('/api/tasks', this.prepareSession, this.upload.array('files'), this.handleTaskRequest);
    this.app.use((err, req, res, next) => {
      // eslint-disable-next-line no-console
      console.error(err);
      if (res.headersSent) {
        next(err);
        return;
      }
      res.status(500).json({
        error: 'サーバーエラーが発生しました。',
        detail: err.message
      });
    });
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  handleGetTools(req, res) {
    res.json({
      tools: this.toolRegistry.describeExecutableCommands()
    });
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async prepareSession(req, res, next) {
    try {
      const sessionId = createSessionId();
      const inputDir = path.join(this.sessionInputRoot, sessionId);
      const outputDir = path.join(this.generatedRoot, sessionId);

      await fs.mkdir(inputDir, { recursive: true });
      await fs.mkdir(outputDir, { recursive: true });

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
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async handleTaskRequest(req, res) {
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

      const { plan, result } = await this.agent.runTask(agentRequest, {
        cwd: session.inputDir,
        publicRoot: this.publicRoot
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

  /**
   * @returns {multer.Multer}
   */
  createUploader() {
    return multer({
      storage: multer.diskStorage({
        destination: (req, file, callback) => {
          const session = req.agentSession;
          if (!session) {
            callback(new Error('セッションが初期化されていません。'), '');
            return;
          }
          callback(null, session.inputDir);
        },
        filename: (req, file, callback) => {
          callback(null, createSafeFileName(file.originalname));
        }
      })
    });
  }

  async ensureBaseDirectories() {
    await Promise.all(
      [this.publicRoot, this.generatedRoot, this.storageRoot, this.sessionInputRoot].map((dir) =>
        fs.mkdir(dir, { recursive: true })
      )
    );
  }
}

function createSessionId() {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `session-${Date.now()}-${randomPart}`;
}

function createSafeFileName(name) {
  const baseName = path.basename(name);
  const sanitized = baseName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  if (!sanitized || sanitized.startsWith('.')) {
    const timestamp = Date.now();
    return `file_${timestamp}`;
  }
  return sanitized.slice(0, 200);
}
