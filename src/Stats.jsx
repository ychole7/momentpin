// src/Stats.jsx — 우리의 순간들 (상용화 UI v2)
// 기존 통계 로직을 유지하면서, 실제 사진/순간 타임라인을 추가한 버전
import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

export default function Stats({ user, group, members, onClose }) {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [moments, setMoments] = useState([])
  const [selected, setSelected] = useState(null)
  const [photoUrl, setPhotoUrl] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    // 기존 페이지와 동일하게 DB의 전체 기록을 기준으로 통계를 계산합니다.
    const [mres, pres] = await Promise.all([
      supabase.from('moments').select('id,fired_at').eq('group_id', group.id).order('fired_at', { ascending: false }),
      supabase.from('posts').select('id,moment_id,user_id,img_back,place_label,created_at,is_late').eq('group_id', group.id).order('created_at', { ascending: false }),
    ])

    const allMoments = mres.data || []
    const posts = pres.data || []

    const byMoment = {}
    posts.forEach(p => { (byMoment[p.moment_id] = byMoment[p.moment_id] || new Set()).add(p.user_id) })
    const allJoinedCount = allMoments.filter(m => (byMoment[m.id] ? byMoment[m.id].size : 0) === members.length && members.length > 0).length

    const byUser = {}
    posts.forEach(p => { byUser[p.user_id] = (byUser[p.user_id] || 0) + 1 })
    const ranking = members.map(m => ({
      name: m.display_name,
      color: m.color,
      count: byUser[m.user_id] || 0,
      me: m.user_id === user.id,
    })).sort((a, b) => b.count - a.count)

    const lateCount = posts.filter(p => p.is_late).length

    let days = 0
    let firstDate = null
    if (allMoments.length) {
      const first = allMoments.slice().sort((a, b) => new Date(a.fired_at) - new Date(b.fired_at))[0]
      firstDate = new Date(first.fired_at)
      days = Math.max(1, Math.ceil((Date.now() - firstDate.getTime()) / 86400000))
    }

    // 같은 사용자의 중복 표시를 피하면서 최근 순간을 구성합니다.
    // 사진이 있는 기록을 우선하고, 최대 12개만 화면에 로드해 모바일 부담을 줄입니다.
    const recentPosts = posts.slice(0, 12)
    const withUrls = await Promise.all(recentPosts.map(async p => {
      let url = ''
      if (p.img_back) {
        const s = await supabase.storage.from('moments').createSignedUrl(p.img_back, 3600)
        if (!s.error && s.data) url = s.data.signedUrl
      }
      return { ...p, photoUrl: url }
    }))

    setMoments(withUrls)
    setStats({
      totalMoments: allMoments.length,
      totalPosts: posts.length,
      allJoinedCount,
      ranking,
      lateCount,
      days,
      firstDate: firstDate ? `${firstDate.getFullYear()}.${firstDate.getMonth() + 1}.${firstDate.getDate()}` : '-',
    })
    setLoading(false)
  }

  useEffect(() => {
    let alive = true
    if (!selected) { setPhotoUrl(''); return undefined }
    if (selected.photoUrl) { setPhotoUrl(selected.photoUrl); return undefined }
    if (!selected.img_back) { setPhotoUrl(''); return undefined }
    supabase.storage.from('moments').createSignedUrl(selected.img_back, 3600).then(s => {
      if (alive && !s.error && s.data) setPhotoUrl(s.data.signedUrl)
    })
    return () => { alive = false }
  }, [selected])

  function nameOf(uid) {
    const m = members.find(x => x.user_id === uid)
    return m ? m.display_name : '?'
  }

  function formatDate(ts) {
    const d = new Date(ts)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }

  function formatTime(ts) {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div style={S.app}>
      <div style={S.top}>
        <button style={S.back} onClick={onClose} aria-label="뒤로가기">←</button>
        <div style={S.title}>우리의 순간들</div>
        <div style={{ width: 36 }} />
      </div>

      {loading ? <div style={S.loading}>우리의 시간을 모아보는 중…</div> : (
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
            <StatCard num={stats.totalMoments} label="함께한 안부" />
            <StatCard num={stats.totalPosts} label="남긴 순간" />
            <StatCard num={stats.allJoinedCount} label="전원 참여" />
            <StatCard num={stats.lateCount} label="늦은 안부" />
          </div>

          <div style={S.secLabel}>참여 랭킹</div>
          <div style={S.rankCard}>
            {stats.ranking.length ? stats.ranking.map((r, i) => (
              <div key={r.name + i} style={{ ...S.rankRow, borderBottom: i === stats.ranking.length - 1 ? 'none' : '1px solid var(--mp-line)' }}>
                <div style={S.rankNo}>{i + 1}</div>
                <div style={{ ...S.rankDot, background: r.color }} />
                <div style={{ flex: 1, fontWeight: 650 }}>{r.name}{r.me && <span style={S.meTag}>나</span>}</div>
                <div style={S.rankCount}>{r.count}회</div>
              </div>
            )) : <div style={S.emptyRank}>아직 참여 기록이 없어요.</div>}
          </div>

          <div style={{ ...S.secLabel, marginTop: 26 }}>최근 우리의 순간</div>
          {moments.length ? (
            <div style={S.timeline}>
              {moments.map((p, i) => (
                <button key={p.id} style={S.momentCard} onClick={() => setSelected(p)}>
                  <div style={S.thumbWrap}>
                    {p.photoUrl ? <img src={p.photoUrl} alt="" style={S.thumb} /> : <div style={S.thumbEmpty}>닿음</div>}
                  </div>
                  <div style={S.momentInfo}>
                    <div style={S.momentName}>{nameOf(p.user_id)}</div>
                    <div style={S.momentDate}>{formatDate(p.created_at)} · {formatTime(p.created_at)}</div>
                    <div style={S.momentPlace}>{p.place_label || '위치 없이 남긴 안부'}</div>
                  </div>
                  <div style={S.chev}>›</div>
                </button>
              ))}
            </div>
          ) : (
            <div style={S.emptyMoment}>아직 함께 남긴 순간이 없어요.</div>
          )}
        </div>
      )}

      {selected && (
        <div style={S.modal} onClick={() => setSelected(null)}>
          <div style={S.modalCard} onClick={e => e.stopPropagation()}>
            <div style={S.modalHead}>
              <div>
                <div style={S.modalName}>{nameOf(selected.user_id)}</div>
                <div style={S.modalMeta}>{formatDate(selected.created_at)} · {formatTime(selected.created_at)}</div>
              </div>
              <button style={S.close} onClick={() => setSelected(null)} aria-label="닫기">×</button>
            </div>
            {photoUrl ? <img src={photoUrl} alt="남긴 순간" style={S.bigPhoto} /> : <div style={S.bigEmpty}>사진 없이 남긴 안부예요.</div>}
            <div style={S.modalPlace}>{selected.place_label || '위치 정보 없음'}</div>
            {selected.is_late && <div style={S.lateBadge}>늦은 안부</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ num, label }) {
  return (
    <div style={S.statCard}>
      <div style={S.statNum}>{num}</div>
      <div style={S.statLabel}>{label}</div>
    </div>
  )
}

const S = {
  app: { width: '100%', maxWidth: 480, margin: '0 auto', minHeight: '100dvh', background: 'var(--mp-bg)', fontFamily: "'Outfit','Gowun Dodum',sans-serif", color: 'var(--mp-ink)', paddingBottom: 40 },
  top: { position: 'sticky', top: 0, zIndex: 100, background: 'var(--mp-topbar)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--mp-line)', padding: '13px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 36, height: 36, border: 'none', background: 'var(--mp-card2)', borderRadius: '50%', fontSize: 21, cursor: 'pointer', color: 'var(--mp-ink)', lineHeight: 1 },
  title: { fontWeight: 750, fontSize: 18 },
  loading: { textAlign: 'center', color: 'var(--mp-muted)', padding: 80, fontSize: 14 },
  body: { padding: 16 },
  hero: { position: 'relative', borderRadius: 22, overflow: 'hidden', background: 'linear-gradient(120deg,#171821,#29202a)', color: '#fff', padding: '25px 22px', marginBottom: 16, boxShadow: '0 12px 40px rgba(20,20,30,.16)' },
  heroGlow: { position: 'absolute', width: 190, height: 190, borderRadius: '50%', background: 'rgba(255,90,100,.22)', right: -55, top: -60, filter: 'blur(22px)' },
  heroTag: { fontSize: 11, fontWeight: 700, letterSpacing: 1.4, opacity: .78 },
  heroBig: { fontSize: 36, fontWeight: 750, letterSpacing: '-1.2px', marginTop: 4 },
  heroSub: { fontSize: 13, opacity: .78, marginTop: 2 },
  cards: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 },
  statCard: { background: 'var(--mp-card)', borderRadius: 16, padding: '17px 14px', boxShadow: '0 4px 24px rgba(20,20,30,.06)', textAlign: 'center' },
  statNum: { fontSize: 30, fontWeight: 750, letterSpacing: '-1px', color: 'var(--mp-coral)' },
  statLabel: { fontSize: 12.5, color: 'var(--mp-sub)', fontWeight: 650, marginTop: 4 },
  secLabel: { fontSize: 12, fontWeight: 650, color: 'var(--mp-muted)', letterSpacing: .4, margin: '4px 4px 10px' },
  rankCard: { background: 'var(--mp-card)', borderRadius: 16, padding: '6px 16px', boxShadow: '0 4px 24px rgba(20,20,30,.06)', marginBottom: 4 },
  rankRow: { display: 'flex', alignItems: 'center', gap: 11, padding: '12px 0' },
  rankNo: { width: 20, textAlign: 'center', fontSize: 13, fontWeight: 750, color: 'var(--mp-muted)' },
  rankDot: { width: 12, height: 12, borderRadius: '50%', flex: 'none' },
  rankCount: { fontSize: 14, fontWeight: 750, color: 'var(--mp-ink)' },
  meTag: { fontSize: 10.5, color: 'var(--mp-coral)', fontWeight: 700, marginLeft: 7, background: '#fff0ed', padding: '3px 7px', borderRadius: 8 },
  emptyRank: { padding: 18, textAlign: 'center', color: 'var(--mp-muted)', fontSize: 13 },
  timeline: { display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 30 },
  momentCard: { width: '100%', display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'var(--mp-card)', borderRadius: 16, padding: 10, textAlign: 'left', cursor: 'pointer', boxShadow: '0 4px 20px rgba(20,20,30,.055)' },
  thumbWrap: { width: 68, height: 68, borderRadius: 12, overflow: 'hidden', flex: 'none', background: 'var(--mp-card2)' },
  thumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  thumbEmpty: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mp-muted)', fontSize: 11, fontWeight: 700 },
  momentInfo: { minWidth: 0, flex: 1 },
  momentName: { fontSize: 14, fontWeight: 700, marginBottom: 3 },
  momentDate: { fontSize: 11.5, color: 'var(--mp-muted)' },
  momentPlace: { fontSize: 12, color: 'var(--mp-sub)', marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chev: { fontSize: 25, color: 'var(--mp-muted)', padding: '0 4px' },
  emptyMoment: { background: 'var(--mp-card)', borderRadius: 16, padding: 24, textAlign: 'center', color: 'var(--mp-muted)', fontSize: 13 },
  modal: { position: 'fixed', inset: 0, zIndex: 5000, background: 'rgba(15,17,27,.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 430, background: 'var(--mp-card)', borderRadius: 22, overflow: 'hidden', boxShadow: '0 20px 70px rgba(0,0,0,.3)' },
  modalHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 13px' },
  modalName: { fontSize: 16, fontWeight: 750 },
  modalMeta: { fontSize: 11.5, color: 'var(--mp-muted)', marginTop: 3 },
  close: { width: 32, height: 32, border: 'none', borderRadius: '50%', background: 'var(--mp-card2)', color: 'var(--mp-ink)', fontSize: 23, cursor: 'pointer', lineHeight: 1 },
  bigPhoto: { width: '100%', maxHeight: '62vh', objectFit: 'cover', display: 'block', background: 'var(--mp-card2)' },
  bigEmpty: { margin: '0 18px', height: 220, borderRadius: 14, background: 'var(--mp-card2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mp-muted)', fontSize: 13 },
  modalPlace: { padding: '13px 18px 5px', fontSize: 13, color: 'var(--mp-sub)' },
  lateBadge: { display: 'inline-block', margin: '7px 18px 18px', background: '#fff0ed', color: 'var(--mp-coral)', borderRadius: 9, padding: '5px 8px', fontSize: 11, fontWeight: 700 },
}
