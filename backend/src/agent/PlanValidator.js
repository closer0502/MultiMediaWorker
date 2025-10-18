import path from 'node:path';

/**
 * Validates a command plan returned by the planner.
 */
export class PlanValidator {
  /**
   * @param {import('./ToolRegistry.js').ToolRegistry} toolRegistry
   */
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  /**
   * @param {import('./types.js').CommandPlan} plan
   * @param {string} outputDir
   * @returns {import('./types.js').CommandPlan}
   */
  validate(plan, outputDir) {
    if (!plan || typeof plan !== 'object') {
      throw new Error('コマンドプランが空です。');
    }

    if (!this.toolRegistry.hasCommand(plan.command)) {
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
      plan.outputs = [];
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
}
