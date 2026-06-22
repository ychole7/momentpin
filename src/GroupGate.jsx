// src/GroupGate.jsx
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

const COLORS = ['#ff4d5e', '#13bca4', '#e0972e', '#5b8def', '#9c4dcc', '#2a9d5a']
const randColor = () => COLORS[Math.floor(Math.random() * COLORS.length)]

function makeCode() {
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 4; i++) s += ch[Math.floor(Math.random() * ch.length)]
  return 'MP-' + s
}

export default function GroupGate({ user, onReady }) {
  const [loading, setLoading] = useState(true)
  const [myGroups, setMyGroups] = useState([])
  const [tab, setTab] = useState('create')
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadMyGroups() }, [])

  async function loadMyGroups() {
    setLoading(true)
    let res = await supabase
      .from('members')
      .select('group_id, display_name, groups(id,name,invite_code)')
      .eq('user_id', user.id)
    const error = res.error
    if (error) { setMsg(error.message); setLoading(false); return }
    setMyGroups((res.data || []).map(r => r.groups).filter(Boolean))
    setLoading(false)
  }

  async function createGroup() {
    if (!name.trim() || !displayName.trim()) { setMsg('그룹 이름과 내 이름을 입력해 주세요.'); return }
    setBusy(true); setMsg('')

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
      .insert({ group_id: group.id, user_id: user.id, display_name: displayName.trim(), color: randColor() })
    const e2 = res2.error
    if (e2) { setMsg(e2.message); setBusy(false); return }

    setBusy(false)
    onReady(group)
  }

  async function joinGroup() {
    if (!code.trim() || !displayName.trim()) { setMsg('초대코드와 내 이름을 입력해 주세요.'); return }
    setBusy(true); setMsg('')

    let res = await supabase.from('groups')
      .select('id,name,invite_code')
      .eq('invite_code', code.trim().toUpperCase())
      .single()
    if (res.error || !res.data) { setMsg('그 코드의 그룹을 찾을 수 없어요.'); setBusy(false); return }
    const group = res.data

    let res2 = await supabase.from('members')
      .insert({ group_id: group.id, user_id: user.id, display_name: displayName.trim(), color: randColor() })
    const e2 = res2.error
    if (e2 && !String(e2.message).includes('duplicate')) { setMsg(e2.message); setBusy(false); return }

    setBusy(false)
    onReady(group)
  }

  if (loading) return <div style={S.center}>불러오는 중…</div>

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <div style={S.h}>모먼핀 그룹</div>

        {myGroups.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={S.label}>내 그룹</div>
            {myGroups.map(g => (
              <button key={g.id} style={S.groupRow} onClick={() => onReady(g)}>
                <span style={{ fontWeight: 700 }}>{g.name}</span>
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

        <input style={S.input} placeholder="내 이름 (예: 아빠, 민지)"
          value={displayName} onChange={e => setDisplayName(e.target.value)} />

        {tab === 'create' ? (
          <input style={S.input} placeholder="그룹 이름 (예: 우리가족)"
            value={name} onChange={e => setName(e.target.value)} />
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
    </div>
  )
}

const S = {
  center: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9b9ba3', fontFamily: "'Outfit',sans-serif" },
  wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', padding: 20, fontFamily: "'Outfit','Gowun Dodum',sans-serif" },
  card: { width: '100%', maxWidth: 380, background: '#fff', borderRadius: 24, padding: 24, boxShadow: '0 12px 40px rgba(20,20,30,.1)' },
  h: { fontSize: 20, fontWeight: 700, letterSpacing: '-.4px', marginBottom: 18, color: '#16161a' },
  label: { fontSize: 12, fontWeight: 600, color: '#9b9ba3', marginBottom: 8, textTransform: 'uppercase', letterSpacing: .4 },
  groupRow: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1.5px solid #efeff2', background: '#fff', borderRadius: 14, padding: '13px 14px', marginBottom: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, color: '#16161a' },
  codeChip: { fontSize: 12, fontWeight: 600, color: '#9b9ba3', background: '#f4f4f6', padding: '4px 9px', borderRadius: 20 },
  or: { textAlign: 'center', fontSize: 12, color: '#c4c4cc', margin: '14px 0 0' },
  tabs: { display: 'flex', gap: 6, background: '#f0f0f3', borderRadius: 24, padding: 4, marginBottom: 14 },
  tab: { flex: 1, border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#9b9ba3', padding: 9, borderRadius: 20, cursor: 'pointer' },
  tabOn: { background: '#fff', color: '#16161a', boxShadow: '0 2px 8px rgba(0,0,0,.08)' },
  input: { width: '100%', border: '1.5px solid #efeff2', borderRadius: 12, padding: '13px 14px', fontSize: 15, fontFamily: 'inherit', marginBottom: 10, outline: 'none', boxSizing: 'border-box' },
  msg: { fontSize: 13, color: '#e0593c', background: '#fff1ed', padding: '10px 12px', borderRadius: 10, margin: '4px 0 12px' },
  primary: { width: '100%', border: 'none', borderRadius: 14, padding: 15, fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 8px 20px rgba(255,77,94,.3)' },
}