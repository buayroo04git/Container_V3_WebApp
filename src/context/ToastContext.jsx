import React, { createContext, useContext, useState, useCallback } from 'react';
import Toast from '../components/ui/Toast';

const ToastContext = createContext(null);

/**
 * 🌐 ToastProvider: ให้บริการแจ้งเตือนทั่วทั้งระบบ
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /**
   * แสดง Toast ข้อความ
   * @param {string|object} options - ข้อความ หรือ Object { message, title, type, duration }
   * @param {string} [type='info'] - 'success' | 'error' | 'warning' | 'info'
   * @param {number} [duration=3000] - มิลลิวินาที (ms)
   */
  const showToast = useCallback((options, type = 'info', duration = 3000) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 9);
    
    let toastObj = { id, type, duration: duration || 3000 };
    if (typeof options === 'string') {
      toastObj.message = options;
    } else if (typeof options === 'object' && options !== null) {
      toastObj = { 
        ...toastObj, 
        ...options,
        duration: options.duration || duration || 3000 
      };
    }

    setToasts((prev) => [...prev, toastObj]);

    const autoDuration = toastObj.duration || 3000;
    if (autoDuration > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, autoDuration);
    }

    return id;
  }, [dismissToast]);

  const success = useCallback((msg, title, duration = 3000) => showToast({ message: msg, title, type: 'success', duration: duration || 3000 }), [showToast]);
  const error = useCallback((msg, title, duration = 5000) => showToast({ message: msg, title, type: 'error', duration: duration || 5000 }), [showToast]);
  const warning = useCallback((msg, title, duration = 4000) => showToast({ message: msg, title, type: 'warning', duration: duration || 4000 }), [showToast]);
  const info = useCallback((msg, title, duration = 3000) => showToast({ message: msg, title, type: 'info', duration: duration || 3000 }), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast, success, error, warning, info }}>
      {children}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

/**
 * Hook สำหรับเรียกใช้ Toast ในคอมโพเนนต์ใดๆ
 * ตัวอย่าง: const { success, error, showToast } = useToast();
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Fallback หากอยู่นอก Provider จะไม่เกิด Error พัง
    return {
      showToast: (msg) => console.log('Toast:', msg),
      dismissToast: () => {},
      success: (msg) => console.log('Success:', msg),
      error: (msg) => console.error('Error:', msg),
      warning: (msg) => console.warn('Warning:', msg),
      info: (msg) => console.log('Info:', msg)
    };
  }
  return context;
}
