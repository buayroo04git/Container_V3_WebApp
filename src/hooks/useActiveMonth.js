import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'app_selected_month';

/**
 * 📅 Default month helper (returns 'YYYY-MM', e.g. '2026-08')
 */
export function getDefaultMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * 🔍 Get currently saved month from localStorage or fallback
 */
export function getSavedActiveMonth(fallback = getDefaultMonth()) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) {
      return saved.trim();
    }
  } catch (e) {}
  return fallback;
}

/**
 * 💾 Save active month globally
 */
export function setActiveMonthGlobal(month) {
  try {
    if (month && month !== 'ALL') {
      localStorage.setItem(STORAGE_KEY, month);
    }
    window.dispatchEvent(new CustomEvent('app_month_changed', { detail: month }));
  } catch (e) {}
}

/**
 * 🎛️ useActiveMonth Hook:
 * Persistent & Real-time Synchronized Month Filter across all menus/views.
 *
 * @param {string|null} defaultFallback - optional default fallback if nothing in localStorage
 */
export function useActiveMonth(defaultFallback = null) {
  const [selectedMonth, setSelectedMonthState] = useState(() => {
    const saved = getSavedActiveMonth(defaultFallback || getDefaultMonth());
    return saved;
  });

  const setSelectedMonth = useCallback((newMonth) => {
    setSelectedMonthState(newMonth);
    try {
      if (newMonth && newMonth !== 'ALL') {
        localStorage.setItem(STORAGE_KEY, newMonth);
      }
      window.dispatchEvent(new CustomEvent('app_month_changed', { detail: newMonth }));
    } catch (e) {}
  }, []);

  // Listen to month changes triggered from any other view/tab in real-time
  useEffect(() => {
    const handleMonthChange = (e) => {
      if (e.detail !== undefined) {
        setSelectedMonthState(e.detail);
      }
    };
    window.addEventListener('app_month_changed', handleMonthChange);
    return () => window.removeEventListener('app_month_changed', handleMonthChange);
  }, []);

  return [selectedMonth, setSelectedMonth];
}

export default useActiveMonth;
