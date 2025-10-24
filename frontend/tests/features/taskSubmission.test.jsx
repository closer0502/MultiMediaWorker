import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App.jsx';

describe('タスク送信フォーム', () => {
  afterEach(() => {
    if (typeof vi.unstubAllGlobals === 'function') {
      vi.unstubAllGlobals();
    }
    vi.restoreAllMocks();
  });

  it('初期表示でフォームとガイダンスが確認できる', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'MultiMedia Worker' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'タスクを送信' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '送信する' })).toBeInTheDocument();
    expect(screen.getByText('まだ表示できる生成物がありません。')).toBeInTheDocument();
  });

  it('入力が空のまま送信するとバリデーションエラーを表示する', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '送信する' }));

    expect(await screen.findByText('タスク内容を入力してください。')).toBeInTheDocument();
  });

  it('ファイルを含むタスク送信で成功レスポンスを履歴に記録する', async () => {
    const payload = {
      sessionId: 'session-1',
      submittedAt: '2024-01-10T00:00:00.000Z',
      task: '映像をリサイズ',
      plan: {
        overview: 'Simple plan',
        followUp: '',
        steps: [
          {
            command: 'ffmpeg',
            arguments: ['-i', 'input.mp4', '-vf', 'scale=1280:720', 'output.mp4'],
            reasoning: 'Resize video',
            outputs: [{ path: '/tmp/output.mp4', description: 'resized video' }]
          }
        ]
      },
      result: {
        exitCode: 0,
        timedOut: false,
        stdout: '[step 1] ok',
        stderr: '',
        resolvedOutputs: [{ path: '/tmp/output.mp4', description: 'resized video', exists: true }],
        steps: [
          {
            status: 'executed',
            command: 'ffmpeg',
            arguments: ['-i', 'input.mp4', '-vf', 'scale=1280:720', 'output.mp4'],
            reasoning: 'Resize video',
            exitCode: 0,
            timedOut: false,
            stdout: 'done',
            stderr: ''
          }
        ]
      },
      phases: [{ id: 'plan', status: 'success' }, { id: 'execute', status: 'success' }],
      uploadedFiles: [
        { id: 'file-1', originalName: 'sample.png', size: 1024, mimeType: 'image/png' }
      ],
      status: 'success',
      detail: null,
      debug: null,
      responseText: null
    };

    let resolveFetch;
    const mockFetch = vi.fn(() => {
      return new Promise((resolve) => {
        resolveFetch = () =>
          resolve({
            ok: true,
            json: () => Promise.resolve(payload)
          });
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const user = userEvent.setup();
    render(<App />);

    const taskField = screen.getByLabelText('目的 / 指示');
    await user.type(taskField, '映像をリサイズ');

    const fileInput = screen.getByLabelText('ファイルを添付');
    const file = new File(['content'], 'sample.png', { type: 'image/png' });
    await user.upload(fileInput, file);

    expect(screen.getByText('選択したファイル（1）')).toBeInTheDocument();
    expect(screen.getByText('sample.png')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '送信する' }));

    expect(await screen.findByRole('button', { name: '処理中…' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'ただいま処理しています' })).toBeInTheDocument();

    resolveFetch();

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData)
      })
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(screen.getByRole('button', { name: '送信する' })).toBeEnabled();

    expect(await screen.findByRole('heading', { name: '最新の結果' })).toBeInTheDocument();
    expect(screen.getAllByText('成功')).not.toHaveLength(0);
    expect(screen.getByText('映像をリサイズ')).toBeInTheDocument();
    expect(screen.getByText(/1）ffmpeg/)).toBeInTheDocument();
  });
});
