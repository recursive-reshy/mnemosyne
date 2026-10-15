import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: [ 'dist/', 'coverage/' ] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  reactHooks.configs.flat.recommended,
  { rules: { 'react-hooks/exhaustive-deps': 'error' } },
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [ '*.js' ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: [ '**/*.js' ],
    extends: [ tseslint.configs.disableTypeChecked ],
  },
  {
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/space-in-parens': [ 'error', 'always' ],
      '@stylistic/array-bracket-spacing': [ 'error', 'always' ],
      '@stylistic/object-curly-spacing': [ 'error', 'always' ],
      '@stylistic/keyword-spacing': [ 'error', {
        before: true,
        after: true,
        overrides: {
          if: { after: false },
          for: { after: false },
          while: { after: false },
          switch: { after: false },
          catch: { after: false },
        },
      } ],
      '@stylistic/semi': [ 'error', 'never' ],
      '@stylistic/quotes': [ 'error', 'single', {
        avoidEscape: true,
        allowTemplateLiterals: 'always',
      } ],
      'prefer-template': 'error',
      '@stylistic/max-len': [ 'error', { code: 100, ignoreUrls: true } ],
      '@stylistic/function-paren-newline': [ 'error', 'multiline-arguments' ],
      '@stylistic/function-call-argument-newline': [ 'error', 'consistent' ],
      '@stylistic/comma-dangle': [ 'error', 'always-multiline' ],
      '@stylistic/object-curly-newline': [ 'error', {
        ImportDeclaration: { minProperties: 4, multiline: true },
      } ],
      '@stylistic/indent': [ 'error', 2 ],
      '@stylistic/jsx-quotes': [ 'error', 'prefer-double' ],
      '@stylistic/jsx-curly-spacing': [ 'error', {
        when: 'always',
        children: true,
        attributes: true,
      } ],
      'max-lines': [ 'error', { max: 150, skipBlankLines: true, skipComments: true } ],
      'no-restricted-imports': [ 'error', {
        patterns: [ {
          regex: '^\\.\\./\\.\\./',
          message: 'Use the #src/* alias for imports that climb two or more levels.',
        } ],
      } ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'Use a string-literal union or an as const object.',
        },
        {
          selector: 'TSModuleDeclaration',
          message: 'Namespaces are not erasable syntax.',
        },
        {
          selector: 'TSParameterProperty',
          message: 'Parameter properties are not erasable syntax.',
        },
      ],
    },
  },
  {
    files: [ '**/*.test.ts', '**/*.test.tsx' ],
    rules: { 'max-lines': 'off' },
  },
)
