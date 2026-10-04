import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Colours live only in src/styles/theme.css. Blocks hex/rgb/hsl/oklch values, Tailwind palette
// classes (bg-red-500, text-white, bg-black/10…) and arbitrary colours (bg-[#…]). See docs/ai/design-system.md.
const RAW_COLOUR =
  "/(#[0-9a-fA-F]{3,8}\\b|\\b(?:rgba?|hsla?|oklch|oklab|lch|hwb)\\(|\\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|divide|shadow|accent|caret|placeholder)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|black|white)(?:-\\d{2,3})?\\b|-\\[(?:#|rgb|hsl|oklch|color:))/";
const RAW_COLOUR_MESSAGE =
  "Colours live only in src/styles/theme.css — use a token utility (bg-primary, text-muted-foreground, bg-tone-info-soft…) or a ui-maps tone. See docs/ai/design-system.md.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/styles/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=${RAW_COLOUR}]`, message: RAW_COLOUR_MESSAGE },
        { selector: `TemplateElement[value.raw=${RAW_COLOUR}]`, message: RAW_COLOUR_MESSAGE },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "coverage/**", "playwright-report/**", "test-results/**"]),
]);

export default eslintConfig;
