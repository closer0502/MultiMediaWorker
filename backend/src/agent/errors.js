export class MediaAgentTaskError extends Error {
  /**
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
