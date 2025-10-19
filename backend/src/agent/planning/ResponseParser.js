/**
 * OpenAIレスポンスからテキスト部分を抽出するヘルパークラスです。
 */
export class ResponseParser {
  /**
   * 各種レスポンス構造から最初に見つかったテキストを取り出します。
   * @param {any} response
   * @returns {string}
   */
  static extractText(response) {
    if (!response || typeof response !== 'object') {
      throw new Error('OpenAIレスポンスが不正です。');
    }

    if (typeof response.output_text === 'string') {
      return response.output_text;
    }

    if (Array.isArray(response.output)) {
      for (const item of response.output) {
        if (item && Array.isArray(item.content)) {
          for (const chunk of item.content) {
            if (chunk && typeof chunk.text === 'string') {
              return chunk.text;
            }
          }
        }
      }
    }

    if (Array.isArray(response.choices)) {
      for (const choice of response.choices) {
        const content = choice?.message?.content;
        if (typeof content === 'string') {
          return content;
        }
        if (Array.isArray(content)) {
          const textChunk = content.find((part) => part.type === 'text' && typeof part.text === 'string');
          if (textChunk && typeof textChunk.text === 'string') {
            return textChunk.text;
          }
        }
      }
    }

    throw new Error('OpenAIレスポンスからテキストを取得できませんでした。');
  }
}
