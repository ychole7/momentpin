// src/MyPage.jsx — 마이페이지 (프로필 + 내기록 + 알림 + 그룹설정 + 통계링크)
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const COLORS = ['#ff4d5e', '#13bca4', '#e0972e', '#5b8def', '#9c4dcc', '#2a9d5a']

export default function MyPage({ user, group, members, onClose, onOpenStats, onSignOut, onOpenPrivacy, onOpenTerms, onProfileUpdate }) {
  const isOwner = group.created_by === user.id

  // 프로필 (계정 단위 profiles 테이블)
  const [myName, setMyName] = useState('')
  const [myColor, setMyColor] = useState('#ff4d5e')
  // 내 기록
  const [myStats, setMyStats] = useState(null)

  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [pushOn, setPushOn] = useState(false)
  const [deletedDone, setDeletedDone] = useState(false)  // 회원 탈퇴 완료 안내 표시
  // 비밀번호 변경 (이메일/비밀번호로 가입한 계정만 표시 — 구글 등 소셜 로그인은 비밀번호가 없음)
  const isPasswordAccount = (user.app_metadata?.providers || [user.app_metadata?.provider]).includes('email')
  const [showPwForm, setShowPwForm] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2400) }

  useEffect(() => { loadMe(); loadMyStats(); checkPush() }, [])

  async function checkPush() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg) { setPushOn(false); return }
      const sub = await reg.pushManager.getSubscription()
      setPushOn(!!sub)
    } catch { setPushOn(false) }
  }

  function urlB64(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = window.atob(base64)
    const arr = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
    return arr
  }

  async function togglePush() {
    try {
      if (pushOn) {
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg) { const sub = await reg.pushManager.getSubscription(); if (sub) { const ep = sub.endpoint; await sub.unsubscribe(); await supabase.from('push_subscriptions').delete().eq('endpoint', ep) } }
        setPushOn(false); flash('알림을 껐어요 🔕')
      } else {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) { flash('이 브라우저는 푸시 미지원 (폰은 홈화면 추가 후)'); return }
        let perm = Notification.permission
        if (perm === 'default') perm = await Notification.requestPermission()
        if (perm !== 'granted') { flash('알림이 차단됐어요'); return }
        const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready
        const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY
        if (!vapid) { flash('VAPID 키 없음'); return }
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(vapid) })
        const j = sub.toJSON()
        let res = await supabase.from('push_subscriptions').upsert({ user_id: user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' })
        if (res.error) { flash('구독 실패: ' + res.error.message); return }
        setPushOn(true); flash('알림 켜짐! 🔔')
      }
    } catch (e) { flash('알림 설정 실패: ' + (e.message || e)) }
  }

  async function loadMe() {
    // 계정 기본 프로필 (profiles 테이블)
    let res = await supabase.from('profiles').select('display_name,color').eq('user_id', user.id).maybeSingle()
    if (!res.error && res.data) {
      setMyName(res.data.display_name || '')
      setMyColor(res.data.color || '#ff4d5e')
    }
  }

  async function loadMyStats() {
    let mres = await supabase.from('moments').select('id').eq('group_id', group.id)
    let pres = await supabase.from('posts').select('moment_id,user_id,created_at').eq('group_id', group.id)
    const totalMoments = (mres.data || []).length
    const myPosts = (pres.data || []).filter(p => p.user_id === user.id)
    const myCount = myPosts.length
    const rate = totalMoments ? Math.round(myCount / totalMoments * 100) : 0
    // 연속 참여(간단): 최근 안부들 중 내가 연속으로 남긴 수 — 날짜 기준 단순 계산
    setMyStats({ myCount, totalMoments, rate })
  }

  async function saveMe() {
    if (!myName.trim()) { flash('이름을 입력해 주세요'); return }
    setBusy(true)
    // 계정 단위 프로필 저장 (upsert)
    let res = await supabase.from('profiles').upsert({
      user_id: user.id,
      display_name: myName.trim().slice(0, 12),
      color: myColor,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    setBusy(false)
    if (res.error) { flash('저장 실패: ' + res.error.message); return }
    flash('프로필 저장됨 ✨')
    if (onProfileUpdate) onProfileUpdate({ display_name: myName.trim().slice(0, 12), color: myColor })
  }

  async function changePassword() {
    if (!newPw || newPw.length < 8) { flash('비밀번호는 8자 이상이어야 해요'); return }
    if (!/[a-zA-Z]/.test(newPw) || !/[0-9]/.test(newPw)) { flash('영문과 숫자를 함께 포함해 주세요'); return }
    if (newPw !== newPw2) { flash('비밀번호가 서로 달라요'); return }
    setPwBusy(true)
    let res = await supabase.auth.updateUser({ password: newPw })
    setPwBusy(false)
    if (res.error) { flash('변경 실패: ' + res.error.message); return }
    setShowPwForm(false); setNewPw(''); setNewPw2('')
    flash('비밀번호가 변경됐어요 ✨')
  }

  async function deleteAccount() {
    if (!confirm('정말 탈퇴하시겠어요?\n계정과 모든 안부·사진·기록이 영구히 삭제되며 되돌릴 수 없어요.')) return
    if (!confirm('마지막 확인이에요. 정말 탈퇴를 진행할까요?')) return
    setBusy(true)
    try {
      let sess = await supabase.auth.getSession()
      const token = sess.data.session ? sess.data.session.access_token : null
      if (!token) { flash('로그인 정보를 확인할 수 없어요'); setBusy(false); return }
      const r = await fetch(window.location.origin + '/api/delete-account', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      })
      const j = await r.json()
      if (!r.ok) {
        if (j.error === 'owner_has_members') { flash(j.message); setBusy(false); return }
        flash('탈퇴 실패: ' + (j.message || j.error || '알 수 없는 오류')); setBusy(false); return
      }
      // 성공 → 계정은 서버에서 이미 삭제됨. signOut은 아직 하지 않고
      // 완료 화면을 먼저 보여준 뒤, 사용자가 "확인"을 누를 때 로그아웃 처리한다.
      // (여기서 signOut을 먼저 하면 App.jsx가 세션 소실을 감지해 이 화면 자체가
      //  즉시 언마운트되어 완료 안내를 볼 틈도 없이 로그인 화면으로 튕겨버림)
      localStorage.removeItem('mp_group')
      setBusy(false)
      setDeletedDone(true)
    } catch (e) {
      flash('탈퇴 중 오류: ' + (e.message || e)); setBusy(false)
    }
  }

  if (deletedDone) {
    return (
    <div style={S.app}>
      <div style={S.top}>
        <button style={S.back} onClick={onClose} aria-label="뒤로가기">‹</button>
        <div style={S.title}>마이페이지</div>
        <div style={S.topSpacer} />
      </div>

      <div style={S.body}>
        <section style={S.profileHero}>
          <div style={{ ...S.bigAvatar, background: myColor }}>{(myName || '?')[0]}</div>
          <div style={S.profileInfo}>
            <div style={S.profileName}>{myName || '나'}</div>
            <div style={S.profileEmail}>{user.email}</div>
            {isOwner && <div style={S.ownerBadge}>그룹장</div>}
          </div>
        </section>

        {myStats && (
          <section style={S.statsGrid}>
            <div style={S.statCard}>
              <div style={S.statNum}>{myStats.myCount}</div>
              <div style={S.statLabel}>내가 남긴 안부</div>
            </div>
            <div style={S.statCard}>
              <div style={S.statNum}>{myStats.rate}%</div>
              <div style={S.statLabel}>참여율</div>
            </div>
          </section>
        )}

        <button style={S.momentsCard} onClick={() => onOpenStats && onOpenStats(members)}>
          <div style={S.momentsIcon}>✦</div>
          <div style={S.momentsCopy}>
            <div style={S.momentsTitle}>우리의 순간들</div>
            <div style={S.momentsSub}>함께 남긴 시간을 다시 만나보세요.</div>
          </div>
          <div style={S.momentsArrow}>›</div>
        </button>

        <div style={S.secLabel}>나의 프로필</div>
        <div style={S.card}>
          <div style={S.rowLabel}>이름</div>
          <input style={S.input} value={myName} maxLength={12}
            onChange={e => setMyName(e.target.value.slice(0, 12))}
            placeholder="이름 또는 별명" />
          <div style={S.counter}>{myName.length}/12</div>

          <div style={{ ...S.rowLabel, marginTop: 18 }}>색상</div>
          <div style={S.colors}>
            {COLORS.map(c => (
              <button key={c} aria-label={`색상 ${c}`} onClick={() => setMyColor(c)}
                style={{ ...S.colorDot, background: c,
                  boxShadow: myColor === c
                    ? `0 0 0 3px var(--mp-card), 0 0 0 5px ${c}`
                    : '0 2px 6px rgba(20,20,30,.14)' }} />
            ))}
          </div>
          <button style={{ ...S.save, opacity: busy ? .6 : 1 }} disabled={busy} onClick={saveMe}>
            {busy ? '저장 중…' : '프로필 저장'}
          </button>
        </div>

        <div style={S.secLabel}>알림</div>
        <div style={S.card}>
          <div style={S.toggleRow}>
            <div>
              <div style={S.itemTitle}>안부 알림</div>
              <div style={S.itemSub}>정해진 시간에 지금을 남길 수 있도록 알려드려요.</div>
            </div>
            <button onClick={togglePush} aria-label={pushOn ? '알림 끄기' : '알림 켜기'}
              style={{ ...S.switch, background: pushOn ? 'var(--mp-coral)' : 'var(--mp-line2)' }}>
              <span style={{ ...S.knob, transform: pushOn ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>
          </div>
        </div>

        {isPasswordAccount && (
          <>
            <div style={S.secLabel}>보안</div>
            <div style={S.card}>
              {!showPwForm ? (
                <button style={S.linkRow} onClick={() => setShowPwForm(true)}>
                  <span>비밀번호 변경</span><span style={S.chevron}>›</span>
                </button>
              ) : (
                <>
                  <div style={S.rowLabel}>새 비밀번호</div>
                  <input style={S.input} type="password" value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    placeholder="영문+숫자 조합 8자 이상" autoComplete="new-password" />
                  <div style={{ ...S.rowLabel, marginTop: 14 }}>새 비밀번호 확인</div>
                  <input style={S.input} type="password" value={newPw2}
                    onChange={e => setNewPw2(e.target.value)}
                    placeholder="다시 입력해 주세요" autoComplete="new-password" />
                  <div style={S.formBtns}>
                    <button style={{ ...S.smallBtn, flex: 1 }}
                      onClick={() => { setShowPwForm(false); setNewPw(''); setNewPw2('') }}>취소</button>
                    <button style={{ ...S.save, flex: 2, marginTop: 0, opacity: pwBusy ? .6 : 1 }}
                      disabled={pwBusy} onClick={changePassword}>
                      {pwBusy ? '변경 중…' : '변경하기'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        <div style={S.secLabel}>약관 · 정책</div>
        <div style={S.card}>
          <button style={S.linkRow} onClick={onOpenPrivacy}>
            <span>개인정보처리방침</span><span style={S.chevron}>›</span>
          </button>
          <button style={{ ...S.linkRow, borderBottom: 'none' }} onClick={onOpenTerms}>
            <span>이용약관</span><span style={S.chevron}>›</span>
          </button>
        </div>

        <div style={{ ...S.secLabel, marginTop: 22 }}>계정</div>
        <div style={S.card}>
          <button style={{ ...S.linkRow, color: 'var(--mp-coral)' }} onClick={onSignOut}>
            <span>로그아웃</span><span style={S.chevron}>›</span>
          </button>
          <button style={{ ...S.linkRow, color: 'var(--mp-muted)', borderBottom: 'none', fontSize: 13 }}
            onClick={deleteAccount}>
            <span>회원 탈퇴</span><span style={S.chevron}>›</span>
          </button>
        </div>
      </div>

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  )
}

const S = {
  app: { width: '100%', maxWidth: 480, margin: '0 auto', minHeight: '100dvh', background: 'var(--mp-bg)', fontFamily: "'Outfit','Gowun Dodum',sans-serif", color: 'var(--mp-ink)', paddingBottom: 48 },
  top: { position: 'sticky', top: 0, zIndex: 100, background: 'var(--mp-topbar)', backdropFilter: 'blur(14px)', borderBottom: '1px solid var(--mp-line)', padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 34, height: 34, border: 'none', background: 'var(--mp-card2)', borderRadius: '50%', fontSize: 27, lineHeight: 1, cursor: 'pointer', color: 'var(--mp-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 3 },
  title: { fontWeight: 700, fontSize: 17, letterSpacing: '-.2px' },
  topSpacer: { width: 34 },
  body: { padding: '18px 16px 32px' },
  profileHero: { display: 'flex', alignItems: 'center', gap: 15, padding: '4px 3px 20px' },
  bigAvatar: { width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 25, flex: 'none', boxShadow: '0 6px 18px rgba(20,20,30,.12)' },
  profileInfo: { minWidth: 0 },
  profileName: { fontSize: 20, fontWeight: 750, letterSpacing: '-.5px' },
  profileEmail: { marginTop: 3, fontSize: 12.5, color: 'var(--mp-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  ownerBadge: { display: 'inline-flex', marginTop: 7, fontSize: 10.5, fontWeight: 700, color: '#a26a12', background: '#fff7e7', padding: '4px 9px', borderRadius: 20 },
  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 },
  statCard: { background: 'var(--mp-card)', borderRadius: 16, padding: '16px 12px', boxShadow: '0 5px 22px rgba(20,20,30,.055)', textAlign: 'center', border: '1px solid rgba(20,20,30,.035)' },
  statNum: { fontSize: 27, lineHeight: 1.05, fontWeight: 750, color: 'var(--mp-coral)', letterSpacing: '-.8px' },
  statLabel: { fontSize: 12, color: 'var(--mp-sub)', fontWeight: 600, marginTop: 5 },
  momentsCard: { width: '100%', display: 'flex', alignItems: 'center', textAlign: 'left', border: '1px solid rgba(255,90,100,.25)', borderRadius: 17, padding: '15px 14px', margin: '0 0 22px', cursor: 'pointer', background: 'linear-gradient(135deg, var(--mp-card), #fff8f4)', boxShadow: '0 7px 25px rgba(255,90,100,.07)', fontFamily: 'inherit', color: 'var(--mp-ink)', boxSizing: 'border-box' },
  momentsIcon: { width: 38, height: 38, borderRadius: 12, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff0eb', color: 'var(--mp-coral)', fontSize: 19, marginRight: 12 },
  momentsCopy: { flex: 1, minWidth: 0 },
  momentsTitle: { fontSize: 14.5, fontWeight: 750, letterSpacing: '-.2px' },
  momentsSub: { fontSize: 11.5, color: 'var(--mp-muted)', marginTop: 3 },
  momentsArrow: { fontSize: 24, color: 'var(--mp-muted)', marginLeft: 8, lineHeight: 1 },
  secLabel: { fontSize: 11.5, fontWeight: 750, color: 'var(--mp-muted)', letterSpacing: '.35px', margin: '18px 4px 8px' },
  card: { background: 'var(--mp-card)', borderRadius: 16, padding: 16, boxShadow: '0 5px 22px rgba(20,20,30,.055)', border: '1px solid rgba(20,20,30,.035)' },
  rowLabel: { fontSize: 13, fontWeight: 700, marginBottom: 9 },
  input: { width: '100%', border: '1px solid var(--mp-line)', borderRadius: 11, padding: '11px 13px', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, outline: 'none', boxSizing: 'border-box', background: 'var(--mp-card2)', color: 'var(--mp-ink)' },
  counter: { fontSize: 10.5, color: 'var(--mp-muted)', textAlign: 'right', marginTop: 4 },
  colors: { display: 'flex', gap: 11, alignItems: 'center', flexWrap: 'wrap' },
  colorDot: { width: 29, height: 29, borderRadius: '50%', border: '2px solid transparent', cursor: 'pointer', padding: 0 },
  save: { width: '100%', border: 'none', borderRadius: 12, padding: 13, marginTop: 17, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 750, cursor: 'pointer', color: '#fff', background: 'var(--mp-ink)', boxShadow: '0 6px 16px rgba(20,20,30,.15)' },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  itemTitle: { fontSize: 14, fontWeight: 700 },
  itemSub: { fontSize: 11.5, color: 'var(--mp-muted)', marginTop: 4, lineHeight: 1.45 },
  switch: { width: 46, height: 26, borderRadius: 20, border: 'none', cursor: 'pointer', position: 'relative', padding: 0, transition: 'background .2s', flex: 'none' },
  knob: { position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,.18)', transition: 'transform .2s' },
  linkRow: { width: '100%', textAlign: 'left', border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 650, color: 'var(--mp-ink)', padding: '13px 2px', cursor: 'pointer', borderBottom: '1px solid var(--mp-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  chevron: { fontSize: 21, lineHeight: 1, color: 'var(--mp-muted)', fontWeight: 400 },
  formBtns: { display: 'flex', gap: 8, marginTop: 14 },
  smallBtn: { border: '1px solid var(--mp-line)', background: 'var(--mp-card)', color: 'var(--mp-ink)', borderRadius: 20, padding: '8px 13px', fontFamily: 'inherit', fontSize: 12, fontWeight: 650, cursor: 'pointer' },
  toast: { position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'var(--mp-ink)', color: 'var(--mp-bg)', padding: '12px 20px', borderRadius: 30, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,.3)', zIndex: 4000 },
  doneWrap: { minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--mp-bg)', padding: 24, fontFamily: "'Outfit','Gowun Dodum',sans-serif" },
  doneCard: { width: '100%', maxWidth: 360, background: 'var(--mp-card)', borderRadius: 20, padding: '36px 28px', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,.08)' },
  doneIcon: { fontSize: 40, marginBottom: 14 },
  doneTitle: { fontSize: 19, fontWeight: 700, color: 'var(--mp-ink)', marginBottom: 10 },
  doneBody: { fontSize: 14, color: 'var(--mp-sub)', lineHeight: 1.6, marginBottom: 26 },
  doneBtn: { width: '100%', border: 'none', borderRadius: 14, padding: 15, fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer', color: '#fff', background: 'var(--mp-ink)', boxShadow: '0 8px 20px rgba(20,20,30,.16)' },
}
