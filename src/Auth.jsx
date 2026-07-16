// src/Auth.jsx
import { useState } from 'react'
import { supabase } from './supabaseClient'
import Privacy from './Privacy'
import Terms from './Terms'

// Supabase Auth 에러 메시지를 한글로 변환
function toKoreanAuthError(message) {
  const m = (message || '').toLowerCase()
  if (m.includes('invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않아요.'
  if (m.includes('email not confirmed')) return '이메일 인증이 아직 완료되지 않았어요. 받은 편지함을 확인해 주세요.'
  if (m.includes('user already registered') || m.includes('already registered')) return '이미 가입된 이메일이에요. 로그인해 주세요.'
  if (m.includes('password should be at least')) return '비밀번호는 최소 8자 이상이어야 해요.'
  if (m.includes('unable to validate email') || m.includes('invalid email')) return '올바른 이메일 형식이 아니에요.'
  if (m.includes('rate limit') || m.includes('too many requests')) return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.'
  if (m.includes('network')) return '네트워크 연결을 확인해 주세요.'
  return '문제가 발생했어요. 잠시 후 다시 시도해 주세요.'
}

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
      if (error) { setMsg(toKoreanAuthError(error.message)); setBusy(false); return }
      // 이메일 확인이 꺼져 있으면 바로 로그인됨. 켜져 있으면 안내.
      if (!res.data.session) {
        setMsg('가입 완료! 메일 인증이 필요하면 받은 편지함을 확인해 주세요.')
        setBusy(false); return
      }
    } else {
      let res = await supabase.auth.signInWithPassword({ email, password: pw })
      const error = res.error
      if (error) { setMsg(toKoreanAuthError(error.message)); setBusy(false); return }
    }
    // 성공 시 onAuthStateChange가 App에서 세션을 감지 → 화면 전환
    setBusy(false)
  }

  async function signInWithGoogle() {
    setMsg('')
    let res = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (res.error) setMsg(toKoreanAuthError(res.error.message))
    // 성공 시 구글 로그인 페이지로 리다이렉트됨 (여기서 할 일 없음)
  }

  if (showPrivacy) return <Privacy onClose={() => setShowPrivacy(false)} />
  if (showTerms) return <Terms onClose={() => setShowTerms(false)} />

  return (
    <div style={S.wrap}>
      {/* 상단 로고 영역 */}
      <div style={S.top}>
        <div style={S.logoRow}>
          <img src="/logo.svg" alt="닿음" style={S.logoDot} />
          <div>
            <div style={S.logoName}>닿음</div>
            <div style={S.logoSub}>DAHEUM</div>
          </div>
        </div>
        <p style={S.tagline}>지도 위에 안부를 묻다<br/><span style={{ fontSize: 13, opacity: .7 }}>멀리 있어도, 오늘 서로의 순간을 나눠요</span></p>
      </div>

      {/* 하단 입력 영역 */}
      <div style={S.form}>
        <button type="button" style={S.googleBtn} onClick={signInWithGoogle} disabled={busy}>
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ flex: 'none' }}>
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.08-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.87 2.68-6.62z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33C2.44 15.98 5.48 18 9 18z"/>
            <path fill="#FBBC05" d="M3.97 10.72c-.18-.54-.28-1.12-.28-1.72s.1-1.18.28-1.72V4.95H.96A8.996 8.996 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
          </svg>
          Google로 계속하기
        </button>

        <div style={S.dividerRow}>
          <span style={S.dividerLine} />
          <span style={S.dividerText}>또는</span>
          <span style={S.dividerLine} />
        </div>

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
  googleBtn: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    border: '1.5px solid var(--mp-line)', borderRadius: 14, padding: '13px 16px', marginBottom: 16,
    background: 'var(--mp-card)', color: 'var(--mp-ink)', fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  dividerRow: { display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0 16px' },
  dividerLine: { flex: 1, height: 1, background: 'var(--mp-line)' },
  dividerText: { fontSize: 12, color: 'var(--mp-muted)', fontWeight: 500 },
  logoRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 },
  logoDot: { width: 72, height: 72, objectFit: 'contain' },
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
