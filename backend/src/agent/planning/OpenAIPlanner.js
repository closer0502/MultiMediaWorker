// @ts-check

import OpenAI from 'openai';
import { DEFAULT_MODEL } from '../config/constants.js';
import { PromptBuilder } from './PromptBuilder.js';
import { PlanValidator } from './PlanValidator.js';
import { ResponseParser } from './ResponseParser.js';

/** @typedef {import('../index.js').ToolRegistry} ToolRegistry */
/** @typedef {import('../index.js').AgentRequest} AgentRequest */
/** @typedef {import('../index.js').CommandPlan} CommandPlan */

/**
 * Generates executable command plans with the OpenAI Responses API.
 */
export class OpenAIPlanner {
  /**
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
   * Plans a multi-step command workflow for the given request.
   * @param {AgentRequest} request
   * @param {{debug?: boolean, includeRawResponse?: boolean}} [options]
   * @returns {Promise<{plan: CommandPlan, rawPlan: any, debug?: Record<string, any>}>}
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
      throw new Error(`Failed to parse OpenAI response as JSON: ${error.message}`);
    }

    const normalized = this.normalizePlanStructure(parsed);

    const debug = options.debug
      ? {
          model: this.model,
          developerPrompt,
          responseText,
          parsed: normalized,
          rawResponse: options.includeRawResponse ? safeSerialize(response) : undefined
        }
      : undefined;

    try {
      const plan = this.planValidator.validate(normalized, request.outputDir);
      return { plan, rawPlan: normalized, debug };
    } catch (error) {
      if (error && typeof error === 'object') {
        /** @type {Record<string, any>} */
        const errorObj = error;
        errorObj.rawPlan = normalized;
        if (debug) {
          errorObj.debug = debug;
        }
        errorObj.responseText = responseText;
      }
      throw error;
    }
  }

  /**
   * Builds a JSON schema describing the multi-step command plan.
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
        required: ['steps'],
        properties: {
          overview: {
            type: 'string',
            description: 'High level summary of the approach.'
          },
          followUp: {
            type: 'string',
            description: 'Optional follow-up guidance for the operator.'
          },
          steps: {
            type: 'array',
            minItems: 1,
            description: 'Ordered command steps to execute.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['command', 'arguments', 'reasoning', 'outputs'],
              properties: {
                id: {
                  type: 'string',
                  description: 'Optional identifier for the step.'
                },
                title: {
                  type: 'string',
                  description: 'Short label for the step.'
                },
                note: {
                  type: 'string',
                  description: 'Additional explanation or caution.'
                },
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
                  description: 'Why this step is needed.'
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
      }
    };
  }

  /**
   * Normalises legacy single-command structures into the multi-step format.
   * @param {any} value
   * @returns {any}
   */
  normalizePlanStructure(value) {
    if (!value || typeof value !== 'object') {
      return value;
    }

    if (Array.isArray(value.steps)) {
      return {
        overview: typeof value.overview === 'string' ? value.overview : '',
        followUp: typeof value.followUp === 'string' ? value.followUp : '',
        steps: value.steps.map((step) => ({
          command: step?.command,
          arguments: Array.isArray(step?.arguments) ? [...step.arguments] : [],
          reasoning: typeof step?.reasoning === 'string' ? step.reasoning : '',
          outputs: Array.isArray(step?.outputs) ? [...step.outputs] : [],
          id: typeof step?.id === 'string' ? step.id : undefined,
          title: typeof step?.title === 'string' ? step.title : undefined,
          note: typeof step?.note === 'string' ? step.note : undefined
        }))
      };
    }

    const legacyCommand = typeof value.command === 'string' ? value.command : 'none';
    const legacyArguments = Array.isArray(value.arguments) ? [...value.arguments] : [];
    const legacyOutputs = Array.isArray(value.outputs) ? [...value.outputs] : [];
    const legacyReasoning = typeof value.reasoning === 'string' ? value.reasoning : '';
    const legacyFollowUp = typeof value.followUp === 'string' ? value.followUp : '';

    return {
      overview: legacyReasoning,
      followUp: legacyFollowUp,
      steps: [
        {
          command: legacyCommand,
          arguments: legacyArguments,
          reasoning: legacyReasoning,
          outputs: legacyOutputs
        }
      ]
    };
  }
}

/**
 * Safely serialises arbitrary values into JSON-compatible structures.
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
