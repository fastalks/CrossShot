import type { Configuration } from 'webpack';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';
import path from 'path';
import { fileURLToPath } from 'url';

// 替换 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rendererConfig: Configuration = {
  entry: './src/renderer.ts', // 根据你的实际入口文件调整
  target: 'electron-renderer',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  output: {
    path: __dirname + '/.webpack/renderer',
    filename: 'index.js'
  }
};

export default rendererConfig;