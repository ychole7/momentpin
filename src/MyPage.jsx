// src/MyPage_commercial.jsx
// 닿음 MyPage — 기존 MyPage 기능은 그대로 사용하고 확정 시안의 시각 언어만 적용
import { useEffect } from 'react'
import MyPageOriginal from './MyPage'

const css = `
:root {
  --mp-bg:#f8f7f3; --mp-card:#fff; --mp-card2:#f3f1ee;
  --mp-topbar:rgba(248,247,243,.94); --mp-ink:#1e2746; --mp-sub:#5f6678;
  --mp-muted:#8b92a1; --mp-line:#e6e7eb; --mp-line2:#d8dbe1;
  --mp-coral:#e56b62; --mp-gold:#d6b46a; --mp-teal:#13bca4;
}
.daheum-mypage-commercial, .daheum-mypage-commercial * { box-sizing:border-box; }
.daheum-mypage-commercial { background:var(--mp-bg); min-height:100dvh; }
.daheum-mypage-commercial > div { background:var(--mp-bg) !important; color:var(--mp-ink) !important; }
.daheum-mypage-commercial button { -webkit-tap-highlight-color:transparent; }
/* top */
.daheum-mypage-commercial > div > div:first-child {
  background:rgba(248,247,243,.94) !important; border-bottom:1px solid var(--mp-line) !important;
  backdrop-filter:blur(18px) !important; padding:14px 16px !important;
}
.daheum-mypage-commercial > div > div:first-child button {
  width:36px !important; height:36px !important; background:#f1f2f4 !important;
  border:0 !important; box-shadow:none !important; color:var(--mp-ink) !important;
}
/* body */
.daheum-mypage-commercial > div > div:nth-child(2) { padding:20px 16px 42px !important; }
/* profile */
.daheum-mypage-commercial > div > div:nth-child(2) > div:first-child { padding:8px 4px 22px !important; gap:14px !important; }
.daheum-mypage-commercial > div > div:nth-child(2) > div:first-child > div:first-child {
  width:64px !important; height:64px !important; border-radius:50% !important;
  box-shadow:0 8px 20px rgba(30,39,70,.12) !important; font-size:25px !important;
}
/* stat cards */
.daheum-mypage-commercial > div > div:nth-child(2) > div:nth-child(2) { gap:10px !important; margin-bottom:14px !important; }
.daheum-mypage-commercial > div > div:nth-child(2) > div:nth-child(2) > div {
  border-radius:18px !important; padding:17px 12px !important;
  box-shadow:0 6px 26px rgba(30,39,70,.055) !important; border:1px solid rgba(30,39,70,.035) !important;
}
/* our moments CTA */
.daheum-mypage-commercial > div > div:nth-child(2) > button {
  border:1px solid rgba(229,107,98,.55) !important; border-radius:16px !important;
  padding:14px 16px !important; margin-bottom:24px !important;
  color:var(--mp-ink) !important; background:linear-gradient(135deg,#fff,#fff7f4) !important;
  box-shadow:0 7px 22px rgba(229,107,98,.09) !important; text-align:left !important;
}
/* section labels */
.daheum-mypage-commercial > div > div:nth-child(2) > div[style*="text-transform: uppercase"] {
  color:#7d8595 !important; font-size:12px !important; letter-spacing:.6px !important;
  margin:20px 4px 9px !important;
}
/* cards */
.daheum-mypage-commercial > div > div:nth-child(2) > div[style*="border-radius: 16px"] {
  border-radius:18px !important; box-shadow:0 6px 28px rgba(30,39,70,.055) !important;
  border:1px solid rgba(30,39,70,.035) !important;
}
/* input */
.daheum-mypage-commercial input {
  border:1px solid #dde0e6 !important; border-radius:13px !important; background:#fff !important;
  min-height:48px !important; color:var(--mp-ink) !important;
}
/* save */
.daheum-mypage-commercial button[style*="linear-gradient"] {
  background:var(--mp-ink) !important; box-shadow:0 8px 18px rgba(30,39,70,.15) !important;
  border-radius:13px !important;
}
/* toggle */
.daheum-mypage-commercial button[style*="translateX"] { box-shadow:none !important; }
/* policy/account rows */
.daheum-mypage-commercial button[style*="borderBottom"] { min-height:46px !important; }
.daheum-mypage-commercial [style*="color: var(--mp-coral)"] { color:var(--mp-coral) !important; }
@media (max-width:520px){ .daheum-mypage-commercial{max-width:480px;margin:0 auto;} }
`

export default function MyPageCommercial(props){
  useEffect(()=>{
    const id='daheum-mypage-commercial-style'
    if(!document.getElementById(id)){
      const s=document.createElement('style'); s.id=id; s.textContent=css; document.head.appendChild(s)
    }
    return()=>document.getElementById(id)?.remove()
  },[])
  return <div className="daheum-mypage-commercial"><MyPageOriginal {...props}/></div>
}
