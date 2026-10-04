module.exports = {
  extends: ['@chatverse/eslint-config'],
  rules: {
    // Playwright fixtures are destructured in test callbacks; empty patterns are idiomatic there.
    'no-empty-pattern': 'off',
  },
};
