// src/Stats.jsx — "우리의 순간들" 통계 (연말 선물의 씨앗)
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function Stats({ user, group, members, onClose }) {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    // 전체 모먼/사진 (DB에 보존된 모든 기록)
    let mres = await supabase.from('moments').select('id,fired_at').eq('group_id', group.id)
    let pres = await supabase.from('posts').select('id,moment_id,user_id,created_at,is_late').eq('group_id', group.id)
    const moments = mres.data || []
    const posts = pres.data || []

    const byMoment = {}
    posts.forEach(p => { (byMoment[p.moment_id] = byMoment[p.moment_id] || new Set()).add(p.user_id) })
    const allJoinedCount = moments.filter(m => (byMoment[m.id] ? byMoment[m.id].size : 0) === members.length && members.length > 0).length

    const byUser = {}
    posts.forEach(p => { byUser[p.user_id] = (byUser[p.user_id] || 0) + 1 })
    const ranking = members.map(m => ({
      name: m.display_name, color: m.color, count: byUser[m.user_id] || 0, me: m.user_id === user.id
    })).sort((a, b) => b.count - a.count)

    const lateCount = posts.filter(p => p.is_late).length

    let days = 0, firstDate = null
    if (moments.length) {
      const first = moments.slice().sort((a, b) => new Date(a.fired_at) - new Date(b.fired_at))[0]
      firstDate = new Date(first.fired_at)
      days = Math.max(1, Math.ceil((Date.now() - firstDate.getTime()) / 86400000))
    }

    setStats({
      totalMoments: moments.length,
      totalPosts: posts.length,
      allJoinedCount, ranking, lateCount, days,
      firstDate: firstDate ? `${firstDate.getFullYear()}.${firstDate.getMonth()+1}.${firstDate.getDate()}` : '-',
    })
    setLoading(false)
  }

  return (
    <div style={S.app}>
      <div style={S.top}>
        <button style={S.back} onClick={onClose}>←</button>
        <div style={S.title}>우리의 순간들</div>
        <div style={{ width: 32 }} />
      </div>

      {loading ? <div style={S.loading}>모아보는 중…</div> : (
        <div style={S.body}>
          <div style={S.hero}>
            <div style={S.heroGlow} />
            <div style={{ position: 'relative', zIndex: 2 }}>
              <div style={S.heroTag}>{group.name}</div>
              <div style={S.heroBig}>{stats.days}일째</div>
              <div style={S.heroSub}>{stats.firstDate}부터 함께</div>
            </div>
          </div>

          <div style={S.cards}>
            <div style={S.statCard}><div style={S.statNum}>{stats.totalMoments}</div><div style={S.statLabel}>📸 함께한 모먼</div></div>
            <div style={S.statCard}><div style={S.statNum}>{stats.totalPosts}</div><div style={S.statLabel}>🖼️ 남긴 순간</div></div>
            <div style={S.statCard}><div style={S.statNum}>{stats.allJoinedCount}</div><div style={S.statLabel}>✨ 전원 참여</div></div>
            <div style={S.statCard}><div style={S.statNum}>{stats.lateCount}</div><div style={S.statLabel}>⏰ 늦참</div></div>
          </div>

          <div style={S.secLabel}>참여 랭킹</div>
          <div style={S.rankCard}>
            {stats.ranking.map((r, i) => (
              <div key={r.name} style={S.rankRow}>
                <div style={S.rankNo}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1)}</div>
                <div style={{ ...S.rankDot, background: r.color }} />
                <div style={{ flex: 1, fontWeight: 600 }}>{r.name}{r.me && <span style={S.meTag}>나</span>}</div>
                <div style={S.rankCount}>{r.count}회</div>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  )
}

const S = {
  app: { width: '100%', maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: 'var(--mp-bg)', fontFamily: "'Outfit','Gowun Dodum',sans-serif", color: 'var(--mp-ink)', paddingBottom: 40 },
  top: { position: 'sticky', top: 0, zIndex: 100, background: 'var(--mp-topbar)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--mp-line)', padding: '13px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 32, height: 32, border: 'none', background: 'var(--mp-card2)', borderRadius: '50%', fontSize: 18, cursor: 'pointer', color: 'var(--mp-ink)' },
  title: { fontWeight: 700, fontSize: 17 },
  loading: { textAlign: 'center', color: 'var(--mp-muted)', padding: 60, fontSize: 14 },
  body: { padding: 16 },
  hero: { position: 'relative', borderRadius: 22, overflow: 'hidden', background: 'linear-gradient(120deg,#16161a,#2a2030)', color: '#fff', padding: '24px 22px', marginBottom: 16, boxShadow: '0 12px 40px rgba(20,20,30,.18)' },
  heroGlow: { position: 'absolute', width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,122,69,.25)', right: -50, top: -50, filter: 'blur(20px)' },
  heroTag: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: .8 },
  heroBig: { fontSize: 34, fontWeight: 700, letterSpacing: '-1px', marginTop: 4 },
  heroSub: { fontSize: 13, opacity: .85, marginTop: 2 },
  cards: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 },
  statCard: { background: 'var(--mp-card)', borderRadius: 16, padding: '18px 16px', boxShadow: '0 4px 24px rgba(20,20,30,.06)', textAlign: 'center' },
  statNum: { fontSize: 30, fontWeight: 700, letterSpacing: '-1px', color: '#ff4d5e' },
  statLabel: { fontSize: 12.5, color: 'var(--mp-sub)', fontWeight: 600, marginTop: 4 },
  secLabel: { fontSize: 12, fontWeight: 600, color: 'var(--mp-muted)', textTransform: 'uppercase', letterSpacing: .4, margin: '4px 4px 10px' },
  rankCard: { background: 'var(--mp-card)', borderRadius: 16, padding: '8px 16px', boxShadow: '0 4px 24px rgba(20,20,30,.06)', marginBottom: 20 },
  rankRow: { display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: '1px solid var(--mp-line)' },
  rankNo: { width: 24, textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--mp-muted)' },
  rankDot: { width: 12, height: 12, borderRadius: '50%', flex: 'none' },
  rankCount: { fontSize: 14, fontWeight: 700, color: 'var(--mp-ink)' },
  meTag: { fontSize: 11, color: 'var(--mp-muted)', fontWeight: 600, marginLeft: 7 },
}
