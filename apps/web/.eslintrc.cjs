module.exports = {
  extends: ['@chatverse/eslint-config', 'plugin:react-hooks/recommended'],
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
  overrides: [
    {
      files: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
  ],
};
