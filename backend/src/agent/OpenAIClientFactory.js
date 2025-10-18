import OpenAI from 'openai';

/**
 * @param {string|undefined} apiKey
 * @returns {OpenAI}
 */
export function createOpenAIClient(apiKey) {
  return new OpenAI({
    apiKey: apiKey || process.env.OPENAI_API_KEY
  });
}
