// src/GroupList.jsx — 하단 탭 "그룹": 내 그룹 목록·전환 + 만들기/참여 + 그룹별 설정을 한 화면에서
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import GroupSettings from './GroupSettings'

const COLORS = ['#ff4d5e', '#13bca4', '#e0972e', '#5b8def', '#9c4dcc', '#2a9d5a']
const randColor = () => COLORS[Math.floor(Math.random() * COLORS.length)]

function makeCode() {
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 4; i++) s += ch[Math.floor(Math.random() * ch.length)]
  return 'MP-' + s
}

export default function GroupList({ user, currentGroup, isActive, onSelectGroup, onGroupUpdate, onCurrentGroupLeave, onMemberUpdate }) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)        // 추가 폼 펼침 여부
  const [tab, setTab] = useState('create')            // 'create' | 'join'
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [myColor, setMyColor] = useState(randColor())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [settingsGroup, setSettingsGroup] = useState(null)  // 설정 화면에서 보고 있는 그룹 (null이면 목록)

  useEffect(() => { load(); loadProfile() }, [])

  // 컴포넌트는 계속 마운트 상태로 유지되므로(탭 전환 시 언마운트 안 됨),
  // "그룹" 탭이 다시 활성화될 때마다 안부 진행 상태 등 최신 정보를 조용히 재조회한다.
  // (loading 화면 없이 백그라운드로 갱신 — 이미 본 목록이 깜빡이지 않게)
  useEffect(() => {
    if (isActive && !settingsGroup) load({ silent: true })
  }, [isActive])

  async function loadProfile() {
    let res = await supabase.from('profiles').select('display_name,color').eq('user_id', user.id).maybeSingle()
    if (!res.error && res.data) {
      if (res.data.display_name) setDisplayName(res.data.display_name)
      if (res.data.color) setMyColor(res.data.color)
    }
  }

  async function load(opts) {
    const silent = opts && opts.silent
    if (!silent) setLoading(true)
    let res = await supabase
      .from('members')
      .select('group_id, groups(id,name,invite_code,created_by,alarm_mode,fixed_times,random_start,random_end,window_min)')
      .eq('user_id', user.id)
    if (res.error) { if (!silent) setLoading(false); return }
    const list = (res.data || []).map(r => r.groups).filter(Boolean)

    const now = new Date().toISOString()
    const gids = list.map(g => g.id)
    let activeSet = new Set()
    if (gids.length) {
      let mres = await supabase.from('moments').select('group_id')
        .in('group_id', gids).lte('fired_at', now).gte('deadline', now)
      if (!mres.error && mres.data) mres.data.forEach(m => activeSet.add(m.group_id))
    }
    setGroups(list.map(g => ({ ...g, active: activeSet.has(g.id) })))
    setLoading(false)
  }

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
    if (groups.length >= 10) { setMsg('그룹은 최대 10개까지 만들 수 있어요.'); setBusy(false); return }
    const dup = groups.some(g => g.name.trim().toLowerCase() === name.trim().toLowerCase())
    if (dup) { setMsg('이미 같은 이름의 그룹이 있어요.'); setBusy(false); return }
    const pErr = await saveProfile()
    if (pErr) { setMsg('프로필 저장 실패: ' + pErr.message); setBusy(false); return }

    let group = null
    for (let attempt = 0; attempt < 3 && !group; attempt++) {
      let res = await supabase.from('groups')
        .insert({ name: name.trim(), invite_code: makeCode(), created_by: user.id })
        .select().single()
      if (!res.error) { group = res.data; break }
      if (!String(res.error.message).includes('duplicate')) { setMsg(res.error.message); setBusy(false); return }
    }
    if (!group) { setMsg('초대코드 생성에 실패했어요. 다시 시도해 주세요.'); setBusy(false); return }

    let res2 = await supabase.from('members')
      .insert({ group_id: group.id, user_id: user.id, display_name: displayName.trim().slice(0, 12), color: myColor })
    if (res2.error) { setMsg(res2.error.message); setBusy(false); return }

    setBusy(false); setName(''); setAdding(false)
    onSelectGroup(group)
  }

  async function joinGroup() {
    if (!code.trim() || !displayName.trim()) { setMsg('초대코드와 내 이름을 입력해 주세요.'); return }
    setBusy(true); setMsg('')
    const pErr = await saveProfile()
    if (pErr) { setMsg('프로필 저장 실패: ' + pErr.message); setBusy(false); return }

    let res = await supabase.from('groups')
      .select('id,name,invite_code,created_by,alarm_mode,fixed_times,random_start,random_end,window_min')
      .eq('invite_code', code.trim().toUpperCase())
      .single()
    if (res.error || !res.data) { setMsg('그 코드의 그룹을 찾을 수 없어요.'); setBusy(false); return }
    const group = res.data

    let res2 = await supabase.from('members')
      .insert({ group_id: group.id, user_id: user.id, display_name: displayName.trim().slice(0, 12), color: myColor })
    if (res2.error && !String(res2.error.message).includes('duplicate')) { setMsg(res2.error.message); setBusy(false); return }

    setBusy(false); setCode(''); setAdding(false)
    onSelectGroup(group)
  }

  // 설정 화면 보는 중이면 GroupSettings를 렌더 (같은 "그룹" 탭 안에서 화면만 전환)
  if (settingsGroup) {
    return (
      <GroupSettings
        user={user}
        group={settingsGroup}
        onClose={() => setSettingsGroup(null)}
        onGroupUpdate={(updated) => {
          setSettingsGroup(updated)
          setGroups(prev => prev.map(g => g.id === updated.id ? { ...g, ...updated } : g))
          if (onGroupUpdate && currentGroup?.id === updated.id) onGroupUpdate(updated)
        }}
        onLeaveGroup={() => {
          const leftId = settingsGroup.id
          setSettingsGroup(null)
          setGroups(prev => prev.filter(g => g.id !== leftId))
          // 지금 활성 중인 그룹을 나갔다면 상위(App)에 알려 홈 상태를 정리
          if (onCurrentGroupLeave && currentGroup?.id === leftId) onCurrentGroupLeave()
          load()
        }}
        onMemberUpdate={() => { if (onMemberUpdate) onMemberUpdate() }}
      />
    )
  }

  return (
    <div style={S.app}>
      <div style={S.top}>
        <div style={S.title}>내 그룹</div>
      </div>

      <div style={S.body}>
        {loading ? (
          <div style={S.center}>불러오는 중…</div>
        ) : (
          <>
            {groups.map(g => {
              const isCurrent = g.id === currentGroup?.id
              return (
                <div key={g.id} style={{ ...S.row, ...(isCurrent ? S.rowActive : {}) }}>
                  <button style={S.rowMain} onClick={() => onSelectGroup(g)}>
                    <div style={S.rowLeft}>
                      <div style={{ ...S.avatar, ...(g.active ? S.avatarActive : {}) }}>
                        {g.active ? '📍' : g.name.slice(0, 1)}
                      </div>
                      <div style={S.rowInfo}>
                        <div style={S.rowName}>
                          {g.name}
                          {g.created_by === user.id && <span style={S.owner}>👑</span>}
                        </div>
                        <div style={S.rowSub}>
                          {g.active
                            ? <span style={S.activeBadge}>안부 진행중</span>
                            : <span style={S.codeText}>{g.invite_code}</span>}
                        </div>
                      </div>
                    </div>
                    {isCurrent && <span style={S.currentChip}>현재</span>}
                  </button>
                  <button style={S.gearBtn} onClick={() => setSettingsGroup(g)} aria-label="그룹 설정">⚙️</button>
                </div>
              )
            })}

            {!adding ? (
              <button style={S.addBtn} onClick={() => { setAdding(true); setMsg('') }}>
                <span style={S.addPlus}>＋</span> 새 그룹 만들기 / 참여하기
              </button>
            ) : (
              <div style={S.addCard}>
                <div style={S.addHead}>
                  <div style={S.addTitle}>새 그룹</div>
                  <button style={S.addClose} onClick={() => { setAdding(false); setMsg('') }}>✕</button>
                </div>

                <div style={S.tabs}>
                  <button style={{ ...S.tab, ...(tab === 'create' ? S.tabOn : {}) }} onClick={() => { setTab('create'); setMsg('') }}>만들기</button>
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const S = {
  center: { textAlign: 'center', color: 'var(--mp-muted)', padding: 40, fontSize: 14 },
  app: { width: '100%', maxWidth: 480, margin: '0 auto', minHeight: '100dvh', background: 'var(--mp-bg)', fontFamily: "'Outfit','Gowun Dodum',sans-serif", color: 'var(--mp-ink)', paddingBottom: 90, boxSizing: 'border-box', overflowX: 'hidden' },
  top: { position: 'sticky', top: 0, zIndex: 100, background: 'var(--mp-topbar)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--mp-line)', padding: 'max(calc(env(safe-area-inset-top,0px) + 14px), 14px) 18px 14px', boxSizing: 'border-box' },
  title: { fontWeight: 700, fontSize: 20, letterSpacing: '-.4px' },
  body: { padding: 16, boxSizing: 'border-box' },
  row: { width: '100%', display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid var(--mp-line)', background: 'var(--mp-card)', borderRadius: 16, padding: '6px 8px 6px 14px', marginBottom: 10, boxSizing: 'border-box' },
  rowActive: { borderColor: '#ff7a45', boxShadow: '0 4px 16px rgba(255,122,69,.12)' },
  rowMain: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: 'none', background: 'none', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', padding: '8px 4px' },
  gearBtn: { flex: 'none', width: 40, height: 40, border: 'none', background: 'var(--mp-card2)', borderRadius: 12, fontSize: 16, cursor: 'pointer' },
  rowLeft: { display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  avatar: { width: 44, height: 44, borderRadius: 14, background: 'var(--mp-card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: 'var(--mp-sub)', flex: 'none' },
  avatarActive: { background: 'rgba(255,122,69,.14)' },
  rowInfo: { minWidth: 0, flex: 1 },
  rowName: { fontWeight: 700, fontSize: 16, color: 'var(--mp-ink)', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  owner: { fontSize: 13 },
  rowSub: { marginTop: 3 },
  codeText: { fontSize: 12.5, color: 'var(--mp-muted)', fontWeight: 600, letterSpacing: .3 },
  activeBadge: { fontSize: 11, fontWeight: 700, color: '#ff7a45', background: 'rgba(255,122,69,.12)', borderRadius: 8, padding: '2px 8px' },
  currentChip: { fontSize: 11, fontWeight: 700, color: '#ff4d5e', background: '#fff1ed', padding: '4px 10px', borderRadius: 10, flex: 'none' },
  goArrow: { fontSize: 22, color: 'var(--mp-line2)', fontWeight: 400, flex: 'none', paddingRight: 2 },
  addBtn: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: '1.5px dashed var(--mp-line2)', background: 'var(--mp-card)', color: 'var(--mp-sub)', borderRadius: 16, padding: 16, marginTop: 4, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  addPlus: { fontSize: 17, fontWeight: 700 },
  addCard: { border: '1.5px solid var(--mp-line)', background: 'var(--mp-card)', borderRadius: 16, padding: 16, marginTop: 4 },
  addHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  addTitle: { fontWeight: 700, fontSize: 16 },
  addClose: { width: 28, height: 28, border: 'none', background: 'var(--mp-card2)', borderRadius: '50%', fontSize: 13, cursor: 'pointer', color: 'var(--mp-muted)' },
  tabs: { display: 'flex', gap: 6, background: 'var(--mp-card2)', borderRadius: 24, padding: 4, marginBottom: 14 },
  tab: { flex: 1, border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--mp-muted)', padding: 9, borderRadius: 20, cursor: 'pointer' },
  tabOn: { background: 'var(--mp-card)', color: 'var(--mp-ink)', boxShadow: '0 2px 8px rgba(0,0,0,.08)' },
  input: { width: '100%', border: '1.5px solid var(--mp-line)', background: 'var(--mp-card)', color: 'var(--mp-ink)', borderRadius: 14, padding: '14px 16px', fontSize: 15, fontFamily: 'inherit', marginBottom: 10, outline: 'none', boxSizing: 'border-box' },
  msg: { fontSize: 13, color: 'var(--mp-coral)', background: 'var(--mp-card2)', border: '1px solid var(--mp-line)', padding: '10px 12px', borderRadius: 10, margin: '4px 0 12px' },
  primary: { width: '100%', border: 'none', borderRadius: 14, padding: 15, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 8px 20px rgba(255,77,94,.3)' },
}
