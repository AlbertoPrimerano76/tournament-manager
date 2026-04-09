/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Brand palette — all #103e31 usages should reference these tokens
        rugby: {
          brand: "#103e31",
          "brand-dark": "#0a2f26",
          "brand-mid": "#0f4737",
          green: "#2d6a4f",
          "green-dark": "#1b4332",
          "green-light": "#52b788",
          gold: "#d4a017",
        },
        // Age group palette — used in TournamentPage for category cards
        "age-u6":  "#22c55e",
        "age-u8":  "#0ea5e9",
        "age-u10": "#f59e0b",
        "age-u12": "#8b5cf6",
        "age-u14": "#ec4899",
        "age-u16": "#f97316",
        "age-u18": "#06b6d4",
        "age-u20": "#64748b",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Named tokens for the card/panel radii used throughout the UI
        card: "1.5rem",
        panel: "1.8rem",
        logo: "1.6rem",
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],  // 11px
      },
      letterSpacing: {
        widest2: "0.2em",
        widest3: "0.22em",
      },
    },
  },
  plugins: [],
}
