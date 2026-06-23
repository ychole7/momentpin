// src/MyPage.jsx — 마이페이지 (프로필 + 내기록 + 알림 + 그룹설정 + 통계링크)
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const COLORS = ['#ff4d5e', '#13bca4', '#e0972e', '#5b8def', '#9c4dcc', '#2a9d5a']

export default function MyPage({ user, group, members, onClose, onOpenStats, onGroupUpdate, onLeaveGroup, onSignOut }) {
  const isOwner = group.created_by === user.id
  const [tab, setTab] = useState('me')  // me | group

  // 프로필
  const [myName, setMyName] = useState('')
  const [myColor, setMyColor] = useState('#ff4d5e')
  const [myMemberId, setMyMemberId] = useState(null)
  // 내 기록
  const [myStats, setMyStats] = useState(null)
  // 그룹 설정
  const [mode, setMode] = useState(group.alarm_mode || 'fixed')
  const [times, setTimes] = useState(Array.isArray(group.fixed_times) ? group.fixed_times : ['08:00', '21:00'])
  const [windowMin, setWindowMin] = useState(group.window_min || 3)
  const [rStart, setRStart] = useState((group.random_start || '09:00').slice(0,5))
  const [rEnd, setREnd] = useState((group.random_end || '21:00').slice(0,5))

  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [pushOn, setPushOn] = useState(false)
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
        if (reg) { const sub = await reg.pushManager.getSubscription(); if (sub) { const ep = sub.endpoint; await sub.unsubscribe(); await supabase.from('push_subscriptions').delete().eq('user_id', user.id).eq('group_id', group.id).eq('endpoint', ep) } }
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
        let res = await supabase.from('push_subscriptions').upsert({ user_id: user.id, group_id: group.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'user_id,group_id,endpoint' })
        if (res.error) { flash('구독 실패: ' + res.error.message); return }
        setPushOn(true); flash('알림 켜짐! 🔔')
      }
    } catch (e) { flash('알림 설정 실패: ' + (e.message || e)) }
  }

  async function loadMe() {
    let res = await supabase.from('members').select('id,display_name,color').eq('group_id', group.id).eq('user_id', user.id).single()
    if (!res.error && res.data) {
      setMyMemberId(res.data.id)
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
    // 연속 참여(간단): 최근 모먼들 중 내가 연속으로 찍은 수 — 날짜 기준 단순 계산
    setMyStats({ myCount, totalMoments, rate })
  }

  async function saveMe() {
    if (!myName.trim()) { flash('이름을 입력해 주세요'); return }
    setBusy(true)
    let res = await supabase.from('members').update({ display_name: myName.trim(), color: myColor }).eq('id', myMemberId)
    setBusy(false)
    if (res.error) { flash('저장 실패: ' + res.error.message); return }
    flash('프로필 저장됨 ✨')
  }

  function addTime() {
    if (times.length >= 3) { flash('최대 3개까지예요'); return }
    const t = prompt('시간 입력 (예: 18:30)', '18:30')
    if (t && /^\d{1,2}:\d{2}$/.test(t)) {
      const [h, m] = t.split(':')
      const norm = String(h).padStart(2, '0') + ':' + m
      if (!times.includes(norm)) setTimes([...times, norm].sort())
    }
  }
  function removeTime(t) { setTimes(times.filter(x => x !== t)) }

  async function saveGroup() {
    setBusy(true)
    let res = await supabase.from('groups').update({ alarm_mode: mode, fixed_times: times, window_min: windowMin, random_start: rStart, random_end: rEnd }).eq('id', group.id)
    setBusy(false)
    if (res.error) { flash('저장 실패: ' + res.error.message); return }
    flash('그룹 설정 저장됨 ✨')
    if (onGroupUpdate) onGroupUpdate({ ...group, alarm_mode: mode, fixed_times: times, window_min: windowMin, random_start: rStart, random_end: rEnd })
  }

  async function copyInvite() {
    const link = window.location.origin + '/?code=' + encodeURIComponent(group.invite_code)
    try { await navigator.clipboard.writeText(link) } catch {}
    flash('초대 링크 복사됨 ✨')
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
            <div style={{ fontSize: 12.5, color: '#9b9ba3' }}>{user.email}</div>
            {isOwner && <div style={S.ownerBadge}>👑 그룹장</div>}
          </div>
        </div>

        {/* 내 기록 */}
        {myStats && (
          <div style={S.miniCards}>
            <div style={S.miniCard}><div style={S.miniNum}>{myStats.myCount}</div><div style={S.miniLabel}>내가 찍은 모먼</div></div>
            <div style={S.miniCard}><div style={S.miniNum}>{myStats.rate}%</div><div style={S.miniLabel}>참여율</div></div>
          </div>
        )}

        <button style={S.statsLink} onClick={() => onOpenStats && onOpenStats(members)}>🎁 우리의 순간들 보기 →</button>

        {/* 탭 */}
        <div style={S.tabs}>
          <button style={{ ...S.tab, ...(tab === 'me' ? S.tabOn : {}) }} onClick={() => setTab('me')}>내 설정</button>
          <button style={{ ...S.tab, ...(tab === 'group' ? S.tabOn : {}) }} onClick={() => setTab('group')}>그룹</button>
        </div>

        {tab === 'me' ? (
          <>
            {/* 프로필 편집 */}
            <div style={S.secLabel}>프로필</div>
            <div style={S.card}>
              <div style={S.rowLabel}>이름</div>
              <input style={S.input} value={myName} onChange={e => setMyName(e.target.value)} />
              <div style={{ ...S.rowLabel, marginTop: 14 }}>색상</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setMyColor(c)} style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: myColor === c ? '3px solid #16161a' : '3px solid #fff', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,.15)' }} />
                ))}
              </div>
              <button style={{ ...S.save, opacity: busy ? .6 : 1 }} disabled={busy} onClick={saveMe}>프로필 저장</button>
            </div>

            {/* 알림 */}
            <div style={S.secLabel}>알림</div>
            <div style={S.card}>
              <div style={S.toggleRow}>
                <div>
                  <div style={{ fontWeight: 600 }}>모먼 알림</div>
                  <div style={{ fontSize: 12, color: '#9b9ba3' }}>정해진 시간에 "지금 찍어!" 알림</div>
                </div>
                <button onClick={togglePush} style={{ ...S.switch, background: pushOn ? '#13bca4' : '#d8d8de' }}>
                  <span style={{ ...S.knob, transform: pushOn ? 'translateX(20px)' : 'translateX(0)' }} />
                </button>
              </div>
            </div>

            {/* 계정 */}
            <div style={S.secLabel}>계정</div>
            <div style={S.card}>
              <button style={S.linkRow} onClick={onLeaveGroup}>🔄 다른 그룹으로</button>
              <button style={{ ...S.linkRow, color: '#e0593c', borderBottom: 'none' }} onClick={onSignOut}>🚪 로그아웃</button>
            </div>
          </>
        ) : (
          <>
            {/* 그룹 정보 */}
            <div style={S.secLabel}>그룹</div>
            <div style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{group.name}</div>
                  <div style={{ fontSize: 12, color: '#9b9ba3' }}>멤버 {members.length}명 · 코드 {group.invite_code}</div>
                </div>
                <button style={S.smallBtn} onClick={copyInvite}>🔗 초대</button>
              </div>
            </div>

            {/* 그룹 알림 설정 (그룹장만) */}
            <div style={S.secLabel}>모먼 알림 설정</div>
            <div style={S.card}>
              {!isOwner ? (
                <div style={S.ownerNote}>🔒 그룹 알림 설정은 <b>그룹장</b>만 바꿀 수 있어요</div>
              ) : (
                <>
                  <div style={S.rowLabel}>언제 다 같이 찍을까요?</div>
                  <div style={S.pills}>
                    <button style={{ ...S.pill, ...(mode === 'fixed' ? S.pillOn : {}) }} onClick={() => setMode('fixed')}>⏰ 정해진 시간</button>
                    <button style={{ ...S.pill, ...(mode === 'random' ? S.pillOn : {}) }} onClick={() => setMode('random')}>⚡ 랜덤</button>
                  </div>

                  {mode === 'fixed' ? (
                    <>
                      <div style={{ ...S.rowLabel, marginTop: 16 }}>찍는 시간 (하루 1~3회)</div>
                      <div style={S.pills}>
                        {times.map(t => <button key={t} style={S.timePill} onClick={() => removeTime(t)}>{t} ✕</button>)}
                        {times.length < 3 && <button style={S.addPill} onClick={addTime}>＋ 추가</button>}
                      </div>
                      <div style={S.hint}>시간을 탭하면 삭제돼요</div>
                    </>
                  ) : (
                    <>
                      <div style={{ ...S.rowLabel, marginTop: 16 }}>랜덤 시간대</div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input style={{ ...S.input, textAlign: 'center', width: 90 }} value={rStart} onChange={e => setRStart(e.target.value)} placeholder="09:00" />
                        <span style={{ color: '#9b9ba3' }}>~</span>
                        <input style={{ ...S.input, textAlign: 'center', width: 90 }} value={rEnd} onChange={e => setREnd(e.target.value)} placeholder="21:00" />
                      </div>
                      <div style={S.hint}>이 시간대 안에서 매일 한 번, 아무도 모르는 시각에 깜짝 알림 ⚡</div>
                    </>
                  )}

                  <div style={{ ...S.rowLabel, marginTop: 16 }}>찍을 수 있는 시간 (마감)</div>
                  <div style={S.pills}>
                    {[2, 3, 5, 10].map(w => <button key={w} style={{ ...S.pill, ...(windowMin === w ? S.pillOn : {}) }} onClick={() => setWindowMin(w)}>{w}분</button>)}
                  </div>
                  <button style={{ ...S.save, opacity: busy ? .6 : 1 }} disabled={busy} onClick={saveGroup}>그룹 설정 저장</button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  )
}

const S = {
  app: { width: '100%', maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#fafafa', fontFamily: "'Outfit','Gowun Dodum',sans-serif", color: '#16161a', paddingBottom: 40 },
  top: { position: 'sticky', top: 0, zIndex: 100, background: 'rgba(250,250,250,.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #efeff2', padding: '13px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 32, height: 32, border: 'none', background: '#f0f0f3', borderRadius: '50%', fontSize: 18, cursor: 'pointer', color: '#16161a' },
  title: { fontWeight: 700, fontSize: 17 },
  body: { padding: 16 },
  profile: { display: 'flex', alignItems: 'center', gap: 14, padding: '6px 4px 18px' },
  bigAvatar: { width: 60, height: 60, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 24, flex: 'none' },
  ownerBadge: { display: 'inline-block', marginTop: 5, fontSize: 11, fontWeight: 700, color: '#e0972e', background: '#fff8ec', padding: '3px 9px', borderRadius: 10 },
  miniCards: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 },
  miniCard: { background: '#fff', borderRadius: 14, padding: '14px 16px', boxShadow: '0 4px 24px rgba(20,20,30,.06)', textAlign: 'center' },
  miniNum: { fontSize: 24, fontWeight: 700, color: '#ff4d5e', letterSpacing: '-.5px' },
  miniLabel: { fontSize: 12, color: '#6b6b73', fontWeight: 600, marginTop: 2 },
  statsLink: { width: '100%', border: 'none', borderRadius: 14, padding: 14, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#16161a', background: 'linear-gradient(135deg,#fff1ed,#ffe9e0)', border: '1.5px solid #ffd9cc', marginBottom: 20 },
  tabs: { display: 'flex', gap: 6, background: '#f0f0f3', borderRadius: 22, padding: 4, marginBottom: 16 },
  tab: { flex: 1, border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#9b9ba3', padding: 9, borderRadius: 18, cursor: 'pointer' },
  tabOn: { background: '#fff', color: '#16161a', boxShadow: '0 2px 8px rgba(0,0,0,.08)' },
  secLabel: { fontSize: 12, fontWeight: 600, color: '#9b9ba3', textTransform: 'uppercase', letterSpacing: .4, margin: '16px 4px 8px' },
  card: { background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 4px 24px rgba(20,20,30,.06)' },
  rowLabel: { fontSize: 14, fontWeight: 600, marginBottom: 10 },
  input: { width: '100%', border: '1.5px solid #efeff2', borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, outline: 'none', boxSizing: 'border-box' },
  pills: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  pill: { border: '1.5px solid #efeff2', background: '#fff', color: '#16161a', padding: '9px 15px', borderRadius: 22, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  hint: { fontSize: 12, color: '#9b9ba3', marginTop: 8 },
  pillOn: { background: '#16161a', color: '#fff', borderColor: '#16161a' },
  timePill: { border: '1.5px solid #ffd9cc', background: '#fff1ed', color: '#e0593c', padding: '9px 14px', borderRadius: 22, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  addPill: { border: '1.5px dashed #c4c4cc', background: '#fff', color: '#9b9ba3', padding: '9px 14px', borderRadius: 22, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  save: { width: '100%', border: 'none', borderRadius: 12, padding: 13, marginTop: 16, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 6px 16px rgba(255,77,94,.28)' },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  switch: { width: 46, height: 26, borderRadius: 20, border: 'none', cursor: 'pointer', position: 'relative', padding: 0, transition: 'background .2s' },
  knob: { position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,.2)', transition: 'transform .2s' },
  linkRow: { width: '100%', textAlign: 'left', border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#16161a', padding: '13px 2px', cursor: 'pointer', borderBottom: '1px solid #f4f4f6' },
  smallBtn: { border: '1.5px solid #efeff2', background: '#fff', color: '#16161a', borderRadius: 20, padding: '8px 13px', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  ownerNote: { background: '#f7f7f9', borderRadius: 10, padding: '13px 15px', fontSize: 13, color: '#6b6b73', textAlign: 'center', lineHeight: 1.5 },
  toast: { position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#16161a', color: '#fff', padding: '12px 20px', borderRadius: 30, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,.3)', zIndex: 4000 },
}
