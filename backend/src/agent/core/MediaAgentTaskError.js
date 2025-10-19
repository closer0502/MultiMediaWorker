/**
 * エージェント実行時に発生したエラーとフェーズ情報をひとまとめにする例外クラスです。
 */
export class MediaAgentTaskError extends Error {
  /**
   * エラー本文・実行フェーズ・追加コンテキストを受け取り例外を構築します。
   * @param {string} message
   * @param {Array<any>} phases
   * @param {{cause?: any, context?: Record<string, any>}} [options]
   */
  constructor(message, phases, options = {}) {
    super(message, { cause: options.cause });
    this.name = 'MediaAgentTaskError';
    this.phases = phases;
    this.context = options.context || {};
  }
}
