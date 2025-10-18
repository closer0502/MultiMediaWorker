import { DEFAULT_MODEL } from './constants.js';
import { PromptBuilder } from './PromptBuilder.js';
import { PlanValidator } from './PlanValidator.js';
import { ResponseParser } from './ResponseParser.js';

/**
 * Handles prompt generation and plan creation via the OpenAI API.
 */
export class OpenAIPlanner {
  /**
   * @param {import('openai').Client} client
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
   * @returns {Promise<import('./types.js').CommandPlan>}
   */
  async plan(request) {
    const developerPrompt = this.promptBuilder.build(request);
    const response = await this.client.responses.create({
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
      response_format: this.buildResponseFormat()
    });

    const responseText = ResponseParser.extractText(response);
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (error) {
      throw new Error(`OpenAIレスポンスのJSON解析に失敗しました: ${error.message}`);
    }

    return this.planValidator.validate(parsed, request.outputDir);
  }

  buildResponseFormat() {
    return {
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
              enum: this.toolRegistry.listCommandIds(),
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
    };
  }
}
