import { CommandExecutor } from '../execution/CommandExecutor.js';
import { OpenAIPlanner } from '../planning/OpenAIPlanner.js';
import { ToolRegistry } from '../registry/ToolRegistry.js';
import { TaskPhaseTracker } from './TaskPhaseTracker.js';
import { MediaAgentTaskError } from './MediaAgentTaskError.js';

/**
 * メディア処理タスクの計画と実行を統括するエージェント。
 */
export class MediaAgent {
  /**
   * 依存するプランナー・実行器・ツールレジストリを受け取り初期化します。
   * @param {{planner: OpenAIPlanner, executor: CommandExecutor, toolRegistry: ToolRegistry}} deps
   */
  constructor({ planner, executor, toolRegistry }) {
    this.planner = planner;
    this.executor = executor;
    this.toolRegistry = toolRegistry;
  }

  /**
   * タスクを計画してから実行し、結果と進捗ログをまとめて返します。
   * @param {import('../shared/types.js').AgentRequest} request
   * @param {import('../shared/types.js').CommandExecutionOptions & {dryRun?: boolean, debug?: boolean, includeRawResponse?: boolean}} [options]
   * @returns {Promise<{plan: import('../shared/types.js').CommandPlan, rawPlan: any, result: import('../shared/types.js').CommandExecutionResult, phases: Array<any>, debug?: Record<string, any>}>}
   */
  async runTask(request, options = {}) {
    const { dryRun = false, debug = false, includeRawResponse = false, ...executionOptions } = options;
    const tracker = new TaskPhaseTracker();

    tracker.start('plan', { task: request.task.slice(0, 120) });
    let plan;
    let rawPlan;
    let debugInfo;
    try {
      const planResult = await this.planner.plan(request, { debug, includeRawResponse });
      plan = planResult.plan;
      rawPlan = planResult.rawPlan;
      debugInfo = planResult.debug;
      tracker.complete('plan', { command: plan.command });
    } catch (error) {
      tracker.fail('plan', error);
      throw new MediaAgentTaskError('Plan phase failed', tracker.getPhases(), {
        cause: error,
        context: {
          rawPlan: error?.rawPlan ?? null,
          debug: error?.debug ?? null,
          responseText: error?.responseText ?? null
        }
      });
    }

    tracker.start('execute', { dryRun });
    let result;
    try {
      if (dryRun) {
        tracker.log('execute', 'Dry-run mode enabled; skipping command execution.');
      }
      result = await this.executor.execute(plan, { ...executionOptions, dryRun });
      tracker.complete('execute', {
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        dryRun: dryRun || result?.dryRun || false
      });
    } catch (error) {
      tracker.fail('execute', error);
      throw new MediaAgentTaskError('Execution phase failed', tracker.getPhases(), {
        cause: error,
        context: { plan, rawPlan: rawPlan ?? plan, debug: debugInfo }
      });
    }

    tracker.start('summarize');
    tracker.complete('summarize', {
      outputs: Array.isArray(result.resolvedOutputs) ? result.resolvedOutputs.length : 0
    });

    return {
      plan,
      rawPlan: rawPlan ?? plan,
      result,
      phases: tracker.getPhases(),
      debug: debugInfo
    };
  }

  /**
   * 現在使用可能なツールレジストリを返します。
   * @returns {ToolRegistry}
   */
  getToolRegistry() {
    return this.toolRegistry;
  }
}

/**
 * 標準構成のメディアエージェントを生成します。
 * @param {import('openai').Client} client
 * @param {{toolRegistry?: ToolRegistry, executorOptions?: {timeoutMs?: number}, model?: string}} [options]
 * @returns {MediaAgent}
 */
export function createMediaAgent(client, options = {}) {
  const toolRegistry = options.toolRegistry || ToolRegistry.createDefault();
  const planner = new OpenAIPlanner(client, toolRegistry, { model: options.model });
  const executor = new CommandExecutor(options.executorOptions);

  return new MediaAgent({
    planner,
    executor,
    toolRegistry
  });
}
