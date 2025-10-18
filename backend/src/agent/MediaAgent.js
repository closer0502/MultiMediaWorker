import { CommandExecutor } from './CommandExecutor.js';
import { OpenAIPlanner } from './OpenAIPlanner.js';
import { ToolRegistry } from './ToolRegistry.js';

/**
 * High-level orchestrator that ties the planner and executor together.
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
   * @param {import('./types.js').AgentRequest} request
   * @param {import('./types.js').CommandExecutionOptions} [options]
   * @returns {Promise<{plan: import('./types.js').CommandPlan, result: import('./types.js').CommandExecutionResult}>}
   */
  async runTask(request, options = {}) {
    const plan = await this.planner.plan(request);
    const result = await this.executor.execute(plan, options);
    return { plan, result };
  }

  /**
   * @returns {ToolRegistry}
   */
  getToolRegistry() {
    return this.toolRegistry;
  }
}

/**
 * Factory helper for standard agent wiring.
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
