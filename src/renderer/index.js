import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, theme, App as AntdApp } from 'antd';
import ClipboardManager from './components/ClipboardManager';

// Ant Design 主题配置
const themeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 8,
    colorBgContainer: '#ffffff',
  },
  components: {
    Card: {
      headerBg: '#fafafa',
    },
    List: {
      itemPadding: '12px 16px',
    },
  },
};

// 全局样式
const globalStyles = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    -webkit-overflow-scrolling: touch;
  }

  html, body, #root {
    height: 100%;
    width: 100%;
    overflow: hidden;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overscroll-behavior: none;
  }

  /* 可滚动容器 - 优化触摸板滚动 */
  .scrollable {
    overflow-y: auto !important;
    overflow-x: hidden !important;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch !important;
    touch-action: pan-y !important;
  }

  /* 强制启用 macOS 弹性滚动 */
  .scrollable {
    scroll-behavior: smooth;
  }

  /* 修复 Ant Design Layout 滚动问题 */
  .ant-layout-sider {
    overflow: hidden !important;
    display: flex !important;
    flex-direction: column !important;
  }

  .ant-layout-sider-children {
    display: flex !important;
    flex-direction: column !important;
    height: 100% !important;
    overflow: hidden !important;
  }

  /* 列表滚动容器 */
  .clipboard-list-container {
    overflow-y: auto !important;
    overflow-x: hidden !important;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch !important;
    touch-action: pan-y !important;
  }

  /* 确保滚动容器可以接收触摸板事件 */
  .scrollable,
  .scrollable * {
    touch-action: pan-y !important;
    -webkit-touch-callout: none;
    -webkit-user-select: text;
    user-select: text;
  }

  /* 滚动条样式 */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #a8a8a8;
  }

  /* 选中样式 */
  ::selection {
    background: #1677ff;
    color: white;
  }

  /* 剪贴板项悬停效果 */
  .clipboard-item:hover {
    transform: translateX(2px);
  }

  /* 加载动画 */
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .fade-in {
    animation: fadeIn 0.3s ease;
  }
`;

// 注入全局样式
const styleSheet = document.createElement('style');
styleSheet.textContent = globalStyles;
document.head.appendChild(styleSheet);

// 渲染应用
const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <ConfigProvider theme={themeConfig}>
    <AntdApp>
      <ClipboardManager />
    </AntdApp>
  </ConfigProvider>
);
