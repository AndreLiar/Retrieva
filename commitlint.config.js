// =============================================================================
// Commitlint Configuration
// =============================================================================
// Enforces Conventional Commits specification
// https://www.conventionalcommits.org/

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Type must be one of the following
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'docs',     // Documentation changes
        'style',    // Code style changes (formatting, semicolons, etc.)
        'refactor', // Code refactoring (no feature/fix)
        'test',     // Adding or updating tests
        'chore',    // Maintenance tasks
        'perf',     // Performance improvements
        'ci',       // CI/CD changes
        'build',    // Build system changes
        'revert',   // Revert previous commit
      ],
    ],
    // Type must be lowercase
    'type-case': [2, 'always', 'lower-case'],
    // Type cannot be empty
    'type-empty': [2, 'never'],
    // Subject cannot be empty
    'subject-empty': [2, 'never'],
    // Subject must start with lowercase
    'subject-case': [2, 'always', 'lower-case'],
    // No period at the end of subject
    'subject-full-stop': [2, 'never', '.'],
    // Header max length 100 characters
    'header-max-length': [2, 'always', 100],
    // Body max line length 100 characters
    'body-max-line-length': [2, 'always', 100],
  },
};
