import assert from 'node:assert/strict';
import path from 'node:path';

import { PromptBuilder, ResponseParser } from '../../src/agent/index.js';
import { TMP_ROOT, sharedToolRegistry } from '../helpers/testEnvironment.js';

export default async function runAgentParsingTests() {
  await testResponseParser();
  await testPromptBuilder();
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
  const expectedViaOutputText = JSON.stringify({
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
  });
  assert.equal(
    ResponseParser.extractText(viaOutputText),
    expectedViaOutputText
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

  const prompt = await builder.build(request);
  assert.ok(prompt.includes('multimedia conversion'), 'Prompt should introduce assistant role.');
  assert.ok(prompt.includes('clip.mp4'), 'Prompt should list uploaded file names.');
  assert.ok(prompt.includes(request.outputDir), 'Prompt should mention output directory.');
  assert.ok(prompt.includes('steps property'), 'Prompt should instruct about steps.');
}
