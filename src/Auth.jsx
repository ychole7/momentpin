// src/Auth.jsx
import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function Auth() {
  const inviteCode = (() => {
    try { return new URL(window.location.href).searchParams.get('code') || '' } catch { return '' }
  })()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function submit() {
    if (!email || !pw) { setMsg('이메일과 비밀번호를 입력해 주세요.'); return }
    setBusy(true); setMsg('')

    if (mode === 'signup') {
      let res = await supabase.auth.signUp({ email, password: pw })
      const error = res.error
      if (error) { setMsg(error.message); setBusy(false); return }
      if (!res.data.session) {
        setMsg('가입 완료! 메일 인증이 필요하면 받은 편지함을 확인해 주세요.')
        setBusy(false); return
      }
    } else {
      let res = await supabase.auth.signInWithPassword({ email, password: pw })
      const error = res.error
      if (error) { setMsg(error.message); setBusy(false); return }
    }
    setBusy(false)
  }

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <div style={S.logoRow}>
          <div style={S.logoDot} />
          <div>
            <div style={S.logoName}>모먼핀</div>
            <div style={S.logoSub}>MOMENT · PIN</div>
          </div>
        </div>
         {inviteCode && (
          <div style={S.invite}>
            🎉 <b>모먼핀에 초대됐어요!</b><br/>
            <span style={{ fontSize: 13, opacity: .85 }}>가입하면 <b>{inviteCode}</b> 그룹에 바로 참여돼요</span>
          </div>
        )}
        <p style={S.tagline}>정해진 순간, 다 같이 찰칵.<br/>지금 가족이 어디에 있는지 지도로.</p>

        <input style={S.input} type="email" placeholder="이메일"
          value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
        <input style={S.input} type="password" placeholder="비밀번호"
          value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />

        {msg && <div style={S.msg}>{msg}</div>}

        <button style={{ ...S.primary, opacity: busy ? .6 : 1 }} disabled={busy} onClick={submit}>
          {busy ? '잠시만요…' : (mode === 'login' ? '로그인' : '가입하기')}
        </button>

        <button style={S.switch} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg('') }}>
          {mode === 'login' ? '처음이신가요? 가입하기' : '이미 계정이 있어요 · 로그인'}
        </button>
      </div>
    </div>
  )
}

const S = {
  wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#fafafa', padding: 20, fontFamily: "'Outfit','Gowun Dodum',-apple-system,sans-serif" },
  card: { width: '100%', maxWidth: 380, background: '#fff', borderRadius: 24, padding: '32px 24px',
    boxShadow: '0 12px 40px rgba(20,20,30,.1)' },
  logoRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 },
  logoDot: { width: 30, height: 30, borderRadius: '9px 9px 9px 3px',
    background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 4px 12px rgba(255,77,94,.35)' },
  logoName: { fontSize: 21, fontWeight: 700, letterSpacing: '-.5px', color: '#16161a', lineHeight: 1 },
  logoSub: { fontSize: 10, letterSpacing: 2, color: '#9b9ba3', fontWeight: 600, marginTop: 2 },
  tagline: { fontSize: 14, color: '#6b6b73', lineHeight: 1.5, margin: '0 0 22px' },
  input: { width: '100%', border: '1.5px solid #efeff2', borderRadius: 12, padding: '13px 14px',
    fontSize: 15, fontFamily: 'inherit', marginBottom: 10, outline: 'none', boxSizing: 'border-box' },
  msg: { fontSize: 13, color: '#e0593c', background: '#fff1ed', padding: '10px 12px',
    borderRadius: 10, margin: '4px 0 12px' },
  primary: { width: '100%', border: 'none', borderRadius: 14, padding: 15, fontSize: 15, fontWeight: 700,
    fontFamily: 'inherit', cursor: 'pointer', color: '#fff',
    background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 8px 20px rgba(255,77,94,.3)' },
  switch: { width: '100%', border: 'none', background: 'none', color: '#9b9ba3',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600, marginTop: 14, cursor: 'pointer' },
  invite: { background: 'linear-gradient(135deg,#fff1ed,#ffe9e0)', border: '1.5px solid #ffd9cc', borderRadius: 14, padding: '13px 15px', marginBottom: 16, color: '#16161a', fontSize: 15, lineHeight: 1.4 },
}