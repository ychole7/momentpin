// src/Home.jsx (실시간 + 거리/장소 라벨 버전)
import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

function distKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null
  const R = 6371, r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}
function distLabel(myPos, loc) {
  const d = distKm(myPos, loc)
  if (d == null) return ''
  if (d < 0.05) return '바로 옆'
  if (d < 1) return Math.round(d * 1000) + 'm'
  return d.toFixed(1) + 'km'
}

export default function Home({ user, group, onLeaveGroup, onSignOut }) {
  const [members, setMembers] = useState([])
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [viewPost, setViewPost] = useState(null) // 크게 볼 모먼

  const mapBoxRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const fileRef = useRef(null)
  const myPosRef = useRef(null)
  const membersRef = useRef([])

  useEffect(() => { loadMembers(); loadPosts() }, [group.id])
  useEffect(() => { initMap() }, [])
  useEffect(() => { drawPins() }, [posts, members])

  useEffect(() => {
    const channel = supabase
      .channel('posts-' + group.id)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'posts', filter: 'group_id=eq.' + group.id },
        () => { loadPosts() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [group.id])

  async function loadMembers() {
    setLoading(true)
    let res = await supabase
      .from('members')
      .select('id,user_id,display_name,color,share_location')
      .eq('group_id', group.id)
      .order('joined_at', { ascending: true })
    const error = res.error
    if (error) { flash(error.message); setLoading(false); return }
    const list = res.data || []
    setMembers(list); membersRef.current = list
    setLoading(false)
  }

  async function loadPosts() {
    let res = await supabase
      .from('posts')
      .select('id,user_id,img_back,lat,lng,place_label,created_at')
      .eq('group_id', group.id)
      .order('created_at', { ascending: false })
    const error = res.error
    if (error) { flash(error.message); return }
    const seen = {}, latest = []
    for (const p of (res.data || [])) {
      if (seen[p.user_id]) continue
      seen[p.user_id] = true
      latest.push(p)
    }
    setPosts(latest)
  }

  function initMap() {
    const L = window.L
    if (!L || !mapBoxRef.current || mapRef.current) return
    const map = L.map(mapBoxRef.current).setView([37.5665, 126.9780], 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap'
    }).addTo(map)
    mapRef.current = map
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => {
          myPosRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }
          map.setView([p.coords.latitude, p.coords.longitude], 15)
          drawPins()
        }, () => {}
      )
    }
    drawPins()
  }

  function nameOf(uid) { const m = membersRef.current.find(x => x.user_id === uid); return m ? m.display_name : '?' }
  function colorOf(uid) { const m = membersRef.current.find(x => x.user_id === uid); return m ? m.color : '#888' }

  async function drawPins() {
    const L = window.L
    const map = mapRef.current
    if (!L || !map) return
    markersRef.current.forEach(mk => map.removeLayer(mk))
    markersRef.current = []
    for (const p of posts) {
      if (p.lat == null || p.lng == null) continue
      let imgUrl = ''
      if (p.img_back) {
        let s = await supabase.storage.from('moments').createSignedUrl(p.img_back, 3600)
        if (!s.error && s.data) imgUrl = s.data.signedUrl
      }
      const color = colorOf(p.user_id)
      const html = imgUrl
        ? `<div style="width:48px;height:48px;border-radius:50%;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.3);background-image:url('${imgUrl}');background-size:cover;background-position:center;"></div>`
        : `<div style="width:44px;height:44px;border-radius:50%;border:3px solid #fff;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.3);">${nameOf(p.user_id)[0]}</div>`
      const icon = L.divIcon({ html, className: '', iconSize: [48, 48], iconAnchor: [24, 24] })
      const mk = L.marker([p.lat, p.lng], { icon }).addTo(map)
      const dist = (p.user_id !== user.id) ? distLabel(myPosRef.current, p) : '바로 여기'
      mk.bindPopup(`<b>${nameOf(p.user_id)}</b><br>${p.place_label || '위치'}${dist ? ' · ' + dist : ''}`)
      mk.on('click', () => setViewPost(p))
      markersRef.current.push(mk)
    }
  }

  function getLoc() {
    return new Promise(resolve => {
      if (myPosRef.current) return resolve(myPosRef.current)
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        p => { myPosRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }; resolve(myPosRef.current) },
        () => resolve(null), { timeout: 5000 }
      )
    })
  }

  async function onPickFile(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); flash('사진 올리는 중…')
    try {
      const loc = await getLoc()
      const postId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))
      const path = `${group.id}/${postId}_back.jpg`
      let up = await supabase.storage.from('moments').upload(path, file, { upsert: true })
      if (up.error) { flash('업로드 실패: ' + up.error.message); setBusy(false); return }
      const now = new Date()
      const deadline = new Date(now.getTime() + (group.window_min || 5) * 60000)
      let mres = await supabase.from('moments')
        .insert({ group_id: group.id, fired_at: now.toISOString(), deadline: deadline.toISOString() })
        .select().single()
      if (mres.error) { flash('모먼 생성 실패: ' + mres.error.message); setBusy(false); return }
      let pres = await supabase.from('posts').insert({
        moment_id: mres.data.id, group_id: group.id, user_id: user.id,
        img_back: path, lat: loc ? loc.lat : null, lng: loc ? loc.lng : null,
        place_label: loc ? '현재 위치' : '위치 없음', is_late: false,
      })
      if (pres.error) { flash('기록 실패: ' + pres.error.message); setBusy(false); return }
      flash('모먼 공유 완료! ✨')
      await loadPosts()
      if (loc && mapRef.current) mapRef.current.setView([loc.lat, loc.lng], 15)
    } catch (err) { flash('오류: ' + (err.message || err)) }
    setBusy(false)
  }

  async function testNotify() {
    if (typeof Notification === 'undefined') { flash('이 브라우저는 알림을 지원하지 않아요'); return }
    let perm = Notification.permission
    if (perm === 'default') perm = await Notification.requestPermission()
    if (perm !== 'granted') { flash('알림이 차단됐어요. 브라우저 설정에서 허용해 주세요.'); return }
    new Notification('📸 모먼 시간!', {
      body: group.name + ' · 지금 다 같이 찍어요',
      icon: '/vite.svg'
    })
    flash('알림을 보냈어요! 화면 모서리를 확인하세요 ✨')
  }

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2600) }
  async function copyCode() {
    try { await navigator.clipboard.writeText(group.invite_code) } catch {}
    flash('초대코드 복사됨 · ' + group.invite_code)
  }
  const [bigUrl, setBigUrl] = useState('')
  useEffect(() => {
    let alive = true
    if (viewPost && viewPost.img_back) {
      supabase.storage.from('moments').createSignedUrl(viewPost.img_back, 3600).then(s => {
        if (alive && !s.error && s.data) setBigUrl(s.data.signedUrl)
      })
    } else { setBigUrl('') }
    return () => { alive = false }
  }, [viewPost])
  const postByUser = {}
  // 모먼 요약 계산
  const others = members.filter(m => m.user_id !== user.id)
  let farMember = null, farD = -1, sum = 0, cnt = 0
  others.forEach(m => {
    const p = postByUser[m.user_id]
    if (!p) return
    const d = distKm(myPosRef.current, p)
    if (d == null) return
    sum += d; cnt++
    if (d > farD) { farD = d; farMember = m }
  })
  const avgD = cnt ? sum / cnt : 0
  const allHere = cnt > 0 && others.every(m => {
    const p = postByUser[m.user_id]; const d = p ? distKm(myPosRef.current, p) : 9
    return d != null && d < 0.3
  })
  const fmtKm = (d) => d < 1 ? Math.round(d * 1000) + 'm' : d.toFixed(1) + 'km'
  posts.forEach(p => { if (!postByUser[p.user_id]) postByUser[p.user_id] = p })

  return (
    <div style={S.app}>
      <div style={S.top}>
        <div style={S.logoRow}><div style={S.logoDot} /><div style={S.logoName}>모먼핀</div></div>
        <button style={S.codeBtn} onClick={copyCode}>🔗 {group.invite_code}</button>
      </div>
      <div style={S.body}>
        <div style={S.groupName}>{group.name}</div>
        <div style={S.sub}>{members.length}명 함께 · 모먼 {posts.length}개 · 🟢 실시간</div>
        <div style={S.mapWrap}><div ref={mapBoxRef} style={S.map} /></div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickFile} />
        <div style={S.summary}>
          <span style={S.sChip}><span style={S.sKey}>참여</span> <b>{posts.length}/{members.length}</b></span>
          {allHere ? (
            <span style={S.sChip}>✨ <b>모두 같은 곳에!</b></span>
          ) : (
            <>
              <span style={S.sSep} />
              <span style={S.sChip}><span style={S.sKey}>평균</span> <b>{cnt ? fmtKm(avgD) : '-'}</b></span>
              {farMember && <>
                <span style={S.sSep} />
                <span style={S.sChip}><span style={S.sKey}>가장 먼</span> <b>{farMember.display_name} {fmtKm(farD)}</b></span>
              </>}
            </>
          )}
        </div>
        <button style={{ ...S.shoot, opacity: busy ? .6 : 1 }} disabled={busy}
          onClick={() => fileRef.current && fileRef.current.click()}>
          {busy ? '올리는 중…' : '📸 모먼 찍기 (사진 선택)'}
        </button>
        <button style={S.notifyBtn} onClick={testNotify}>🔔 알림 테스트 (지금 울려보기)</button>
        <div style={S.label}>멤버</div>
        {loading ? <div style={S.muted}>불러오는 중…</div> : members.map(m => {
          const p = postByUser[m.user_id]
          const dist = p && m.user_id !== user.id ? distLabel(myPosRef.current, p) : ''
          return (
            <div key={m.id} style={S.memberRow}>
              <div style={{ ...S.avatar, background: m.color }}>{m.display_name[0]}</div>
              <div style={{ flex: 1, fontWeight: 600 }}>
                {m.display_name}{m.user_id === user.id && <span style={S.meTag}>나</span>}
                {dist && <span style={S.distTag}>{dist}</span>}
              </div>
              <span style={S.shareTag}>{p ? '📍 ' + (p.place_label || '위치') : (m.share_location ? '대기 중' : '위치 끔')}</span>
            </div>
          )
        })}
        <div style={S.actions}>
          <button style={S.ghost} onClick={onLeaveGroup}>다른 그룹 보기</button>
          <button style={S.ghost} onClick={onSignOut}>로그아웃</button>
        </div>
      </div>
      {toast && <div style={S.toast}>{toast}</div>}
      {viewPost && (
        <div style={S.pop} onClick={() => setViewPost(null)}>
          <div style={S.popCard} onClick={e => e.stopPropagation()}>
            <div style={S.popPhoto}>
              {bigUrl ? <img src={bigUrl} style={S.popImg} alt="" /> : <div style={S.popLoading}>불러오는 중…</div>}
            </div>
            <div style={S.popInfo}>
              <div style={{ ...S.avatar, background: colorOf(viewPost.user_id) }}>{nameOf(viewPost.user_id)[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{nameOf(viewPost.user_id)}</div>
                <div style={{ fontSize: 12, color: '#9b9ba3' }}>📍 {viewPost.place_label || '위치'}{viewPost.user_id !== user.id ? ' · ' + distLabel(myPosRef.current, viewPost) : ''}</div>
              </div>
              <button style={S.popX} onClick={() => setViewPost(null)}>✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  app: { maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#fafafa', fontFamily: "'Outfit','Gowun Dodum',sans-serif", color: '#16161a' },
  top: { position: 'sticky', top: 0, zIndex: 1000, background: 'rgba(250,250,250,.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #efeff2', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoRow: { display: 'flex', alignItems: 'center', gap: 8 },
  logoDot: { width: 24, height: 24, borderRadius: '8px 8px 8px 3px', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)' },
  logoName: { fontSize: 18, fontWeight: 700, letterSpacing: '-.4px' },
  codeBtn: { border: '1px solid #efeff2', background: '#fff', color: '#6b6b73', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 20, cursor: 'pointer' },
  body: { padding: 18 },
  groupName: { fontSize: 24, fontWeight: 700, letterSpacing: '-.5px' },
  sub: { fontSize: 13, color: '#9b9ba3', marginTop: 2, marginBottom: 16 },
  mapWrap: { position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 24px rgba(20,20,30,.07)', marginBottom: 14 },
  map: { width: '100%', height: 300 },
  summary: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', background: '#fff', borderRadius: 14, padding: '11px 14px', boxShadow: '0 4px 24px rgba(20,20,30,.07)', marginBottom: 14, fontSize: 13 },
  notifyBtn: { width: '100%', border: '1.5px solid #efeff2', background: '#fff', color: '#16161a', borderRadius: 14, padding: 13, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: -10, marginBottom: 22 },
  pop: { position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(10,10,14,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  popCard: { width: '100%', maxWidth: 360, background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.5)' },
  popPhoto: { aspectRatio: '4/5', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  popImg: { width: '100%', height: '100%', objectFit: 'cover' },
  popLoading: { color: '#fff', fontSize: 13 },
  popInfo: { display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px' },
  popX: { marginLeft: 'auto', background: '#f0f0f3', border: 'none', width: 34, height: 34, borderRadius: '50%', fontSize: 16, cursor: 'pointer', color: '#9b9ba3' },
  sChip: { display: 'inline-flex', alignItems: 'center', gap: 5, color: '#16161a' },
  sKey: { color: '#9b9ba3', fontWeight: 500 },
  sSep: { width: 1, height: 14, background: '#efeff2' },
  shoot: { width: '100%', border: 'none', borderRadius: 16, padding: 16, fontFamily: 'inherit', fontSize: 16, fontWeight: 700, cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 8px 20px rgba(255,77,94,.3)', marginBottom: 22 },
  label: { fontSize: 12, fontWeight: 600, color: '#9b9ba3', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 10 },
  muted: { color: '#9b9ba3', fontSize: 14 },
  memberRow: { display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderBottom: '1px solid #f4f4f6' },
  avatar: { width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, flex: 'none' },
  meTag: { fontSize: 11, color: '#9b9ba3', fontWeight: 600, marginLeft: 7 },
  distTag: { fontSize: 12, color: '#13bca4', fontWeight: 700, marginLeft: 7 },
  shareTag: { fontSize: 12, color: '#9b9ba3', fontWeight: 500 },
  actions: { display: 'flex', gap: 10, marginTop: 24 },
  ghost: { flex: 1, border: '1.5px solid #efeff2', background: '#fff', color: '#16161a', borderRadius: 14, padding: 13, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  toast: { position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#16161a', color: '#fff', padding: '12px 20px', borderRadius: 30, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,.3)', zIndex: 2000 },
}