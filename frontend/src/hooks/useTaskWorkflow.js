import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PROGRESS_ROTATION_MS, PROGRESS_STEPS } from '../constants/app.js';

const INITIAL_HISTORY = [];

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
  const fileInputRef = useRef(null);

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
        setIsSubmitting(false);
      }
    },
    [task, selectedFiles, debugEnabled, dryRun]
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
    isSubmittingComplaint
  ]);

  const progressPercent = useMemo(() => {
    if (!isSubmitting) {
      return 0;
    }
    const currentStep = Math.min(progressStage + 1, PROGRESS_STEPS.length);
    return Math.min(100, Math.round((currentStep / PROGRESS_STEPS.length) * 100));
  }, [progressStage, isSubmitting]);

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
    progressPercent,
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
    setError
  };
}
