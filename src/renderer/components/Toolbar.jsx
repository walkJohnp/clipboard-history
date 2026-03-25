import React from 'react';
import { Button, Space, Popconfirm, Upload, Badge, Tooltip } from 'antd';
import {
  ClearOutlined,
  ExportOutlined,
  ImportOutlined,
  ReloadOutlined,
  DeleteFilled,
  FileJsonOutlined
} from '@ant-design/icons';

/**
 * 工具栏组件
 * 提供清空、导出、导入、刷新等功能
 */
const Toolbar = ({
  totalCount,
  onClearAll,
  onExport,
  onImport,
  onRefresh
}) => {
  // 处理导入文件
  const handleImport = (file) => {
    onImport(file);
    return false; // 阻止默认上传行为
  };

  return (
    <Space wrap size="small" style={{ display: 'flex', alignItems: 'center' }}>
      {/* 总数显示 */}
      <span style={{
        padding: '0 8px',
        fontSize: 12,
        color: '#595959',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6
      }}>
        Items:
        <Badge
          count={totalCount}
          overflowCount={99999}
          style={{ backgroundColor: '#1677ff' }}
          showZero
        />
      </span>

      <Tooltip title="Refresh">
        <Button
          icon={<ReloadOutlined />}
          size="small"
          onClick={onRefresh}
        >
          Refresh
        </Button>
      </Tooltip>

      {/* 清空按钮 */}
      <Popconfirm
        title="Clear all history?"
        description={
          <div>
            <p>This will delete all clipboard history.</p>
            <p style={{ color: '#ff4d4f' }}>
              <DeleteFilled /> Pinned items will be kept.
            </p>
          </div>
        }
        onConfirm={onClearAll}
        okText="Clear"
        cancelText="Cancel"
        okButtonProps={{ danger: true }}
      >
        <Tooltip title="Clear All">
          <Button
            icon={<ClearOutlined />}
            size="small"
            danger
          >
            Clear
          </Button>
        </Tooltip>
      </Popconfirm>

      {/* 导出按钮 */}
      <Tooltip title="Export to JSON">
        <Button
          icon={<ExportOutlined />}
          size="small"
          onClick={onExport}
        >
          Export
        </Button>
      </Tooltip>

      {/* 导入按钮 */}
      <Upload
        accept=".json"
        showUploadList={false}
        beforeUpload={handleImport}
      >
        <Tooltip title="Import from JSON">
          <Button
            icon={<ImportOutlined />}
            size="small"
          >
            Import
          </Button>
        </Tooltip>
      </Upload>
    </Space>
  );
};

export default Toolbar;
