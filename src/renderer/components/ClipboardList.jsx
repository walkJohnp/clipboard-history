import React, { useCallback, useEffect, useRef } from 'react';
import ClipboardItem from './ClipboardItem';

// 每项固定高度
const ITEM_HEIGHT = 80;

/**
 * 剪贴板列表组件
 */
const ClipboardList = ({
  items,
  selectedId,
  onSelect,
  onDelete,
  onCopy,
  onTogglePin,
  loading,
  hasMore,
  onLoadMore
}) => {
  const containerRef = useRef(null);

  // 使用原生滚动事件
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop - clientHeight < 100 && hasMore && !loading) {
        onLoadMore();
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMore, loading, onLoadMore]);

  // 如果 items 为空，显示空状态
  if (!items || items.length === 0) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#999',
        flexDirection: 'column',
        gap: 8
      }}>
        <div>{loading ? 'Loading...' : 'No items'}</div>
        <div style={{ fontSize: 12, color: '#ccc' }}>Items count: {items?.length || 0}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="clipboard-list-container"
      style={{
        flex: '1 1 0',
        width: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      {items.map((item) => (
        <div key={item.id} style={{ marginBottom: 8 }}>
          <ClipboardItem
            item={item}
            isSelected={selectedId === item.id}
            onClick={() => onSelect(item)}
            onDelete={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            onCopy={(e) => {
              e.stopPropagation();
              onCopy(item.content);
            }}
            onTogglePin={(e) => {
              e.stopPropagation();
              onTogglePin(item.id);
            }}
          />
        </div>
      ))}
      {loading && hasMore && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
          Loading more...
        </div>
      )}
    </div>
  );
};

export default ClipboardList;
