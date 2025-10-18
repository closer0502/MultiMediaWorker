/**
 * @typedef {Object} MockResponse
 * @property {any} data - レスポンスデータ
 */

import { createOpenAIClient, getCommandSuggestion } from './OpenaiAgent.js';

/**
 * @param {any} mockResponseData - モックレスポンスデータ
 * @returns {any} モッククライアント
 */
function createMockClient(mockResponseData) {
  return {
    responses: {
      create: async () => mockResponseData
    }
  };
}

/**
 * テスト実行
 * @returns {Promise<void>}
 */
async function runTests() {
  console.log('=== OpenaiAgent テスト開始 ===\n');

  // テスト1: createOpenAIClient
  console.log('[テスト1] createOpenAIClient関数のテスト');
  try {
    const client = createOpenAIClient('test-api-key');
    console.log('✓ クライアント作成成功:', client ? 'OK' : 'NG');
  } catch (error) {
    console.log('✗ エラー:', error.message);
  }

  // テスト2: getCommandSuggestion (モッククライアント)
  console.log('\n[テスト2] getCommandSuggestion関数のテスト (モック)');
  try {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              command: 'ffmpeg',
              arguments: ['-i', 'input.mp4', 'output.mp4']
            })
          }
        }
      ]
    };
    
    const mockClient = createMockClient(mockResponse);
    const result = await getCommandSuggestion(mockClient, '動画を変換したい');
    console.log('✓ レスポンス取得成功:', result ? 'OK' : 'NG');
    console.log('  レスポンス:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('✗ エラー:', error.message);
  }

  // テスト3: 実際のAPIコール (環境変数がある場合のみ)
  console.log('\n[テスト3] 実際のAPIコール');
  if (process.env.OPENAI_API_KEY) {
    try {
      const client = createOpenAIClient();
      console.log('✓ 実際のAPIキーが設定されています');
      console.log('  (実際のAPI呼び出しはスキップ - コスト削減のため)');
      // 実際に呼び出す場合は以下のコメントを外す
      // const result = await getCommandSuggestion(client, '画像をリサイズしたい');
      // console.log('  結果:', result);
    } catch (error) {
      console.log('✗ エラー:', error.message);
    }
  } else {
    console.log('⚠ OPENAI_API_KEYが設定されていません (スキップ)');
  }

  console.log('\n=== テスト完了 ===');
}

// テスト実行
runTests().catch(error => {
  console.error('テスト実行エラー:', error);
  process.exit(1);
});
