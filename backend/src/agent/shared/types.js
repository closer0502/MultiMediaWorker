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
 * @typedef {Object} CommandPlan
 * @property {'ffmpeg'|'magick'|'exiftool'|'none'} command
 * @property {string[]} arguments
 * @property {string} reasoning
 * @property {string} [followUp]
 * @property {CommandOutputPlan[]} outputs
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
 * @typedef {Object} CommandExecutionResult
 * @property {number|null} exitCode
 * @property {boolean} timedOut
 * @property {string} stdout
 * @property {string} stderr
 * @property {DescribedOutput[]} resolvedOutputs
 * @property {boolean|undefined} dryRun
 */

export {};
