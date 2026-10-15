/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0f766e',
          light: '#14b8a6',
          dark: '#115e59',
        },
        warm: '#faf6f1',
        ink: '#1c1917',
        champ: {
          DEFAULT: '#ca8a04',
          light: '#eab308',
          dark: '#a16207',
        },
        clay: {
          DEFAULT: '#9a5b3f',
          light: '#b5755a',
          soft: '#f7e8dd',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        soft: '0 2px 12px rgba(28, 25, 23, 0.06)',
        lift: '0 12px 32px rgba(28, 25, 23, 0.12)',
        glow: '0 0 0 1px rgba(15, 118, 110, 0.08), 0 12px 40px rgba(15, 118, 110, 0.18)',
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.55s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.5s ease both',
        'float': 'float 6s ease-in-out infinite',
        'drawer-in': 'drawer-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
        'shimmer': 'shimmer 1.6s linear infinite',
        'float3d': 'float3d 7s ease-in-out infinite',
        'tilt3d': 'tilt3d 11s ease-in-out infinite',
        'shadow-pulse': 'shadow-pulse 7s ease-in-out infinite',
        'watermark-drift': 'watermark-drift 14s ease-in-out infinite',
        'glare': 'glare 7s ease-in-out infinite',
        'card-in': 'card-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        'hero-in': 'hero-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
        'hero-line': 'hero-line 0.8s cubic-bezier(0.16, 1, 0.3, 1) both',
        'rise': 'rise 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
        'ring-spin': 'ring-spin 16s linear infinite',
        'ring-spin-slow': 'ring-spin 22s linear infinite',
        'tilt-sway': 'tilt-sway 7s ease-in-out infinite',
        'msg-in': 'msg-in 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
        'marquee': 'marquee 26s linear infinite',
      },
      keyframes: {
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(18px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'drawer-in': {
          from: { opacity: '0', transform: 'translateX(100%)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        float3d: {
          '0%, 100%': { transform: 'translateY(0) rotateY(-6deg) rotateZ(0.4deg)' },
          '50%': { transform: 'translateY(-22px) rotateY(-6deg) rotateZ(-0.4deg)' },
        },
        tilt3d: {
          '0%, 100%': { transform: 'rotateY(-7deg) rotateX(2deg) scale(1.02)' },
          '50%': { transform: 'rotateY(7deg) rotateX(-2deg) scale(1)' },
        },
        'shadow-pulse': {
          '0%, 100%': { opacity: '0.55', transform: 'translateX(-50%) scaleX(0.9)' },
          '50%': { opacity: '0.32', transform: 'translateX(-50%) scaleX(0.72)' },
        },
        'watermark-drift': {
          '0%, 100%': { transform: 'translateX(-3%)' },
          '50%': { transform: 'translateX(3%)' },
        },
        glare: {
          '0%': { transform: 'translateX(-160%) skewX(-14deg)', opacity: '0' },
          '52%': { transform: 'translateX(-160%) skewX(-14deg)', opacity: '0' },
          '72%': { transform: 'translateX(230%) skewX(-14deg)', opacity: '0.55' },
          '100%': { transform: 'translateX(230%) skewX(-14deg)', opacity: '0' },
        },
        'progress-fill': {
          '0%': { width: '0%' },
          '100%': { width: '100%' },
        },
        'card-in': {
          '0%': { opacity: '0', transform: 'translateY(22px) scale(0.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'hero-in': {
          '0%': { opacity: '0', transform: 'translateY(26px) scale(0.985)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'hero-line': {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(40px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'ring-spin': {
          to: { transform: 'rotate(360deg)' },
        },
        'tilt-sway': {
          '0%, 100%': { transform: 'rotate(-3deg) scale(1.02)' },
          '50%': { transform: 'rotate(3deg) scale(1.06)' },
        },
        'msg-in': {
          '0%': { opacity: '0', transform: 'translateY(16px)', filter: 'blur(6px)' },
          '60%': { opacity: '1' },
          '100%': { opacity: '1', transform: 'translateY(0)', filter: 'blur(0)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
};
