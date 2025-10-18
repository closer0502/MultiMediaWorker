import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

/**
 * Executes validated command plans and returns runtime metadata.
 */
export class CommandExecutor {
  /**
   * @param {{timeoutMs?: number}} [options]
   */
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  }

  /**
   * @param {import('./types.js').CommandPlan} plan
   * @param {import('./types.js').CommandExecutionOptions} [options]
   * @returns {Promise<import('./types.js').CommandExecutionResult>}
   */
  async execute(plan, options = {}) {
    const cwd = options.cwd || process.cwd();
    const publicRoot = options.publicRoot ? path.resolve(options.publicRoot) : null;
    const dryRun = Boolean(options.dryRun);

    await this.ensureOutputDirectories(plan.outputs);

    const skipExecution = dryRun || plan.command === 'none';

    if (skipExecution) {
      return {
        exitCode: null,
        timedOut: false,
        stdout: '',
        stderr: '',
        resolvedOutputs: await this.describeOutputs(plan.outputs, publicRoot),
        dryRun: dryRun || plan.command === 'none'
      };
    }

    const { exitCode, stdout, stderr, timedOut } = await this.spawnProcess(plan.command, plan.arguments, cwd);

    return {
      exitCode,
      timedOut,
      stdout,
      stderr,
      resolvedOutputs: await this.describeOutputs(plan.outputs, publicRoot),
      dryRun: false
    };
  }

  /**
   * @param {import('./types.js').CommandOutputPlan[]} outputs
   * @returns {Promise<void>}
   */
  async ensureOutputDirectories(outputs) {
    const uniqueDirs = new Set(outputs.map((item) => path.dirname(path.resolve(item.path))));
    await Promise.all(Array.from(uniqueDirs).map((dir) => fs.mkdir(dir, { recursive: true })));
  }

  /**
   * @param {import('./types.js').CommandOutputPlan[]} outputs
   * @param {string|null} publicRoot
   * @returns {Promise<import('./types.js').DescribedOutput[]>}
   */
  async describeOutputs(outputs, publicRoot) {
    const described = [];
    for (const item of outputs) {
      const absolutePath = path.resolve(item.path);
      const exists = existsSync(absolutePath);
      let size = null;
      if (exists) {
        const stat = await fs.stat(absolutePath);
        size = stat.size;
      }
      let publicPath = null;
      if (exists && publicRoot) {
        const relative = path.relative(publicRoot, absolutePath);
        if (!relative.startsWith('..')) {
          publicPath = relative.split(path.sep).join('/');
        }
      }
      described.push({
        path: item.path,
        description: item.description,
        absolutePath,
        exists,
        size,
        publicPath
      });
    }
    return described;
  }

  /**
   * @param {string} command
   * @param {string[]} args
   * @param {string} cwd
   * @returns {Promise<{exitCode: number|null, stdout: string, stderr: string, timedOut: boolean}>}
   */
  spawnProcess(command, args, cwd) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: process.env,
        shell: false,
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';
      let finished = false;
      let timedOut = false;

      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, this.timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        if (!finished) {
          finished = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      });

      child.on('close', (code) => {
        if (!finished) {
          finished = true;
          clearTimeout(timeoutId);
          resolve({
            exitCode: timedOut ? null : code,
            stdout,
            stderr,
            timedOut
          });
        }
      });
    });
  }
}
