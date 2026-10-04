module.exports = {
  extends: ['@chatverse/eslint-config'],
  rules: {
    // The bench CLI prints its results to stdout by design.
    'no-console': 'off',
  },
};
