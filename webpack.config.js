const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'development',
    entry: {
        content: './src/content.mjs',
        sandbox: './src/sandbox.mjs',
        setup: './src/setup.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
    },
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: ["style-loader", "css-loader"],
            },
        ],
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: "manifest.json", to: "manifest.json" },
                { from: "src/icon_128.png", to: "icon_128.png" },
                { from: "src/popup.html", to: "popup.html" },
                { from: "src/popup.js", to: "popup.js" },
                { from: "src/sandbox.html", to: "sandbox.html" },
                { from: "src/setup.html", to: "setup.html" },
                { from: "dist/models", to: "models" },
                { from: "node_modules/@mediapipe/tasks-vision/wasm", to: "wasm" }
            ],
        }),
    ],
    devtool: 'cheap-module-source-map',
};
