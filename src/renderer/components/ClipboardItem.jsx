import React, { memo, useState } from 'react';
import { Button, Tooltip, Badge } from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  PushpinOutlined,
  PushpinFilled,
  FileTextOutlined,
  FileImageOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

// 加载 dayjs 插件
dayjs.extend(relativeTime);

/**
 * 剪贴板单项组件
 * 显示单个剪贴板历史记录
 */
const ClipboardItem = memo(({
  item,
  isSelected,
  onClick,
  onDelete,
  onCopy,
  onTogglePin
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // 确保 is_pinned 是布尔值（SQLite 返回 0/1）
  const isPinned = Boolean(item.is_pinned);

  // 格式化时间（相对时间）
  const timeAgo = dayjs(item.timestamp).fromNow();
  const fullTime = dayjs(item.timestamp).format('YYYY-MM-DD HH:mm:ss');

  // 内容类型检测
  const detectContentType = (content) => {
    if (content.startsWith('data:image')) {
      return 'image';
    }
    if (content.startsWith('http://') || content.startsWith('https://')) {
      return 'link';
    }
    if (content.includes('```') || content.includes('function') || content.includes('class')) {
      return 'code';
    }
    if (content.match(/^\d{4}-\d{2}-\d{2}/)) {
      return 'date';
    }
    return 'text';
  };

  const contentType = detectContentType(item.content);

  // 判断是否为图片类型
  const isImage = contentType === 'image' || item.type === 'image';

  // 获取内容类型颜色
  const getTypeColor = (type) => {
    switch (type) {
      case 'image': return '#eb2f96';
      case 'link': return '#1677ff';
      case 'code': return '#52c41a';
      case 'date': return '#fa8c16';
      default: return '#8c8c8c';
    }
  };

  // 获取预览内容
  const getPreview = () => {
    if (isImage) {
      return '[Image]';
    }
    return item.content.length > 120
      ? item.content.substring(0, 120) + '...'
      : item.content;
  };

  const preview = getPreview();

  return (
    <div
      className={`clipboard-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '12px 16px',
        borderRadius: 8,
        marginBottom: 8,
        backgroundColor: isSelected ? '#e6f4ff' : (isPinned ? '#fff2f0' : '#fafafa'),
        cursor: 'pointer',
        border: `1px solid ${isSelected ? '#91caff' : '#f0f0f0'}`,
        transition: 'all 0.2s ease',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* 置顶指示器 */}
      {isPinned && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          borderStyle: 'solid',
          borderWidth: '8px 8px 0 0',
          borderColor: '#ff4d4f transparent transparent transparent'
        }} />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* 类型图标 */}
        <div style={{
          width: 24,
          height: 24,
          borderRadius: 4,
          backgroundColor: `${getTypeColor(contentType)}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2
        }}>
          {isImage ? (
            <FileImageOutlined style={{
              fontSize: 14,
              color: getTypeColor('image')
            }} />
          ) : (
            <FileTextOutlined style={{
              fontSize: 14,
              color: getTypeColor(contentType)
            }} />
          )}
        </div>

        {/* 内容区域 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 预览 - 图片显示缩略图 */}
          {isImage ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 4
            }}>
              <img
                src={item.content}
                alt="Thumbnail"
                style={{
                  width: 40,
                  height: 40,
                  objectFit: 'cover',
                  borderRadius: 4,
                  border: '1px solid #f0f0f0'
                }}
              />
              <span style={{ fontSize: 14, color: '#262626' }}>[Image]</span>
            </div>
          ) : (
            <div
              style={{
                fontSize: 14,
                color: '#262626',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                marginBottom: 4,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}
            >
              {preview}
            </div>
          )}

          {/* 底部信息 */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <Tooltip title={fullTime}>
              <span style={{
                fontSize: 12,
                color: '#8c8c8c'
              }}>
                {timeAgo}
              </span>
            </Tooltip>

            {/* 字符数 */}
            <span style={{
              fontSize: 11,
              color: '#bfbfbf'
            }}>
              {item.content.length} chars
            </span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            opacity: isHovered || isSelected ? 1 : 0,
            transition: 'opacity 0.2s',
            flexShrink: 0
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip title="Copy">
            <Button
              size="small"
              type="text"
              icon={<CopyOutlined />}
              onClick={onCopy}
              style={{ color: '#595959' }}
            />
          </Tooltip>

          <Tooltip title={isPinned ? 'Unpin' : 'Pin'}>
            <Button
              size="small"
              type="text"
              icon={isPinned ? <PushpinFilled style={{ color: '#ff4d4f' }} /> : <PushpinOutlined />}
              onClick={onTogglePin}
              style={{ color: isPinned ? '#ff4d4f' : '#595959' }}
            />
          </Tooltip>

          <Tooltip title="Delete">
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={onDelete}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
});

ClipboardItem.displayName = 'ClipboardItem';

export default ClipboardItem;
