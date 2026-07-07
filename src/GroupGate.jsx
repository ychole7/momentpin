// src/GroupGate.jsx
// 로그인 후 첫 관문: 그룹 만들기 or 초대코드로 들어가기.
// 이미 속한 그룹이 있으면 onReady(group) 로 넘어감.
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const COLORS = ['#ff4d5e', '#13bca4', '#e0972e', '#5b8def', '#9c4dcc', '#2a9d5a']
const randColor = () => COLORS[Math.floor(Math.random() * COLORS.length)]

// MP-XXXX 형태 초대코드 생성 (혼동 문자 제외)
function makeCode() {
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 4; i++) s += ch[Math.floor(Math.random() * ch.length)]
  return 'MP-' + s
}

export default function GroupGate({ user, onReady }) {
  const [loading, setLoading] = useState(true)
  const [myGroups, setMyGroups] = useState([])
  const [tab, setTab] = useState('create') // 'create' | 'join'
  const [name, setName] = useState('')       // 그룹 이름 / 내 표시 이름
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [myColor, setMyColor] = useState(randColor())      // 프로필 색 (없으면 랜덤)
  const [hasProfile, setHasProfile] = useState(false)      // 이미 이름 정한 계정인지

  async function loadProfile() {
    let res = await supabase.from('profiles').select('display_name,color').eq('user_id', user.id).maybeSingle()
    if (!res.error && res.data) {
      if (res.data.display_name) { setDisplayName(res.data.display_name); setHasProfile(true) }
      if (res.data.color) setMyColor(res.data.color)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    localStorage.removeItem('mp_group')
    window.location.href = '/'
  }

  async function deleteAccount() {
    if (!confirm('정말 탈퇴하시겠어요?\n계정과 모든 기록이 영구히 삭제되며 되돌릴 수 없어요.')) return
    if (!confirm('마지막 확인이에요. 정말 탈퇴를 진행할까요?')) return
    setBusy(true)
    try {
      let sess = await supabase.auth.getSession()
      const token = sess.data.session ? sess.data.session.access_token : null
      if (!token) { alert('로그인 정보를 확인할 수 없어요'); setBusy(false); return }
      const r = await fetch(window.location.origin + '/api/delete-account', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
      })
      const j = await r.json()
      if (!r.ok) {
        if (j.error === 'owner_has_members') { alert(j.message); setBusy(false); return }
        alert('탈퇴 실패: ' + (j.message || j.error || '오류')); setBusy(false); return
      }
      await supabase.auth.signOut()
      localStorage.removeItem('mp_group')
      window.location.href = '/'
    } catch (e) { alert('탈퇴 중 오류: ' + (e.message || e)); setBusy(false) }
  }
  const [msg, setMsg] = useState('')

  useEffect(() => { loadMyGroups(); loadProfile() }, [])

  async function loadMyGroups() {
    setLoading(true)
    let res = await supabase
      .from('members')
      .select('group_id, display_name, groups(id,name,invite_code,created_by,alarm_mode,fixed_times,random_start,random_end,window_min)')
      .eq('user_id', user.id)
    const error = res.error
    if (error) { setMsg(error.message); setLoading(false); return }
    const groups = (res.data || []).map(r => r.groups).filter(Boolean)

    // 진행중인 안부가 있는 그룹 ID 조회
    const now = new Date().toISOString()
    const gids = groups.map(g => g.id)
    let activeSet = new Set()
    if (gids.length) {
      let mres = await supabase.from('moments').select('group_id')
        .in('group_id', gids)
        .lte('fired_at', now)
        .gte('deadline', now)
      if (!mres.error && mres.data) mres.data.forEach(m => activeSet.add(m.group_id))
    }
    setMyGroups(groups.map(g => ({ ...g, active: activeSet.has(g.id) })))
    setLoading(false)

    // 딥링크: URL에 ?group=ID가 있으면 해당 그룹으로 자동 진입
    try {
      const urlGroupId = new URLSearchParams(window.location.search).get('group')
      if (urlGroupId) {
        const target = groups.find(g => g.id === urlGroupId)
        if (target) {
          // URL 파라미터 제거 후 진입 (뒤로가기 시 다시 자동진입 방지)
          window.history.replaceState({}, '', window.location.pathname)
          onReady(target)
          return
        }
      }
    } catch {}
  }

  // 프로필(계정 단위) 저장 — 그룹 만들/참여 시 함께 저장
  async function saveProfile() {
    let res = await supabase.from('profiles').upsert({
      user_id: user.id,
      display_name: displayName.trim().slice(0, 12),
      color: myColor,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    return res.error
  }

  async function createGroup() {
    if (!name.trim() || !displayName.trim()) { setMsg('그룹 이름과 내 이름을 입력해 주세요.'); return }
    setBusy(true); setMsg('')

    // 0) 그룹 개수 제한 (최대 10개)
    if (myGroups.length >= 10) { setMsg('그룹은 최대 10개까지 만들 수 있어요.'); setBusy(false); return }

    // 0-1) 같은 이름 그룹 중복 체크
    const dupName = myGroups.some(g => g.name.trim().toLowerCase() === name.trim().toLowerCase())
    if (dupName) { setMsg('이미 같은 이름의 그룹이 있어요. 다른 이름을 써주세요.'); setBusy(false); return }

    // 0-2) 프로필 저장 (계정 단위 이름·색)
    const pErr = await saveProfile()
    if (pErr) { setMsg('프로필 저장 실패: ' + pErr.message); setBusy(false); return }

    // 1) 그룹 생성 (초대코드 충돌 시 한 번 더 시도)
    let group = null
    for (let attempt = 0; attempt < 3 && !group; attempt++) {
      let res = await supabase.from('groups')
        .insert({ name: name.trim(), invite_code: makeCode(), created_by: user.id })
        .select().single()
      if (!res.error) { group = res.data; break }
      if (!String(res.error.message).includes('duplicate')) { setMsg(res.error.message); setBusy(false); return }
    }
    if (!group) { setMsg('초대코드 생성에 실패했어요. 다시 시도해 주세요.'); setBusy(false); return }

    // 2) 본인을 멤버로 추가 (members에도 이름·색 저장 = 기존 호환/fallback)
    let res2 = await supabase.from('members')
      .insert({ group_id: group.id, user_id: user.id, display_name: displayName.trim().slice(0, 12), color: myColor })
    const e2 = res2.error
    if (e2) { setMsg(e2.message); setBusy(false); return }

    setBusy(false)
    onReady(group)
  }

  async function joinGroup() {
    if (!code.trim() || !displayName.trim()) { setMsg('초대코드와 내 이름을 입력해 주세요.'); return }
    setBusy(true); setMsg('')

    // 0) 프로필 저장
    const pErr = await saveProfile()
    if (pErr) { setMsg('프로필 저장 실패: ' + pErr.message); setBusy(false); return }

    // 1) 코드로 그룹 찾기
    let res = await supabase.from('groups')
      .select('id,name,invite_code,created_by,alarm_mode,fixed_times,random_start,random_end,window_min')
      .eq('invite_code', code.trim().toUpperCase())
      .single()
    if (res.error || !res.data) { setMsg('그 코드의 그룹을 찾을 수 없어요.'); setBusy(false); return }
    const group = res.data

    // 2) 멤버로 추가 (이미 있으면 무시하고 통과)
    let res2 = await supabase.from('members')
      .insert({ group_id: group.id, user_id: user.id, display_name: displayName.trim().slice(0, 12), color: myColor })
    const e2 = res2.error
    if (e2 && !String(e2.message).includes('duplicate')) { setMsg(e2.message); setBusy(false); return }

    setBusy(false)
    onReady(group)
  }

  if (loading) return <div style={S.center}>불러오는 중…</div>

  return (
    <div style={S.wrap}>
      <div style={S.top}>
        <div style={S.logoRow}>
          <img src="/logo.svg" alt="닿음" style={S.logoDot} />
          <div style={S.logoName}>닿음</div>
        </div>
        <div style={S.h}>그룹으로 시작해요</div>
        <div style={S.sub}>가족이나 친구와 함께 안부를 나눠요</div>
      </div>

      <div style={S.form}>
        {myGroups.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={S.label}>내 그룹</div>
            {myGroups.map(g => (
              <button key={g.id} style={{ ...S.groupRow, ...(g.active ? S.groupRowActive : {}) }} onClick={() => onReady(g)}>
                <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {g.active && <span style={S.activeDot}>📍</span>}
                  {g.name}
                  {g.active && <span style={S.activeBadge}>안부 진행중</span>}
                </span>
                <span style={S.codeChip}>{g.invite_code}</span>
              </button>
            ))}
            <div style={S.or}>또는 새로 시작</div>
          </div>
        )}

        <div style={S.tabs}>
          <button style={{ ...S.tab, ...(tab === 'create' ? S.tabOn : {}) }} onClick={() => { setTab('create'); setMsg('') }}>그룹 만들기</button>
          <button style={{ ...S.tab, ...(tab === 'join' ? S.tabOn : {}) }} onClick={() => { setTab('join'); setMsg('') }}>초대코드로 참여</button>
        </div>

        <input style={S.input} placeholder="내 이름 (예: 아빠, 민지)" maxLength={12}
          value={displayName} onChange={e => setDisplayName(e.target.value.slice(0, 12))} />

        {tab === 'create' ? (
          <input style={S.input} placeholder="그룹 이름 (예: 우리가족)" maxLength={10}
            value={name} onChange={e => setName(e.target.value.slice(0, 10))} />
        ) : (
          <input style={{ ...S.input, textTransform: 'uppercase' }} placeholder="초대코드 (예: MP-4F2K)"
            value={code} onChange={e => setCode(e.target.value)} />
        )}

        {msg && <div style={S.msg}>{msg}</div>}

        <button style={{ ...S.primary, opacity: busy ? .6 : 1 }} disabled={busy}
          onClick={tab === 'create' ? createGroup : joinGroup}>
          {busy ? '잠시만요…' : (tab === 'create' ? '그룹 만들기' : '참여하기')}
        </button>

        <div style={S.accountRow}>
          <button style={S.accountBtn} onClick={signOut}>로그아웃</button>
          <span style={S.accountSep}>·</span>
          <button style={S.accountBtn} onClick={deleteAccount}>회원 탈퇴</button>
        </div>
      </div>
    </div>
  )
}

const S = {
  center: { minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mp-muted)', fontFamily: "'Outfit',sans-serif" },
  wrap: { minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'var(--mp-bg)', fontFamily: "'Outfit','Gowun Dodum',sans-serif", maxWidth: 480, margin: '0 auto' },
  top: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'calc(env(safe-area-inset-top,0px) + 40px) 32px 32px' },
  form: { padding: '0 24px calc(env(safe-area-inset-bottom,0px) + 32px)' },
  logoRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 },
  logoDot: { width: 40, height: 40, objectFit: 'contain' },
  logoName: { fontSize: 26, fontWeight: 700, letterSpacing: '-.5px', color: 'var(--mp-ink)' },
  h: { fontSize: 22, fontWeight: 700, letterSpacing: '-.4px', marginBottom: 8, color: 'var(--mp-ink)', textAlign: 'center' },
  sub: { fontSize: 14, color: 'var(--mp-muted)', textAlign: 'center' },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--mp-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .4 },
  groupRow: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1.5px solid var(--mp-line)', background: 'var(--mp-card)', borderRadius: 14, padding: '13px 14px', marginBottom: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, color: 'var(--mp-ink)' },
  groupRowActive: { border: '1.5px solid #ff7a45', background: 'var(--mp-card)' },
  activeDot: { fontSize: 14 },
  activeBadge: { fontSize: 11, fontWeight: 700, color: '#ff7a45', background: 'rgba(255,122,69,.12)', borderRadius: 8, padding: '2px 7px' },
  codeChip: { fontSize: 12, fontWeight: 600, color: 'var(--mp-muted)', background: 'var(--mp-card2)', padding: '4px 9px', borderRadius: 20 },
  or: { textAlign: 'center', fontSize: 12, color: 'var(--mp-muted)', margin: '14px 0 0' },
  tabs: { display: 'flex', gap: 6, background: 'var(--mp-card2)', borderRadius: 24, padding: 4, marginBottom: 14 },
  tab: { flex: 1, border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--mp-muted)', padding: 9, borderRadius: 20, cursor: 'pointer' },
  tabOn: { background: 'var(--mp-card)', color: 'var(--mp-ink)', boxShadow: '0 2px 8px rgba(0,0,0,.08)' },
  input: { width: '100%', border: '1.5px solid var(--mp-line)', background: 'var(--mp-card)', color: 'var(--mp-ink)', borderRadius: 14, padding: '14px 16px', fontSize: 15, fontFamily: 'inherit', marginBottom: 10, outline: 'none', boxSizing: 'border-box' },
  msg: { fontSize: 13, color: 'var(--mp-coral)', background: 'var(--mp-card2)', border: '1px solid var(--mp-line)', padding: '10px 12px', borderRadius: 10, margin: '4px 0 12px' },
  accountRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18 },
  accountBtn: { border: 'none', background: 'none', color: 'var(--mp-muted)', fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer', padding: 4 },
  accountSep: { color: 'var(--mp-line2)', fontSize: 12 },
  primary: { width: '100%', border: 'none', borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 8px 20px rgba(255,77,94,.3)' },
}
