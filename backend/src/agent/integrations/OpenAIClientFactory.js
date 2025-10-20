import OpenAI from 'openai';

/**
 * OpenAIクライアントを生成するファクトリー関数です。
 * @param {string|undefined} apiKey
 * @returns {OpenAI}
 */
export function createOpenAIClient(apiKey, OpenAIClass = OpenAI) {
  return new OpenAIClass({
    apiKey: apiKey || process.env.OPENAI_API_KEY
  });
}
