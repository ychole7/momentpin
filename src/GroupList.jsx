// src/GroupList.jsx — 닿음 그룹 목록·전환 + 만들기/참여 + 그룹별 설정
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
  const [adding, setAdding] = useState(false)
  const [tab, setTab] = useState('create')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [myColor, setMyColor] = useState(randColor())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [settingsGroup, setSettingsGroup] = useState(null)

  useEffect(() => { load(); loadProfile() }, [])

  useEffect(() => {
    if (isActive && !settingsGroup) load({ silent: true })
  }, [isActive])

  async function loadProfile() {
    const res = await supabase.from('profiles').select('display_name,color').eq('user_id', user.id).maybeSingle()
    if (!res.error && res.data) {
      if (res.data.display_name) setDisplayName(res.data.display_name)
      if (res.data.color) setMyColor(res.data.color)
    }
  }

  async function load(opts) {
    const silent = opts && opts.silent
    if (!silent) setLoading(true)
    const res = await supabase
      .from('members')
      .select('group_id, groups(id,name,invite_code,created_by,alarm_mode,fixed_times,random_start,random_end,window_min)')
      .eq('user_id', user.id)

    if (res.error) {
      if (!silent) setLoading(false)
      return
    }

    const list = (res.data || []).map(r => r.groups).filter(Boolean)
    const now = new Date().toISOString()
    const gids = list.map(g => g.id)
    const activeSet = new Set()

    if (gids.length) {
      const mres = await supabase.from('moments').select('group_id')
        .in('group_id', gids).lte('fired_at', now).gte('deadline', now)
      if (!mres.error && mres.data) mres.data.forEach(m => activeSet.add(m.group_id))
    }

    setGroups(list.map(g => ({ ...g, active: activeSet.has(g.id) })))
    setLoading(false)
  }

  async function saveProfile() {
    const res = await supabase.from('profiles').upsert({
      user_id: user.id,
      display_name: displayName.trim().slice(0, 12),
      color: myColor,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    return res.error
  }

  async function createGroup() {
    if (!name.trim() || !displayName.trim()) {
      setMsg('그룹 이름과 내 이름을 입력해 주세요.')
      return
    }
    setBusy(true); setMsg('')

    if (groups.length >= 10) {
      setMsg('그룹은 최대 10개까지 만들 수 있어요.')
      setBusy(false)
      return
    }

    const dup = groups.some(g => g.name.trim().toLowerCase() === name.trim().toLowerCase())
    if (dup) {
      setMsg('이미 같은 이름의 그룹이 있어요.')
      setBusy(false)
      return
    }

    const pErr = await saveProfile()
    if (pErr) {
      setMsg('프로필 저장 실패: ' + pErr.message)
      setBusy(false)
      return
    }

    let group = null
    for (let attempt = 0; attempt < 3 && !group; attempt++) {
      const res = await supabase.from('groups')
        .insert({ name: name.trim(), invite_code: makeCode(), created_by: user.id })
        .select().single()

      if (!res.error) {
        group = res.data
        break
      }
      if (!String(res.error.message).includes('duplicate')) {
        setMsg(res.error.message)
        setBusy(false)
        return
      }
    }

    if (!group) {
      setMsg('초대코드 생성에 실패했어요. 다시 시도해 주세요.')
      setBusy(false)
      return
    }

    const res2 = await supabase.from('members')
      .insert({
        group_id: group.id,
        user_id: user.id,
        display_name: displayName.trim().slice(0, 12),
        color: myColor
      })

    if (res2.error) {
      setMsg(res2.error.message)
      setBusy(false)
      return
    }

    setBusy(false)
    setName('')
    setAdding(false)
    onSelectGroup(group)
  }

  async function joinGroup() {
    if (!code.trim() || !displayName.trim()) {
      setMsg('초대코드와 내 이름을 입력해 주세요.')
      return
    }

    setBusy(true); setMsg('')

    const pErr = await saveProfile()
    if (pErr) {
      setMsg('프로필 저장 실패: ' + pErr.message)
      setBusy(false)
      return
    }

    const res = await supabase.from('groups')
      .select('id,name,invite_code,created_by,alarm_mode,fixed_times,random_start,random_end,window_min')
      .eq('invite_code', code.trim().toUpperCase())
      .single()

    if (res.error || !res.data) {
      setMsg('그 코드의 그룹을 찾을 수 없어요.')
      setBusy(false)
      return
    }

    const group = res.data
    const res2 = await supabase.from('members')
      .insert({
        group_id: group.id,
        user_id: user.id,
        display_name: displayName.trim().slice(0, 12),
        color: myColor
      })

    if (res2.error && !String(res2.error.message).includes('duplicate')) {
      setMsg(res2.error.message)
      setBusy(false)
      return
    }

    setBusy(false)
    setCode('')
    setAdding(false)
    onSelectGroup(group)
  }

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
          if (onCurrentGroupLeave && currentGroup?.id === leftId) onCurrentGroupLeave()
          load()
        }}
        onMemberUpdate={() => { if (onMemberUpdate) onMemberUpdate() }}
      />
    )
  }

  function openAdd(mode = 'create') {
    setTab(mode)
    setAdding(true)
    setMsg('')
  }

  return (
    <div style={S.app}>
      <header style={S.top}>
        <div>
          <div style={S.eyebrow}>함께하는 사람들</div>
          <div style={S.title}>내 그룹</div>
        </div>
        <button style={S.topAdd} onClick={() => openAdd('create')} aria-label="새 그룹 만들기">＋</button>
      </header>

      <main style={S.body}>
        {loading ? (
          <div style={S.loadingCard}>
            <div style={S.loadingDot} />
            <div>
              <div style={S.loadingTitle}>그룹을 불러오는 중</div>
              <div style={S.loadingSub}>잠시만 기다려 주세요.</div>
            </div>
          </div>
        ) : (
          <>
            {groups.length > 0 && (
              <div style={S.sectionHead}>
                <div>
                  <div style={S.sectionTitle}>함께 닿는 그룹</div>
                  <div style={S.sectionSub}>{groups.length}개의 그룹과 함께하고 있어요.</div>
                </div>
              </div>
            )}

            {groups.map(g => {
              const isCurrent = g.id === currentGroup?.id
              const initial = (g.name || '그룹').slice(0, 1)

              return (
                <div key={g.id} style={{ ...S.row, ...(isCurrent ? S.rowActive : {}) }}>
                  <button style={S.rowMain} onClick={() => onSelectGroup(g)}>
                    <div style={{ ...S.avatar, ...(isCurrent ? S.avatarCurrent : {}), ...(g.active ? S.avatarActive : {}) }}>
                      {g.active ? '●' : initial}
                    </div>

                    <div style={S.rowInfo}>
                      <div style={S.rowName}>
                        {g.name}
                        {g.created_by === user.id && <span style={S.owner}>그룹장</span>}
                      </div>

                      <div style={S.rowSub}>
                        <span style={S.codeText}>{g.invite_code}</span>
                        <span style={S.dot}>·</span>
                        {g.active
                          ? <span style={S.activeBadge}>안부 진행 중</span>
                          : <span style={S.waitText}>다음 안부를 기다리는 중</span>}
                      </div>
                    </div>

                    {isCurrent && <span style={S.currentChip}>현재</span>}
                    <span style={S.arrow}>›</span>
                  </button>

                  <button style={S.gearBtn} onClick={() => setSettingsGroup(g)} aria-label={`${g.name} 그룹 설정`}>
                    <span style={S.gearGlyph}>⚙</span>
                  </button>
                </div>
              )
            })}

            {!adding ? (
              <button style={S.addBtn} onClick={() => openAdd('create')}>
                <span style={S.addIcon}>＋</span>
                <span>
                  <strong style={S.addTitle}>새 그룹 만들기 / 참여하기</strong>
                  <small style={S.addSub}>가족·친구와 함께 닿을 그룹을 만들어보세요.</small>
                </span>
                <span style={S.addArrow}>›</span>
              </button>
            ) : (
              <section style={S.addCard}>
                <div style={S.addHead}>
                  <div>
                    <div style={S.addKicker}>GROUP</div>
                    <div style={S.addTitleLarge}>{tab === 'create' ? '새 그룹 만들기' : '초대코드로 참여하기'}</div>
                  </div>
                  <button style={S.addClose} onClick={() => { setAdding(false); setMsg('') }} aria-label="닫기">×</button>
                </div>

                <div style={S.tabs}>
                  <button style={{ ...S.tab, ...(tab === 'create' ? S.tabOn : {}) }} onClick={() => { setTab('create'); setMsg('') }}>새로 만들기</button>
                  <button style={{ ...S.tab, ...(tab === 'join' ? S.tabOn : {}) }} onClick={() => { setTab('join'); setMsg('') }}>초대코드 참여</button>
                </div>

                <label style={S.fieldLabel}>내 이름</label>
                <input
                  style={S.input}
                  placeholder="예: 아빠, 민지"
                  maxLength={12}
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value.slice(0, 12))}
                />

                {tab === 'create' ? (
                  <>
                    <label style={S.fieldLabel}>그룹 이름</label>
                    <input
                      style={S.input}
                      placeholder="예: 우리가족"
                      maxLength={10}
                      value={name}
                      onChange={e => setName(e.target.value.slice(0, 10))}
                    />
                  </>
                ) : (
                  <>
                    <label style={S.fieldLabel}>초대코드</label>
                    <input
                      style={{ ...S.input, textTransform: 'uppercase', letterSpacing: 1.2 }}
                      placeholder="예: MP-4F2K"
                      value={code}
                      onChange={e => setCode(e.target.value)}
                    />
                  </>
                )}

                {msg && <div style={S.msg}>{msg}</div>}

                <button
                  style={{ ...S.primary, opacity: busy ? .6 : 1 }}
                  disabled={busy}
                  onClick={tab === 'create' ? createGroup : joinGroup}
                >
                  {busy ? '잠시만요…' : (tab === 'create' ? '그룹 만들기' : '그룹 참여하기')}
                </button>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

const S = {
  center: { textAlign: 'center', color: 'var(--mp-muted)', padding: 40, fontSize: 14 },

  app: {
    width: '100%',
    maxWidth: 480,
    margin: '0 auto',
    minHeight: '100dvh',
    background: 'var(--mp-bg)',
    fontFamily: "'Outfit','Gowun Dodum',sans-serif",
    color: 'var(--mp-ink)',
    paddingBottom: 110,
    boxSizing: 'border-box',
    overflowX: 'hidden'
  },

  top: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'rgba(250,250,248,.94)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    borderBottom: '1px solid rgba(30,39,70,.08)',
    padding: 'max(calc(env(safe-area-inset-top,0px) + 16px), 16px) 24px 16px',
    boxSizing: 'border-box'
  },

  eyebrow: {
    color: 'var(--mp-muted)',
    fontSize: 11,
    fontWeight: 650,
    letterSpacing: .3,
    marginBottom: 2
  },

  title: {
    fontWeight: 800,
    fontSize: 24,
    letterSpacing: '-.7px',
    color: 'var(--mp-ink)'
  },

  topAdd: {
    width: 42,
    height: 42,
    border: '1px solid rgba(30,39,70,.10)',
    borderRadius: 14,
    background: 'var(--mp-card)',
    color: 'var(--mp-ink)',
    fontSize: 24,
    lineHeight: 1,
    fontWeight: 400,
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(30,39,70,.06)'
  },

  body: { padding: '24px 24px 30px', boxSizing: 'border-box' },

  sectionHead: { margin: '2px 2px 12px' },
  sectionTitle: { fontSize: 16, fontWeight: 780, color: 'var(--mp-ink)', letterSpacing: '-.3px' },
  sectionSub: { marginTop: 4, fontSize: 12, color: 'var(--mp-muted)' },

  loadingCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'var(--mp-card)',
    border: '1px solid var(--mp-line)',
    borderRadius: 20,
    padding: 18,
    boxShadow: '0 8px 26px rgba(30,39,70,.05)'
  },
  loadingDot: {
    width: 38, height: 38, borderRadius: 12,
    background: 'linear-gradient(135deg,#fff4da,#f5e7bf)',
    flex: 'none'
  },
  loadingTitle: { fontSize: 14, fontWeight: 700, color: 'var(--mp-ink)' },
  loadingSub: { marginTop: 3, fontSize: 12, color: 'var(--mp-muted)' },

  row: {
    position: 'relative',
    width: '100%',
    display: 'flex',
    alignItems: 'stretch',
    gap: 8,
    border: '1px solid rgba(30,39,70,.10)',
    background: 'var(--mp-card)',
    borderRadius: 22,
    padding: 8,
    marginBottom: 12,
    boxSizing: 'border-box',
    boxShadow: '0 7px 22px rgba(30,39,70,.055)'
  },

  rowActive: {
    borderColor: 'rgba(255,92,91,.72)',
    boxShadow: '0 8px 28px rgba(255,92,91,.12)'
  },

  rowMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 13,
    border: 'none',
    background: 'none',
    fontFamily: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
    padding: '10px 7px'
  },

  avatar: {
    width: 52,
    height: 52,
    borderRadius: 17,
    background: '#f0f1f4',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 19,
    fontWeight: 800,
    color: '#687184',
    flex: 'none'
  },

  avatarCurrent: { background: '#fff0ec', color: '#ff5c5b' },
  avatarActive: { background: '#fff1e4', color: '#d08a32' },

  rowInfo: { minWidth: 0, flex: 1 },

  rowName: {
    fontWeight: 800,
    fontSize: 17,
    color: 'var(--mp-ink)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },

  owner: {
    fontSize: 10,
    fontWeight: 700,
    color: '#a57a2c',
    background: '#fff5dc',
    borderRadius: 7,
    padding: '3px 6px',
    flex: 'none'
  },

  rowSub: {
    marginTop: 7,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap'
  },

  codeText: { fontSize: 11.5, color: 'var(--mp-muted)', fontWeight: 650, letterSpacing: .4 },
  dot: { color: '#c6cad2', fontSize: 10 },
  waitText: { fontSize: 11.5, color: 'var(--mp-muted)', fontWeight: 550 },

  activeBadge: {
    fontSize: 11,
    fontWeight: 750,
    color: '#c17920',
    background: '#fff5df',
    borderRadius: 8,
    padding: '4px 7px'
  },

  currentChip: {
    position: 'static',
    fontSize: 10,
    fontWeight: 800,
    color: '#ff5c5b',
    background: '#fff0ec',
    padding: '4px 7px',
    borderRadius: 8
  },

  arrow: { fontSize: 26, color: '#c4c8d0', fontWeight: 300, lineHeight: 1, marginLeft: 'auto' },

  gearBtn: {
    flex: 'none',
    width: 46,
    border: 'none',
    background: '#f5f6f7',
    borderRadius: 16,
    cursor: 'pointer',
    color: '#7e8796',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },

  gearGlyph: { fontSize: 17, lineHeight: 1 },

  addBtn: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 13,
    border: '1.5px dashed #d4d7df',
    background: 'rgba(255,255,255,.72)',
    color: 'var(--mp-sub)',
    borderRadius: 20,
    padding: '15px 16px',
    marginTop: 2,
    fontFamily: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    boxSizing: 'border-box'
  },

  addIcon: {
    width: 42, height: 42, borderRadius: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#fff5dc', color: '#b18437', fontSize: 23, flex: 'none'
  },

  addTitle: { display: 'block', fontSize: 14, fontWeight: 750, color: 'var(--mp-ink)' },
  addSub: { display: 'block', marginTop: 3, fontSize: 11.5, color: 'var(--mp-muted)' },
  addArrow: { marginLeft: 'auto', fontSize: 25, color: '#c0a15d', fontWeight: 300 },

  addCard: {
    border: '1px solid rgba(30,39,70,.10)',
    background: 'var(--mp-card)',
    borderRadius: 24,
    padding: 20,
    marginTop: 4,
    boxShadow: '0 10px 30px rgba(30,39,70,.07)'
  },

  addHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 17
  },

  addKicker: {
    fontSize: 10,
    fontWeight: 800,
    color: '#b08a3e',
    letterSpacing: 1.2,
    marginBottom: 3
  },

  addTitleLarge: { fontWeight: 800, fontSize: 20, letterSpacing: '-.5px' },

  addClose: {
    width: 34, height: 34, border: 'none',
    background: '#f3f4f6', borderRadius: 12,
    fontSize: 22, cursor: 'pointer', color: '#737b8a'
  },

  tabs: {
    display: 'flex',
    gap: 4,
    background: '#eef0f3',
    borderRadius: 15,
    padding: 4,
    marginBottom: 19
  },

  tab: {
    flex: 1,
    border: 'none',
    background: 'none',
    fontFamily: 'inherit',
    fontSize: 12.5,
    fontWeight: 650,
    color: 'var(--mp-muted)',
    padding: 10,
    borderRadius: 12,
    cursor: 'pointer'
  },

  tabOn: {
    background: 'var(--mp-card)',
    color: 'var(--mp-ink)',
    boxShadow: '0 2px 8px rgba(30,39,70,.09)'
  },

  fieldLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--mp-sub)',
    margin: '0 2px 7px'
  },

  input: {
    width: '100%',
    border: '1px solid #dfe2e8',
    background: '#fbfbfa',
    color: 'var(--mp-ink)',
    borderRadius: 15,
    padding: '14px 15px',
    fontSize: 15,
    fontFamily: 'inherit',
    marginBottom: 14,
    outline: 'none',
    boxSizing: 'border-box'
  },

  msg: {
    fontSize: 12.5,
    color: 'var(--mp-coral)',
    background: '#fff4f2',
    border: '1px solid #ffd8d3',
    padding: '11px 12px',
    borderRadius: 12,
    margin: '0 0 13px'
  },

  primary: {
    width: '100%',
    border: 'none',
    borderRadius: 15,
    padding: 15,
    fontSize: 15,
    fontWeight: 750,
    fontFamily: 'inherit',
    cursor: 'pointer',
    color: '#fff',
    background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)',
    boxShadow: '0 8px 20px rgba(255,77,94,.22)'
  }
}
