// CommonJS version of webpack.rules.ts for Forge compatibility
/* eslint-disable @typescript-eslint/no-var-requires */
exports.rules = [
  // Support native node modules
  {
    test: /native_modules[/\\].+\.node$/,
    use: 'node-loader',
  },
  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: '@vercel/webpack-asset-relocator-loader',
      options: { outputAssetBase: 'native_modules' },
    },
  },
  {
    test: /\.tsx?$/,
    exclude: /(node_modules|\.webpack)/,
    use: {
      loader: 'ts-loader',
      options: { transpileOnly: true },
    },
  },
];
