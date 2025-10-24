import assert from 'node:assert/strict';

import { OpenAIPlanner, createOpenAIClient } from '../../src/agent/index.js';
import { sharedToolRegistry } from '../helpers/testEnvironment.js';

export default async function runPlannerTests() {
  await testOpenAIPlannerNormalization();
  await testOpenAIPlannerResponseFormat();
  await testCreateOpenAIClient();
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
