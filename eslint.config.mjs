import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { flatConfigs as importConfigs } from "eslint-plugin-import-x";
import vue from "eslint-plugin-vue";
import globals from "globals";
import { configs as tsConfigs, parser as tsParser } from "typescript-eslint";

export default [
  { ignores: ["node_modules/**", "out/**", ".vite/**", ".yarn/**", ".cache/**", "tests/**"] },
  js.configs.recommended,
  ...tsConfigs.recommended,
  importConfigs.recommended,
  importConfigs.typescript,
  ...vue.configs["flat/recommended"],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { "vue/multi-word-component-names": "off", "import-x/no-unresolved": "off" }
  },
  { files: ["**/*.vue"], languageOptions: { parserOptions: { parser: tsParser } } },
  // These files are function expressions injected into YouTube Music as raw text.
  { files: ["**/*.script.js"], rules: { "@typescript-eslint/no-unused-expressions": "off" } },
  prettier
];
