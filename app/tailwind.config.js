/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        probolsas: {
          navy: '#1565C0',
          cyan: '#00B4D8',
        },
        dashboard: {
          sidebar: '#0f172a', /* Dark slate from image */
          canvas: '#e2e8f0', /* Light grayish blue background */
          card: '#ffffff',
          textMain: '#0f172a',
          textMuted: '#64748b'
        }
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        '4xl': '2.5rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
