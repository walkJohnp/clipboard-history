const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// 根据环境选择 target
const isDev = process.env.NODE_ENV === 'development';

module.exports = {
    entry: './src/renderer/index.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.js',
    },
    resolve: {
        extensions: ['.js', '.jsx'],
        fallback: {
            // 开发时 polyfill Node 模块
            events: require.resolve('events/'),
        },
    },
    module: {
        rules: [
            {
                test: /\.jsx?$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env', '@babel/preset-react'],
                    },
                },
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './index.html',
        }),
    ],
    // 开发时用 'web'，生产用 'electron-renderer'
    target: isDev ? 'web' : 'electron-renderer',
    devtool: 'source-map',
    devServer: {
        port: 3000,
        hot: false, // 禁用 HMR，使用普通刷新
        liveReload: true,
        compress: true,
        historyApiFallback: true,
        devMiddleware: {
            writeToDisk: true,
        },
        static: false,
        client: {
            overlay: {
                errors: true,
                warnings: false,
            },
        },
    },
};