// src/Onboarding.jsx — 로그인 후 처음 1회 보는 앱 소개 (3페이지)
import { useState } from 'react'

const PAGES = [
  {
    art: 'welcome',
    title: '지도 위에 안부를 묻다',
    body: '멀리 있어도 괜찮아요.\n정해진 순간이 오면 다 같이 지금을 남기고,\n지도 위에서 서로의 안부를 확인해요.',
  },
  {
    art: 'group',
    title: '먼저, 그룹으로 모여요',
    body: '가족이나 친구끼리 그룹을 만들어요.\n새 그룹을 만들거나,\n받은 초대 코드로 참여할 수 있어요.',
  },
  {
    art: 'flow',
    title: '이렇게 함께해요',
    body: '',
    steps: [
      { n: '🔔', t: '모먼 시간이 되면 알림이 와요' },
      { n: '📍', t: '정해진 시간 안에 다 같이 지금을 남겨요' },
      { n: '🗺️', t: '지도와 피드에서 서로의 지금을 봐요' },
    ],
  },
]

export default function Onboarding({ onDone }) {
  const [i, setI] = useState(0)
  const last = i === PAGES.length - 1
  const page = PAGES[i]

  return (
    <div style={S.wrap}>
      <div style={S.skipRow}>
        <button style={S.skip} onClick={onDone}>건너뛰기</button>
      </div>

      <div style={S.body}>
        <div style={S.art}><Art kind={page.art} /></div>
        <div style={S.title}>{page.title}</div>
        {page.body && <div style={S.text}>{page.body.split('\n').map((l, k) => <div key={k}>{l}</div>)}</div>}
        {page.steps && (
          <div style={S.steps}>
            {page.steps.map((s, k) => (
              <div key={k} style={S.step}>
                <span style={S.stepIcon}>{s.n}</span>
                <span style={S.stepText}>{s.t}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={S.bottom}>
        <div style={S.dots}>
          {PAGES.map((_, k) => <span key={k} style={{ ...S.dot, ...(k === i ? S.dotOn : {}) }} />)}
        </div>
        <button style={S.next} onClick={() => last ? onDone() : setI(i + 1)}>
          {last ? '시작하기' : '다음'}
        </button>
      </div>
    </div>
  )
}

function Art({ kind }) {
  if (kind === 'welcome') return (
    <svg viewBox="0 0 200 200" width="180" height="180">
      <defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff7a45"/><stop offset="1" stopColor="#ff4d5e"/></linearGradient></defs>
      <circle cx="100" cy="100" r="80" fill="#fff1ed"/>
      <path d="M100 55c-20 0-36 16-36 36 0 27 36 54 36 54s36-27 36-54c0-20-16-36-36-36z" fill="url(#g1)"/>
      <circle cx="100" cy="91" r="14" fill="#fff"/>
    </svg>
  )
  if (kind === 'group') return (
    <svg viewBox="0 0 200 200" width="180" height="180">
      <circle cx="100" cy="100" r="80" fill="#eef4ff"/>
      <circle cx="72" cy="88" r="20" fill="#5b8def"/><circle cx="72" cy="80" r="9" fill="#fff"/><path d="M58 104c0-9 6-14 14-14s14 5 14 14z" fill="#fff"/>
      <circle cx="128" cy="88" r="20" fill="#13bca4"/><circle cx="128" cy="80" r="9" fill="#fff"/><path d="M114 104c0-9 6-14 14-14s14 5 14 14z" fill="#fff"/>
      <circle cx="100" cy="120" r="22" fill="#ff7a45"/><circle cx="100" cy="111" r="10" fill="#fff"/><path d="M84 138c0-10 7-16 16-16s16 6 16 16z" fill="#fff"/>
    </svg>
  )
  return (
    <svg viewBox="0 0 200 200" width="180" height="180">
      <circle cx="100" cy="100" r="80" fill="#f0fdf9"/>
      <rect x="55" y="60" width="90" height="80" rx="12" fill="#fff" stroke="#13bca4" strokeWidth="3"/>
      <circle cx="100" cy="95" r="18" fill="#13bca4"/><circle cx="100" cy="90" r="7" fill="#fff"/>
      <rect x="72" y="120" width="56" height="7" rx="3" fill="#d6f5ec"/>
      <circle cx="145" cy="65" r="14" fill="#ff4d5e"/><text x="145" y="70" fontSize="14" fill="#fff" textAnchor="middle">♥</text>
    </svg>
  )
}

const S = {
  wrap: { position: 'fixed', inset: 0, background: '#fff', zIndex: 9000, display: 'flex', flexDirection: 'column', fontFamily: "'Outfit','Gowun Dodum',sans-serif", color: '#16161a', maxWidth: 480, margin: '0 auto' },
  skipRow: { display: 'flex', justifyContent: 'flex-end', padding: 'max(calc(env(safe-area-inset-top, 0px) + 16px), 56px) 18px 0', minHeight: 44 },
  skip: { border: 'none', background: '#f4f4f6', color: '#6b6b73', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '7px 14px', borderRadius: 16 },
  body: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 32px', textAlign: 'center' },
  art: { marginBottom: 32 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 14, letterSpacing: '-.5px' },
  text: { fontSize: 15, color: '#5b5b63', lineHeight: 1.7 },
  steps: { display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8, width: '100%', maxWidth: 320 },
  step: { display: 'flex', alignItems: 'center', gap: 14, background: '#fafafa', borderRadius: 14, padding: '14px 16px', textAlign: 'left' },
  stepIcon: { fontSize: 22, flex: 'none' },
  stepText: { fontSize: 14, fontWeight: 500, color: '#16161a' },
  bottom: { padding: '20px 24px calc(env(safe-area-inset-bottom, 0px) + 28px)' },
  dots: { display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 20 },
  dot: { width: 7, height: 7, borderRadius: '50%', background: '#e0e0e6', transition: 'all .2s' },
  dotOn: { background: '#ff4d5e', width: 22, borderRadius: 4 },
  next: { width: '100%', border: 'none', borderRadius: 14, padding: 16, fontFamily: 'inherit', fontSize: 16, fontWeight: 700, cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 8px 20px rgba(255,77,94,.3)' },
}
