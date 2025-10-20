import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  CommandExecutor,
  PlanValidator,
  ResponseParser,
  TaskPhaseTracker,
  ToolRegistry,
  createMediaAgent
} from '../src/agent/index.js';

const TMP_ROOT = path.join(process.cwd(), 'tmp-tests');
const toolRegistry = ToolRegistry.createDefault();

async function runTests() {
  await testResponseParser();
  await testPlanValidator();
  await testTaskPhaseTracker();
  await testCommandExecutorWithNone();
  await testMediaAgentWithMockClient();
  await cleanup();
  // eslint-disable-next-line no-console
  console.log('All tests passed');
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

async function testPlanValidator() {
  const validator = new PlanValidator(toolRegistry);
  const tmpDir = path.join(TMP_ROOT, 'outputs');
  const legacyPlan = {
    command: 'none',
    arguments: [],
    reasoning: 'legacy structure',
    followUp: '',
    outputs: [
      {
        path: path.join(tmpDir, 'legacy.txt'),
        description: 'legacy file'
      }
    ]
  };

  // Legacy plans should still be accepted via the planner normalisation.
  const normalized = validator.validate(
    {
      overview: legacyPlan.reasoning,
      followUp: legacyPlan.followUp,
      steps: [
        {
          command: legacyPlan.command,
          arguments: legacyPlan.arguments,
          reasoning: legacyPlan.reasoning,
          outputs: legacyPlan.outputs
        }
      ]
    },
    tmpDir
  );

  assert.equal(normalized.steps.length, 1);
  assert.equal(normalized.steps[0].command, 'none');
  assert.equal(path.resolve(normalized.steps[0].outputs[0].path), path.join(tmpDir, 'legacy.txt'));

  const plan = validator.validate(
    {
      overview: 'No execution required',
      followUp: '',
      steps: [
        {
          command: 'none',
          arguments: [],
          reasoning: 'Skip execution.',
          outputs: [
            {
              path: path.join(tmpDir, 'sample.txt'),
              description: 'sample file'
            }
          ]
        }
      ]
    },
    tmpDir
  );

  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].outputs.length, 1);

  let threw = false;
  try {
    validator.validate(
      {
        overview: '',
        followUp: '',
        steps: [
          {
            command: 'none',
            arguments: [],
            reasoning: '',
            outputs: [
              {
                path: path.join(process.cwd(), '..', 'bad.txt'),
                description: 'invalid'
              }
            ]
          }
        ]
      },
      tmpDir
    );
  } catch (error) {
    threw = true;
    assert.ok(error.message.includes('Output path'));
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
  const validator = new PlanValidator(toolRegistry);
  const executor = new CommandExecutor();
  const tmpDir = path.join(TMP_ROOT, 'outputs-none');
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

  const agent = createMediaAgent(mockClient, { toolRegistry });
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

async function cleanup() {
  await fs.rm(TMP_ROOT, { recursive: true, force: true });
}

runTests().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
