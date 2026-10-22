import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: [ 'test-results/', 'playwright-report/' ] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { process: 'readonly', Buffer: 'readonly', URL: 'readonly' },
      parserOptions: {
        projectService: {
          allowDefaultProject: [ '*.js' ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: [ '**/*.js', '**/*.mjs' ],
    extends: [ tseslint.configs.disableTypeChecked ],
  },
  {
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/space-in-parens': [ 'error', 'always' ],
      '@stylistic/array-bracket-spacing': [ 'error', 'always' ],
      '@stylistic/object-curly-spacing': [ 'error', 'always' ],
      '@stylistic/semi': [ 'error', 'never' ],
      '@stylistic/quotes': [ 'error', 'single', {
        avoidEscape: true,
        allowTemplateLiterals: 'always',
      } ],
      'prefer-template': 'error',
      '@stylistic/comma-dangle': [ 'error', 'always-multiline' ],
      '@stylistic/indent': [ 'error', 2 ],
      'func-style': [ 'error', 'expression' ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
)
