import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  CommandExecutor,
  DEFAULT_MODEL,
  DEFAULT_TOOL_DEFINITIONS,
  MediaAgentTaskError,
  OpenAIPlanner,
  PlanValidator,
  PromptBuilder,
  ResponseParser,
  TaskPhaseTracker,
  ToolRegistry,
  createMediaAgent,
  createOpenAIClient
} from '../src/agent/index.js';
import {
  MediaAgentServer,
  createRequestPhase,
  createSafeFileName,
  createSessionId,
  getFirstQueryValue,
  parseBoolean,
  parseDebugMode
} from '../src/server/MediaAgentServer.js';

const TMP_ROOT = path.join(process.cwd(), 'tmp-tests');
const sharedToolRegistry = ToolRegistry.createDefault();

async function runTests() {
  await fs.mkdir(TMP_ROOT, { recursive: true });

  try {
    await testResponseParser();
    await testPromptBuilder();
    await testPlanValidator();
    await testTaskPhaseTracker();
    await testCommandExecutorWithNone();
    await testCommandExecutorExecutionPaths();
    await testToolRegistry();
    await testMediaAgentTaskError();
    await testOpenAIPlannerNormalization();
    await testOpenAIPlannerResponseFormat();
    await testCreateOpenAIClient();
    await testMediaAgentServerHelpers();
    await testMediaAgentServerPrepareSession();
    await testMediaAgentServerHandleTaskRequestSuccess();
    await testMediaAgentServerHandleTaskRequestAgentError();
    await testIndexExports();
    await testMediaAgentWithMockClient();
    // eslint-disable-next-line no-console
    console.log('All tests passed');
  } finally {
    await cleanup();
  }
}

async function testResponseParser() {
  const viaOutputText = {
    output_text: JSON.stringify({
      overview: '',
      followUp: '',
      steps: [
        {
          command: 'none',
          arguments: [],
          reasoning: 'No work required.',
          outputs: []
        }
      ]
    })
  };
  assert.equal(
    ResponseParser.extractText(viaOutputText),
    '{"overview":"","followUp":"","steps":[{"command":"none","arguments":[],"reasoning":"No work required.","outputs":[]}]}'
  );

  const viaOutputArray = {
    output: [
      {
        content: [
          {
            type: 'output_text',
            text: '{"hello":"world"}'
          }
        ]
      }
    ]
  };
  assert.equal(ResponseParser.extractText(viaOutputArray), '{"hello":"world"}');
}

async function testPromptBuilder() {
  const builder = new PromptBuilder(sharedToolRegistry);
  const request = {
    task: 'Transcode the clip and extract thumbnail.',
    files: [
      {
        id: 'file-1',
        originalName: 'clip.mp4',
        absolutePath: path.join(TMP_ROOT, 'clip.mp4'),
        size: 1024,
        mimeType: 'video/mp4'
      }
    ],
    outputDir: path.join(TMP_ROOT, 'outputs')
  };

  const prompt = builder.build(request);
  assert.ok(prompt.includes('multimedia conversion'), 'Prompt should introduce assistant role.');
  assert.ok(prompt.includes('clip.mp4'), 'Prompt should list uploaded file names.');
  assert.ok(prompt.includes(request.outputDir), 'Prompt should mention output directory.');
  assert.ok(prompt.includes('steps property'), 'Prompt should instruct about steps.');
}

async function testPlanValidator() {
  const validator = new PlanValidator(sharedToolRegistry);
  const tmpDir = path.join(TMP_ROOT, 'validator');
  await fs.mkdir(tmpDir, { recursive: true });

  const validated = validator.validate(
    {
      overview: 'Process media',
      followUp: 'Review artifacts.',
      steps: [
        {
          command: 'none',
          arguments: [],
          reasoning: 123,
          outputs: [],
          id: ' step-1 ',
          title: '  Initial ',
          note: ' optional note '
        }
      ]
    },
    tmpDir
  );

  assert.equal(validated.steps.length, 1);
  const step = validated.steps[0];
  assert.equal(step.command, 'none');
  assert.equal(step.reasoning, '');
  assert.equal(step.id, 'step-1');
  assert.equal(step.title, 'Initial');
  assert.equal(step.note, 'optional note');

  let threw = false;
  try {
    validator.validate(
      {
        overview: '',
        followUp: '',
        steps: [
          {
            command: 'none',
            arguments: [123],
            reasoning: '',
            outputs: []
          }
        ]
      },
      tmpDir
    );
  } catch (error) {
    threw = true;
    assert.ok(error.message.includes('array of strings'));
  }
  assert.equal(threw, true);
}

async function testTaskPhaseTracker() {
  const tracker = new TaskPhaseTracker([
    { id: 'plan', title: 'Plan command' },
    { id: 'execute', title: 'Execute command' }
  ]);
  tracker.start('plan');
  tracker.log('plan', 'starting planner');
  tracker.complete('plan', { steps: 1 });
  tracker.start('execute');
  tracker.fail('execute', new Error('mock failure'));

  const phases = tracker.getPhases();
  assert.equal(phases.length, 2);
  assert.equal(phases[0].status, 'success');
  assert.equal(phases[0].logs.length, 1);
  assert.equal(phases[1].status, 'failed');
  assert.ok(phases[1].error);
}

async function testCommandExecutorWithNone() {
  const validator = new PlanValidator(sharedToolRegistry);
  const executor = new CommandExecutor();
  const tmpDir = path.join(TMP_ROOT, 'executor-none');
  await fs.mkdir(tmpDir, { recursive: true });

  const plan = validator.validate(
    {
      overview: '',
      followUp: '',
      steps: [
        {
          command: 'none',
          arguments: [],
          reasoning: 'No operation required.',
          outputs: [
            {
              path: path.join(tmpDir, 'noresult.txt'),
              description: 'placeholder'
            }
          ]
        }
      ]
    },
    tmpDir
  );

  const result = await executor.execute(plan, { publicRoot: tmpDir });
  assert.equal(result.exitCode, null);
  assert.equal(result.timedOut, false);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(result.resolvedOutputs.length, 1);
  assert.equal(result.resolvedOutputs[0].exists, false);
  assert.equal(result.dryRun, true);
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0].status, 'skipped');
  assert.equal(result.steps[0].skipReason, 'no_op_command');
}

async function testCommandExecutorExecutionPaths() {
  const executor = new CommandExecutor({ timeoutMs: 10_000 });
  const plan = {
    overview: 'Run sample commands',
    followUp: '',
    steps: [
      {
        command: process.execPath,
        arguments: ['-e', "process.stdout.write('hello world')"],
        reasoning: 'Print greeting.',
        outputs: []
      },
      {
        command: 'none',
        arguments: [],
        reasoning: 'Skip follow-up.',
        outputs: []
      }
    ]
  };

  const result = await executor.execute(plan, {});
  assert.equal(result.exitCode, 0);
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[0].status, 'executed');
  assert.equal(result.steps[0].exitCode, 0);
  assert.ok(result.stdout.includes('hello world'));
  assert.equal(result.steps[1].status, 'skipped');
  assert.equal(result.steps[1].skipReason, 'no_op_command');
  assert.ok(result.stdout.includes('[step 1]'), 'Aggregated stdout should label steps.');
}

async function testToolRegistry() {
  const registry = ToolRegistry.createDefault();
  assert.ok(registry.hasCommand('ffmpeg'));
  assert.ok(registry.listCommandIds().includes('none'));
  assert.ok(registry.describeExecutableCommands().every((entry) => entry.id !== 'none'));
}

async function testMediaAgentTaskError() {
  const cause = new Error('boom');
  const phases = [{ id: 'execute', status: 'failed' }];
  const context = { plan: { steps: [] } };
  const error = new MediaAgentTaskError('Execution failed', phases, { cause, context });

  assert.equal(error.message, 'Execution failed');
  assert.equal(error.name, 'MediaAgentTaskError');
  assert.equal(error.phases, phases);
  assert.equal(error.context, context);
  assert.equal(error.cause, cause);
}

async function testOpenAIPlannerNormalization() {
  const dummyClient = { responses: { create: async () => ({}) } };
  const planner = new OpenAIPlanner(dummyClient, sharedToolRegistry);

  const legacy = planner.normalizePlanStructure({
    command: 'none',
    arguments: ['-v'],
    reasoning: 'Legacy format',
    followUp: 'Review later',
    outputs: []
  });
  assert.equal(legacy.steps.length, 1);
  assert.equal(legacy.steps[0].command, 'none');
  assert.equal(legacy.followUp, 'Review later');

  const structured = planner.normalizePlanStructure({
    overview: 'Use ffmpeg then magick',
    steps: [
      { command: 'ffmpeg', arguments: [], reasoning: '', outputs: [] },
      { command: 'magick', arguments: [], reasoning: '', outputs: [] }
    ]
  });
  assert.equal(structured.steps.length, 2);
  assert.equal(structured.overview, 'Use ffmpeg then magick');
}

async function testOpenAIPlannerResponseFormat() {
  const dummyClient = { responses: { create: async () => ({}) } };
  const planner = new OpenAIPlanner(dummyClient, sharedToolRegistry);
  const schema = planner.buildResponseFormat();
  assert.equal(schema.type, 'json_schema');
  assert.ok(schema.schema.properties.steps);
  assert.ok(schema.schema.properties.steps.items.required.includes('command'));
}

async function testCreateOpenAIClient() {
  class StubOpenAI {
    constructor(options) {
      this.options = options;
    }
  }

  const explicit = createOpenAIClient('test-key', StubOpenAI);
  assert.equal(explicit.options.apiKey, 'test-key');

  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'env-key';
  const implicit = createOpenAIClient(undefined, StubOpenAI);
  assert.equal(implicit.options.apiKey, 'env-key');
  process.env.OPENAI_API_KEY = original;
}

async function testMediaAgentServerHelpers() {
  const idA = createSessionId();
  const idB = createSessionId();
  assert.notEqual(idA, idB);
  assert.ok(idA.startsWith('session-'));

  assert.equal(createSafeFileName('foo bar.txt'), 'foo_bar.txt');
  const hidden = createSafeFileName('.env');
  assert.ok(hidden.startsWith('file_'));

  const phase = createRequestPhase('Transcode media', [{ id: '1' }], { dryRun: true, debug: false });
  assert.equal(phase.meta.taskPreview, 'Transcode media');
  assert.equal(phase.meta.fileCount, 1);
  assert.equal(phase.meta.dryRun, true);

  assert.equal(parseBoolean('true'), true);
  assert.equal(parseBoolean('no'), false);
  assert.equal(parseBoolean(undefined), false);

  const debugVerbose = parseDebugMode('verbose');
  assert.equal(debugVerbose.enabled, true);
  assert.equal(debugVerbose.includeRaw, true);
  const debugOff = parseDebugMode(undefined);
  assert.equal(debugOff.enabled, false);

  assert.equal(getFirstQueryValue(['yes', 'no']), 'yes');
  assert.equal(getFirstQueryValue(null), undefined);
}

async function testMediaAgentServerPrepareSession() {
  const baseDir = path.join(TMP_ROOT, 'server-prepare');
  const server = createServerInstance(baseDir, {
    agent: { runTask: async () => ({}) }
  });
  await server.ensureBaseDirectories();

  const req = { query: {} };
  const res = {};
  await server.prepareSession(req, res, (error) => {
    if (error) {
      throw error;
    }
  });

  assert.ok(req.agentSession);
  const session = req.agentSession;
  const inputExists = await directoryExists(session.inputDir);
  const outputExists = await directoryExists(session.outputDir);
  assert.equal(inputExists, true);
  assert.equal(outputExists, true);
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

async function testIndexExports() {
  assert.equal(typeof DEFAULT_MODEL, 'string');
  assert.ok(Object.keys(DEFAULT_TOOL_DEFINITIONS).length > 0);
}

async function testMediaAgentWithMockClient() {
  const mockClient = {
    responses: {
      create: async () => ({
        output_text: JSON.stringify({
          overview: 'No action required.',
          followUp: '',
          steps: [
            {
              command: 'none',
              arguments: [],
              reasoning: 'Nothing to execute.',
              outputs: []
            }
          ]
        })
      })
    }
  };

  const tmpDir = path.join(TMP_ROOT, 'agent-run');
  await fs.mkdir(tmpDir, { recursive: true });

  const agent = createMediaAgent(mockClient, { toolRegistry: sharedToolRegistry });
  const { plan, rawPlan, result, phases, debug } = await agent.runTask(
    {
      task: 'No additional processing required',
      files: [],
      outputDir: tmpDir
    },
    { publicRoot: tmpDir, dryRun: true, debug: true }
  );

  assert.ok(Array.isArray(plan.steps));
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].command, 'none');
  assert.equal(result.exitCode, null);
  assert.ok(Array.isArray(result.resolvedOutputs));
  assert.ok(Array.isArray(result.steps));
  assert.ok(Array.isArray(phases));
  assert.equal(phases[0].id, 'plan');
  assert.equal(phases[1].id, 'execute');
  assert.ok(debug);
  assert.ok(rawPlan);
}

function createMockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function createServerInstance(baseDir, overrides) {
  const paths = {
    publicRoot: path.join(baseDir, 'public'),
    generatedRoot: path.join(baseDir, 'generated'),
    storageRoot: path.join(baseDir, 'storage'),
    sessionInputRoot: path.join(baseDir, 'inputs')
  };

  return new MediaAgentServer({
    agent: overrides.agent,
    toolRegistry: overrides.toolRegistry || ToolRegistry.createDefault(),
    ...paths
  });
}

async function directoryExists(targetPath) {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function cleanup() {
  await fs.rm(TMP_ROOT, { recursive: true, force: true });
}

runTests().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});

