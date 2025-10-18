import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const response = await openai.responses.create({
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