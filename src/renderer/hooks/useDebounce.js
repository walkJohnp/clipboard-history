import { useState, useEffect } from 'react';

/**
 * 防抖 Hook
 * @param {any} value - 要防抖的值
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {any} - 防抖后的值
 */
export function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * 节流 Hook
 * @param {Function} callback - 要节流的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} - 节流后的函数
 */
export function useThrottle(callback, delay) {
  const [lastCall, setLastCall] = useState(0);

  return (...args) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      setLastCall(now);
      callback(...args);
    }
  };
}

/**
 * 剪贴板数据 Hook
 * 封装剪贴板数据的获取和实时更新
 */
export function useClipboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [total, setTotal] = useState(0);

  // 订阅实时更新
  useEffect(() => {
    const unsubscribeUpdate = window.electronAPI.onClipboardUpdated((data) => {
      setItems(prev => [data, ...prev]);
      setTotal(prev => prev + 1);
    });

    const unsubscribeDelete = window.electronAPI.onClipboardDeleted((id) => {
      setItems(prev => prev.filter(i => i.id !== id));
      setTotal(prev => prev - 1);
    });

    return () => {
      unsubscribeUpdate();
      unsubscribeDelete();
    };
  }, []);

  // 加载历史
  const loadHistory = async (page = 1, pageSize = 50, search = '') => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.getClipboardHistory(page, pageSize, search);
      setItems(prev => page === 1 ? result.items : [...prev, ...result.items]);
      setTotal(result.total);
      return result;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // 删除
  const deleteItem = async (id) => {
    await window.electronAPI.deleteItem(id);
    setItems(prev => prev.filter(i => i.id !== id));
    setTotal(prev => prev - 1);
  };

  // 复制
  const copyItem = async (content) => {
    await window.electronAPI.copyToClipboard(content);
  };

  return {
    items,
    loading,
    error,
    total,
    loadHistory,
    deleteItem,
    copyItem
  };
}
