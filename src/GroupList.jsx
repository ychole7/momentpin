// src/GroupList.jsx — 하단 탭 "그룹": 내 그룹 목록, 전환, 새 그룹 만들기/참여 진입
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function GroupList({ user, currentGroup, onSelectGroup, onCreateNew }) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    let res = await supabase
      .from('members')
      .select('group_id, groups(id,name,invite_code,created_by,alarm_mode,fixed_times,random_start,random_end,window_min)')
      .eq('user_id', user.id)
    if (res.error) { setLoading(false); return }
    const list = (res.data || []).map(r => r.groups).filter(Boolean)

    // 진행중인 안부가 있는 그룹 표시
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

  if (loading) return <div style={S.center}>불러오는 중…</div>

  return (
    <div style={S.app}>
      <div style={S.top}>
        <div style={S.title}>내 그룹</div>
      </div>

      <div style={S.body}>
        {groups.map(g => (
          <button key={g.id} style={{ ...S.row, ...(g.id === currentGroup?.id ? S.rowActive : {}) }}
            onClick={() => onSelectGroup(g)}>
            <div style={S.rowMain}>
              <span style={S.rowName}>
                {g.active && <span style={S.activeDot}>📍</span>}
                {g.name}
              </span>
              <span style={S.rowMeta}>
                {g.id === currentGroup?.id && <span style={S.current}>현재</span>}
                {g.created_by === user.id && <span style={S.owner}>👑</span>}
                {g.active && <span style={S.activeBadge}>안부 진행중</span>}
              </span>
            </div>
            <span style={S.codeChip}>{g.invite_code}</span>
          </button>
        ))}

        <button style={S.addBtn} onClick={onCreateNew}>＋ 새 그룹 만들기 / 참여하기</button>
      </div>
    </div>
  )
}

const S = {
  center: { minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mp-muted)', fontFamily: "'Outfit',sans-serif" },
  app: { width: '100%', maxWidth: 480, margin: '0 auto', minHeight: '100dvh', background: 'var(--mp-bg)', fontFamily: "'Outfit','Gowun Dodum',sans-serif", color: 'var(--mp-ink)', paddingBottom: 90 },
  top: { position: 'sticky', top: 0, zIndex: 100, background: 'var(--mp-topbar)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--mp-line)', padding: 'max(calc(env(safe-area-inset-top,0px) + 13px), 13px) 18px 13px' },
  title: { fontWeight: 700, fontSize: 20, letterSpacing: '-.4px' },
  body: { padding: 16 },
  row: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1.5px solid var(--mp-line)', background: 'var(--mp-card)', borderRadius: 16, padding: '16px 16px', marginBottom: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' },
  rowActive: { border: '1.5px solid #ff7a45' },
  rowMain: { display: 'flex', flexDirection: 'column', gap: 6 },
  rowName: { fontWeight: 700, fontSize: 16, color: 'var(--mp-ink)', display: 'flex', alignItems: 'center', gap: 6 },
  rowMeta: { display: 'flex', alignItems: 'center', gap: 6 },
  activeDot: { fontSize: 14 },
  activeBadge: { fontSize: 11, fontWeight: 700, color: '#ff7a45', background: 'rgba(255,122,69,.12)', borderRadius: 8, padding: '2px 7px' },
  current: { fontSize: 11, fontWeight: 700, color: '#ff4d5e', background: '#fff1ed', padding: '2px 8px', borderRadius: 8 },
  owner: { fontSize: 13 },
  codeChip: { fontSize: 12, fontWeight: 600, color: 'var(--mp-muted)', background: 'var(--mp-card2)', padding: '4px 9px', borderRadius: 20, flex: 'none', marginLeft: 10 },
  addBtn: { width: '100%', border: '1.5px dashed var(--mp-line2)', background: 'var(--mp-card)', color: 'var(--mp-sub)', borderRadius: 16, padding: 16, marginTop: 6, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
}
