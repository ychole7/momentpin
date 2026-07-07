// src/MyPage.jsx — 마이페이지 (프로필 + 내기록 + 알림 + 그룹설정 + 통계링크)
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const COLORS = ['#ff4d5e', '#13bca4', '#e0972e', '#5b8def', '#9c4dcc', '#2a9d5a']

export default function MyPage({ user, group, members, onClose, onOpenStats, onGroupUpdate, onLeaveGroup, onSignOut, onOpenPrivacy, onOpenTerms, onProfileUpdate }) {
  const isOwner = group.created_by === user.id
  const [tab, setTab] = useState('me')  // me | group

  // 프로필 (계정 단위 profiles 테이블)
  const [myName, setMyName] = useState('')
  const [myColor, setMyColor] = useState('#ff4d5e')
  // 이 그룹에서만 쓰는 이름·색 (members 테이블, 비어있으면 기본 프로필 사용)
  const [groupName, setGroupName] = useState('')     // 그룹별 이름 (빈값 = 기본 사용)
  const [groupColor, setGroupColor] = useState('')   // 그룹별 색 (빈값 = 기본 사용)
  const [useGroupName, setUseGroupName] = useState(false)  // 이 그룹에서 다른 이름 쓰기 on/off
  const [myMemberId, setMyMemberId] = useState(null)
  // 내 기록
  const [myStats, setMyStats] = useState(null)
  // 그룹 설정
  const [mode, setMode] = useState(group.alarm_mode || 'fixed')
  const [times, setTimes] = useState(Array.isArray(group.fixed_times) ? group.fixed_times : ['08:00', '21:00'])
  const [windowMin, setWindowMin] = useState(group.window_min || 3)
  const [rStart, setRStart] = useState((group.random_start || '09:00').slice(0,5))
  const [rEnd, setREnd] = useState((group.random_end || '21:00').slice(0,5))
  const [newTime, setNewTime] = useState('18:30')

  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [pushOn, setPushOn] = useState(false)
  const [todayCount, setTodayCount] = useState(null)  // 오늘 생성된 안부 수
  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2400) }

  useEffect(() => { loadMe(); loadMyStats(); checkPush(); loadTodayCount() }, [])

  async function loadTodayCount() {
    // KST 기준 오늘 0시 이후 생성된 안부 수
    const now = new Date()
    const kst = new Date(now.getTime() + 9 * 3600 * 1000)
    const y = kst.getUTCFullYear(), mo = kst.getUTCMonth(), d = kst.getUTCDate()
    const startKstUtc = new Date(Date.UTC(y, mo, d) - 9 * 3600 * 1000)  // KST 자정을 UTC로
    let res = await supabase.from('moments')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', group.id)
      .gte('fired_at', startKstUtc.toISOString())
    if (typeof res.count === 'number') setTodayCount(res.count)
  }

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
    // 계정 기본 프로필 (profiles 테이블)
    let res = await supabase.from('profiles').select('display_name,color').eq('user_id', user.id).maybeSingle()
    if (!res.error && res.data) {
      setMyName(res.data.display_name || '')
      setMyColor(res.data.color || '#ff4d5e')
    }
    // 이 그룹에서 쓰는 이름·색 (members 테이블) — 값 있으면 "그룹별 이름 쓰기" on
    let mres = await supabase.from('members').select('id,display_name,color').eq('group_id', group.id).eq('user_id', user.id).maybeSingle()
    if (!mres.error && mres.data) {
      setMyMemberId(mres.data.id)
      if (mres.data.display_name) {
        setGroupName(mres.data.display_name)
        setGroupColor(mres.data.color || '')
        setUseGroupName(true)
      }
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

  // 이 그룹에서 쓰는 이름·색 저장 (members 테이블)
  // useGroupName이 꺼져있으면 null로 비워서 기본 프로필을 쓰게 함
  async function saveMyGroupName() {
    if (!myMemberId) { flash('멤버 정보를 찾을 수 없어요'); return }
    if (useGroupName && !groupName.trim()) { flash('이 그룹에서 쓸 이름을 입력해 주세요'); return }

    // 그룹 닉네임 중복 차단: 나 말고 다른 멤버가 이미 쓰는 이름과 겹치면 거부
    if (useGroupName) {
      const wanted = groupName.trim().toLowerCase()
      const clash = (members || []).some(m =>
        m.user_id !== user.id &&
        (m.display_name || '').trim().toLowerCase() === wanted
      )
      if (clash) { flash('이 그룹에 이미 같은 이름이 있어요. 다른 이름을 써주세요'); return }
    }

    setBusy(true)
    const payload = useGroupName
      ? { display_name: groupName.trim().slice(0, 12), color: groupColor || myColor }
      : { display_name: null, color: null }
    let res = await supabase.from('members').update(payload).eq('id', myMemberId)
    setBusy(false)
    if (res.error) { flash('저장 실패: ' + res.error.message); return }
    flash(useGroupName ? '이 그룹 이름 저장됨 ✨' : '기본 프로필로 되돌렸어요')
    if (onProfileUpdate) onProfileUpdate()   // Home 멤버 갱신
  }

  function addTime() {
    if (times.length >= 3) { flash('최대 3개까지예요'); return }
    if (!newTime) return
    if (times.includes(newTime)) { flash('이미 있는 시간이에요'); return }
    setTimes([...times, newTime].sort())
  }
  function removeTime(t) { setTimes(times.filter(x => x !== t)) }

  async function saveGroup() {
    // 유효성 검사
    if (mode === 'fixed') {
      if (!times.length) { flash('안부 시간을 1개 이상 추가해 주세요'); return }
    } else {
      const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
      const s = toMin(rStart), e = toMin(rEnd)
      if (e <= s) { flash('끝 시간이 시작 시간보다 늦어야 해요'); return }
      if (e - s < 10) { flash('랜덤 시간대는 최소 10분 이상으로 정해 주세요'); return }
    }
    setBusy(true)
    let res = await supabase.from('groups').update({ alarm_mode: mode, fixed_times: times, window_min: windowMin, random_start: rStart, random_end: rEnd }).eq('id', group.id)
    setBusy(false)
    if (res.error) { flash('저장 실패: ' + res.error.message); return }
    flash('그룹 설정 저장됨 ✨')
    if (onGroupUpdate) onGroupUpdate({ ...group, alarm_mode: mode, fixed_times: times, window_min: windowMin, random_start: rStart, random_end: rEnd })
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
      // 성공 → 로그아웃 처리
      await supabase.auth.signOut()
      localStorage.removeItem('mp_group')
      window.location.href = '/'
    } catch (e) {
      flash('탈퇴 중 오류: ' + (e.message || e)); setBusy(false)
    }
  }

  async function copyInvite() {
    const link = window.location.origin + '/?code=' + encodeURIComponent(group.invite_code)
    try { await navigator.clipboard.writeText(link) } catch {}
    flash('초대 링크 복사됨 ✨')
  }

  const [editName, setEditName] = useState(group.name)
  async function saveGroupName() {
    const nm = editName.trim().slice(0, 10)
    if (!nm) { flash('그룹 이름을 입력해 주세요'); return }
    setBusy(true)
    let res = await supabase.from('groups').update({ name: nm }).eq('id', group.id)
    setBusy(false)
    if (res.error) { flash('저장 실패: ' + res.error.message); return }
    flash('그룹 이름 변경됨 ✨')
    if (onGroupUpdate) onGroupUpdate({ ...group, name: nm })
  }

  async function leaveGroup() {
    if (isOwner && members.length > 1) {
      flash('그룹장은 먼저 다른 멤버에게 넘기거나 그룹을 삭제해 주세요')
      return
    }
    if (!confirm('정말 이 그룹에서 나갈까요?')) return
    setBusy(true)
    let res = await supabase.from('members').delete().eq('group_id', group.id).eq('user_id', user.id)
    setBusy(false)
    if (res.error) { flash('나가기 실패: ' + res.error.message); return }
    if (onLeaveGroup) onLeaveGroup()
  }

  async function deleteGroup() {
    if (!confirm('정말 그룹을 삭제할까요?\n모든 안부와 사진이 사라지고 되돌릴 수 없어요.')) return
    if (!confirm('한 번 더 확인할게요. 정말 삭제하시겠어요?')) return
    setBusy(true)
    await supabase.from('posts').delete().eq('group_id', group.id)
    await supabase.from('moments').delete().eq('group_id', group.id)
    await supabase.from('members').delete().eq('group_id', group.id)
    let res = await supabase.from('groups').delete().eq('id', group.id)
    setBusy(false)
    if (res.error) { flash('삭제 실패: ' + res.error.message); return }
    if (onLeaveGroup) onLeaveGroup()
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

            {/* 계정 */}
            <div style={S.secLabel}>계정</div>
            <div style={S.card}>
              <button style={S.linkRow} onClick={onLeaveGroup}>🔄 다른 그룹으로</button>
              <button style={{ ...S.linkRow, color: 'var(--mp-coral)', borderBottom: 'none' }} onClick={onSignOut}>🚪 로그아웃</button>
            </div>

            <div style={{ ...S.secLabel, marginTop: 20 }}>약관·정책</div>
            <div style={S.card}>
              <button style={{ ...S.linkRow, fontSize: 13.5 }} onClick={onOpenPrivacy}>📄 개인정보처리방침</button>
              <button style={{ ...S.linkRow, fontSize: 13.5, borderBottom: 'none' }} onClick={onOpenTerms}>📋 이용약관</button>
            </div>

            <div style={{ ...S.secLabel, marginTop: 20 }}>위험 구역</div>
            <div style={S.card}>
              <button style={{ ...S.linkRow, color: 'var(--mp-muted)', borderBottom: 'none', fontSize: 13 }} onClick={deleteAccount}>회원 탈퇴</button>
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
                  <div style={{ fontSize: 12, color: 'var(--mp-muted)' }}>멤버 {members.length}명 · 코드 {group.invite_code}</div>
                </div>
                <button style={S.smallBtn} onClick={copyInvite}>🔗 초대</button>
              </div>
              {isOwner && (
                <div style={{ marginTop: 14 }}>
                  <div style={S.rowLabel}>그룹 이름 바꾸기</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ ...S.input, flex: 1 }} value={editName} maxLength={10} onChange={e => setEditName(e.target.value.slice(0, 10))} />
                    <button style={{ ...S.smallBtn, opacity: busy ? .6 : 1 }} disabled={busy} onClick={saveGroupName}>저장</button>
                  </div>
                </div>
              )}
            </div>

            {/* 이 그룹에서 다른 이름 쓰기 (모든 멤버) */}
            <div style={S.secLabel}>이 그룹에서 쓰는 이름</div>
            <div style={S.card}>
              <div style={S.toggleRow}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--mp-ink)' }}>다른 이름 쓰기</div>
                  <div style={{ fontSize: 12, color: 'var(--mp-muted)', marginTop: 2 }}>
                    {useGroupName ? '이 그룹에서만 다르게 표시돼요' : '지금은 기본 프로필(' + (myName || '이름 없음') + ')을 써요'}
                  </div>
                </div>
                <button
                  onClick={() => setUseGroupName(v => !v)}
                  style={{ ...S.switch, background: useGroupName ? '#13bca4' : 'var(--mp-line2)' }}
                >
                  <span style={{ ...S.knob, transform: useGroupName ? 'translateX(20px)' : 'translateX(0)' }} />
                </button>
              </div>

              {useGroupName && (
                <>
                  <div style={{ ...S.rowLabel, marginTop: 14 }}>이 그룹에서 쓸 이름</div>
                  <input style={S.input} value={groupName} maxLength={12} onChange={e => setGroupName(e.target.value.slice(0, 12))} placeholder="예: 아빠, 팀장님" />
                  <div style={{ fontSize: 11, color: 'var(--mp-muted)', textAlign: 'right', marginTop: 4 }}>{groupName.length}/12</div>
                  <div style={{ ...S.rowLabel, marginTop: 14 }}>이 그룹에서 쓸 색상</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setGroupColor(c)} style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: (groupColor || myColor) === c ? '3px solid var(--mp-ink)' : '3px solid var(--mp-card)', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,.15)' }} />
                    ))}
                  </div>
                </>
              )}
              <button style={{ ...S.save, opacity: busy ? .6 : 1 }} disabled={busy} onClick={saveMyGroupName}>
                {useGroupName ? '이 그룹 이름 저장' : '기본 프로필로 되돌리기'}
              </button>
            </div>

            {/* 그룹 알림 설정 (그룹장만) */}
            <div style={S.secLabel}>안부 알림 설정</div>
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
                      <div style={{ ...S.rowLabel, marginTop: 16 }}>안부 시간 (하루 1~3회)</div>
                      <div style={S.pills}>
                        {times.map(t => <button key={t} style={S.timePill} onClick={() => removeTime(t)}>{t} ✕</button>)}
                      </div>
                      {times.length < 3 && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                          <input type="time" style={{ ...S.input, flex: 1 }} value={newTime} onChange={e => setNewTime(e.target.value)} />
                          <button style={S.addPill} onClick={addTime}>＋ 추가</button>
                        </div>
                      )}
                      <div style={S.hint}>추가한 시간을 탭하면 삭제돼요</div>
                    </>
                  ) : (
                    <>
                      <div style={{ ...S.rowLabel, marginTop: 16 }}>랜덤 시간대</div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input type="time" style={{ ...S.input, flex: 1, textAlign: 'center' }} value={rStart} onChange={e => setRStart(e.target.value)} />
                        <span style={{ color: 'var(--mp-muted)' }}>~</span>
                        <input type="time" style={{ ...S.input, flex: 1, textAlign: 'center' }} value={rEnd} onChange={e => setREnd(e.target.value)} />
                      </div>
                      <div style={S.hint}>이 시간대 안에서 매일 한 번, 아무도 모르는 시각에 깜짝 알림 ⚡</div>
                    </>
                  )}

                  <div style={{ ...S.rowLabel, marginTop: 16 }}>찍을 수 있는 시간 (마감)</div>
                  <div style={S.pills}>
                    {[2, 3, 5, 10].map(w => <button key={w} style={{ ...S.pill, ...(windowMin === w ? S.pillOn : {}) }} onClick={() => setWindowMin(w)}>{w}분</button>)}
                  </div>

                  {(() => {
                    const dailyLimit = Math.min(5, Math.max(1, mode === 'random' ? 1 : times.length))
                    const rawUsed = todayCount == null ? null : todayCount
                    // 모드 변경 등으로 오늘 찍은 수가 한도를 넘는 경우, 표시는 한도로 클램프 (3/1 같은 역전 방지)
                    const used = rawUsed == null ? null : Math.min(rawUsed, dailyLimit)
                    const left = used == null ? null : Math.max(0, dailyLimit - rawUsed)
                    return (
                      <div style={S.quotaBox}>
                        <div style={S.quotaRow}>
                          <span style={S.quotaLabel}>{mode === 'random' ? '하루 알림' : '오늘 알림 예정'}</span>
                          <span style={S.quotaVal}>하루 {dailyLimit}번</span>
                        </div>
                        {used != null && (
                          <div style={S.quotaRow}>
                            <span style={S.quotaLabel}>오늘 남긴 안부</span>
                            <span style={{ ...S.quotaVal, color: left === 0 ? 'var(--mp-muted)' : 'var(--mp-coral)' }}>
                              {used} / {dailyLimit}회{left === 0 ? ' · 오늘 끝 🌙' : ''}
                            </span>
                          </div>
                        )}
                        <div style={S.quotaHint}>
                          {mode === 'random'
                            ? '설정한 시간대 안에서 하루 한 번 깜짝 알림이 가요'
                            : '설정한 시간 개수만큼 하루 알림이 가요 (지금 ' + times.length + '개)'}
                        </div>
                      </div>
                    )
                  })()}

                  <button style={{ ...S.save, opacity: busy ? .6 : 1 }} disabled={busy} onClick={saveGroup}>그룹 설정 저장</button>
                </>
              )}
            </div>

            {/* 그룹 나가기 / 삭제 */}
            <div style={S.secLabel}>그룹 관리</div>
            <div style={S.card}>
              <button style={S.linkRow} onClick={leaveGroup}>🚪 이 그룹에서 나가기</button>
              {isOwner && <button style={{ ...S.linkRow, color: 'var(--mp-coral)', borderBottom: 'none' }} onClick={deleteGroup}>🗑️ 그룹 삭제하기</button>}
            </div>
            {isOwner && <div style={S.dangerNote}>삭제하면 모든 안부·사진이 영구히 사라져요</div>}
          </>
        )}
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
}
