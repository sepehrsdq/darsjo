import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#F0FDFA",
          100: "#CCFBF1",
          200: "#99F6E4",
          300: "#5EEAD4",
          400: "#2DD4BF",
          500: "#14B8A6",
          600: "#0D9488",
          700: "#0F766E",
          800: "#115E59",
          900: "#134E4A",
        },
        ink: {
          DEFAULT: "#10312E",
          soft: "#2C4F4B",
          muted: "#4B6B67",
        },
        sun: { 400: "#FBBF24", 500: "#F59E0B", 600: "#D97706", 700: "#B45309" },
        berry: "#DB2777",
        sky: "#2563EB",
        grape: "#7C3AED",
        danger: "#DC2626",
        leaf: "#16A34A",
      },
      fontFamily: {
        sans: ["'Vazirmatn Variable'", "Vazirmatn", "Tahoma", "sans-serif"],
        display: ["Lalezar", "'Vazirmatn Variable'", "sans-serif"],
      },
      borderRadius: { xl2: "1.5rem", xl3: "2rem" },
      boxShadow: {
        soft: "0 18px 40px -28px rgba(13, 148, 136, 0.45)",
        lift: "0 26px 50px -30px rgba(13, 148, 136, 0.55)",
        ring: "0 0 0 4px rgba(20, 184, 166, 0.18)",
      },
      keyframes: {
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        floaty: "floaty 6s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
