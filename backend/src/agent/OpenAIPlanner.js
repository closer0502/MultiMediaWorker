// @ts-check

import { DEFAULT_MODEL } from './constants.js';
import { PromptBuilder } from './PromptBuilder.js';
import { PlanValidator } from './PlanValidator.js';
import { ResponseParser } from './ResponseParser.js';
import OpenAI from 'openai';

/**
 * Handles prompt generation and plan creation via the OpenAI API.
 */
export class OpenAIPlanner {
  /**
   * @param {OpenAI} client
   * @param {import('./ToolRegistry.js').ToolRegistry} toolRegistry
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
   * @param {import('./types.js').AgentRequest} request
   * @param {{debug?: boolean, includeRawResponse?: boolean}} [options]
   * @returns {Promise<{plan: import('./types.js').CommandPlan, rawPlan: any, debug?: Record<string, any>}>}
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
    } 
    catch (error) {
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

function safeSerialize(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}
