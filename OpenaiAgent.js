import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import OpenAI from 'openai';

dotenv.config({ path: '.env.local' });

export const TOOL_DEFINITIONS = {
  ffmpeg: {
    title: 'FFmpeg',
    description: 'Use for video/audio transcoding and image sequence tasks.'
  },
  magick: {
    title: 'ImageMagick',
    description: 'Use for image conversion, resizing, and compositing workflows.'
  },
  exiftool: {
    title: 'ExifTool',
    description: 'Use for reading or editing media metadata.'
  },
  none: {
    title: 'No command',
    description: 'Select when the task cannot be solved with the available tools.'
  }
};

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ALLOWED_COMMANDS = Object.keys(TOOL_DEFINITIONS);

/**
 * @typedef {Object} AgentFile
 * @property {string} id - Internal identifier.
 * @property {string} originalName - Name provided by the user.
 * @property {string} absolutePath - Absolute path on disk.
 * @property {number} size - File size in bytes.
 * @property {string|undefined} mimeType - Optional MIME type.
 */

/**
 * @typedef {Object} AgentRequest
 * @property {string} task - Natural language user request.
 * @property {AgentFile[]} files - Files uploaded for the task.
 * @property {string} outputDir - Directory where new outputs must be written.
 */

/**
 * @typedef {Object} CommandOutputPlan
 * @property {string} path - Absolute path to the expected output.
 * @property {string} description - Short human readable summary.
 */

/**
 * @typedef {Object} CommandPlan
 * @property {'ffmpeg'|'magick'|'exiftool'|'none'} command - Selected command.
 * @property {string[]} arguments - Ordered command arguments.
 * @property {string} reasoning - High level explanation.
 * @property {string} followUp - Optional follow-up instructions for the operator.
 * @property {CommandOutputPlan[]} outputs - Planned output files or artefacts.
 */

/**
 * @typedef {Object} CommandExecutionOptions
 * @property {string} [cwd] - Working directory for the spawned process.
 * @property {number} [timeoutMs] - Optional timeout in milliseconds.
 * @property {string} [publicRoot] - Directory exposed via static hosting.
 */

/**
 * @typedef {Object} CommandExecutionResult
 * @property {number|null} exitCode - Exit code or null if not executed.
 * @property {boolean} timedOut - Whether the process was terminated by timeout.
 * @property {string} stdout - Captured stdout.
 * @property {string} stderr - Captured stderr.
 * @property {Array<CommandOutputPlan & {exists: boolean, absolutePath: string, publicPath: string|null, size: number|null}>} resolvedOutputs
 * Detailed information about declared outputs.
 */

/**
 * @param {string|undefined} apiKey - OpenAI API key override.
 * @returns {OpenAI} Configured OpenAI client.
 */
export function createOpenAIClient(apiKey) {
  return new OpenAI({
    apiKey: apiKey || process.env.OPENAI_API_KEY
  });
}

/**
 * @param {AgentRequest} request - Current user task.
 * @returns {string} Developer prompt for the agent.
 */
export function buildDeveloperPrompt(request) {
  const toolSummary = ALLOWED_COMMANDS.filter((key) => key !== 'none')
    .map((key) => {
      const tool = TOOL_DEFINITIONS[key];
      return `- ${key}: ${tool.description}`;
    })
    .join('\n');

  const fileSummary = request.files.length
    ? request.files
        .map(
          (file, index) =>
            `${index + 1}. ${file.originalName}\n   path: ${file.absolutePath}\n   size: ${file.size} bytes${
              file.mimeType ? `\n   mime: ${file.mimeType}` : ''
            }`
        )
        .join('\n')
    : 'なし';

  return [
    'あなたはマルチメディア処理のCLIアシスタントです。',
    '利用可能なコマンドは次の通りです:',
    toolSummary,
    '入力ファイル一覧:',
    fileSummary,
    `新しいファイルは必ず次のディレクトリ配下に生成してください: ${request.outputDir}`,
    '要件:',
    '- 返却はJSONのみ。',
    '- commandは ffmpeg / magick / exiftool / none のいずれか。',
    '- argumentsにはコマンドライン引数を順番通りに格納。',
    '- outputsには生成されるファイル(存在しない場合も予定として)を列挙。',
    '- 実行できない場合は command を none として理由を reasoning に記載。',
    '- ファイルパスは絶対パスで指定。'
  ].join('\n\n');
}

/**
 * @param {any} response - OpenAI API raw response.
 * @returns {string} Extracted JSON text.
 */
export function extractResponseText(response) {
  if (!response || typeof response !== 'object') {
    throw new Error('OpenAIレスポンスが不正です。');
  }

  if (typeof response.output_text === 'string') {
    return response.output_text;
  }

  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (item && Array.isArray(item.content)) {
        for (const chunk of item.content) {
          if (chunk && typeof chunk.text === 'string') {
            return chunk.text;
          }
        }
      }
    }
  }

  if (Array.isArray(response.choices)) {
    for (const choice of response.choices) {
      const content = choice?.message?.content;
      if (typeof content === 'string') {
        return content;
      }
      if (Array.isArray(content)) {
        const textChunk = content.find((part) => part.type === 'text');
        if (textChunk && typeof textChunk.text === 'string') {
          return textChunk.text;
        }
      }
    }
  }

  throw new Error('OpenAIレスポンスからテキストを取得できませんでした。');
}

/**
 * @param {CommandPlan} plan - Planned command.
 * @param {string} outputDir - Allowed output directory.
 * @returns {CommandPlan} Validated plan.
 */
export function validateCommandPlan(plan, outputDir) {
  if (!plan || typeof plan !== 'object') {
    throw new Error('コマンドプランが空です。');
  }

  if (!ALLOWED_COMMANDS.includes(plan.command)) {
    throw new Error(`未対応のコマンドです: ${plan.command}`);
  }

  if (!Array.isArray(plan.arguments) || !plan.arguments.every((arg) => typeof arg === 'string')) {
    throw new Error('arguments は文字列配列である必要があります。');
  }

  if (typeof plan.reasoning !== 'string') {
    plan.reasoning = '';
  }

  if (typeof plan.followUp !== 'string') {
    plan.followUp = '';
  }

  if (!Array.isArray(plan.outputs)) {
    throw new Error('outputs は配列である必要があります。');
  }

  const normalizedOutputDir = path.resolve(outputDir);
  plan.outputs = plan.outputs.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new Error('outputs の要素が不正です。');
    }
    if (typeof item.path !== 'string' || !item.path.trim()) {
      throw new Error('outputs の path が不正です。');
    }
    if (typeof item.description !== 'string') {
      item.description = '';
    }

    const absolutePath = path.resolve(item.path);
    const relative = path.relative(normalizedOutputDir, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`出力パスが許可ディレクトリ外です: ${item.path}`);
    }

    return {
      path: absolutePath,
      description: item.description
    };
  });

  return plan;
}

/**
 * @param {CommandPlan} plan - Validated plan.
 * @param {CommandExecutionOptions} [options] - Execution options.
 * @returns {Promise<CommandExecutionResult>} Execution result.
 */
export async function executeCommandPlan(plan, options = {}) {
  const cwd = options.cwd || process.cwd();
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const publicRoot = options.publicRoot ? path.resolve(options.publicRoot) : null;

  await ensureOutputDirectories(plan.outputs);

  if (plan.command === 'none') {
    return {
      exitCode: null,
      timedOut: false,
      stdout: '',
      stderr: '',
      resolvedOutputs: await describeOutputs(plan.outputs, publicRoot)
    };
  }

  const { exitCode, stdout, stderr, timedOut } = await spawnProcess(plan.command, plan.arguments, {
    cwd,
    timeoutMs
  });

  return {
    exitCode,
    timedOut,
    stdout,
    stderr,
    resolvedOutputs: await describeOutputs(plan.outputs, publicRoot)
  };
}

/**
 * @param {OpenAI} client - OpenAI client.
 * @param {AgentRequest} request - Agent request payload.
 * @returns {Promise<CommandPlan>} Planned command.
 */
export async function generateCommandPlan(client, request) {
  const developerPrompt = buildDeveloperPrompt(request);

  const response = await client.responses.create({
    model: DEFAULT_MODEL,
    input: [
      {
        role: 'developer',
        content: [
          {
            type: 'input_text',
            text: developerPrompt
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: request.task
          }
        ]
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'command_plan',
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['command', 'arguments', 'reasoning', 'outputs'],
          properties: {
            command: {
              type: 'string',
              enum: ['ffmpeg', 'magick', 'exiftool', 'none'],
              description: 'Command name to execute.'
            },
            arguments: {
              type: 'array',
              description: 'Ordered command arguments.',
              items: {
                type: 'string'
              }
            },
            reasoning: {
              type: 'string',
              description: 'Why this command solves the request.'
            },
            followUp: {
              type: 'string',
              description: 'Optional follow-up guidance for the operator.'
            },
            outputs: {
              type: 'array',
              description: 'Planned output files.',
              items: {
                type: 'object',
                required: ['path', 'description'],
                additionalProperties: false,
                properties: {
                  path: {
                    type: 'string'
                  },
                  description: {
                    type: 'string'
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  const responseText = extractResponseText(response);
  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch (error) {
    throw new Error(`OpenAIレスポンスのJSON解析に失敗しました: ${error.message}`);
  }

  return validateCommandPlan(parsed, request.outputDir);
}

/**
 * @param {CommandOutputPlan[]} outputs - Planned outputs.
 * @returns {Promise<void>}
 */
async function ensureOutputDirectories(outputs) {
  const uniqueDirs = new Set(
    outputs.map((item) => path.dirname(path.resolve(item.path)))
  );

  await Promise.all(
    Array.from(uniqueDirs).map((dir) => fs.mkdir(dir, { recursive: true }))
  );
}

/**
 * @param {CommandOutputPlan[]} outputs - Planned outputs.
 * @param {string|null} publicRoot - Public directory root.
 * @returns {Promise<Array<CommandOutputPlan & {exists: boolean, absolutePath: string, publicPath: string|null, size: number|null}>>}
 */
async function describeOutputs(outputs, publicRoot) {
  const described = [];
  for (const item of outputs) {
    const absolutePath = path.resolve(item.path);
    const exists = existsSync(absolutePath);
    let size = null;
    if (exists) {
      const stat = await fs.stat(absolutePath);
      size = stat.size;
    }
    let publicPath = null;
    if (exists && publicRoot) {
      const relative = path.relative(publicRoot, absolutePath);
      if (!relative.startsWith('..')) {
        publicPath = relative.split(path.sep).join('/');
      }
    }
    described.push({
      path: item.path,
      description: item.description,
      absolutePath,
      exists,
      size,
      publicPath
    });
  }
  return described;
}

/**
 * @param {string} command - Command to execute.
 * @param {string[]} args - Command arguments.
 * @param {{cwd: string, timeoutMs: number}} options - Spawn options.
 * @returns {Promise<{exitCode: number|null, stdout: string, stderr: string, timedOut: boolean}>}
 */
function spawnProcess(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      shell: false,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    let finished = false;
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeoutId);
        reject(error);
      }
    });

    child.on('close', (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeoutId);
        resolve({
          exitCode: timedOut ? null : code,
          stdout,
          stderr,
          timedOut
        });
      }
    });
  });
}

/**
 * @param {OpenAI} client - OpenAI client.
 * @param {AgentRequest} request - Task description and files.
 * @param {CommandExecutionOptions} [options] - Execution options.
 * @returns {Promise<{plan: CommandPlan, result: CommandExecutionResult}>} Combined result.
 */
export async function runAgentTask(client, request, options = {}) {
  const plan = await generateCommandPlan(client, request);
  const executionResult = await executeCommandPlan(plan, options);
  return { plan, result: executionResult };
}
