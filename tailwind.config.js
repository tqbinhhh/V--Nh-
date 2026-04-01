module.exports = {
  content: [
    "./index.html",
    "./src/pages/**/*.html",
    "./src/js/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        // Primary Colors - Vietnamese prosperity green
        primary: {
          DEFAULT: "#2E7D32", // green-700
          50: "#E8F5E8", // green-50
          100: "#C8E6C9", // green-100
          200: "#A5D6A7", // green-200
          300: "#81C784", // green-300
          400: "#66BB6A", // green-400
          500: "#4CAF50", // green-500
          600: "#43A047", // green-600
          700: "#2E7D32", // green-700
          800: "#2E7D32", // green-800
          900: "#1B5E20", // green-900
        },
        // Secondary Colors - Confident blue
        secondary: {
          DEFAULT: "#1565C0", // blue-700
          50: "#E3F2FD", // blue-50
          100: "#BBDEFB", // blue-100
          200: "#90CAF9", // blue-200
          300: "#64B5F6", // blue-300
          400: "#42A5F5", // blue-400
          500: "#2196F3", // blue-500
          600: "#1E88E5", // blue-600
          700: "#1565C0", // blue-700
          800: "#1565C0", // blue-800
          900: "#0D47A1", // blue-900
        },
        // Accent Colors - Celebration orange
        accent: {
          DEFAULT: "#FF6F00", // orange-700
          50: "#FFF3E0", // orange-50
          100: "#FFE0B2", // orange-100
          200: "#FFCC80", // orange-200
          300: "#FFB74D", // orange-300
          400: "#FFA726", // orange-400
          500: "#FF9800", // orange-500
          600: "#FB8C00", // orange-600
          700: "#FF6F00", // orange-700
          800: "#EF6C00", // orange-800
          900: "#E65100", // orange-900
        },
        // Background Colors
        background: "#FAFAFA", // gray-50
        surface: "#FFFFFF", // white
        // Text Colors
        text: {
          primary: "#212121", // gray-800
          secondary: "#757575", // gray-600
        },
        // Status Colors
        success: {
          DEFAULT: "#4CAF50", // green-500
          50: "#E8F5E8", // green-50
          100: "#C8E6C9", // green-100
        },
        warning: {
          DEFAULT: "#FF9800", // orange-500
          50: "#FFF3E0", // orange-50
          100: "#FFE0B2", // orange-100
        },
        error: {
          DEFAULT: "#F44336", // red-500
          50: "#FFEBEE", // red-50
          100: "#FFCDD2", // red-100
        },
        // Border Colors
        border: {
          DEFAULT: "#E0E0E0", // gray-300
          light: "#F5F5F5", // gray-100
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      fontWeight: {
        light: '300',
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      boxShadow: {
        card: '0 2px 8px rgba(0, 0, 0, 0.08)',
        elevated: '0 4px 16px rgba(0, 0, 0, 0.12)',
        subtle: '0 1px 3px rgba(0, 0, 0, 0.06)',
      },
      borderRadius: {
        'lg': '8px',
        'xl': '12px',
        '2xl': '16px',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      animation: {
        'jar-fill': 'jarFill 600ms ease-out',
        'celebration': 'celebration 600ms ease-out',
        'fade-in': 'fadeIn 300ms ease-out',
        'slide-up': 'slideUp 300ms ease-out',
      },
      keyframes: {
        jarFill: {
          '0%': {
            transform: 'scaleY(0)',
            transformOrigin: 'bottom',
          },
          '100%': {
            transform: 'scaleY(1)',
            transformOrigin: 'bottom',
          },
        },
        celebration: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': {
            opacity: '0',
            transform: 'translateY(10px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
      },
      transitionDuration: {
        '300': '300ms',
        '600': '600ms',
      },
      transitionTimingFunction: {
        'ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
      },
      screens: {
        'xs': '475px',
      },
      maxWidth: {
        '8xl': '88rem',
        '9xl': '96rem',
      },
    },
  },
  plugins: [
    // Add any additional plugins here
    function({ addUtilities }) {
      const newUtilities = {
        '.text-headline': {
          fontSize: '1.5rem',
          fontWeight: '600',
          color: '#212121',
          lineHeight: '1.3',
        },
        '.text-subheadline': {
          fontSize: '1.125rem',
          fontWeight: '500',
          color: '#212121',
          lineHeight: '1.4',
        },
        '.text-body': {
          fontSize: '1rem',
          color: '#212121',
          lineHeight: '1.6',
        },
        '.text-caption': {
          fontSize: '0.875rem',
          color: '#757575',
          lineHeight: '1.5',
        },
        '.text-accent-light': {
          fontSize: '0.875rem',
          fontWeight: '300',
          color: '#757575',
          lineHeight: '1.5',
        },
        '.space-mindful > * + *': {
          marginTop: '2rem',
        },
        '.space-breathe > * + *': {
          marginTop: '3rem',
        },
      }
      addUtilities(newUtilities)
    }
  ],
}
