import path from 'node:path';

import { formatMediaMetadataLines } from '../shared/MediaMetadata.js';

/** @typedef {import('../registry/ToolRegistry.js').ToolRegistry} ToolRegistry */
/** @typedef {import('../shared/types.js').AgentRequest} AgentRequest */

/**
 * Builds the developer prompt that guides the planner model.
 */
export class PromptBuilder {
  /**
   * @param {ToolRegistry} toolRegistry
   */
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  /**
   * Generates a multi-step planning instruction for the model.
   * @param {AgentRequest} request
   * @returns {Promise<string>}
   */
  async build(request) {
    const toolSummary = this.toolRegistry
      .describeExecutableCommands()
      .map((tool) => `- ${tool.id}: ${tool.description}`)
      .join('\n');

    const fileSummary = await this.buildFileSummary(request);

    return [
      'You are a multimedia conversion CLI assistant.',
      'Available commands:',
      toolSummary,
      'Input files:',
      fileSummary,
      `Place any new files inside: ${normalizePath(request.outputDir)}`,
      'Rules:',
      '- Output must be JSON only.',
      '- Define an ordered array of command steps in the steps property.',
      `- Each step command must be one of ${this.toolRegistry.listCommandIds().join(' / ')}; use none if nothing should run.`,
      '- arguments must list CLI arguments in execution order.',
      '- reasoning should briefly explain why the step is needed.',
      '- outputs must list planned files (even if they may not exist yet).',
      '- Add followUp or overview strings when helpful.',
      '- Use absolute paths and keep every path inside outputDir.'
    ].join('\n\n');
  }

  /**
   * @param {AgentRequest} request
   * @returns {Promise<string>}
   */
  async buildFileSummary(request) {
    if (!request.files.length) {
      return 'No input files were provided.';
    }

    const summaries = [];
    for (let index = 0; index < request.files.length; index += 1) {
      const file = request.files[index];
      const lines = [
        `${index + 1}. ${file.originalName}`,
        `   path: ${normalizePath(file.absolutePath)}`,
        `   size: ${file.size} bytes`
      ];
      if (file.mimeType) {
        lines.push(`   mime: ${file.mimeType}`);
      }
      try {
        const metadataLines = await formatMediaMetadataLines(file);
        if (metadataLines && metadataLines.length) {
          metadataLines.forEach((metaLine) => {
            lines.push(`   ${metaLine}`);
          });
        }
      } catch {
        // 取得に失敗した場合は無視
      }
      summaries.push(lines.join('\n'));
    }
    return summaries.join('\n');
  }
}

function normalizePath(targetPath) {
  return path.resolve(targetPath);
}
