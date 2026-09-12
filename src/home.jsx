// src/Home.jsx
// 닿음 Home v2 — 기존 Home 로직을 그대로 보존하고 상용앱 스타일만 입히는 안전한 래퍼
// 적용 전 기존 Home.jsx를 HomeOriginal.jsx로 이름 변경하세요.

import { useEffect } from 'react'
import OriginalHome from './HomeOriginal'

const styleText = `
:root {
  --mp-bg: #f8f7f3;
  --mp-card: #ffffff;
  --mp-card2: #f0f1f3;
  --mp-topbar: rgba(248,247,243,.94);
  --mp-ink: #1e2746;
  --mp-sub: #5f6678;
  --mp-muted: #8b92a1;
  --mp-line: #e5e7eb;
  --mp-coral: #e56b62;
  --mp-gold: #d6b46a;
  --mp-teal: #13a995;
}

#root > div {
  background: var(--mp-bg) !important;
  color: var(--mp-ink) !important;
  font-family: -apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif !important;
}

#root > div > div:first-child {
  background: rgba(248,247,243,.94) !important;
  border-bottom: 1px solid var(--mp-line) !important;
  backdrop-filter: blur(18px) !important;
}

#root > div > div:first-child img {
  width: 34px !important;
  height: 34px !important;
}

#root > div > div:first-child button {
  background: #fff !important;
  color: var(--mp-ink) !important;
  border: 1px solid rgba(30,39,70,.12) !important;
  box-shadow: 0 3px 10px rgba(30,39,70,.07) !important;
}

/* 메인 상태 카드 */
#root > div > div:nth-of-type(2) {
  background: linear-gradient(145deg,#1e2746,#273252) !important;
  box-shadow: 0 14px 34px rgba(30,39,70,.18) !important;
}

#root > div > div:nth-of-type(2) > div:last-child {
  min-height: 142px !important;
}

#root > div > div:nth-of-type(2) > div:last-child > div:first-child {
  font-size: 10px !important;
  letter-spacing: 1.1px !important;
  opacity: .68 !important;
}

#root > div > div:nth-of-type(2) > div:last-child > div:nth-child(2) {
  font-size: 22px !important;
  line-height: 1.3 !important;
  font-weight: 750 !important;
  letter-spacing: -.65px !important;
}

/* 초대/스트릭 카드 */
#root button {
  -webkit-tap-highlight-color: transparent;
}

#root > div button {
  font-family: inherit !important;
}

#root > div > div:nth-of-type(3),
#root > div > div:nth-of-type(4) {
  border-radius: 16px !important;
}

/* 지도 */
.leaflet-container {
  font-family: inherit !important;
}

.leaflet-control-zoom a {
  color: var(--mp-ink) !important;
}

/* 탭 */
#root > div > div:nth-of-type(5) {
  background: #e9eaed !important;
  border-radius: 15px !important;
  padding: 3px !important;
}

#root > div > div:nth-of-type(5) button {
  border-radius: 12px !important;
  font-size: 12.5px !important;
}

#root > div > div:nth-of-type(5) button[style*="background: var(--mp-card)"] {
  box-shadow: 0 2px 7px rgba(30,39,70,.10) !important;
}

/* 사진/피드 카드 */
.leaflet-container,
#root img {
  -webkit-user-drag: none;
}

@media (max-width: 520px) {
  #root > div {
    max-width: 480px !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
  }
}
`

function injectStyles() {
  const id = 'daheum-home-v2-style'
  if (document.getElementById(id)) return
  const el = document.createElement('style')
  el.id = id
  el.textContent = styleText
  document.head.appendChild(el)
}

export default function Home(props) {
  useEffect(() => {
    injectStyles()
    return () => {
      document.getElementById('daheum-home-v2-style')?.remove()
    }
  }, [])

  return <OriginalHome {...props} />
}
