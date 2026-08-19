/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0a0a0b",
          800: "#121214",
          700: "#1a1a1f",
          600: "#24242b",
          500: "#33333d",
        },
        accent: {
          DEFAULT: "#1db954",
          soft: "#1ed760",
          dim: "#14803a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseRing: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up .22s ease-out both",
        "pulse-ring": "pulseRing 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
