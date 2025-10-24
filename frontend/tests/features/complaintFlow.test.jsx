import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App.jsx';

describe('修正リクエストフロー', () => {
  afterEach(() => {
    if (typeof vi.unstubAllGlobals === 'function') {
      vi.unstubAllGlobals();
    }
    vi.restoreAllMocks();
  });

  it('生成物がない場合は修正リクエストボタンが無効', async () => {
    const user = userEvent.setup();
    render(<App />);

    const complaintField = screen.getByPlaceholderText(
      '例: 出力された動画が指定より暗いので明るさを調整してください。'
    );
    await user.type(complaintField, '仕上がりに不満があります');

    const complaintButton = screen.getByRole('button', { name: '再編集を依頼' });
    expect(complaintButton).toBeDisabled();
    expect(screen.getByText('修正リクエストは生成物が確認できる状態で利用できます。')).toBeInTheDocument();
  });

  it('最新の生成物から修正リクエストを送信できる', async () => {
    const taskPayload = {
      sessionId: 'session-1',
      submittedAt: '2024-01-10T00:00:00.000Z',
      task: '最初のタスク',
      plan: {
        overview: '',
        followUp: '',
        steps: [
          {
            command: 'ffmpeg',
            arguments: ['-i', 'input.mp4', 'output.mp4'],
            reasoning: 'convert',
            outputs: [{ path: '/tmp/output.mp4', description: 'converted' }]
          }
        ]
      },
      result: {
        exitCode: 0,
        timedOut: false,
        stdout: '',
        stderr: '',
        resolvedOutputs: [{ path: '/tmp/output.mp4', description: 'converted', exists: true }],
        steps: []
      },
      phases: [],
      uploadedFiles: [],
      status: 'success',
      detail: null,
      debug: null,
      responseText: null
    };

    const revisionPayload = {
      sessionId: 'session-2',
      parentSessionId: 'session-1',
      submittedAt: '2024-01-11T00:00:00.000Z',
      task: '最初のタスク',
      plan: taskPayload.plan,
      result: taskPayload.result,
      phases: [],
      uploadedFiles: [],
      status: 'success',
      detail: null,
      debug: null,
      responseText: null,
      complaint: 'もっと明るくしてください。'
    };

    const mockFetch = vi.fn((url) => {
      if (url.startsWith('/api/tasks')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(taskPayload)
        });
      }
      if (url.startsWith('/api/revisions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(revisionPayload)
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal('fetch', mockFetch);

    const user = userEvent.setup();
    render(<App />);

    const taskField = screen.getByLabelText('目的 / 指示');
    await user.type(taskField, '最初のタスク');
    await user.click(screen.getByRole('button', { name: '送信する' }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({ method: 'POST' })
    ));

    await screen.findByRole('heading', { name: '最新の結果' });
    const complaintField = screen.getByPlaceholderText(
      '例: 出力された動画が指定より暗いので明るさを調整してください。'
    );
    await user.type(complaintField, 'もっと明るくしてください。');

    const complaintButton = screen.getByRole('button', { name: '再編集を依頼' });
    await waitFor(() => expect(complaintButton).toBeEnabled());

    await user.click(complaintButton);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      '/api/revisions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' })
      })
    ));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const latestHeader = await screen.findByRole('heading', { name: '最新の結果' });
    expect(latestHeader).toBeInTheDocument();
    expect(screen.getByText('再編集')).toBeInTheDocument();
    expect(screen.getByText('もっと明るくしてください。')).toBeInTheDocument();
  });
});
