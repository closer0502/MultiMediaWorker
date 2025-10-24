import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { MediaAgentTaskError } from '../../src/agent/index.js';
import {
  TMP_ROOT,
  createMockResponse,
  createServerInstance
} from '../helpers/testEnvironment.js';

export default async function runServerHandleTaskRequestTests() {
  await testMediaAgentServerHandleTaskRequestSuccess();
  await testMediaAgentServerHandleTaskRequestAgentError();
}

async function testMediaAgentServerHandleTaskRequestSuccess() {
  const baseDir = path.join(TMP_ROOT, 'server-success');
  const calls = [];
  const server = createServerInstance(baseDir, {
    agent: {
      async runTask(request, options) {
        calls.push({ request, options });
        return {
          plan: { steps: [] },
          rawPlan: null,
          result: {
            exitCode: 0,
            timedOut: false,
            stdout: '',
            stderr: '',
            resolvedOutputs: [],
            dryRun: false,
            steps: []
          },
          phases: [{ id: 'plan', status: 'success' }],
          debug: { info: 'details' }
        };
      }
    }
  });
  await server.ensureBaseDirectories();

  const sessionDir = path.join(baseDir, 'generated', 'session-success');
  const inputDir = path.join(baseDir, 'inputs', 'session-success');
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.mkdir(inputDir, { recursive: true });

  const req = {
    body: { task: 'Process media' },
    query: { dryRun: 'true', debug: 'verbose' },
    files: [
      {
        originalname: 'image.png',
        path: path.join(baseDir, 'uploads', 'image.png'),
        size: 42,
        mimetype: 'image/png'
      }
    ],
    agentSession: {
      id: 'session-success',
      inputDir,
      outputDir: sessionDir
    }
  };
  await fs.mkdir(path.dirname(req.files[0].path), { recursive: true });
  await fs.writeFile(req.files[0].path, 'binary');

  const res = createMockResponse();
  await server.handleTaskRequest(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body);
  assert.equal(res.body.status, 'success');
  assert.equal(res.body.sessionId, 'session-success');
  assert.equal(res.body.plan.steps.length, 0);
  assert.equal(res.body.phases.length, 2);
  assert.equal(res.body.uploadedFiles.length, 1);
  assert.ok(res.body.debug);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].request.task, 'Process media');
  assert.equal(calls[0].options.dryRun, true);
  assert.equal(calls[0].options.includeRawResponse, true);
}

async function testMediaAgentServerHandleTaskRequestAgentError() {
  const baseDir = path.join(TMP_ROOT, 'server-agent-error');
  const errorPhases = [{ id: 'execute', status: 'failed' }];
  const errorContext = {
    plan: { steps: [] },
    rawPlan: { steps: [] },
    responseText: 'error-text',
    debug: { trace: true }
  };
  const agentError = new MediaAgentTaskError('Planner failed', errorPhases, {
    context: errorContext
  });

  const server = createServerInstance(baseDir, {
    agent: {
      async runTask() {
        throw agentError;
      }
    }
  });
  await server.ensureBaseDirectories();

  const sessionDir = path.join(baseDir, 'generated', 'session-error');
  const inputDir = path.join(baseDir, 'inputs', 'session-error');
  await fs.mkdir(sessionDir, { recursive: true });
  await fs.mkdir(inputDir, { recursive: true });

  const req = {
    body: { task: 'Process media' },
    query: { debug: 'true' },
    files: [],
    agentSession: {
      id: 'session-error',
      inputDir,
      outputDir: sessionDir
    }
  };

  const res = createMockResponse();
  await server.handleTaskRequest(req, res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.status, 'failed');
  assert.equal(res.body.plan, errorContext.plan);
  assert.equal(res.body.rawPlan, errorContext.rawPlan);
  assert.equal(res.body.responseText, errorContext.responseText);
  assert.equal(res.body.debug, errorContext.debug);
  assert.equal(res.body.phases.length, 2);
}
