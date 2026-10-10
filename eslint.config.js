import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

const headless = [
  'src/physics/**/*.ts',
  'src/ai/**/*.ts',
  'src/race/**/*.ts',
  'src/tracks/**/*.ts',
  'src/cars/**/*.ts',
  'src/core/**/*.ts',
  'src/input/**/*.ts',
  'src/audio/**/*.ts',
  'src/ui/**/*.ts',
  'src/game/**/*.ts',
]

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/**',
      'playwright-report/**',
      'test-results/**',
      'blob-report/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: headless,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three', 'three/*'],
              message: 'Import Three.js only from src/render so the simulation stays headless.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
)
