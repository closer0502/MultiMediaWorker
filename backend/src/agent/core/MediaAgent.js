import { CommandExecutor } from '../execution/CommandExecutor.js';
import { OpenAIPlanner } from '../planning/OpenAIPlanner.js';
import { ToolRegistry } from '../registry/ToolRegistry.js';
import { TaskPhaseTracker } from './TaskPhaseTracker.js';
import { MediaAgentTaskError } from './MediaAgentTaskError.js';
import OpenAI from 'openai';

/** @typedef {import('../index.js').AgentRequest} AgentRequest */
/** @typedef {import('../index.js').CommandPlan} CommandPlan */
/** @typedef {import('../index.js').CommandExecutionOptions} CommandExecutionOptions */
/** @typedef {import('../index.js').CommandExecutionResult} CommandExecutionResult */

/**
 * Orchestrates planning and executing multimedia workflows.
 */
export class MediaAgent {
  /**
   * @param {{planner: OpenAIPlanner, executor: CommandExecutor, toolRegistry: ToolRegistry}} deps
   */
  constructor({ planner, executor, toolRegistry }) {
    this.planner = planner;
    this.executor = executor;
    this.toolRegistry = toolRegistry;
  }

  /**
   * Produces a command plan and executes it.
   * @param {AgentRequest} request
   * @param {CommandExecutionOptions & {dryRun?: boolean, debug?: boolean, includeRawResponse?: boolean}} [options]
   * @returns {Promise<{plan: CommandPlan, rawPlan: any, result: CommandExecutionResult, phases: Array<any>, debug?: Record<string, any>}>}
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
      tracker.complete('plan', {
        steps: plan.steps.length,
        commands: plan.steps.map((step) => step.command)
      });
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
      const executeMeta = {
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        dryRun: dryRun || result?.dryRun || false,
        steps: result.steps.map((step) => ({
          command: step.command,
          status: step.status,
          exitCode: step.exitCode,
          timedOut: step.timedOut,
          skipReason: step.skipReason ?? null
        }))
      };
      if (hasExecutionFailure(result)) {
        const failureError = new Error(describeExecutionFailure(result));
        failureError.name = 'CommandExecutionError';
        tracker.fail('execute', failureError, executeMeta);
        throw new MediaAgentTaskError('Execution phase failed', tracker.getPhases(), {
          cause: failureError,
          context: {
            plan,
            rawPlan: rawPlan ?? plan,
            debug: debugInfo,
            result
          }
        });
      }
      tracker.complete('execute', executeMeta);
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
   * Returns the tool registry currently in use.
   * @returns {ToolRegistry}
   */
  getToolRegistry() {
    return this.toolRegistry;
  }
}

/**
 * Determine whether the executor result contains a failed command.
 * @param {CommandExecutionResult} result
 * @returns {boolean}
 */
function hasExecutionFailure(result) {
  if (!result) {
    return false;
  }
  if (result.timedOut) {
    return true;
  }
  if (typeof result.exitCode === 'number' && result.exitCode !== 0) {
    return true;
  }
  if (!Array.isArray(result.steps)) {
    return false;
  }
  return result.steps.some((step) => {
    if (!step || step.status !== 'executed') {
      return false;
    }
    if (step.timedOut) {
      return true;
    }
    return typeof step.exitCode === 'number' && step.exitCode !== 0;
  });
}

/**
 * Generate a human-readable summary for the first failing command.
 * @param {CommandExecutionResult} result
 * @returns {string}
 */
function describeExecutionFailure(result) {
  if (!result) {
    return 'Command execution failed.';
  }
  if (result.timedOut) {
    return 'Command execution timed out.';
  }
  const failedStep =
    Array.isArray(result.steps) &&
    result.steps.find(
      (step) =>
        step &&
        step.status === 'executed' &&
        (step.timedOut || (typeof step.exitCode === 'number' && step.exitCode !== 0))
    );
  if (failedStep) {
    if (failedStep.timedOut) {
      return `Command "${failedStep.command}" timed out.`;
    }
    const exitCode = typeof failedStep.exitCode === 'number' ? failedStep.exitCode : 'unknown';
    return `Command "${failedStep.command}" exited with code ${exitCode}.`;
  }
  if (typeof result.exitCode === 'number' && result.exitCode !== 0) {
    return `Command execution exited with code ${result.exitCode}.`;
  }
  return 'Command execution failed.';
}

/**
 * Factory helper to create a fully wired MediaAgent.
 * @param {OpenAI} client
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

