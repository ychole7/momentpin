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
      // 성공 → 완료 안내를 보여주고, 확인을 누르면 로그아웃 처리
      await supabase.auth.signOut()
      localStorage.removeItem('mp_group')
      setBusy(false)
      setDeletedDone(true)
    } catch (e) {
      flash('탈퇴 중 오류: ' + (e.message || e)); setBusy(false)
    }
  }

  if (deletedDone) {
    return (
      <div style={S.doneWrap}>
        <div style={S.doneCard}>
          <div style={S.doneIcon}>✅</div>
          <div style={S.doneTitle}>탈퇴가 완료됐어요</div>
          <div style={S.doneBody}>그동안 닿음을 이용해 주셔서 감사했어요.<br/>계정과 모든 기록이 삭제됐어요.</div>
          <button style={S.doneBtn} onClick={() => { window.location.href = '/' }}>확인</button>
        </div>
      </div>
    )
  }

  return (
    <div style={S.app}>
      <div style={S.top}>
        <button style={S.back} onClick={onClose}>←</button>
        <div style={S.title}>마이페이지</div>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.body}>
        {/* 프로필 헤더 */}
        <div style={S.profile}>
          <div style={{ ...S.bigAvatar, background: myColor }}>{(myName || '?')[0]}</div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{myName || '나'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--mp-muted)' }}>{user.email}</div>
            {isOwner && <div style={S.ownerBadge}>👑 그룹장</div>}
          </div>
        </div>

        {/* 내 기록 */}
        {myStats && (
          <div style={S.miniCards}>
            <div style={S.miniCard}><div style={S.miniNum}>{myStats.myCount}</div><div style={S.miniLabel}>내가 남긴 안부</div></div>
            <div style={S.miniCard}><div style={S.miniNum}>{myStats.rate}%</div><div style={S.miniLabel}>참여율</div></div>
          </div>
        )}

        <button style={S.statsLink} onClick={() => onOpenStats && onOpenStats(members)}>🎁 우리의 순간들 보기 →</button>

        {/* 프로필 편집 */}
        <div style={S.secLabel}>프로필</div>
        <div style={S.card}>
          <div style={S.rowLabel}>이름</div>
          <input style={S.input} value={myName} maxLength={12} onChange={e => setMyName(e.target.value.slice(0, 12))} placeholder="이름 또는 별명" />
          <div style={{ fontSize: 11, color: 'var(--mp-muted)', textAlign: 'right', marginTop: 4 }}>{myName.length}/12</div>
          <div style={{ ...S.rowLabel, marginTop: 14 }}>색상</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => setMyColor(c)} style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: myColor === c ? '3px solid var(--mp-ink)' : '3px solid var(--mp-card)', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,.15)' }} />
            ))}
          </div>
          <button style={{ ...S.save, opacity: busy ? .6 : 1 }} disabled={busy} onClick={saveMe}>프로필 저장</button>
        </div>

        {/* 알림 */}
        <div style={S.secLabel}>알림</div>
        <div style={S.card}>
          <div style={S.toggleRow}>
            <div>
              <div style={{ fontWeight: 600 }}>안부 알림</div>
              <div style={{ fontSize: 12, color: 'var(--mp-muted)' }}>정해진 시간에 "지금 찍어!" 알림</div>
            </div>
            <button onClick={togglePush} style={{ ...S.switch, background: pushOn ? '#13bca4' : 'var(--mp-line2)' }}>
              <span style={{ ...S.knob, transform: pushOn ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>
          </div>
        </div>

        {/* 약관·정책 */}
        <div style={S.secLabel}>약관·정책</div>
        <div style={S.card}>
          <button style={{ ...S.linkRow, fontSize: 13.5 }} onClick={onOpenPrivacy}>📄 개인정보처리방침</button>
          <button style={{ ...S.linkRow, fontSize: 13.5, borderBottom: 'none' }} onClick={onOpenTerms}>📋 이용약관</button>
        </div>

        {/* 계정: 로그아웃/회원탈퇴를 한 묶음으로 맨 아래에 */}
        <div style={{ ...S.secLabel, marginTop: 20 }}>계정</div>
        <div style={S.card}>
          <button style={{ ...S.linkRow, color: 'var(--mp-coral)' }} onClick={onSignOut}>🚪 로그아웃</button>
          <button style={{ ...S.linkRow, color: 'var(--mp-muted)', borderBottom: 'none', fontSize: 13 }} onClick={deleteAccount}>회원 탈퇴</button>
        </div>
      </div>

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  )
}

const S = {
  app: { width: '100%', maxWidth: 480, margin: '0 auto', minHeight: '100dvh', background: 'var(--mp-bg)', fontFamily: "'Outfit','Gowun Dodum',sans-serif", color: 'var(--mp-ink)', paddingBottom: 40 },
  top: { position: 'sticky', top: 0, zIndex: 100, background: 'var(--mp-topbar)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--mp-line)', padding: '13px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 32, height: 32, border: 'none', background: 'var(--mp-card2)', borderRadius: '50%', fontSize: 18, cursor: 'pointer', color: 'var(--mp-ink)' },
  title: { fontWeight: 700, fontSize: 17 },
  body: { padding: 16 },
  profile: { display: 'flex', alignItems: 'center', gap: 14, padding: '6px 4px 18px' },
  bigAvatar: { width: 60, height: 60, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 24, flex: 'none' },
  ownerBadge: { display: 'inline-block', marginTop: 5, fontSize: 11, fontWeight: 700, color: '#e0972e', background: '#fff8ec', padding: '3px 9px', borderRadius: 10 },
  miniCards: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 },
  miniCard: { background: 'var(--mp-card)', borderRadius: 14, padding: '14px 16px', boxShadow: '0 4px 24px rgba(20,20,30,.06)', textAlign: 'center' },
  miniNum: { fontSize: 24, fontWeight: 700, color: '#ff4d5e', letterSpacing: '-.5px' },
  miniLabel: { fontSize: 12, color: 'var(--mp-sub)', fontWeight: 600, marginTop: 2 },
  statsLink: { width: '100%', border: '1.5px solid var(--mp-coral)', borderRadius: 14, padding: 14, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: 'var(--mp-coral)', background: 'var(--mp-card2)', marginBottom: 20 },
  tabs: { display: 'flex', gap: 6, background: 'var(--mp-card2)', borderRadius: 22, padding: 4, marginBottom: 16 },
  tab: { flex: 1, border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--mp-muted)', padding: 9, borderRadius: 18, cursor: 'pointer' },
  tabOn: { background: 'var(--mp-card)', color: 'var(--mp-ink)', boxShadow: '0 2px 8px rgba(0,0,0,.08)' },
  secLabel: { fontSize: 12, fontWeight: 600, color: 'var(--mp-muted)', textTransform: 'uppercase', letterSpacing: .4, margin: '16px 4px 8px' },
  card: { background: 'var(--mp-card)', borderRadius: 16, padding: 16, boxShadow: '0 4px 24px rgba(20,20,30,.06)' },
  rowLabel: { fontSize: 14, fontWeight: 600, marginBottom: 10 },
  input: { width: '100%', border: '1.5px solid var(--mp-line)', borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, outline: 'none', boxSizing: 'border-box' },
  pills: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  pill: { border: '1.5px solid var(--mp-line2)', background: 'var(--mp-card2)', color: 'var(--mp-ink)', padding: '9px 15px', borderRadius: 22, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  hint: { fontSize: 12, color: 'var(--mp-muted)', marginTop: 8 },
  quotaBox: { marginTop: 16, background: 'var(--mp-card2)', border: '1px solid var(--mp-line)', borderRadius: 12, padding: '12px 14px' },
  quotaRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  quotaLabel: { fontSize: 13, color: 'var(--mp-sub)', fontWeight: 500 },
  quotaVal: { fontSize: 14, fontWeight: 700, color: 'var(--mp-ink)' },
  quotaHint: { fontSize: 11.5, color: 'var(--mp-muted)', marginTop: 4, lineHeight: 1.5 },
  pillOn: { background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', color: '#fff', border: '1.5px solid #ff7a45', boxShadow: '0 2px 10px rgba(255,90,70,.35)' },
  timePill: { border: '1.5px solid var(--mp-coral)', background: 'var(--mp-card2)', color: 'var(--mp-coral)', padding: '9px 14px', borderRadius: 22, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  addPill: { border: '1.5px dashed var(--mp-line2)', background: 'var(--mp-card)', color: 'var(--mp-muted)', padding: '9px 14px', borderRadius: 22, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  save: { width: '100%', border: 'none', borderRadius: 12, padding: 13, marginTop: 16, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 6px 16px rgba(255,77,94,.28)' },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  switch: { width: 46, height: 26, borderRadius: 20, border: 'none', cursor: 'pointer', position: 'relative', padding: 0, transition: 'background .2s' },
  knob: { position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,.2)', transition: 'transform .2s' },
  linkRow: { width: '100%', textAlign: 'left', border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: 'var(--mp-ink)', padding: '13px 2px', cursor: 'pointer', borderBottom: '1px solid var(--mp-line)' },
  smallBtn: { border: '1.5px solid var(--mp-line)', background: 'var(--mp-card)', color: 'var(--mp-ink)', borderRadius: 20, padding: '8px 13px', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  dangerNote: { fontSize: 12, color: 'var(--mp-coral)', textAlign: 'center', marginTop: 8 },
  ownerNote: { background: 'var(--mp-card2)', borderRadius: 10, padding: '13px 15px', fontSize: 13, color: 'var(--mp-sub)', textAlign: 'center', lineHeight: 1.5 },
  toast: { position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'var(--mp-ink)', color: 'var(--mp-bg)', padding: '12px 20px', borderRadius: 30, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,.3)', zIndex: 4000 },
  doneWrap: { minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--mp-bg)', padding: 24, fontFamily: "'Outfit','Gowun Dodum',sans-serif" },
  doneCard: { width: '100%', maxWidth: 360, background: 'var(--mp-card)', borderRadius: 20, padding: '36px 28px', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,.08)' },
  doneIcon: { fontSize: 40, marginBottom: 14 },
  doneTitle: { fontSize: 19, fontWeight: 700, color: 'var(--mp-ink)', marginBottom: 10 },
  doneBody: { fontSize: 14, color: 'var(--mp-sub)', lineHeight: 1.6, marginBottom: 26 },
  doneBtn: { width: '100%', border: 'none', borderRadius: 14, padding: 15, fontFamily: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 8px 20px rgba(255,77,94,.3)' },
}
