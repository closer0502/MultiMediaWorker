import path from 'node:path';

/**
 * Builds the developer prompt sent to the OpenAI planner.
 */
export class PromptBuilder {
  /**
   * @param {import('./ToolRegistry.js').ToolRegistry} toolRegistry
   */
  constructor(toolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  /**
   * @param {import('./types.js').AgentRequest} request
   * @returns {string}
   */
  build(request) {
    const toolSummary = this.toolRegistry
      .describeExecutableCommands()
      .map((tool) => `- ${tool.id}: ${tool.description}`)
      .join('\n');

    const fileSummary = request.files.length
      ? request.files
          .map(
            (file, index) =>
              `${index + 1}. ${file.originalName}\n   path: ${normalizePath(file.absolutePath)}\n   size: ${
                file.size
              } bytes${file.mimeType ? `\n   mime: ${file.mimeType}` : ''}`
          )
          .join('\n')
      : 'なし';

    return [
      'あなたはマルチメディア処理のCLIアシスタントです。',
      '利用可能なコマンドは次の通りです:',
      toolSummary,
      '入力ファイル一覧:',
      fileSummary,
      `新しいファイルは必ず次のディレクトリ配下に生成してください: ${normalizePath(request.outputDir)}`,
      '要件:',
      '- 返却はJSONのみ。',
      `- commandは ${this.toolRegistry.listCommandIds().join(' / ')} のいずれか。`,
      '- argumentsにはコマンドライン引数を順番通りに格納。',
      '- outputsには生成されるファイル(存在しない場合も予定として)を列挙。',
      '- 実行できない場合は command を none として理由を reasoning に記載。',
      '- ファイルパスは絶対パスで指定。'
    ].join('\n\n');
  }
}

function normalizePath(targetPath) {
  return path.resolve(targetPath);
}
