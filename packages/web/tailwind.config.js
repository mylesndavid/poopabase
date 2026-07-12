/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Light system — cool off-white canvas, pure-white panels, neutral scale.
        bg: "#fbfbfc",
        surface: "#ffffff",
        elevated: "#f5f6f7",
        overlay: "#ffffff",
        border: "#e7e8eb",
        borderhi: "#dcdee2",
        muted: "#5f636b",
        subtle: "#8b8f98",
        text: "#1b1c1e",
        // Green — brand for actions/status, green-ink for text/icons on white.
        accent: "#3ecf8e",
        accent2: "#34b87e",
        accentdark: "#05341f",
        greenink: "#1a7f52",
        brandwash: "#edf9f2",
        good: "#1a7f52",
        warn: "#b7791f",
        bad: "#e5484d",
      },
      fontFamily: {
        sans: ["'Inter'", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["'Roboto Mono'", "'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04)",
        pop: "0 24px 70px rgba(16,24,40,0.18), 0 0 0 1px rgba(16,24,40,0.04)",
        drawer: "-24px 0 70px rgba(16,24,40,0.14), -1px 0 0 rgba(16,24,40,0.06)",
      },
      keyframes: {
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slidein: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
      animation: {
        slideUp: "slideUp 0.18s ease-out",
        slidein: "slidein 0.22s cubic-bezier(0.32,0.72,0,1)",
      },
    },
  },
  plugins: [],
};
