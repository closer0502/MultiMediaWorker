import { DEFAULT_TOOL_DEFINITIONS } from '../config/constants.js';

/**
 * 利用可能なCLIコマンドとそのメタ情報を管理するレジストリです。
 */
export class ToolRegistry {
  /**
   * 既定の定義に任意の追加定義をマージして初期化します。
   * @param {Record<string, {title: string, description: string}>} [definitions]
   */
  constructor(definitions) {
    this.definitions = { ...DEFAULT_TOOL_DEFINITIONS, ...definitions };
  }

  /**
   * 既定定義のみを使ってToolRegistryインスタンスを生成します。
   * @returns {ToolRegistry}
   */
  static createDefault() {
    return new ToolRegistry();
  }

  /**
   * 指定コマンドIDが登録済みか判定します。
   * @param {string} command
   * @returns {boolean}
   */
  hasCommand(command) {
    return Boolean(this.definitions[command]);
  }

  /**
   * すべてのコマンドIDを配列で返します。
   * @returns {string[]}
   */
  listCommandIds() {
    return Object.keys(this.definitions);
  }

  /**
   * 実行可能なコマンドIDのみを抽出して返します。
   * @returns {string[]}
   */
  listExecutableCommandIds() {
    return this.listCommandIds().filter((id) => id !== 'none');
  }

  /**
   * 実行可能なコマンドの概要リストを構築します。
   * @returns {Array<{id: string, title: string, description: string}>}
   */
  describeExecutableCommands() {
    return this.listExecutableCommandIds().map((id) => ({
      id,
      title: this.definitions[id].title,
      description: this.definitions[id].description
    }));
  }
}
