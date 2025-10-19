import OpenAI from 'openai';

/**
 * OpenAIクライアントを生成するファクトリー関数です。
 * @param {string|undefined} apiKey
 * @returns {OpenAI}
 */
export function createOpenAIClient(apiKey) {
  return new OpenAI({
    apiKey: apiKey || process.env.OPENAI_API_KEY
  });
}
