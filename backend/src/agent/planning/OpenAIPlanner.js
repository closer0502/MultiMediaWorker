// @ts-check

import OpenAI from 'openai';
import { DEFAULT_MODEL } from '../config/constants.js';
import { PromptBuilder } from './PromptBuilder.js';
import { PlanValidator } from './PlanValidator.js';
import { ResponseParser } from './ResponseParser.js';

/** @typedef {import('../registry/ToolRegistry.js').ToolRegistry} ToolRegistry */

/**
 * OpenAI APIを用いてタスク計画を生成するプランナーです。
 */
export class OpenAIPlanner {
  /**
   * OpenAIクライアントとツール情報を受け取り、計画生成に必要なコンポーネントを初期化します。
   * @param {OpenAI} client
   * @param {ToolRegistry} toolRegistry
   * @param {{model?: string, promptBuilder?: PromptBuilder, planValidator?: PlanValidator}} [options]
   */
  constructor(client, toolRegistry, options = {}) {
    this.client = client;
    this.toolRegistry = toolRegistry;
    this.model = options.model || DEFAULT_MODEL;
    this.promptBuilder = options.promptBuilder || new PromptBuilder(toolRegistry);
    this.planValidator = options.planValidator || new PlanValidator(toolRegistry);
  }

  /**
   * エージェントリクエストからプロンプトを構築し、OpenAIに問い合わせてコマンドプランを生成します。
   * @param {import('../shared/types.js').AgentRequest} request
   * @param {{debug?: boolean, includeRawResponse?: boolean}} [options]
   * @returns {Promise<{plan: import('../shared/types.js').CommandPlan, rawPlan: any, debug?: Record<string, any>}>}
   */
  async plan(request, options = {}) {
    const developerPrompt = this.promptBuilder.build(request);
    /** @type {OpenAI.Responses.ResponseCreateParamsNonStreaming} */
    const responsePayload = {
      model: this.model,
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
      text: {
        format: this.buildResponseFormat(),
        verbosity: 'medium'
      },
      reasoning: {
        effort: 'low'
      },
      tools: [],
      store: true,
      include: ['reasoning.encrypted_content', 'web_search_call.action.sources']
    };

    const response = await this.client.responses.create(responsePayload);

    const responseText = ResponseParser.extractText(response);
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (error) {
      throw new Error(`OpenAIレスポンスのJSON解析に失敗しました: ${error.message}`);
    }

    const debug = options.debug
      ? {
        model: this.model,
        developerPrompt,
        responseText,
        parsed,
        rawResponse: options.includeRawResponse ? safeSerialize(response) : undefined
      }
      : undefined;

    try {
      const plan = this.planValidator.validate(parsed, request.outputDir);
      return { plan, rawPlan: parsed, debug };
    } catch (error) {
      if (error && typeof error === 'object') {
        /** @type {Record<string, any>} */
        const errorObj = error;
        errorObj.rawPlan = parsed;
        if (debug) {
          errorObj.debug = debug;
        }
        errorObj.responseText = responseText;
      }
      throw error;
    }
  }

  /**
   * OpenAI Responses APIで求める返却JSONのスキーマを定義します。
   * @returns {OpenAI.Responses.ResponseFormatTextJSONSchemaConfig}
   */
  buildResponseFormat() {
    return {
      type: 'json_schema',
      name: 'command_plan',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['command', 'arguments', 'reasoning', 'followUp', 'outputs'],
        properties: {
          command: {
            type: 'string',
            description: 'Command name to execute.',
            enum: this.toolRegistry.listCommandIds()
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
    };
  }
}

/**
 * 循環参照などが含まれるレスポンスを安全にシリアライズします。
 * @param {any} value
 * @returns {any}
 */
function safeSerialize(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}
