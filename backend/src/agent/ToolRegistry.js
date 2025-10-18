import { DEFAULT_TOOL_DEFINITIONS } from './constants.js';

/**
 * Keeps track of available CLI tools.
 */
export class ToolRegistry {
  /**
   * @param {Record<string, {title: string, description: string}>} [definitions]
   */
  constructor(definitions) {
    this.definitions = { ...DEFAULT_TOOL_DEFINITIONS, ...definitions };
  }

  /**
   * @returns {ToolRegistry}
   */
  static createDefault() {
    return new ToolRegistry();
  }

  /**
   * @param {string} command
   * @returns {boolean}
   */
  hasCommand(command) {
    return Boolean(this.definitions[command]);
  }

  /**
   * @returns {string[]}
   */
  listCommandIds() {
    return Object.keys(this.definitions);
  }

  /**
   * @returns {string[]}
   */
  listExecutableCommandIds() {
    return this.listCommandIds().filter((id) => id !== 'none');
  }

  /**
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
