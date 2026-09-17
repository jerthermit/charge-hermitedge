/** @type {import("tailwindcss").Config} */
const defaultTheme = require("tailwindcss/defaultTheme");

module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],

  theme: {
    container: {
      center: false,
      padding: "0rem",
      screens: {
        "2xl": "100%",
      },
    },

    extend: {
      spacing: {
        13: "3.25rem",
      },

      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          ...defaultTheme.fontFamily.sans,
        ],
        mono: [
          '"JetBrains Mono"',
          '"SFMono-Regular"',
          "Consolas",
          ...defaultTheme.fontFamily.mono,
        ],
      },

      colors: {
        border: "hsl(0 0% 100% / 0.08)",
        input: "hsl(0 0% 7%)",
        ring: "hsl(79 100% 71%)",
        foreground: "hsl(0 0% 96%)",

        primary: {
          DEFAULT: "#111510",
          foreground: "#ffffff",
          light: "#293028",
          dark: "#070907",
          muted: "#e6e8e1",
        },

        secondary: {
          DEFAULT: "#dfff69",
          foreground: "#111510",
          light: "#e9ff9f",
          dark: "#b8db3f",
          muted: "#f4f8df",
        },

        accent: {
          DEFAULT: "#45c77a",
          foreground: "#111510",
          light: "#78dc9d",
          dark: "#269957",
          muted: "#e2f5e9",
        },

        background: {
          DEFAULT: "#111510",
          foreground: "#ffffff",
          alt: "#181d17",
          panel: "#20261f",
          raised: "#2a3129",
        },

        card: {
          DEFAULT: "#181d17",
          foreground: "#ffffff",
          border: "hsl(0 0% 100% / 0.08)",
          hover: "#20261f",
        },

        destructive: {
          DEFAULT: "#c84d3d",
          foreground: "#ffffff",
          light: "#ffe2dd",
          dark: "#8d2e22",
        },

        muted: {
          DEFAULT: "#20261f",
          foreground: "#a5ada3",
          border: "hsl(0 0% 100% / 0.08)",
        },

        popover: {
          DEFAULT: "#181d17",
          foreground: "#ffffff",
          border: "hsl(0 0% 100% / 0.08)",
        },

        charge: {
          ink: "#111510",
          canvas: "#f1f2ed",
          signal: "#dfff69",
          green: "#45c77a",
          blue: "#3477f6",
          danger: "#c84d3d",
        },

        energy: {
          oled: "#000000",
          charcoal: "#111510",
          panel: "#181d17",
          cyan: "#3477f6",
          yellow: "#dfff69",
          green: "#45c77a",
          red: "#c84d3d",
          amber: "#b98022",
          grid: "rgba(223, 255, 105, 0.14)",
          glass: "rgba(255, 255, 255, 0.05)",
        },
      },

      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      boxShadow: {
        "inner-glass":
          "inset 0 0 0 1px rgba(255, 255, 255, 0.05)",
        "inner-cyan":
          "inset 0 0 0 1px rgba(52, 119, 246, 0.28)",
        "inner-yellow":
          "inset 0 0 0 1px rgba(223, 255, 105, 0.28)",
        "inner-green":
          "inset 0 0 0 1px rgba(69, 199, 122, 0.28)",
        "cyan-glow": "0 0 22px rgba(52, 119, 246, 0.22)",
        "yellow-glow": "0 0 22px rgba(223, 255, 105, 0.22)",
        "green-glow": "0 0 22px rgba(69, 199, 122, 0.22)",
      },
    },
  },

  plugins: [require("tailwindcss-animate")],
};