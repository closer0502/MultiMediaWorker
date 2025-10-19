import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';

import { MediaAgentTaskError } from '../agent/index.js';

/**
 * Express based API server that wires the media agent to HTTP endpoints.
 */
export class MediaAgentServer {
  /**
   * @param {{agent: import('../agent/core/MediaAgent.js').MediaAgent, toolRegistry: import('../agent/registry/ToolRegistry.js').ToolRegistry, publicRoot: string, generatedRoot: string, storageRoot: string, sessionInputRoot: string}} options
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
    const task = (req.body?.task || '').trim();
    if (!task) {
      res.status(400).json({ error: 'task フィールドは必須です。' });
      return;
    }

    const session = req.agentSession;
    if (!session) {
      res.status(500).json({ error: 'セッションが初期化されていません。' });
      return;
    }

    const debugMode = parseDebugMode(req.query?.debug);
    const dryRun = parseBoolean(req.query?.dryRun);

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

    const requestPhase = createRequestPhase(task, files, { dryRun, debug: debugMode.enabled });

    try {
      const agentResponse = await this.agent.runTask(agentRequest, {
        cwd: session.inputDir,
        publicRoot: this.publicRoot,
        dryRun,
        debug: debugMode.enabled,
        includeRawResponse: debugMode.includeRaw
      });

      const phases = [requestPhase, ...agentResponse.phases];

      res.json({
        status: 'success',
        sessionId: session.id,
        task,
        plan: agentResponse.plan,
        rawPlan: agentResponse.rawPlan ?? agentResponse.plan,
        result: agentResponse.result,
        phases,
        debug: debugMode.enabled ? agentResponse.debug ?? null : undefined,
        uploadedFiles: files
      });
    } catch (error) {
      const isAgentError = error instanceof MediaAgentTaskError;
      const phases = [requestPhase, ...(isAgentError ? error.phases : [])];
      const errorContext = isAgentError ? error.context || {} : {};
      const planPayload = isAgentError ? errorContext.plan ?? null : null;
      const rawPlan = isAgentError ? errorContext.rawPlan ?? planPayload : null;

      res.status(500).json({
        status: 'failed',
        sessionId: session.id,
        error: 'コマンド生成に失敗しました。',
        detail: error.message,
        phases,
        plan: planPayload,
        rawPlan,
        responseText: isAgentError ? errorContext.responseText ?? null : null,
        debug: debugMode.enabled ? errorContext.debug ?? null : undefined,
        uploadedFiles: files
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

function createRequestPhase(task, files, options = {}) {
  const now = new Date().toISOString();
  return {
    id: 'request',
    title: 'Receive request',
    status: 'success',
    startedAt: now,
    finishedAt: now,
    error: null,
    logs: [],
    meta: {
      taskPreview: task.slice(0, 120),
      fileCount: files.length,
      dryRun: Boolean(options.dryRun),
      debug: Boolean(options.debug)
    }
  };
}

function parseBoolean(value) {
  const normalized = getFirstQueryValue(value);
  if (normalized === undefined) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(normalized.toLowerCase());
}

function parseDebugMode(value) {
  const normalized = getFirstQueryValue(value);
  if (!normalized) {
    return { enabled: false, includeRaw: false };
  }
  const lower = normalized.toLowerCase();
  return {
    enabled: ['1', 'true', 'yes', 'on', 'verbose', 'full'].includes(lower),
    includeRaw: lower === 'verbose' || lower === 'full'
  };
}

function getFirstQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  if (value === null || value === undefined) {
    return undefined;
  }
  return String(value);
}
