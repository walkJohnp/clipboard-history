#!/bin/bash

# Clipboard Manager 启动脚本

echo "================================"
echo "Clipboard Manager Launcher"
echo "================================"

# 检查是否安装了依赖
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# 构建前端
echo "Building frontend..."
npm run build

# 启动应用
echo "Starting application..."
npm start
