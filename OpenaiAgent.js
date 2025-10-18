import dotenv from 'dotenv';

// .env.localファイルを読み込む
dotenv.config({ path: '.env.local' });

/**
 * @typedef {Object} CommandResponse
 * @property {string} command - コマンド名 (ffmpeg, magick, exiftool, none)
 * @property {string[]} arguments - コマンドの引数配列
 */

import OpenAI from "openai";

/**
 * @param {string|undefined} apiKey - OpenAI APIキー
 * @returns {OpenAI} OpenAIクライアント
 */
export function createOpenAIClient(apiKey) {
  return new OpenAI({
    apiKey: apiKey || process.env.OPENAI_API_KEY,
  });
}

/**
 * @param {OpenAI} client - OpenAIクライアント
 * @param {string} userQuery - ユーザーのクエリ
 * @returns {Promise<any>} OpenAI APIレスポンス
 */
export async function getCommandSuggestion(client, userQuery) {
  const response = await client.responses.create({
    model: "gpt-5",
    input: [
      {
        "role": "developer",
        "content": [
          {
            "type": "input_text",
            "text": "#あなたはユーザーの求める問題を解決する最適なターミナルコマンドを返答をします。\n#あなたが使えるコマンドは以下のコマンドリストです。\n- ffmpeg\n- magick(ImageMagick)\n- exiftool\n- none (ユーザーの求める問題を解決する上のどのコマンドでも無理な場合)\n\n#返答はJSON schemaに従って返してください。"
          }
        ]
      },
      {
        "role": "user",
        "content": [
          {
            "type": "input_text",
            "text": userQuery
          }
        ]
      }
    ],
    text: {
      "format": {
        "type": "json_schema",
        "name": "command_with_arguments",
        "strict": true,
        "schema": {
          "type": "object",
          "properties": {
            "command": {
              "type": "string",
              "description": "Command name (must be one of: ffmpeg, magick, exiftool, or none).",
              "enum": [
                "ffmpeg",
                "magick",
                "exiftool",
                "none"
              ]
            },
            "arguments": {
              "type": "array",
              "description": "Arguments for the command (each specified as a non-empty string; can be empty array).",
              "items": {
                "type": "string",
                "minLength": 1
              }
            }
          },
          "required": [
            "command",
            "arguments"
          ],
          "additionalProperties": false
        }
      },
      "verbosity": "medium"
    },
    reasoning: {
      "effort": "low"
    },
    tools: [],
    store: true,
    include: [
      "reasoning.encrypted_content",
      "web_search_call.action.sources"
    ]
  });
  return response;
}