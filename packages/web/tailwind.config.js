/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#08090a",
        surface: "#0f1011",
        elevated: "#161718",
        border: "#232427",
        borderhi: "#33353a",
        muted: "#8a8f98",
        subtle: "#62666d",
        text: "#f7f8f8",
        accent: "#7c6bf0",
        accent2: "#8f7bff",
        good: "#4cc38a",
        warn: "#f5a623",
        bad: "#eb5757",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 0 0 1px rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.4)",
        pop: "0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
        glow: "0 0 0 1px rgba(124,107,240,0.4), 0 0 24px rgba(124,107,240,0.25)",
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
