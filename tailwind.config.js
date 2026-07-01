/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        atlas: {
          ink: "#3B3081",
          primary: "#51509D",
          violet: "#564EBD",
          teal: "#42CCB2",
          coral: "#E26C48",
          lavender: "#BAC0D8",
        },
        sidebar: {
          bg: "#251F4A",
        },
        surface: {
          light: "#F8F9FC",
          card: "#FFFFFF",
        },
        ink: {
          muted: "#6B6B85",
        }
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Sora", "Manrope", "sans-serif"],
      }
    },
  },
  plugins: [],
}

