import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

/**
 * 検証済みのコマンドプランを実行して実行結果を取りまとめるクラスです。
 */
export class CommandExecutor {
  /**
   * タイムアウトなどの基本設定を受け取り初期化します。
   * @param {{timeoutMs?: number}} [options]
   */
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  }

  /**
   * コマンドプランを実行し、標準出力・エラーなどの結果を返します。
   * @param {import('../shared/types.js').CommandPlan} plan
   * @param {import('../shared/types.js').CommandExecutionOptions} [options]
   * @returns {Promise<import('../shared/types.js').CommandExecutionResult>}
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
   * 出力予定のファイルが置かれるディレクトリを作成します。
   * @param {import('../shared/types.js').CommandOutputPlan[]} outputs
   * @returns {Promise<void>}
   */
  async ensureOutputDirectories(outputs) {
    const uniqueDirs = new Set(outputs.map((item) => path.dirname(path.resolve(item.path))));
    await Promise.all(Array.from(uniqueDirs).map((dir) => fs.mkdir(dir, { recursive: true })));
  }

  /**
   * 出力ファイルの実在確認や公開パスを付加して詳細情報を組み立てます。
   * @param {import('../shared/types.js').CommandOutputPlan[]} outputs
   * @param {string|null} publicRoot
   * @returns {Promise<import('../shared/types.js').DescribedOutput[]>}
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
   * 子プロセスを起動して標準出力／エラーを収集します。
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
