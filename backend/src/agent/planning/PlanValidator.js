import path from 'node:path';

/** @typedef {import('../registry/ToolRegistry.js').ToolRegistry} ToolRegistry */
/** @typedef {import('../shared/types.js').CommandPlan} CommandPlan */

/**
 * プランナーから返されたコマンドプランの妥当性を検証するクラスです。
 */
export class PlanValidator {
  /**
   * 利用可能なコマンド一覧を持つツールレジストリを受け取ります。
   * @param {ToolRegistry} toolRegistry
   */
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  /**
   * コマンドプランを検証し、不足項目を補完した上で返します。
   * @param {CommandPlan} plan
   * @param {string} outputDir
   * @returns {CommandPlan}
   */
  validate(plan, outputDir) {
    if (!plan || typeof plan !== 'object') {
      throw new Error('コマンドプランが空か不正な形式です。');
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

    if (typeof outputDir !== 'string' || !outputDir.trim()) {
      throw new Error('出力ディレクトリが指定されていません。');
    }

    const normalizedOutputDir = path.resolve(outputDir);
    plan.outputs = plan.outputs.map((item) => {
      if (!item || typeof item !== 'object') {
        throw new Error('outputs の要素が不正です。');
      }

      const rawPath = typeof item.path === 'string' ? item.path.trim() : '';
      if (!rawPath) {
        throw new Error('outputs の path が指定されていません。');
      }

      const absolutePath = path.resolve(rawPath);
      const relative = path.relative(normalizedOutputDir, absolutePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`出力パスが許可ディレクトリ外です: ${item.path}`);
      }

      const description = typeof item.description === 'string' ? item.description : '';

      return {
        path: absolutePath,
        description
      };
    });

    return plan;
  }
}
