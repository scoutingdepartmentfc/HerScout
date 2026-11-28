/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        navy: {
          950: "#070c18",
          900: "#0b1329",
          850: "#0e1834",
          800: "#132145",
          700: "#1a2c5b",
          600: "#274288",
        },
        pitch: {
          500: "#10b981",
          400: "#34d399",
        },
        score: {
          purple: "#7068FF",
          mint: "#00E676",
          green: "#00C853",
          amber: "#FFB300",
          white: "#FFFFFF",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Arial Narrow", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [
    // Player profile "fit to screen" canvas (tablet/desktop): the page is laid out on a fixed design
    // canvas and scaled with CSS zoom, so viewport breakpoints don't apply inside it — use fit:/land: instead.
    function ({ addVariant }) {
      addVariant("fit", ".profile-fit &");
      addVariant("land", ".profile-fit-land &");
    },
  ],
};

