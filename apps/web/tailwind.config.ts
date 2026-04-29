import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        amber: {
          accent: "#D4903A",
          "accent-dark": "#a06a20",
          "accent-light": "#f5eadb",
          "accent-muted": "#3d2e1a",
        },
        surface: {
          dark: "#1A1A1A",
          "dark-secondary": "#141414",
          "dark-tertiary": "#252525",
          light: "#FFFFFF",
          "light-secondary": "#FAFAFA",
          "light-tertiary": "#F5F5F5",
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
export default config;
