/**
 * @typedef {Object} AgentFile
 * @property {string} id
 * @property {string} originalName
 * @property {string} absolutePath
 * @property {number} size
 * @property {string|undefined} mimeType
 */

/**
 * @typedef {Object} AgentRequest
 * @property {string} task
 * @property {AgentFile[]} files
 * @property {string} outputDir
 */

/**
 * @typedef {Object} CommandOutputPlan
 * @property {string} path
 * @property {string} description
 */

/**
 * @typedef {Object} CommandStepPlan
 * @property {'ffmpeg'|'magick'|'exiftool'|'none'} command
 * @property {string[]} arguments
 * @property {string} reasoning
 * @property {CommandOutputPlan[]} outputs
 * @property {string|undefined} id
 * @property {string|undefined} title
 * @property {string|undefined} note
 */

/**
 * @typedef {Object} CommandPlan
 * @property {CommandStepPlan[]} steps
 * @property {string|undefined} overview
 * @property {string|undefined} followUp
 */

/**
 * @typedef {Object} CommandExecutionOptions
 * @property {string} [cwd]
 * @property {number} [timeoutMs]
 * @property {string} [publicRoot]
 * @property {boolean} [dryRun]
 */

/**
 * @typedef {Object} DescribedOutput
 * @property {string} description
 * @property {string} path
 * @property {string} absolutePath
 * @property {boolean} exists
 * @property {number|null} size
 * @property {string|null} publicPath
 */

/**
 * @typedef {'executed'|'skipped'} CommandStepStatus
 */

/**
 * @typedef {Object} CommandStepResult
 * @property {CommandStepStatus} status
 * @property {string} command
 * @property {string[]} arguments
 * @property {string} reasoning
 * @property {number|null} exitCode
 * @property {boolean} timedOut
 * @property {string} stdout
 * @property {string} stderr
 * @property {string|undefined} skipReason
 */

/**
 * @typedef {Object} CommandExecutionResult
 * @property {number|null} exitCode
 * @property {boolean} timedOut
 * @property {string} stdout
 * @property {string} stderr
 * @property {DescribedOutput[]} resolvedOutputs
 * @property {boolean|undefined} dryRun
 * @property {CommandStepResult[]} steps
 */

export {};
