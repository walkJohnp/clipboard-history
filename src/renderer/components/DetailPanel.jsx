import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Space, Typography, Tag, Tooltip, message } from 'antd';
import {
  CopyOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  PushpinFilled,
  ClockCircleOutlined,
  FileTextOutlined,
  NumberOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Text, Title } = Typography;

/**
 * 详情面板组件
 * 显示选中的剪贴板内容详情，支持编辑和复制
 */
const DetailPanel = ({ item, onCopy, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [imageUrl, setImageUrl] = useState(null);

  // 当选择的项变化时，退出编辑模式并加载图片
  useEffect(() => {
    setIsEditing(false);
    setEditedContent('');
    setImageUrl(null);

    // 如果是图片类型且有文件路径，加载原图
    if (item?.type === 'image' && item?.file_path) {
      window.electronAPI.getImageUrl(item.file_path).then(url => {
        setImageUrl(url);
      });
    }
  }, [item?.id]);

  // 如果没有选择项
  if (!item) {
    return (
      <Card
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <div style={{ textAlign: 'center', color: '#8c8c8c' }}>
          <FileTextOutlined style={{ fontSize: 64, marginBottom: 16, color: '#d9d9d9' }} />
          <Title level={4} style={{ color: '#8c8c8c' }}>
            Select an item to view details
          </Title>
          <Text type="secondary">
            Click on any clipboard history item from the list
          </Text>
        </div>
      </Card>
    );
  }

  // 开始编辑
  const startEdit = () => {
    setEditedContent(item.content);
    setIsEditing(true);
  };

  // 保存编辑
  const saveEdit = async () => {
    if (editedContent === item.content) {
      setIsEditing(false);
      return;
    }

    try {
      await onUpdate(item.id, editedContent);
      setIsEditing(false);
      message.success('Content updated successfully');
    } catch (err) {
      message.error('Failed to update: ' + err.message);
    }
  };

  // 取消编辑
  const cancelEdit = () => {
    setIsEditing(false);
    setEditedContent('');
  };

  // 处理复制
  const handleCopy = async () => {
    try {
      await onCopy(item.content);
    } catch (err) {
      message.error('Failed to copy: ' + err.message);
    }
  };

  // 格式化时间
  const formatTime = (timestamp) => {
    return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss');
  };

  // 获取内容统计
  const getStats = () => {
    const content = item.content;
    return {
      length: content.length,
      lines: content.split('\n').length,
      words: content.trim().split(/\s+/).length,
      hasUnicode: /[^\x00-\x7F]/.test(content)
    };
  };

  const stats = getStats();

  return (
    <Card
      title={
        <Space>
          <span>Details</span>
          {item.is_pinned && (
            <Tag color="red" icon={<PushpinFilled />}>
              Pinned
            </Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          {!isEditing ? (
            <>
              <Button
                type="primary"
                icon={<CopyOutlined />}
                onClick={handleCopy}
              >
                Copy
              </Button>
              <Button
                icon={<EditOutlined />}
                onClick={startEdit}
              >
                Edit
              </Button>
            </>
          ) : (
            <>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={saveEdit}
              >
                Save
              </Button>
              <Button
                icon={<CloseOutlined />}
                onClick={cancelEdit}
              >
                Cancel
              </Button>
            </>
          )}
        </Space>
      }
      style={{ height: '100%' }}
      styles={{
        body: {
          height: 'calc(100% - 57px)',
          display: 'flex',
          flexDirection: 'column'
        }
      }}
    >
      {/* 内容显示/编辑区域 */}
      <div style={{ flex: 1, overflow: 'auto', marginBottom: 16 }}>
        {isEditing ? (
          <TextArea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            autoSize={{ minRows: 10, maxRows: 30 }}
            style={{
              fontFamily: 'monospace',
              fontSize: 14,
              lineHeight: 1.6
            }}
          />
        ) : item.type === 'image' || item.content.startsWith('data:image') ? (
          // 图片类型显示
          <div style={{
            padding: 16,
            backgroundColor: '#f5f5f5',
            borderRadius: 6,
            textAlign: 'center'
          }}>
            <img
              src={imageUrl || item.content}
              alt="Clipboard content"
              style={{
                maxWidth: '100%',
                maxHeight: '60vh',
                borderRadius: 4,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
            />
          </div>
        ) : (
          <pre style={{
            margin: 0,
            padding: 16,
            backgroundColor: '#f5f5f5',
            borderRadius: 6,
            fontFamily: 'monospace',
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            maxHeight: '100%',
            overflow: 'auto'
          }}>
            {item.content}
          </pre>
        )}
      </div>

      {/* 底部信息栏 */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: '#fafafa',
        borderRadius: 6,
        border: '1px solid #f0f0f0'
      }}>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          {/* ID 和时间 */}
          <Space split={<span style={{ color: '#d9d9d9' }}>|</span>}>
            <Tooltip title="Item ID">
              <Space size={4}>
                <NumberOutlined style={{ color: '#8c8c8c' }} />
                <Text type="secondary" copyable={{ text: item.id.toString() }}>
                  ID: {item.id}
                </Text>
              </Space>
            </Tooltip>

            <Tooltip title={formatTime(item.timestamp)}>
              <Space size={4}>
                <ClockCircleOutlined style={{ color: '#8c8c8c' }} />
                <Text type="secondary">
                  {formatTime(item.timestamp)}
                </Text>
              </Space>
            </Tooltip>
          </Space>

          {/* 统计信息 */}
          <Space split={<span style={{ color: '#d9d9d9' }}>|</span>}>
            <Tag color="blue">{stats.length} chars</Tag>
            <Tag color="green">{stats.lines} lines</Tag>
            <Tag color="orange">{stats.words} words</Tag>
            {stats.hasUnicode && <Tag color="purple">Unicode</Tag>}
          </Space>
        </Space>
      </div>
    </Card>
  );
};

export default DetailPanel;
