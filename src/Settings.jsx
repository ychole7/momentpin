// src/Settings.jsx — 그룹/개인 설정
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const COLORS = ['#ff4d5e', '#13bca4', '#e0972e', '#5b8def', '#9c4dcc', '#2a9d5a']

export default function Settings({ user, group, onClose, onGroupUpdate, onLeaveGroup }) {
  const [mode, setMode] = useState(group.alarm_mode || 'fixed')
  const [times, setTimes] = useState(Array.isArray(group.fixed_times) ? group.fixed_times : ['08:00', '21:00'])
  const [rStart, setRStart] = useState((group.random_start || '09:00').slice(0, 5))
  const [rEnd, setREnd] = useState((group.random_end || '21:00').slice(0, 5))
  const [windowMin, setWindowMin] = useState(group.window_min || 5)

  const [myName, setMyName] = useState('')
  const [myColor, setMyColor] = useState('#ff4d5e')
  const [shareLoc, setShareLoc] = useState(true)
  const [myMemberId, setMyMemberId] = useState(null)

  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2400) }

  useEffect(() => { loadMe() }, [])
  async function loadMe() {
    let res = await supabase.from('members')
      .select('id,display_name,color,share_location')
      .eq('group_id', group.id).eq('user_id', user.id).single()
    if (!res.error && res.data) {
      setMyMemberId(res.data.id)
      setMyName(res.data.display_name || '')
      setMyColor(res.data.color || '#ff4d5e')
      setShareLoc(res.data.share_location !== false)
    }
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
    let res = await supabase.from('groups').update({
      alarm_mode: mode,
      fixed_times: times,
      random_start: rStart,
      random_end: rEnd,
      window_min: windowMin,
    }).eq('id', group.id)
    setBusy(false)
    if (res.error) { flash('저장 실패: ' + res.error.message); return }
    flash('그룹 설정 저장됨 ✨')
    if (onGroupUpdate) onGroupUpdate({ ...group, alarm_mode: mode, fixed_times: times, random_start: rStart, random_end: rEnd, window_min: windowMin })
  }

  async function saveMe() {
    if (!myName.trim()) { flash('이름을 입력해 주세요'); return }
    setBusy(true)
    let res = await supabase.from('members').update({
      display_name: myName.trim(), color: myColor, share_location: true,
    }).eq('id', myMemberId)
    setBusy(false)
    if (res.error) { flash('저장 실패: ' + res.error.message); return }
    flash('내 설정 저장됨 ✨')
  }

  async function leaveGroup() {
    if (!confirm(`'${group.name}' 그룹에서 나갈까요?`)) return
    setBusy(true)
    let res = await supabase.from('members').delete().eq('id', myMemberId)
    setBusy(false)
    if (res.error) { flash('나가기 실패: ' + res.error.message); return }
    if (onLeaveGroup) onLeaveGroup()
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
        <div style={S.title}>설정</div>
        <div style={{ width: 32 }} />
      </div>

      <div style={S.body}>
        {/* 알림 설정 */}
        <div style={S.secLabel}>모먼 알림</div>
        <div style={S.card}>
          <div style={S.rowLabel}>언제 다 같이 찍을까요?</div>
          <div style={S.pills}>
            <button style={{ ...S.pill, ...(mode === 'fixed' ? S.pillOn : {}) }} onClick={() => setMode('fixed')}>⏰ 정해진 시간</button>
            <button style={{ ...S.pill, ...(mode === 'random' ? S.pillOn : {}) }} onClick={() => setMode('random')}>⚡ 랜덤</button>
          </div>

          {mode === 'fixed' ? (
            <>
              <div style={{ ...S.rowLabel, marginTop: 16 }}>찍는 시간 (하루 1~3회)</div>
              <div style={S.pills}>
                {times.map(t => (
                  <button key={t} style={S.timePill} onClick={() => removeTime(t)}>{t} ✕</button>
                ))}
                {times.length < 3 && <button style={S.addPill} onClick={addTime}>＋ 추가</button>}
              </div>
              <div style={S.hint}>시간을 탭하면 삭제돼요</div>
            </>
          ) : (
            <>
              <div style={{ ...S.rowLabel, marginTop: 16 }}>랜덤 시간대</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input style={S.input} value={rStart} onChange={e => setRStart(e.target.value)} placeholder="09:00" />
                <span style={{ color: '#9b9ba3' }}>~</span>
                <input style={S.input} value={rEnd} onChange={e => setREnd(e.target.value)} placeholder="21:00" />
              </div>
              <div style={S.hint}>이 시간대 안에서 매일 한 번 깜짝 알림</div>
            </>
          )}

          <div style={{ ...S.rowLabel, marginTop: 16 }}>찍을 수 있는 시간 (마감)</div>
          <div style={S.pills}>
            {[2, 5, 10].map(w => (
              <button key={w} style={{ ...S.pill, ...(windowMin === w ? S.pillOn : {}) }} onClick={() => setWindowMin(w)}>{w}분</button>
            ))}
          </div>

          <button style={{ ...S.save, opacity: busy ? .6 : 1 }} disabled={busy} onClick={saveGroup}>그룹 설정 저장</button>
        </div>

        {/* 개인 설정 */}
        <div style={S.secLabel}>내 정보</div>
        <div style={S.card}>
          <div style={S.rowLabel}>내 이름</div>
          <input style={{ ...S.input, width: '100%', marginBottom: 14 }} value={myName} onChange={e => setMyName(e.target.value)} />

          <div style={S.rowLabel}>내 색상</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => setMyColor(c)} style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: myColor === c ? '3px solid #16161a' : '3px solid #fff', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,.15)' }} />
            ))}
          </div>

          <div style={S.infoBox}>
            📍 위치는 <b>모먼을 찍는 순간에만</b> 공유돼요.<br/>
            위치를 빼고 싶을 땐 홈에서 <b>'🔒 위치 없이 찍기'</b>를 누르면 돼요.
          </div>

          <button style={{ ...S.save, opacity: busy ? .6 : 1 }} disabled={busy} onClick={saveMe}>내 설정 저장</button>
        </div>

        {/* 그룹 */}
        <div style={S.secLabel}>그룹</div>
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{group.name}</div>
              <div style={{ fontSize: 12, color: '#9b9ba3' }}>초대코드 {group.invite_code}</div>
            </div>
            <button style={S.smallBtn} onClick={copyInvite}>🔗 초대 링크</button>
          </div>
          <button style={S.leave} onClick={leaveGroup}>이 그룹에서 나가기</button>
        </div>
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
  secLabel: { fontSize: 12, fontWeight: 600, color: '#9b9ba3', textTransform: 'uppercase', letterSpacing: .4, margin: '18px 4px 8px' },
  card: { background: '#fff', borderRadius: 18, padding: 16, boxShadow: '0 4px 24px rgba(20,20,30,.06)' },
  rowLabel: { fontSize: 14, fontWeight: 600, marginBottom: 10 },
  pills: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  pill: { border: '1.5px solid #efeff2', background: '#fff', color: '#16161a', padding: '9px 15px', borderRadius: 22, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  pillOn: { background: '#16161a', color: '#fff', borderColor: '#16161a' },
  timePill: { border: '1.5px solid #ffd9cc', background: '#fff1ed', color: '#e0593c', padding: '9px 14px', borderRadius: 22, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  addPill: { border: '1.5px dashed #c4c4cc', background: '#fff', color: '#9b9ba3', padding: '9px 14px', borderRadius: 22, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  input: { border: '1.5px solid #efeff2', background: '#fff', borderRadius: 10, padding: '11px 13px', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#16161a', outline: 'none', textAlign: 'center', boxSizing: 'border-box' },
  hint: { fontSize: 12, color: '#9b9ba3', marginTop: 8 },
  toggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0 14px' },
  infoBox: { background: '#f4faf9', border: '1.5px solid #d7f3ee', borderRadius: 12, padding: '13px 15px', fontSize: 13, color: '#16161a', lineHeight: 1.6, marginBottom: 4 },
  switch: { width: 46, height: 26, borderRadius: 20, border: 'none', cursor: 'pointer', position: 'relative', padding: 0, transition: 'background .2s' },
  knob: { position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,.2)', transition: 'transform .2s' },
  save: { width: '100%', border: 'none', borderRadius: 12, padding: 13, marginTop: 16, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 6px 16px rgba(255,77,94,.28)' },
  smallBtn: { border: '1.5px solid #efeff2', background: '#fff', color: '#16161a', borderRadius: 20, padding: '8px 13px', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  leave: { width: '100%', border: '1.5px solid #ffd9cc', background: '#fff', color: '#e0593c', borderRadius: 12, padding: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  toast: { position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#16161a', color: '#fff', padding: '12px 20px', borderRadius: 30, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,.3)', zIndex: 4000 },
}
