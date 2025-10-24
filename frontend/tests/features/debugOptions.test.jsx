import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App.jsx';

describe('デバッグオプション', () => {
  afterEach(() => {
    if (typeof vi.unstubAllGlobals === 'function') {
      vi.unstubAllGlobals();
    }
    vi.restoreAllMocks();
  });

  it('ドライランとデバッグを有効にするとAPIのクエリが切り替わる', async () => {
    const payload = {
      sessionId: 'session-debug',
      submittedAt: '2024-01-10T00:00:00.000Z',
      task: 'sample',
      plan: { overview: '', followUp: '', steps: [] },
      result: { exitCode: 0, timedOut: false, stdout: '', stderr: '', resolvedOutputs: [], steps: [] },
      phases: [],
      uploadedFiles: [],
      status: 'success',
      detail: null,
      debug: null,
      responseText: null
    };

    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(payload)
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const user = userEvent.setup();
    render(<App />);

    const dryRunCheckbox = screen.getByLabelText('ドライラン（コマンド実行をスキップ）');
    const debugCheckbox = screen.getByLabelText('プラン生成のデバッグ情報を含める（生レスポンス含む）');

    expect(dryRunCheckbox).not.toBeChecked();
    expect(debugCheckbox).not.toBeChecked();

    await user.click(dryRunCheckbox);
    await user.click(debugCheckbox);

    expect(dryRunCheckbox).toBeChecked();
    expect(debugCheckbox).toBeChecked();

    const taskField = screen.getByLabelText('目的 / 指示');
    await user.type(taskField, 'テスト');

    await user.click(screen.getByRole('button', { name: '送信する' }));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    expect(mockFetch.mock.calls[0][0]).toBe('/api/tasks?debug=verbose&dryRun=true');
  });

  it('デバッグオプションを折りたたむとチェックボックスが非表示になる', async () => {
    const user = userEvent.setup();
    render(<App />);

    const headerToggle = screen.getByLabelText('デバッグオプション');
    expect(screen.getByLabelText('ドライラン（コマンド実行をスキップ）')).toBeInTheDocument();

    await user.click(headerToggle);

    expect(headerToggle).not.toBeChecked();
    expect(screen.queryByLabelText('ドライラン（コマンド実行をスキップ）')).not.toBeInTheDocument();

    await user.click(headerToggle);

    expect(headerToggle).toBeChecked();
    expect(screen.getByLabelText('プラン生成のデバッグ情報を含める（生レスポンス含む）')).toBeInTheDocument();
  });
});
