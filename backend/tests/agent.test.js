import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  CommandExecutor,
  PlanValidator,
  ResponseParser,
  ToolRegistry,
  createMediaAgent
} from '../src/agent/index.js';

const TMP_ROOT = path.join(process.cwd(), 'tmp-tests');
const toolRegistry = ToolRegistry.createDefault();

async function runTests() {
  await testResponseParser();
  await testPlanValidator();
  await testCommandExecutorWithNone();
  await testMediaAgentWithMockClient();
  await cleanup();
  // eslint-disable-next-line no-console
  console.log('All tests passed');
}

async function testResponseParser() {
  const viaOutputText = {
    output_text: '{"command":"none","arguments":[],"reasoning":"","outputs":[]}'
  };
  assert.equal(
    ResponseParser.extractText(viaOutputText),
    '{"command":"none","arguments":[],"reasoning":"","outputs":[]}'
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

async function testPlanValidator() {
  const validator = new PlanValidator(toolRegistry);
  const tmpDir = path.join(TMP_ROOT, 'outputs');
  const plan = {
    command: 'none',
    arguments: [],
    reasoning: 'not needed',
    followUp: '',
    outputs: [
      {
        path: path.join(tmpDir, 'sample.txt'),
        description: 'sample file'
      }
    ]
  };

  const validated = validator.validate(plan, tmpDir);
  assert.equal(validated.outputs.length, 1);
  assert.equal(path.resolve(validated.outputs[0].path), path.join(tmpDir, 'sample.txt'));

  let threw = false;
  try {
    validator.validate(
      {
        command: 'none',
        arguments: [],
        reasoning: '',
        followUp: '',
        outputs: [
          {
            path: path.join(process.cwd(), '..', 'bad.txt'),
            description: 'invalid'
          }
        ]
      },
      tmpDir
    );
  } catch (error) {
    threw = true;
    assert.ok(error.message.includes('出力パス'));
  }
  assert.equal(threw, true);
}

async function testCommandExecutorWithNone() {
  const validator = new PlanValidator(toolRegistry);
  const executor = new CommandExecutor();
  const tmpDir = path.join(TMP_ROOT, 'outputs-none');
  await fs.mkdir(tmpDir, { recursive: true });
  const plan = validator.validate(
    {
      command: 'none',
      arguments: [],
      reasoning: '',
      followUp: '',
      outputs: [
        {
          path: path.join(tmpDir, 'noresult.txt'),
          description: 'placeholder'
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
}

async function testMediaAgentWithMockClient() {
  const mockClient = {
    responses: {
      create: async () => ({
        output_text: JSON.stringify({
          command: 'none',
          arguments: [],
          reasoning: 'No action required.',
          followUp: '',
          outputs: []
        })
      })
    }
  };

  const tmpDir = path.join(TMP_ROOT, 'agent-run');
  await fs.mkdir(tmpDir, { recursive: true });

  const agent = createMediaAgent(mockClient, { toolRegistry });
  const { plan, result } = await agent.runTask(
    {
      task: '何もしないでください',
      files: [],
      outputDir: tmpDir
    },
    { publicRoot: tmpDir }
  );

  assert.equal(plan.command, 'none');
  assert.equal(result.exitCode, null);
  assert.ok(Array.isArray(result.resolvedOutputs));
}

async function cleanup() {
  await fs.rm(TMP_ROOT, { recursive: true, force: true });
}

runTests().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
