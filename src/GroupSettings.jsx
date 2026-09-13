// src/GroupSettings.jsx — commercial UI redesign; existing functionality preserved
import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

const COLORS = ['#ff4d5e', '#13bca4', '#e0972e', '#5b8def', '#9c4dcc', '#2a9d5a']

export default function GroupSettings({ user, group, onClose, onGroupUpdate, onLeaveGroup, onMemberUpdate }) {
  const isOwner = group.created_by === user.id
  const [members, setMembers] = useState([])
  const [myName, setMyName] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupColor, setGroupColor] = useState('')
  const [useGroupName, setUseGroupName] = useState(false)
  const [myMemberId, setMyMemberId] = useState(null)
  const [mode, setMode] = useState(group.alarm_mode || 'fixed')
  const [times, setTimes] = useState(Array.isArray(group.fixed_times) ? group.fixed_times : ['08:00', '21:00'])
  const [windowMin, setWindowMin] = useState(group.window_min || 3)
  const [rStart, setRStart] = useState((group.random_start || '09:00').slice(0, 5))
  const [rEnd, setREnd] = useState((group.random_end || '21:00').slice(0, 5))
  const [newTime, setNewTime] = useState('18:30')
  const [editName, setEditName] = useState(group.name)
  const [todayCount, setTodayCount] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const scheduleBaseline = useRef({ mode, times: [...times], windowMin, rStart, rEnd })
  const memberBaseline = useRef({ useGroupName: false, groupName: '', groupColor: '' })
  const nameBaseline = useRef(group.name || '')
  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2400) }

  useEffect(() => { loadMembers(); loadMe(); loadTodayCount(); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }) }, [])

  async function loadMembers() {
    let res = await supabase.from('members').select('user_id,display_name,color').eq('group_id', group.id)
    if (!res.error) setMembers(res.data || [])
  }
  async function loadMe() {
    let res = await supabase.from('profiles').select('display_name,color').eq('user_id', user.id).maybeSingle()
    if (!res.error && res.data) setMyName(res.data.display_name || '')
    let mres = await supabase.from('members').select('id,display_name,color').eq('group_id', group.id).eq('user_id', user.id).maybeSingle()
    if (!mres.error && mres.data) {
      setMyMemberId(mres.data.id)
      const memberUse = !!mres.data.display_name
      const memberName = mres.data.display_name || ''
      const memberColor = mres.data.color || ''
      if (memberUse) {
        setGroupName(memberName)
        setGroupColor(memberColor)
        setUseGroupName(true)
      }
      memberBaseline.current = { useGroupName: memberUse, groupName: memberName, groupColor: memberColor }
    }
  }
  async function loadTodayCount() {
    const now = new Date()
    const kst = new Date(now.getTime() + 9 * 3600 * 1000)
    const y = kst.getUTCFullYear(), mo = kst.getUTCMonth(), d = kst.getUTCDate()
    const startKstUtc = new Date(Date.UTC(y, mo, d) - 9 * 3600 * 1000)
    let res = await supabase.from('moments').select('id', { count: 'exact', head: true }).eq('group_id', group.id).gte('fired_at', startKstUtc.toISOString())
    if (typeof res.count === 'number') setTodayCount(res.count)
  }
  async function saveMyGroupName() {
    if (!myMemberId) { flash('멤버 정보를 찾을 수 없어요'); return }
    if (useGroupName && !groupName.trim()) { flash('이 그룹에서 쓸 이름을 입력해 주세요'); return }
    if (useGroupName) {
      const wanted = groupName.trim().toLowerCase()
      const clash = (members || []).some(m => m.user_id !== user.id && (m.display_name || '').trim().toLowerCase() === wanted)
      if (clash) { flash('이 그룹에 이미 같은 이름이 있어요. 다른 이름을 써주세요'); return }
    }
    setBusy(true)
    const payload = useGroupName ? { display_name: groupName.trim().slice(0, 12), color: groupColor || '#ff4d5e' } : { display_name: null, color: null }
    let res = await supabase.from('members').update(payload).eq('id', myMemberId)
    setBusy(false)
    if (res.error) { flash('저장 실패: ' + res.error.message); return }
    memberBaseline.current = { useGroupName, groupName: useGroupName ? groupName.trim().slice(0, 12) : '', groupColor: useGroupName ? (groupColor || '#ff4d5e') : '' }
    flash('저장했어요 ✓')
    if (onMemberUpdate) onMemberUpdate()
  }
  const scheduleDirty = mode !== scheduleBaseline.current.mode ||
    JSON.stringify(times) !== JSON.stringify(scheduleBaseline.current.times) ||
    windowMin !== scheduleBaseline.current.windowMin || rStart !== scheduleBaseline.current.rStart || rEnd !== scheduleBaseline.current.rEnd
  const memberDirty = useGroupName !== memberBaseline.current.useGroupName || groupName !== memberBaseline.current.groupName || (groupColor || '') !== (memberBaseline.current.groupColor || '')
  const nameDirty = editName !== nameBaseline.current

  function addTime() {
    if (times.length >= 3) { flash('최대 3개까지예요'); return }
    if (!newTime) return
    if (times.includes(newTime)) { flash('이미 있는 시간이에요'); return }
    setTimes([...times, newTime].sort())
  }
  function removeTime(t) { setTimes(times.filter(x => x !== t)) }
  async function saveGroup() {
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
    scheduleBaseline.current = { mode, times: [...times], windowMin, rStart, rEnd }
    flash('저장했어요 ✓')
    if (onGroupUpdate) onGroupUpdate({ ...group, alarm_mode: mode, fixed_times: times, window_min: windowMin, random_start: rStart, random_end: rEnd })
  }
  async function saveGroupName() {
    const nm = editName.trim().slice(0, 10)
    if (!nm) { flash('그룹 이름을 입력해 주세요'); return }
    setBusy(true)
    let res = await supabase.from('groups').update({ name: nm }).eq('id', group.id)
    setBusy(false)
    if (res.error) { flash('저장 실패: ' + res.error.message); return }
    nameBaseline.current = nm
    flash('저장했어요 ✓')
    if (onGroupUpdate) onGroupUpdate({ ...group, name: nm })
  }
  async function copyInvite() {
    const link = window.location.origin + '/?code=' + encodeURIComponent(group.invite_code)
    try { await navigator.clipboard.writeText(link) } catch {}
    flash('초대 링크 복사됨 ✨')
  }
  async function leaveGroup() {
    if (isOwner && members.length > 1) { flash('그룹장은 먼저 다른 멤버에게 넘기거나 그룹을 삭제해 주세요'); return }
    const lastOne = members.length <= 1
    if (lastOne && !confirm('이 그룹엔 나만 있어요. 나가면 그룹이 삭제되고 모든 기록이 사라져요. 계속할까요?')) return
    if (!lastOne && !confirm('정말 이 그룹에서 나갈까요?')) return
    setBusy(true)
    if (lastOne) {
      let res = await supabase.from('groups').delete().eq('id', group.id)
      setBusy(false)
      if (res.error) { flash('나가기 실패: ' + res.error.message); return }
    } else {
      let res = await supabase.from('members').delete().eq('group_id', group.id).eq('user_id', user.id)
      setBusy(false)
      if (res.error) { flash('나가기 실패: ' + res.error.message); return }
    }
    if (onLeaveGroup) onLeaveGroup()
  }
  async function deleteGroup() {
    if (!confirm('정말 그룹을 삭제할까요?\n모든 안부와 사진이 사라지고 되돌릴 수 없어요.')) return
    if (!confirm('한 번 더 확인할게요. 정말 삭제하시겠어요?')) return
    setBusy(true)
    let res = await supabase.from('groups').delete().eq('id', group.id)
    setBusy(false)
    if (res.error) { flash('삭제 실패: ' + res.error.message); return }
    if (onLeaveGroup) onLeaveGroup()
  }

  const dailyLimit = Math.min(5, Math.max(1, mode === 'random' ? 1 : times.length))
  const rawUsed = todayCount == null ? null : todayCount
  const used = rawUsed == null ? null : Math.min(rawUsed, dailyLimit)
  const left = used == null ? null : Math.max(0, dailyLimit - rawUsed)

  return (
    <div style={S.app}>
      <header style={S.header}>
        <button style={S.back} onClick={onClose} aria-label="뒤로">‹</button>
        <div style={S.headerCenter}>
          <div style={S.eyebrow}>GROUP SETTINGS</div>
          <div style={S.title}>{group.name}</div>
        </div>
        <div style={S.headerSpacer} />
      </header>

      <main style={S.body}>
        <SectionLabel text="그룹" />
        <section style={S.card}>
          <div style={S.groupHead}>
            <div style={S.groupAvatar}>{(group.name || '그').slice(0, 1)}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={S.groupName}>{group.name}</div>
              <div style={S.meta}>멤버 {members.length}명 · {group.invite_code}</div>
            </div>
            <button style={S.inviteBtn} onClick={copyInvite}>초대</button>
          </div>
          {isOwner && <div style={S.subBlock}>
            <div style={S.label}>그룹 이름</div>
            <div style={S.inline}>
              <input style={{ ...S.input, flex: 1 }} value={editName} maxLength={10} onChange={e => setEditName(e.target.value.slice(0, 10))} />
              <button style={S.outlineBtn} disabled={busy || !nameDirty} onClick={saveGroupName}>저장</button>
            </div>
          </div>}
        </section>

        <SectionLabel text="이 그룹에서 쓰는 이름" />
        <section style={S.card}>
          <div style={S.toggleRow}>
            <div>
              <div style={S.cardTitle}>다른 이름 쓰기</div>
              <div style={S.cardHint}>{useGroupName ? '이 그룹에서만 다르게 표시돼요' : `기본 프로필(${myName || '이름 없음'})을 사용해요`}</div>
            </div>
            <button onClick={() => setUseGroupName(v => !v)} style={{ ...S.switch, background: useGroupName ? '#13bca4' : '#d9dde5' }} aria-label="다른 이름 사용">
              <span style={{ ...S.knob, transform: useGroupName ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>
          </div>
          {useGroupName && <div style={S.expandBlock}>
            <div style={S.label}>이 그룹에서 쓸 이름</div>
            <input style={S.input} value={groupName} maxLength={12} onChange={e => setGroupName(e.target.value.slice(0, 12))} placeholder="예: 아빠, 팀장님" />
            <div style={S.counter}>{groupName.length}/12</div>
            <div style={{ ...S.label, marginTop: 16 }}>이 그룹에서 쓸 색상</div>
            <div style={S.colors}>
              {COLORS.map(c => <button key={c} onClick={() => setGroupColor(c)} style={{ ...S.colorDot, background: c, border: (groupColor || '#ff4d5e') === c ? '3px solid #1e2746' : '3px solid #fff' }} aria-label="색상 선택" />)}
            </div>
          </div>}
          <button style={{ ...S.primaryBtn, ...(memberDirty ? {} : S.primaryBtnDisabled) }} disabled={busy || !memberDirty} onClick={saveMyGroupName}>{useGroupName ? '이 그룹 이름 저장' : '기본 프로필로 되돌리기'}</button>
        </section>

        <SectionLabel text="안부 알림" />
        <section style={S.card}>
          {!isOwner ? <div style={S.locked}><div style={S.lockIcon}>🔒</div><div><b style={{fontSize:13}}>그룹장만 설정할 수 있어요</b><span style={{display:'block',fontSize:11,color:'#8a91a1',marginTop:3}}>안부 알림 시간은 그룹장이 관리해요.</span></div></div> : <>
            <div style={S.label}>언제 다 같이 찍을까요?</div>
            <div style={S.segment}>
              <button style={{ ...S.segmentBtn, ...(mode === 'fixed' ? S.segmentOn : {}) }} onClick={() => setMode('fixed')}>정해진 시간</button>
              <button style={{ ...S.segmentBtn, ...(mode === 'random' ? S.segmentOn : {}) }} onClick={() => setMode('random')}>랜덤</button>
            </div>
            {mode === 'fixed' ? <>
              <div style={{ ...S.label, marginTop: 20 }}>안부 시간 <span style={S.muted}>하루 1~3회</span></div>
              <div style={S.timeList}>
                {times.map((t, i) => (
                  <div key={t} style={i === 0 ? S.timePrimary : S.timeChip}>
                    <span>{formatTime(t)}</span>
                    <button
                      type="button"
                      style={i === 0 ? S.timeRemovePrimary : S.timeRemove}
                      onClick={(e) => { e.stopPropagation(); removeTime(t) }}
                      aria-label={`${formatTime(t)} 삭제`}
                    >×</button>
                  </div>
                ))}
              </div>
              {times.length < 3 && <div style={S.inlineAdd}><input type="time" style={{ ...S.input, flex: 1 }} value={newTime} onChange={e => setNewTime(e.target.value)} /><button style={S.addBtn} onClick={addTime}>+ 추가</button></div>}
              <div style={S.help}>추가한 시간을 누르면 삭제할 수 있어요.</div>
            </> : <>
              <div style={{ ...S.label, marginTop: 20 }}>랜덤 시간대</div>
              <div style={S.timeRange}><input type="time" style={{ ...S.input, flex: 1, textAlign: 'center' }} value={rStart} onChange={e => setRStart(e.target.value)} /><span>~</span><input type="time" style={{ ...S.input, flex: 1, textAlign: 'center' }} value={rEnd} onChange={e => setREnd(e.target.value)} /></div>
              <div style={S.help}>이 시간대 안에서 하루 한 번, 깜짝 알림이 가요.</div>
            </>}
            <div style={{ ...S.label, marginTop: 20 }}>찍을 수 있는 시간 <span style={S.muted}>마감</span></div>
            <div style={S.segmentWrap}>{[2, 3, 5, 10].map(w => <button key={w} style={{ ...S.smallPill, ...(windowMin === w ? S.smallPillOn : {}) }} onClick={() => setWindowMin(w)}>{w}분</button>)}</div>
            <div style={S.quota}>
              <div style={S.quotaRow}><span>오늘 알림 예정</span><b>하루 {dailyLimit}번</b></div>
              {used != null && <div style={S.quotaRow}><span>오늘 남긴 안부</span><b style={{ color: left === 0 ? '#8a91a1' : '#e56b62' }}>{used} / {dailyLimit}회{left === 0 ? ' · 오늘 끝' : ''}</b></div>}
              <div style={S.quotaHint}>{mode === 'random' ? '설정한 시간대 안에서 하루 한 번 깜짝 알림이 가요.' : `설정한 시간 ${times.length}개만큼 하루 알림이 가요.`}</div>
            </div>
            <button style={{ ...S.primaryBtn, ...(scheduleDirty ? {} : S.primaryBtnDisabled) }} disabled={busy || !scheduleDirty} onClick={saveGroup}>그룹 설정 저장</button>
          </>}
        </section>

        <SectionLabel text="그룹 관리" />
        <section style={S.card}>
          <button style={S.actionRow} onClick={leaveGroup}><span>이 그룹에서 나가기</span><span>›</span></button>
          {isOwner && <button style={{ ...S.actionRow, color: '#e56b62', borderBottom: 'none' }} onClick={deleteGroup}><span>그룹 삭제하기</span><span>›</span></button>}
        </section>
        {isOwner && <div style={S.danger}>삭제하면 모든 안부와 사진이 영구히 사라져요.</div>}
      </main>
      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  )
}

function formatTime(t) {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? '오후' : '오전'
  const hh = h % 12 || 12
  return `${suffix} ${hh}:${String(m).padStart(2, '0')}`
}

function SectionLabel({ text }) { return <div style={S.sectionLabel}>{text}</div> }

const S = {
  app: { width: '100%', maxWidth: 480, margin: '0 auto', minHeight: '100dvh', background: '#f8f7f3', color: '#1e2746', fontFamily: "'Outfit','Gowun Dodum',sans-serif", paddingBottom: 32 },
  header: { position: 'sticky', top: 0, zIndex: 100, minHeight: 86, padding: 'max(12px, env(safe-area-inset-top)) 18px 12px', boxSizing: 'border-box', background: 'rgba(248,247,243,.97)', backdropFilter: 'blur(18px)', borderBottom: '1px solid #e9e7e2', display: 'flex', alignItems: 'center' },
  back: { width: 46, height: 46, border: '1px solid rgba(30,39,70,.06)', background: '#fff', borderRadius: 15, fontSize: 31, lineHeight: 1, color: '#1e2746', cursor: 'pointer', boxShadow: '0 3px 12px rgba(30,39,70,.07)', display:'grid', placeItems:'center', paddingBottom:2 },
  headerCenter: { flex: 1, textAlign: 'center', minWidth: 0 },
  headerSpacer: { width: 46 },
  eyebrow: { fontSize: 9, fontWeight: 800, letterSpacing: 1.8, color: '#9a9ead', marginBottom: 4 },
  title: { fontSize: 21, fontWeight: 800, letterSpacing:'-.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  body: { padding: '22px 18px 58px' },
  intro: { display: 'flex', gap: 12, alignItems: 'center', padding: '15px 16px', background: '#fff', borderRadius: 18, boxShadow: '0 5px 24px rgba(30,39,70,.055)', marginBottom: 4 },
  introIcon: { width: 38, height: 38, borderRadius: 13, display: 'grid', placeItems: 'center', background: '#fff2ef', color: '#e56b62', fontSize: 22, fontWeight: 700 },
  introTitle: { fontSize: 14, fontWeight: 800, marginBottom: 3 },
  introSub: { fontSize: 11.5, lineHeight: 1.45, color: '#8a91a1' },
  sectionLabel: { margin: '26px 4px 11px', fontSize: 13, fontWeight: 800, color: '#7e8596', letterSpacing: .1 },
  card: { background: '#fff', borderRadius: 22, padding: 18, boxShadow: '0 6px 24px rgba(30,39,70,.055)', border: '1px solid rgba(30,39,70,.045)' },
  groupHead: { display: 'flex', alignItems: 'center', gap: 12 },
  groupAvatar: { width: 54, height: 54, flex: '0 0 54px', borderRadius: 16, background: '#1e2746', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800 },
  groupName: { fontSize: 18, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { marginTop: 4, fontSize: 11.5, color: '#8a91a1' },
  inviteBtn: { border: '1px solid #e7e5e0', background: '#fff', borderRadius: 13, padding: '9px 13px', color: '#1e2746', fontWeight: 800, fontSize: 12, cursor: 'pointer' },
  subBlock: { borderTop: '1px solid #efeee9', marginTop: 16, paddingTop: 15 },
  label: { fontSize: 12.5, fontWeight: 800, marginBottom: 9 },
  muted: { color: '#a1a6b1', fontWeight: 600, marginLeft: 3 },
  inline: { display: 'flex', gap: 8 },
  input: { width: '100%', border: '1px solid #e4e3df', borderRadius: 13, padding: '12px 13px', background: '#fbfaf8', color: '#1e2746', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, outline: 'none', boxSizing: 'border-box' },
  outlineBtn: { border: '1px solid #dfe0e4', background: '#fff', color: '#1e2746', borderRadius: 13, padding: '0 15px', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer' },
  cardTitle: { fontSize: 14, fontWeight: 800 },
  cardHint: { fontSize: 11.5, color: '#8a91a1', marginTop: 4, lineHeight: 1.45 },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  switch: { width: 46, height: 26, borderRadius: 20, border: 'none', cursor: 'pointer', position: 'relative', padding: 0, transition: 'background .2s' },
  knob: { position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,.18)', transition: 'transform .2s' },
  expandBlock: { marginTop: 17, paddingTop: 17, borderTop: '1px solid #efeee9' },
  counter: { fontSize: 10.5, color: '#a1a6b1', textAlign: 'right', marginTop: 4 },
  colors: { display: 'flex', gap: 10 },
  colorDot: { width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', boxSizing: 'border-box', boxShadow: '0 2px 7px rgba(0,0,0,.08)' },
  primaryBtnDisabled: { opacity: .45, boxShadow: 'none', cursor: 'default' },
  primaryBtn: { width: '100%', border: 'none', borderRadius: 15, padding: '14px 14px', marginTop: 17, color: '#fff', background: '#1e2746', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer', boxShadow: '0 7px 18px rgba(30,39,70,.16)' },
  segment: { display: 'grid', gridTemplateColumns: '1fr 1fr', padding: 4, borderRadius: 14, background: '#f1f0ec' },
  segmentBtn: { border: 'none', background: 'transparent', color: '#7e8596', padding: '10px 8px', borderRadius: 11, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' },
  segmentOn: { background: '#fff', color: '#1e2746', boxShadow: '0 2px 8px rgba(30,39,70,.09)' },
  timeList: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  timeChip: { display: 'inline-flex', alignItems: 'center', gap: 3, border: '1px solid #ead1ce', background: '#fff7f5', color: '#e56b62', padding: '10px 8px 10px 13px', borderRadius: 13, fontFamily: 'inherit', fontSize: 13, fontWeight: 800 },
  timePrimary: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, border: '1px solid #e0e1e5', background: '#fbfaf8', color: '#1e2746', padding: '11px 9px 11px 15px', borderRadius: 13, fontFamily: 'inherit', fontSize: 14, fontWeight: 800, minWidth: 150, textAlign: 'center' },
  timeRemove: { width: 22, height: 22, border: 'none', background: 'transparent', color: '#e56b62', padding: 0, margin: 0, fontFamily: 'inherit', fontSize: 17, lineHeight: 1, fontWeight: 500, cursor: 'pointer', display: 'grid', placeItems: 'center' },
  timeRemovePrimary: { width: 24, height: 24, border: 'none', background: 'transparent', color: '#7d8493', padding: 0, margin: 0, fontFamily: 'inherit', fontSize: 17, lineHeight: 1, fontWeight: 500, cursor: 'pointer', display: 'grid', placeItems: 'center' },
  inlineAdd: { display: 'flex', gap: 8, marginTop: 10 },
  addBtn: { border: '1px dashed #cfd2d9', background: '#fff', color: '#596173', borderRadius: 13, padding: '0 14px', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer' },
  help: { fontSize: 11, color: '#9a9ead', marginTop: 8, lineHeight: 1.5 },
  timeRange: { display: 'flex', gap: 8, alignItems: 'center' },
  segmentWrap: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  smallPill: { minWidth: 56, border: '1px solid #e1e2e5', background: '#fafaf9', color: '#596173', padding: '9px 13px', borderRadius: 12, fontFamily: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer' },
  smallPillOn: { background: '#fff1ee', borderColor: '#e56b62', color: '#d95f57', boxShadow: '0 2px 7px rgba(229,107,98,.10)' },
  quota: { marginTop: 18, background: '#f8f7f3', borderRadius: 15, padding: '13px 14px' },
  quotaRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12.5, color: '#707789', padding: '3px 0' },
  quotaHint: { fontSize: 10.5, color: '#9a9ead', lineHeight: 1.5, marginTop: 6 },
  locked: { display: 'flex', gap: 12, alignItems: 'center', background: '#f8f7f3', borderRadius: 15, padding: '14px' },
  lockIcon: { width: 38, height: 38, borderRadius: 12, background: '#fff', display: 'grid', placeItems: 'center', fontSize: 17 },
  actionRow: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: 'none', borderBottom: '1px solid #efeee9', background: 'transparent', color: '#1e2746', padding: '17px 2px', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' },
  danger: { textAlign: 'center', color: '#e56b62', fontSize: 10.5, marginTop: 9 },
  toast: { position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', background: '#1e2746', color: '#fff', padding: '12px 19px', borderRadius: 24, fontSize: 12.5, fontWeight: 700, boxShadow: '0 10px 30px rgba(0,0,0,.22)', zIndex: 4000, whiteSpace: 'nowrap' }
}
