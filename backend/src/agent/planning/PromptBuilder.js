import path from 'node:path';

/** @typedef {import('../registry/ToolRegistry.js').ToolRegistry} ToolRegistry */
/** @typedef {import('../shared/types.js').AgentRequest} AgentRequest */

/**
 * OpenAIプランナー向けの開発者プロンプトを組み立てるビルダーです。
 */
export class PromptBuilder {
  /**
   * 利用可能なツール定義を基にインスタンスを構築します。
   * @param {ToolRegistry} toolRegistry
   */
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  /**
   * エージェントリクエストを受け取り、プロンプト文字列を生成します。
   * @param {AgentRequest} request
   * @returns {string}
   */
  build(request) {
    const toolSummary = this.toolRegistry
      .describeExecutableCommands()
      .map((tool) => `- ${tool.id}: ${tool.description}`)
      .join('\n');

    const fileSummary =
      request.files.length > 0
        ? request.files
            .map((file, index) => {
              const lines = [
                `${index + 1}. ${file.originalName}`,
                `   path: ${normalizePath(file.absolutePath)}`,
                `   size: ${file.size} bytes`
              ];
              if (file.mimeType) {
                lines.push(`   mime: ${file.mimeType}`);
              }
              return lines.join('\n');
            })
            .join('\n')
        : '添付ファイルはありません。';

    return [
      'あなたはマルチメディア処理を支援するCLIアシスタントです。',
      '利用可能なコマンドは次の通りです:',
      toolSummary,
      '入力ファイル一覧:',
      fileSummary,
      `新しいファイルは必ず次のディレクトリ配下に生成してください: ${normalizePath(request.outputDir)}`,
      '要件:',
      '- 返却はJSONのみ。',
      `- commandは ${this.toolRegistry.listCommandIds().join(' / ')} のいずれか。`,
      '- argumentsにはコマンドライン引数を実行順通りに格納。',
      '- outputsには生成予定のファイル(未生成の可能性があっても)を列挙。',
      '- 実行できない場合は command を none とし理由を reasoning に記載。',
      '- ファイルパスは絶対パスで記載。'
    ].join('\n\n');
  }
}

function normalizePath(targetPath) {
  return path.resolve(targetPath);
}
