// src/Auth.jsx
import { useState } from 'react'
import { supabase } from './supabaseClient'
import Privacy from './Privacy'
import Terms from './Terms'

export default function Auth() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [age, setAge] = useState(false)   // 만 14세 이상 동의

  async function submit() {
    if (!email || !pw) { setMsg('이메일과 비밀번호를 입력해 주세요.'); return }
    if (mode === 'signup') {
      if (!age) { setMsg('만 14세 이상만 가입할 수 있어요. 동의에 체크해 주세요.'); return }
      if (pw.length < 8) { setMsg('비밀번호는 8자 이상이어야 해요.'); return }
      if (!/[a-zA-Z]/.test(pw)) { setMsg('비밀번호에 영문자를 포함해 주세요.'); return }
      if (!/[0-9]/.test(pw)) { setMsg('비밀번호에 숫자를 포함해 주세요.'); return }
    }
    setBusy(true); setMsg('')

    if (mode === 'signup') {
      // ⚠️ CRM 빌드 경고 회피: { error } 구조분해 대신 res.error 사용
      let res = await supabase.auth.signUp({ email, password: pw })
      const error = res.error
      if (error) { setMsg(error.message); setBusy(false); return }
      // 이메일 확인이 꺼져 있으면 바로 로그인됨. 켜져 있으면 안내.
      if (!res.data.session) {
        setMsg('가입 완료! 메일 인증이 필요하면 받은 편지함을 확인해 주세요.')
        setBusy(false); return
      }
    } else {
      let res = await supabase.auth.signInWithPassword({ email, password: pw })
      const error = res.error
      if (error) { setMsg(error.message); setBusy(false); return }
    }
    // 성공 시 onAuthStateChange가 App에서 세션을 감지 → 화면 전환
    setBusy(false)
  }

  if (showPrivacy) return <Privacy onClose={() => setShowPrivacy(false)} />
  if (showTerms) return <Terms onClose={() => setShowTerms(false)} />

  return (
    <div style={S.wrap}>
      {/* 상단 로고 영역 */}
      <div style={S.top}>
        <div style={S.logoRow}>
          <div style={S.logoDot} />
          <div>
            <div style={S.logoName}>모먼핀</div>
            <div style={S.logoSub}>MOMENT · PIN</div>
          </div>
        </div>
        <p style={S.tagline}>지도 위에 안부를 묻다<br/><span style={{ fontSize: 13, opacity: .7 }}>멀리 있어도, 오늘 서로의 순간을 나눠요</span></p>
      </div>

      {/* 하단 입력 영역 */}
      <div style={S.form}>
        <input style={S.input} type="email" placeholder="이메일"
          value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
        <input style={S.input} type="password" placeholder="비밀번호"
          value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
        {mode === 'signup' && <div style={S.pwHint}>영문+숫자 조합 8자 이상</div>}

        {mode === 'signup' && (
          <label style={S.ageRow}>
            <input type="checkbox" checked={age} onChange={e => setAge(e.target.checked)} style={S.checkbox} />
            <span>만 14세 이상이며, <button type="button" onClick={() => setShowTerms(true)} style={S.linkBtn}>이용약관</button> 및 <button type="button" onClick={() => setShowPrivacy(true)} style={S.linkBtn}>개인정보처리방침</button>에 동의합니다.</span>
          </label>
        )}

        {msg && <div style={S.msg}>{msg}</div>}

        <button style={{ ...S.primary, opacity: busy ? .6 : 1 }} disabled={busy} onClick={submit}>
          {busy ? '잠시만요…' : (mode === 'login' ? '로그인' : '가입하기')}
        </button>

        <button style={S.switch} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg(''); setAge(false) }}>
          {mode === 'login' ? '처음이신가요? 가입하기' : '이미 계정이 있어요 · 로그인'}
        </button>
      </div>
    </div>
  )
}

const S = {
  wrap: { minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    background: 'var(--mp-bg)', fontFamily: "'Outfit','Gowun Dodum',-apple-system,sans-serif",
    maxWidth: 480, margin: '0 auto' },
  top: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: 'calc(env(safe-area-inset-top,0px) + 40px) 32px 32px' },
  form: { padding: '0 24px calc(env(safe-area-inset-bottom,0px) + 32px)' },
  logoRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 },
  logoDot: { width: 44, height: 44, borderRadius: '13px 13px 13px 4px',
    background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 6px 18px rgba(255,77,94,.4)' },
  logoName: { fontSize: 28, fontWeight: 700, letterSpacing: '-.5px', color: 'var(--mp-ink)', lineHeight: 1 },
  logoSub: { fontSize: 10, letterSpacing: 2, color: 'var(--mp-muted)', fontWeight: 600, marginTop: 3 },
  tagline: { fontSize: 18, fontWeight: 700, color: 'var(--mp-ink)', lineHeight: 1.6,
    textAlign: 'center', margin: 0, letterSpacing: '-.3px' },
  input: { width: '100%', border: '1.5px solid var(--mp-line)', borderRadius: 14, padding: '14px 16px',
    fontSize: 15, fontFamily: 'inherit', marginBottom: 10, outline: 'none',
    boxSizing: 'border-box', background: 'var(--mp-card)', color: 'var(--mp-ink)' },
  pwHint: { fontSize: 11.5, color: 'var(--mp-muted)', marginTop: -4, marginBottom: 8, paddingLeft: 2 },
  ageRow: { display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: 'var(--mp-sub)',
    lineHeight: 1.5, margin: '4px 2px 8px', cursor: 'pointer', textAlign: 'left' },
  checkbox: { width: 17, height: 17, marginTop: 1, accentColor: '#ff4d5e', flex: 'none', cursor: 'pointer' },
  link: { color: '#ff4d5e', textDecoration: 'underline', fontWeight: 600 },
  linkBtn: { color: '#ff4d5e', textDecoration: 'underline', fontWeight: 600, border: 'none',
    background: 'none', padding: 0, font: 'inherit', cursor: 'pointer' },
  msg: { fontSize: 13, color: 'var(--mp-coral)', background: 'var(--mp-card2)', border: '1px solid var(--mp-line)', padding: '10px 12px',
    borderRadius: 10, margin: '4px 0 12px' },
  primary: { width: '100%', border: 'none', borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700,
    fontFamily: 'inherit', cursor: 'pointer', color: '#fff',
    background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 8px 20px rgba(255,77,94,.3)' },
  switch: { width: '100%', border: 'none', background: 'none', color: 'var(--mp-muted)',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600, marginTop: 16, cursor: 'pointer' },
}
