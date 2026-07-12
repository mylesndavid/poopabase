/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#121212",
        surface: "#1c1c1c",
        elevated: "#232323",
        overlay: "#2a2a2a",
        border: "#2e2e2e",
        borderhi: "#3e3e3e",
        muted: "#a0a0a0",
        subtle: "#707070",
        text: "#ededed",
        accent: "#3ecf8e",
        accent2: "#24b47e",
        accentdark: "#072a1c",
        good: "#3ecf8e",
        warn: "#f5a623",
        bad: "#e5484d",
      },
      fontFamily: {
        sans: ["'Inter'", "'Circular'", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["'Roboto Mono'", "'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.2)",
        pop: "0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
        glow: "0 0 0 1px rgba(62,207,142,0.35), 0 0 20px rgba(62,207,142,0.2)",
      },
      keyframes: {
        pulseDot: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        flow: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
      },
      animation: {
        pulseDot: "pulseDot 1.6s ease-in-out infinite",
        slideUp: "slideUp 0.18s ease-out",
        flow: "flow 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};
