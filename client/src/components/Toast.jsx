import { useCallback, useRef, useState } from 'react';

let idCounter = 0;

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts(list => list.filter(t => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback((message, { tone = 'success', durationMs = 2600 } = {}) => {
    const id = ++idCounter;
    setToasts(list => [...list, { id, message, tone }]);
    const timer = setTimeout(() => dismiss(id), durationMs);
    timers.current.set(id, timer);
    return id;
  }, [dismiss]);

  return { toasts, showToast, dismiss };
}

const TONE_ICON = {
  success: '✓',
  error: '✕',
  info: 'ⓘ',
};

export function ToastStack({ toasts, dismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.tone}`} onClick={() => dismiss(t.id)}>
          <span className="toast-icon">{TONE_ICON[t.tone] || TONE_ICON.info}</span>
          <span className="toast-message">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
