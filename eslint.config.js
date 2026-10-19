import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'prototype', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Game rules act on a given player (multiplayer has several); world.player is single-player shorthand.
    files: ['src/sim/**', 'src/ai/**', 'src/items/**', 'server/**'],
    rules: {
      'no-restricted-properties': ['error', { object: 'world', property: 'player', message: 'Take the player the rule acts on (world.players[id]); world.player is single-player shorthand.' }],
    },
  },
);
