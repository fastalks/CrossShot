// CommonJS version of webpack.renderer.config.ts
const { rules } = require('./webpack.rules');
const { plugins } = require('./webpack.plugins');

// add css loader rule
rules.push({ test: /\.css$/, use: [{ loader: 'style-loader' }, { loader: 'css-loader' }] });

module.exports = {
  module: { rules },
  plugins,
  resolve: { extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'] },
};
