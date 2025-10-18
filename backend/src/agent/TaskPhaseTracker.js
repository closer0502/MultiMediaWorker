const DEFAULT_PHASES = [
  { id: 'plan', title: 'Plan command' },
  { id: 'execute', title: 'Execute command' },
  { id: 'summarize', title: 'Summarize results' }
];

/**
 * Tracks progress across discrete phases for a task run.
 */
export class TaskPhaseTracker {
  /**
   * @param {Array<{id: string, title: string}>} [phases]
   */
  constructor(phases = DEFAULT_PHASES) {
    this._phases = phases.map((phase) => ({
      id: phase.id,
      title: phase.title,
      status: 'pending',
      startedAt: null,
      finishedAt: null,
      error: null,
      meta: {},
      logs: []
    }));
  }

  /**
   * @param {string} phaseId
   * @param {Record<string, any>} [meta]
   */
  start(phaseId, meta = {}) {
    const phase = this._findPhase(phaseId);
    if (!phase) {
      return;
    }
    const now = new Date().toISOString();
    phase.status = 'in_progress';
    phase.startedAt = phase.startedAt || now;
    phase.meta = { ...phase.meta, ...meta };
  }

  /**
   * @param {string} phaseId
   * @param {Record<string, any>} [meta]
   */
  complete(phaseId, meta = {}) {
    const phase = this._findPhase(phaseId);
    if (!phase) {
      return;
    }
    const now = new Date().toISOString();
    phase.status = 'success';
    phase.finishedAt = now;
    phase.meta = { ...phase.meta, ...meta };
  }

  /**
   * @param {string} phaseId
   * @param {Error|string} error
   * @param {Record<string, any>} [meta]
   */
  fail(phaseId, error, meta = {}) {
    const phase = this._findPhase(phaseId);
    if (!phase) {
      return;
    }
    const now = new Date().toISOString();
    phase.status = 'failed';
    phase.finishedAt = now;
    phase.meta = { ...phase.meta, ...meta };
    phase.error =
      typeof error === 'string'
        ? { message: error }
        : {
            message: error?.message ?? 'Unknown error',
            stack: error?.stack ?? null,
            name: error?.name ?? 'Error'
          };
  }

  /**
   * @param {string} phaseId
   * @param {string} message
   */
  log(phaseId, message) {
    const phase = this._findPhase(phaseId);
    if (!phase) {
      return;
    }
    phase.logs.push({ at: new Date().toISOString(), message });
  }

  /**
   * @returns {Array<any>}
   */
  getPhases() {
    return this._phases.map((phase) => ({
      ...phase,
      meta: { ...phase.meta },
      logs: [...phase.logs]
    }));
  }

  _findPhase(phaseId) {
    return this._phases.find((phase) => phase.id === phaseId);
  }
}

export { DEFAULT_PHASES as DEFAULT_TASK_PHASES };
