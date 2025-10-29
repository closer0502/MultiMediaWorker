import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PROGRESS_ROTATION_MS, PROGRESS_STEPS } from '../constants/app.js';

const INITIAL_HISTORY = [];
const LOG_LINE_LIMIT = 500;

export function useTaskWorkflow() {
  const [task, setTask] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState(INITIAL_HISTORY);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [showDebugOptions, setShowDebugOptions] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [progressStage, setProgressStage] = useState(0);
  const [complaintText, setComplaintText] = useState('');
  const [complaintError, setComplaintError] = useState('');
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);
  const [liveLogs, setLiveLogs] = useState([]);
  const fileInputRef = useRef(null);
  const eventSourceRef = useRef(null);
  const logChannelRef = useRef('');
  const logChunkBufferRef = useRef({ stdout: '', stderr: '' });

  useEffect(() => {
    if (!isSubmitting) {
      setProgressStage(0);
      return undefined;
    }

    setProgressStage(0);
    const timer = setInterval(() => {
      setProgressStage((prev) => {
        if (prev >= PROGRESS_STEPS.length - 1) {
          return prev;
        }
        return prev + 1;
      });
    }, PROGRESS_ROTATION_MS);
    return () => clearInterval(timer);
  }, [isSubmitting]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    const { body } = document;
    if (!body) {
      return undefined;
    }
    body.classList.toggle('modal-open', isSubmitting);
    return () => {
      body.classList.remove('modal-open');
    };
  }, [isSubmitting]);

  const appendLogLines = useCallback((lines) => {
    if (!Array.isArray(lines) || lines.length === 0) {
      return;
    }
    setLiveLogs((prev) => {
      const merged = [...prev, ...lines];
      if (merged.length > LOG_LINE_LIMIT) {
        return merged.slice(merged.length - LOG_LINE_LIMIT);
      }
      return merged;
    });
  }, []);

  const appendLogChunk = useCallback(
    (stream, text) => {
      if (!text) {
        return;
      }
      const key = stream === 'stderr' ? 'stderr' : 'stdout';
      const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const pending = logChunkBufferRef.current[key] || '';
      const combined = pending + normalized;
      const segments = combined.split('\n');
      logChunkBufferRef.current[key] = segments.pop() ?? '';
      if (segments.length === 0) {
        return;
      }
      const lines = segments.map((line) => {
        if (key === 'stderr') {
          return line.length > 0 ? `[stderr] ${line}` : '[stderr]';
        }
        return line;
      });
      appendLogLines(lines);
    },
    [appendLogLines]
  );

  const flushPendingChunks = useCallback(() => {
    const pending = logChunkBufferRef.current;
    const lines = [];
    if (pending.stdout) {
      lines.push(pending.stdout);
    }
    if (pending.stderr) {
      lines.push(`[stderr] ${pending.stderr}`);
    }
    logChunkBufferRef.current = { stdout: '', stderr: '' };
    if (lines.length > 0) {
      appendLogLines(lines);
    }
  }, [appendLogLines]);

  const stopLogStream = useCallback(() => {
    flushPendingChunks();
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    logChannelRef.current = '';
    logChunkBufferRef.current = { stdout: '', stderr: '' };
  }, [flushPendingChunks]);

  const startLogStream = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      logChannelRef.current = '';
      logChunkBufferRef.current = { stdout: '', stderr: '' };
      setLiveLogs([]);
      return '';
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const channelId = `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const source = new EventSource(`/api/task-logs?channel=${encodeURIComponent(channelId)}`);
    logChannelRef.current = channelId;
    logChunkBufferRef.current = { stdout: '', stderr: '' };
    setLiveLogs([]);

    const parseEventData = (event) => {
      if (!event?.data) {
        return {};
      }
      try {
        return JSON.parse(event.data);
      } catch (error) {
        return {};
      }
    };

    const handleInfo = (event) => {
      const payload = parseEventData(event);
      if (payload?.message) {
        appendLogLines([payload.message]);
      }
    };

    const handleError = (event) => {
      const payload = parseEventData(event);
      if (payload?.message) {
        appendLogLines([`[error] ${payload.message}`]);
      }
    };

    const handleCommandStart = (event) => {
      const payload = parseEventData(event);
      const index = typeof payload?.index === 'number' ? payload.index + 1 : null;
      const commandLine =
        typeof payload?.commandLine === 'string' && payload.commandLine.trim().length > 0
          ? payload.commandLine
          : typeof payload?.command === 'string'
            ? payload.command
            : '';
      const label = index ? `[${index}] ` : '';
      const prefix = commandLine ? `$ ${commandLine}` : 'コマンドを開始します。';
      appendLogLines([`${label}${prefix}`]);
    };

    const handleCommandEnd = (event) => {
      const payload = parseEventData(event);
      const index = typeof payload?.index === 'number' ? payload.index + 1 : null;
      const timedOut = Boolean(payload?.timedOut);
      const exitCode = typeof payload?.exitCode === 'number' ? payload.exitCode : payload?.exitCode;
      let suffix;
      if (timedOut) {
        suffix = 'タイムアウトしました。';
      } else if (exitCode === null || exitCode === undefined) {
        suffix = '終了コード: 不明';
      } else {
        suffix = `終了コード: ${exitCode}`;
      }
      const label = index ? `[${index}] ` : '';
      appendLogLines([`${label}${suffix}`]);
    };

    const handleCommandSkip = (event) => {
      const payload = parseEventData(event);
      const index = typeof payload?.index === 'number' ? payload.index + 1 : null;
      const reason = payload?.reason || 'skipped';
      const commandLine =
        typeof payload?.commandLine === 'string' && payload.commandLine.trim().length > 0
          ? payload.commandLine
          : typeof payload?.command === 'string'
            ? payload.command
            : '';
      const reasonText =
        reason === 'dry_run'
          ? 'ドライランのためスキップ'
          : reason === 'previous_step_failed'
            ? '前のステップが失敗したためスキップ'
            : reason === 'no_op_command'
              ? '実行対象のコマンドがありません'
              : `スキップ (${reason})`;
      const label = index ? `[${index}] ` : '';
      const suffix = commandLine ? `: ${commandLine}` : '';
      appendLogLines([`${label}${reasonText}${suffix}`]);
    };

    const handleLog = (event) => {
      const payload = parseEventData(event);
      if (!payload) {
        return;
      }
      const stream = payload.stream === 'stderr' ? 'stderr' : 'stdout';
      const text = typeof payload.text === 'string' ? payload.text : '';
      appendLogChunk(stream, text);
    };

    source.addEventListener('info', handleInfo);
    source.addEventListener('error', handleError);
    source.addEventListener('command_start', handleCommandStart);
    source.addEventListener('command_end', handleCommandEnd);
    source.addEventListener('command_skip', handleCommandSkip);
    source.addEventListener('log', handleLog);
    source.addEventListener('end', () => {
      flushPendingChunks();
    });
    source.onerror = () => {
      flushPendingChunks();
    };

    eventSourceRef.current = source;
    return channelId;
  }, [appendLogChunk, appendLogLines, flushPendingChunks]);

  useEffect(
    () => () => {
      stopLogStream();
    },
    [stopLogStream]
  );

  const resetForm = useCallback(() => {
    setTask('');
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleFilesSelected = useCallback((files) => {
    setSelectedFiles(files);
  }, []);

  const handleClearFiles = useCallback(() => {
    setSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!task.trim()) {
        setError('タスク内容を入力してください。');
        return;
      }
      setIsSubmitting(true);
      setError('');

      const params = new URLSearchParams();
      const logChannel = startLogStream();
      if (logChannel) {
        params.append('logChannel', logChannel);
      }
      if (debugEnabled) {
        params.append('debug', 'verbose');
      }
      if (dryRun) {
        params.append('dryRun', 'true');
      }

      const url = `/api/tasks${params.toString() ? `?${params.toString()}` : ''}`;
      const formData = new FormData();
      formData.append('task', task);
      selectedFiles.forEach((file) => {
        formData.append('files', file);
      });

      const submittedAt = new Date().toISOString();
      const pendingUploads = selectedFiles.map((file, index) => ({
        id: `local-${index}`,
        originalName: file.name,
        size: file.size,
        mimeType: file.type
      }));

      try {
        const response = await fetch(url, {
          method: 'POST',
          body: formData
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          const message = payload?.error || '実行中に問題が発生しました。';
          setError(message);
          if (payload) {
            const recordedAt = payload.submittedAt || submittedAt;
            setHistory((prev) => [
              {
                id: payload.sessionId || `error-${Date.now()}`,
                submittedAt: recordedAt,
                task: payload.task || task,
                plan: payload.plan || null,
                rawPlan: payload.rawPlan ?? payload.plan ?? null,
                result: payload.result || null,
                phases: payload.phases || [],
                uploadedFiles: payload.uploadedFiles || pendingUploads,
                status: payload.status || 'failed',
                error: payload.detail || message,
                debug: payload.debug || null,
                responseText: payload.responseText ?? null,
                parentSessionId: payload.parentSessionId ?? null,
                complaint: payload.complaint ?? null,
                requestOptions: {
                  debug: debugEnabled,
                  verbose: debugEnabled,
                  dryRun
                }
              },
              ...prev
            ]);
          }
          return;
        }

        if (!payload) {
          throw new Error('サーバーから空の応答が返されました。');
        }

        const recordedAt = payload.submittedAt || submittedAt;
        setHistory((prev) => [
          {
            id: payload.sessionId,
            submittedAt: recordedAt,
            task: payload.task || task,
            plan: payload.plan,
            rawPlan: payload.rawPlan ?? payload.plan ?? null,
            result: payload.result,
            phases: payload.phases || [],
            uploadedFiles: payload.uploadedFiles || pendingUploads,
            status: payload.status || 'success',
            error: payload.detail || null,
            debug: payload.debug || null,
            responseText: payload.responseText ?? null,
            parentSessionId: payload.parentSessionId ?? null,
            complaint: payload.complaint ?? null,
            requestOptions: {
              debug: debugEnabled,
              verbose: debugEnabled,
              dryRun
            }
          },
          ...prev
        ]);
        setComplaintText('');
        setComplaintError('');
      } catch (submitError) {
        setError(submitError.message);
      } finally {
        stopLogStream();
        setIsSubmitting(false);
      }
    },
    [task, selectedFiles, debugEnabled, dryRun, startLogStream, stopLogStream]
  );

  const latestEntry = useMemo(() => {
    if (isSubmitting) {
      return null;
    }
    return history[0] || null;
  }, [history, isSubmitting]);

  const latestOutputs = useMemo(() => {
    if (!latestEntry) {
      return [];
    }
    return latestEntry?.result?.resolvedOutputs || [];
  }, [latestEntry]);

  const handleComplaintSubmit = useCallback(async () => {
    const complaintValue = complaintText.trim();
    const baseSessionId = latestEntry?.id || '';
    const baseTask = latestEntry?.task || '';
    const hasOutputs = Array.isArray(latestOutputs) && latestOutputs.length > 0;

    if (!complaintValue) {
      setComplaintError('クレーム内容を入力してください。');
      return;
    }
    if (!baseSessionId || !hasOutputs) {
      setComplaintError('再編集できる生成物が見つかりません。');
      return;
    }
    if (isSubmittingComplaint || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setIsSubmittingComplaint(true);
    setComplaintError('');

    const params = new URLSearchParams();
    const logChannel = startLogStream();
    if (logChannel) {
      params.append('logChannel', logChannel);
    }
    if (debugEnabled) {
      params.append('debug', 'verbose');
    }
    if (dryRun) {
      params.append('dryRun', 'true');
    }

    const url = `/api/revisions${params.toString() ? `?${params.toString()}` : ''}`;
    const submittedAt = new Date().toISOString();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: baseSessionId,
          complaint: complaintValue
        })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message = payload?.error || '再編集のリクエストに失敗しました。';
        setComplaintError(message);
        if (payload) {
          const recordedAt = payload.submittedAt || submittedAt;
          setHistory((prev) => [
            {
              id: payload.sessionId || `revision-error-${Date.now()}`,
              submittedAt: recordedAt,
              task: payload.task || baseTask,
              plan: payload.plan || null,
              rawPlan: payload.rawPlan ?? payload.plan ?? null,
              result: payload.result || null,
              phases: payload.phases || [],
              uploadedFiles: payload.uploadedFiles || [],
              status: payload.status || 'failed',
              error: payload.detail || message,
              debug: payload.debug || null,
              responseText: payload.responseText ?? null,
              parentSessionId: payload.parentSessionId ?? baseSessionId,
              complaint: payload.complaint ?? complaintValue,
              requestOptions: {
                debug: debugEnabled,
                verbose: debugEnabled,
                dryRun
              }
            },
            ...prev
          ]);
        }
        return;
      }

      if (!payload) {
        throw new Error('サーバーから空の応答が返されました。');
      }

      const recordedAt = payload.submittedAt || submittedAt;
      setHistory((prev) => [
        {
          id: payload.sessionId,
          submittedAt: recordedAt,
          task: payload.task || baseTask,
          plan: payload.plan,
          rawPlan: payload.rawPlan ?? payload.plan ?? null,
          result: payload.result,
          phases: payload.phases || [],
          uploadedFiles: payload.uploadedFiles || [],
          status: payload.status || 'success',
          error: payload.detail || null,
          debug: payload.debug || null,
          responseText: payload.responseText ?? null,
          parentSessionId: payload.parentSessionId ?? baseSessionId,
          complaint: payload.complaint ?? complaintValue,
          requestOptions: {
            debug: debugEnabled,
            verbose: debugEnabled,
            dryRun
          }
        },
        ...prev
      ]);
      setComplaintText('');
    } catch (submitError) {
      setComplaintError(submitError.message);
    } finally {
      stopLogStream();
      setIsSubmitting(false);
      setIsSubmittingComplaint(false);
    }
  }, [
    complaintText,
    latestEntry,
    latestOutputs,
    debugEnabled,
    dryRun,
    isSubmitting,
    isSubmittingComplaint,
    startLogStream,
    stopLogStream
  ]);

  const complaintTextTrimmed = complaintText.trim();
  const canSubmitRevision = Boolean(!isSubmitting && latestEntry && latestOutputs.length > 0);
  const complaintButtonDisabled =
    isSubmitting || isSubmittingComplaint || !canSubmitRevision || complaintTextTrimmed.length === 0;
  const complaintHelperMessage = canSubmitRevision
    ? '最新の生成物に対するクレーム内容を記入してください。'
    : '修正リクエストは生成物が確認できる状態で利用できます。';

  const handleComplaintChange = useCallback(
    (value) => {
      setComplaintText(value);
      if (complaintError) {
        setComplaintError('');
      }
    },
    [complaintError]
  );

  return {
    task,
    setTask,
    selectedFiles,
    handleFilesSelected,
    handleClearFiles,
    fileInputRef,
    isSubmitting,
    error,
    history,
    debugEnabled,
    setDebugEnabled,
    showDebugOptions,
    setShowDebugOptions,
    dryRun,
    setDryRun,
    progressStage,
    handleSubmit,
    resetForm,
    latestEntry,
    latestOutputs,
    complaintText,
    complaintError,
    complaintButtonDisabled,
    complaintHelperMessage,
    canSubmitRevision,
    isSubmittingComplaint,
    handleComplaintSubmit,
    handleComplaintChange,
    setError,
    liveLogs
  };
}
