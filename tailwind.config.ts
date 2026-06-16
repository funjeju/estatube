import type { Config } from "tailwindcss";

// 제주 디자인 토큰 (SPEC.md §6: 현무암·바다·감귤)
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        basalt: "#20282b", // 현무암 — 본문/제목
        paper: "#eef0ec", // 배경
        sea: {
          DEFAULT: "#176b6b", // 바다
          soft: "#d7e6e3",
        },
        tangerine: "#e2702a", // 감귤 — 상태 신호(게시·라이브·가격인하)에만
        stone: "#b9c2bd",
        muted: "#5d665f",
      },
      borderRadius: {
        card: "10px",
        pill: "20px",
      },
      fontFamily: {
        sans: ["Pretendard", "ui-sans-serif", "system-ui", "sans-serif"],
        // 가격·좌표·날짜·ID·로그 전용
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
