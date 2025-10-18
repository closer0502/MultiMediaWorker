import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const TMP_ROOT = path.join(process.cwd(), 'tmp-tests');

import { extractResponseText, executeCommandPlan, runAgentTask, validateCommandPlan } from './OpenaiAgent.js';

async function runTests() {
  await testExtractResponseText();
  await testValidateCommandPlan();
  await testExecuteCommandPlanWithNone();
  await testRunAgentTaskWithMockClient();
  await cleanup();
  // eslint-disable-next-line no-console
  console.log('All tests passed');
}

async function testExtractResponseText() {
  const viaOutputText = {
    output_text: '{"command":"none","arguments":[],"reasoning":"","outputs":[]}'
  };
  assert.equal(
    extractResponseText(viaOutputText),
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
  assert.equal(extractResponseText(viaOutputArray), '{"hello":"world"}');
}

async function testValidateCommandPlan() {
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

  const validated = validateCommandPlan(plan, tmpDir);
  assert.equal(validated.outputs.length, 1);
  assert.equal(path.resolve(validated.outputs[0].path), path.join(tmpDir, 'sample.txt'));

  let threw = false;
  try {
    validateCommandPlan(
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

async function testExecuteCommandPlanWithNone() {
  const tmpDir = path.join(TMP_ROOT, 'outputs-none');
  await fs.mkdir(tmpDir, { recursive: true });
  const plan = validateCommandPlan(
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

  const result = await executeCommandPlan(plan, { publicRoot: tmpDir });
  assert.equal(result.exitCode, null);
  assert.equal(result.timedOut, false);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(result.resolvedOutputs.length, 1);
  assert.equal(result.resolvedOutputs[0].exists, false);
}

async function testRunAgentTaskWithMockClient() {
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

  const tmpDir = path.join(process.cwd(), 'tmp-tests', 'agent-run');
  await fs.mkdir(tmpDir, { recursive: true });

  const { plan, result } = await runAgentTask(
    mockClient,
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
