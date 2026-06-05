/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: '#F2F2F7',
        or: '#C9A84C',
        success: '#4CAF82',
        info: '#4A9EFF',
        warning: '#FF9A3C',
        danger: '#FF6464',
        dark: '#1C1C2E',
      }
    },
  },
  plugins: [],
}
