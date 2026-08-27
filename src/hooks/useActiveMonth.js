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
export function getSavedActiveMonth(fallback = 'ALL') {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null && saved !== undefined) {
      const trimmed = saved.trim();
      return trimmed || 'ALL';
    }
  } catch (e) {}
  return fallback;
}

/**
 * 💾 Save active month globally
 */
export function setActiveMonthGlobal(month) {
  try {
    const clean = (month && month !== 'ALL') ? String(month).trim() : 'ALL';
    localStorage.setItem(STORAGE_KEY, clean);
    window.dispatchEvent(new CustomEvent('app_month_changed', { detail: clean }));
  } catch (e) {}
}

/**
 * 🎛️ useActiveMonth Hook:
 * Persistent & Real-time Synchronized Month Filter across all menus/views.
 *
 * @param {string} defaultFallback - optional default fallback if nothing in localStorage (default: 'ALL')
 */
export function useActiveMonth(defaultFallback = 'ALL') {
  const [selectedMonth, setSelectedMonthState] = useState(() => {
    return getSavedActiveMonth(defaultFallback);
  });

  const setSelectedMonth = useCallback((newMonth) => {
    const clean = (newMonth && newMonth !== 'ALL') ? String(newMonth).trim() : 'ALL';
    setSelectedMonthState(clean);
    try {
      localStorage.setItem(STORAGE_KEY, clean);
      window.dispatchEvent(new CustomEvent('app_month_changed', { detail: clean }));
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
