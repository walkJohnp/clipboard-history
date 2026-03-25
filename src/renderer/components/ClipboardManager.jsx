import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Layout, notification, Spin, Empty } from 'antd';
import { useDebounce } from '../hooks/useDebounce';
import ClipboardList from './ClipboardList';
import DetailPanel from './DetailPanel';
import Toolbar from './Toolbar';
import SearchBar from './SearchBar';

const { Sider, Content } = Layout;

// 分页大小
const PAGE_SIZE = 50;

/**
 * 剪贴板管理器主组件
 */
const ClipboardManager = () => {
  // ==================== 状态 ====================
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);

  // 防抖搜索
  const debouncedSearch = useDebounce(searchQuery, 300);

  // 用于防止重复加载的引用
  const loadingRef = useRef(false);

  // ==================== 初始化 ====================
  useEffect(() => {
    console.log('Component mounted, loading items...');
    loadItems(1, true);
    const cleanup = setupEventListeners();
    return cleanup;
  }, []);

  // 监听 items 变化
  useEffect(() => {
    console.log('Items changed:', items.length);
  }, [items]);

  // 监听 initialLoading 变化
  useEffect(() => {
    console.log('initialLoading changed:', initialLoading);
  }, [initialLoading]);

  // 搜索变化时重新加载
  useEffect(() => {
    loadItems(1, true);
  }, [debouncedSearch]);

  // ==================== 事件监听 ====================
  const setupEventListeners = () => {
    // 监听新内容
    const unsubscribeUpdate = window.electronAPI.onClipboardUpdated((data) => {
      setItems(prev => {
        // 避免重复
        if (prev.some(i => i.id === data.id)) return prev;
        return [data, ...prev];
      });
      setTotalCount(prev => prev + 1);
    });

    // 监听删除
    const unsubscribeDelete = window.electronAPI.onClipboardDeleted((id) => {
      setItems(prev => prev.filter(i => i.id !== id));
      if (selectedItem?.id === id) {
        setSelectedItem(null);
      }
      setTotalCount(prev => prev - 1);
    });

    // 监听清空
    const unsubscribeCleared = window.electronAPI.onClipboardCleared(() => {
      setItems([]);
      setSelectedItem(null);
      setTotalCount(0);
      notification.success({ message: 'All items cleared' });
    });

    // 清理函数
    return () => {
      unsubscribeUpdate();
      unsubscribeDelete();
      unsubscribeCleared();
    };
  };

  // ==================== 数据加载 ====================
  const loadItems = async (pageNum, reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    try {
      console.log('Loading items...', { pageNum, reset, debouncedSearch });
      const result = await window.electronAPI.getClipboardHistory(
        pageNum,
        PAGE_SIZE,
        debouncedSearch
      );
      console.log('Loaded items:', result);

      setItems(prev => {
        const newItems = reset ? result.items : [...prev, ...result.items];
        console.log('Setting items:', newItems.length);
        return newItems;
      });

      setHasMore(result.items.length === PAGE_SIZE);
      setTotalCount(result.total);
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to load items:', err);
      notification.error({
        message: 'Failed to load data',
        description: err.message
      });
    } finally {
      setLoading(false);
      loadingRef.current = false;
      setInitialLoading(false);
    }
  };

  // ==================== 加载更多 ====================
  const handleLoadMore = useCallback(() => {
    if (!loadingRef.current && hasMore) {
      loadItems(page + 1);
    }
  }, [page, hasMore]);

  // ==================== 选择项 ====================
  const handleSelect = useCallback((item) => {
    setSelectedItem(item);
  }, []);

  // ==================== 删除 ====================
  const handleDelete = useCallback(async (id) => {
    try {
      await window.electronAPI.deleteItem(id);
      notification.success({ message: 'Deleted successfully' });
    } catch (err) {
      notification.error({
        message: 'Delete failed',
        description: err.message
      });
    }
  }, []);

  // ==================== 复制 ====================
  const handleCopy = useCallback(async (content) => {
    try {
      await window.electronAPI.copyToClipboard(content);
      notification.success({ message: 'Copied to clipboard' });

      // 复制后自动隐藏窗口
      setTimeout(() => {
        window.electronAPI.hideWindow();
      }, 500);
    } catch (err) {
      notification.error({
        message: 'Copy failed',
        description: err.message
      });
    }
  }, []);

  // ==================== 更新 ====================
  const handleUpdate = useCallback(async (id, content) => {
    try {
      await window.electronAPI.updateItem(id, content);
      setItems(prev => prev.map(i =>
        i.id === id ? { ...i, content } : i
      ));
      if (selectedItem?.id === id) {
        setSelectedItem({ ...selectedItem, content });
      }
      notification.success({ message: 'Updated successfully' });
    } catch (err) {
      notification.error({
        message: 'Update failed',
        description: err.message
      });
    }
  }, [selectedItem]);

  // ==================== 置顶切换 ====================
  const handleTogglePin = useCallback(async (id) => {
    try {
      const result = await window.electronAPI.togglePin(id);
      // 重新加载以反映排序变化
      loadItems(1, true);

      if (result.success) {
        notification.success({
          message: result.isPinned ? 'Pinned' : 'Unpinned'
        });
      }
    } catch (err) {
      notification.error({
        message: 'Failed to toggle pin',
        description: err.message
      });
    }
  }, []);

  // ==================== 清空 ====================
  const handleClearAll = useCallback(async () => {
    try {
      await window.electronAPI.clearAll(true); // 保留置顶项
      notification.success({ message: 'All cleared (pinned items kept)' });
    } catch (err) {
      notification.error({
        message: 'Clear failed',
        description: err.message
      });
    }
  }, []);

  // ==================== 导出 ====================
  const handleExport = useCallback(async () => {
    try {
      const data = await window.electronAPI.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      });

      // 创建下载链接
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clipboard-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      notification.success({
        message: 'Export successful',
        description: `${data.count} items exported`
      });
    } catch (err) {
      notification.error({
        message: 'Export failed',
        description: err.message
      });
    }
  }, []);

  // ==================== 导入 ====================
  const handleImport = useCallback(async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const result = await window.electronAPI.importData(data);

      notification.success({
        message: 'Import successful',
        description: `${result.imported} items imported`
      });

      // 刷新列表
      loadItems(1, true);
    } catch (err) {
      notification.error({
        message: 'Import failed',
        description: err.message
      });
    }
  }, []);

  // ==================== 刷新 ====================
  const handleRefresh = useCallback(() => {
    loadItems(1, true);
  }, []);

  // ==================== 渲染 ====================
  return (
    <Layout style={{ height: '100vh' }}>
      {/* 左侧列表区域 */}
      <Sider
        width="40%"
        style={{
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #f0f0f0',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {/* 搜索和工具栏 - macOS 留出红绿灯按钮空间 */}
        <div style={{
          padding: navigator.platform === 'MacIntel' ? '32px 16px 16px' : '16px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fafafa'
        }}>
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search clipboard history..."
            loading={loading && items.length === 0}
          />
          <div style={{ marginTop: 12 }}>
            <Toolbar
              totalCount={totalCount}
              onClearAll={handleClearAll}
              onExport={handleExport}
              onImport={handleImport}
              onRefresh={handleRefresh}
            />
          </div>
        </div>

        {/* 列表区域 */}
        <div
          style={{
            flex: '1 1 0',
            minHeight: 0,
            overflow: 'hidden',
            padding: '0 16px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {initialLoading ? (
            <div style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'column',
              gap: 12
            }}>
              <Spin size="large" />
              <span style={{ color: '#999' }}>Loading...</span>
            </div>
          ) : items.length === 0 ? (
            <Empty
              description={searchQuery ? 'No matching items' : 'No clipboard history'}
              style={{ marginTop: 100 }}
            />
          ) : (
            <ClipboardList
              items={items}
              selectedId={selectedItem?.id}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onCopy={handleCopy}
              onTogglePin={handleTogglePin}
              loading={loading}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
            />
          )}
        </div>
      </Sider>

      {/* 右侧详情区域 */}
      <Content style={{
        padding: 24,
        background: '#f5f5f5',
        overflow: 'auto'
      }}>
        <DetailPanel
          item={selectedItem}
          onCopy={handleCopy}
          onUpdate={handleUpdate}
        />
      </Content>
    </Layout>
  );
};

export default ClipboardManager;
