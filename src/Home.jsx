// src/Home.jsx (위치 숨김 관점3 + members 실시간 포함 완성본)
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
const fmtKm = (d) => d < 1 ? Math.round(d * 1000) + 'm' : d.toFixed(1) + 'km'
const SIDO_SHORT = {
  '서울특별시':'서울','부산광역시':'부산','대구광역시':'대구','인천광역시':'인천',
  '광주광역시':'광주','대전광역시':'대전','울산광역시':'울산','세종특별자치시':'세종',
  '경기도':'경기','강원특별자치도':'강원','강원도':'강원','충청북도':'충북','충청남도':'충남',
  '전북특별자치도':'전북','전라북도':'전북','전라남도':'전남','경상북도':'경북','경상남도':'경남',
  '제주특별자치도':'제주'
}
async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&accept-language=ko`
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } })
    const j = await r.json()
    const a = j.address || {}
    const sido = SIDO_SHORT[a.state] || a.state || ''
    const gu = a.city_district || a.borough || a.county || ''
    const dong = a.quarter || a.neighbourhood || a.suburb || a.village || a.town || ''
    const label = [sido, gu, dong].filter(Boolean).join(' ')
    return label || a.city || '위치'
  } catch { return '위치' }
}
function hhmm(ts) { const d = new Date(ts); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') }
function ago(ts) { const d = (Date.now() - new Date(ts).getTime()) / 1000; if (d < 60) return '방금'; if (d < 3600) return Math.floor(d / 60) + '분 전'; return Math.floor(d / 3600) + '시간 전' }

export default function Home({ user, group, onOpenSettings, onMembersLoaded }) {
  const [members, setMembers] = useState([])
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [tab, setTab] = useState('map')
  const [viewPost, setViewPost] = useState(null)
  const [bigUrl, setBigUrl] = useState('')
  const [signed, setSigned] = useState({})
  const [pushOn, setPushOn] = useState(false)
  const [moments, setMoments] = useState([])
  const [nowTick, setNowTick] = useState(Date.now())

  const mapBoxRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const fileRef = useRef(null)
  const myPosRef = useRef(null)
  const membersRef = useRef([])
  const includeLocRef = useRef(true)
  const openMomentRef = useRef(null)
  const isOwner = group.created_by === user.id

  useEffect(() => { loadMembers(); loadPosts() }, [group.id])
  useEffect(() => { loadMoments() }, [group.id])
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const ch = supabase.channel('moments-' + group.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'moments', filter: 'group_id=eq.' + group.id }, () => { loadMoments(); loadPosts() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [group.id])
  useEffect(() => {
    if (tab === 'map') {
      const t = setTimeout(initMap, 50)
      return () => clearTimeout(t)
    }
    // 지도 탭을 떠나면 기존 지도 인스턴스를 깨끗이 제거
    if (mapRef.current) { try { mapRef.current.remove() } catch {} mapRef.current = null; markersRef.current = [] }
  }, [tab])
  useEffect(() => { drawPins() }, [posts, members])
  useEffect(() => { resolveSigned() }, [posts])

  // 현재 푸시 구독 상태 확인
  useEffect(() => {
    (async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
        const reg = await navigator.serviceWorker.getRegistration()
        if (!reg) { setPushOn(false); return }
        const sub = await reg.pushManager.getSubscription()
        setPushOn(!!sub)
      } catch { setPushOn(false) }
    })()
  }, [])

  // posts 실시간
  useEffect(() => {
    const ch = supabase.channel('posts-' + group.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts', filter: 'group_id=eq.' + group.id }, () => loadPosts())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [group.id])

  // members 실시간 (위치 on/off 즉시 반영)
  useEffect(() => {
    const ch = supabase.channel('members-' + group.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: 'group_id=eq.' + group.id }, () => loadMembers())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [group.id])

  useEffect(() => {
    let alive = true
    if (viewPost && viewPost.img_back) {
      supabase.storage.from('moments').createSignedUrl(viewPost.img_back, 3600).then(s => { if (alive && !s.error && s.data) setBigUrl(s.data.signedUrl) })
    } else setBigUrl('')
    return () => { alive = false }
  }, [viewPost])

  async function loadMembers() {
    setLoading(true)
    let res = await supabase.from('members').select('id,user_id,display_name,color,share_location').eq('group_id', group.id).order('joined_at', { ascending: true })
    if (res.error) { flash(res.error.message); setLoading(false); return }
    const list = res.data || []
    setMembers(list); membersRef.current = list
    setLoading(false)
    drawPins()
    if (onMembersLoaded) onMembersLoaded(list)
  }

  async function loadPosts() {
    let res = await supabase.from('posts').select('id,moment_id,user_id,img_back,img_front,lat,lng,place_label,created_at,is_late').eq('group_id', group.id).order('created_at', { ascending: false })
    if (res.error) { flash(res.error.message); return }
    const seen = {}, latest = []
    for (const p of (res.data || [])) { if (seen[p.user_id]) continue; seen[p.user_id] = true; latest.push(p) }
    setPosts(latest)
  }

  async function loadMoments() {
    let res = await supabase.from('moments').select('id,fired_at,deadline').eq('group_id', group.id).order('fired_at', { ascending: false }).limit(20)
    if (!res.error) setMoments(res.data || [])
  }

    async function resolveSigned() {
    const map = {}
    for (const p of posts) {
      if (p.img_back) { let s = await supabase.storage.from('moments').createSignedUrl(p.img_back, 3600); if (!s.error && s.data) map[p.id] = s.data.signedUrl }
    }
    setSigned(map)
  }

  function initMap() {
    const L = window.L
    if (!L || !mapBoxRef.current) return
    if (mapRef.current) return  // 이미 떠 있으면 중복 생성 안 함
    // 컨테이너에 이전 Leaflet 흔적이 남아있으면 초기화
    if (mapBoxRef.current._leaflet_id) { mapBoxRef.current._leaflet_id = null }
    const map = L.map(mapBoxRef.current).setView([37.5665, 126.9780], 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map)
    mapRef.current = map
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p => {
        myPosRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }
        map.setView([p.coords.latitude, p.coords.longitude], 15)
        drawPins()
      }, () => {})
    }
    drawPins()
  }

  function nameOf(uid) { const m = membersRef.current.find(x => x.user_id === uid); return m ? m.display_name : '?' }
  function colorOf(uid) { const m = membersRef.current.find(x => x.user_id === uid); return m ? m.color : '#888' }
  function sharesLoc(uid) { const m = membersRef.current.find(x => x.user_id === uid); return m ? m.share_location !== false : true }
  function hasLoc(p) { return !!(p && p.lat != null && p.lng != null) }  // 그 모먼에 위치가 포함됐는지

  async function drawPins() {
    const L = window.L, map = mapRef.current
    if (!L || !map) return
    markersRef.current.forEach(mk => map.removeLayer(mk))
    markersRef.current = []
    const _n = new Date()
    const _open = moments.filter(m => new Date(m.fired_at) <= _n && _n <= new Date(m.deadline))
    const _recent = moments.slice().sort((a,b)=>new Date(b.fired_at)-new Date(a.fired_at))[0]
    const activeIds = _open.length ? _open.map(m=>m.id) : (_recent ? [_recent.id] : [])
    for (const p of posts) {
      if (!activeIds.includes(p.moment_id)) continue
      if (p.lat == null || p.lng == null) continue
      // 위치 포함 모먼만 핀 표시 (lat/lng 없으면 이미 위에서 skip)
      let imgUrl = signed[p.id] || ''
      if (!imgUrl && p.img_back) { let s = await supabase.storage.from('moments').createSignedUrl(p.img_back, 3600); if (!s.error && s.data) imgUrl = s.data.signedUrl }
      const color = colorOf(p.user_id)
      const nm = nameOf(p.user_id)
      const inner = imgUrl
        ? `<div style="width:48px;height:48px;border-radius:50%;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.3);background-image:url('${imgUrl}');background-size:cover;background-position:center;"></div>`
        : `<div style="width:44px;height:44px;border-radius:50%;border:3px solid #fff;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.3);">${nm[0]}</div>`
      const label = `<div style="margin-top:3px;background:#16161a;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3);">${nm}</div>`
      const html = `<div style="display:flex;flex-direction:column;align-items:center;">${inner}${label}</div>`
      const icon = L.divIcon({ html, className: '', iconSize: [60, 70], iconAnchor: [30, 30] })
      const mk = L.marker([p.lat, p.lng], { icon }).addTo(map)
      mk.on('click', () => setViewPost(p))
      markersRef.current.push(mk)
    }
  }

  function getLoc() {
    return new Promise(resolve => {
      if (myPosRef.current) return resolve(myPosRef.current)
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(p => { myPosRef.current = { lat: p.coords.latitude, lng: p.coords.longitude }; resolve(myPosRef.current) }, () => resolve(null), { timeout: 5000 })
    })
  }

  async function startMoment() {
    if (!isOwner) { flash('그룹을 만든 사람만 모먼을 시작할 수 있어요'); return }
    setBusy(true)
    const now = new Date()
    // 이미 열린 모먼이 있으면 새로 만들지 않고 재사용 (중복 방지)
    let openRes = await supabase.from('moments').select('id')
      .eq('group_id', group.id)
      .lte('fired_at', now.toISOString())
      .gte('deadline', now.toISOString())
      .limit(1)
    if (openRes.data && openRes.data.length > 0) {
      setBusy(false)
      await loadMoments()
      flash('이미 모먼이 진행 중이에요 📍')
      try { fetch(window.location.origin + '/api/send-moment?groupId=' + group.id) } catch {}
      return
    }
    const deadline = new Date(now.getTime() + (group.window_min || 3) * 60000)
    let res = await supabase.from('moments').insert({ group_id: group.id, fired_at: now.toISOString(), deadline: deadline.toISOString() }).select().single()
    setBusy(false)
    if (res.error) { flash('모먼 시작 실패: ' + res.error.message); return }
    await loadMoments()
    flash('📍 모먼 시작! 다 같이 찍어요 (' + (group.window_min||3) + '분)')
    try { fetch(window.location.origin + '/api/send-moment?groupId=' + group.id) } catch {}
  }

    async function onPickFile(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); flash('위치 확인 중…')
    try {
      const loc = await getLoc()
      if (!loc) { flash('위치를 가져올 수 없어요. 위치 권한을 켜주세요 📍'); setBusy(false); return }
      const dongLabel = await reverseGeocode(loc.lat, loc.lng)
      flash('사진 올리는 중…')
      const postId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))
      const path = `${group.id}/${postId}_back.jpg`
      let up = await supabase.storage.from('moments').upload(path, file, { upsert: true })
      if (up.error) { flash('업로드 실패: ' + up.error.message); setBusy(false); return }
      // 열린 모먼에만 제출 (열린 모먼 없으면 찍기 자체가 막혀있음)
      const target = openMomentRef.current
      if (!target) { flash('지금은 모먼 시간이 아니에요'); setBusy(false); return }
      const momentId = target.id
      const late = new Date() > new Date(target.deadline)
      let pres = await supabase.from('posts').upsert({
        moment_id: momentId, group_id: group.id, user_id: user.id,
        img_back: path, lat: loc.lat, lng: loc.lng,
        place_label: dongLabel, is_late: late,
      }, { onConflict: 'moment_id,user_id' })
      if (pres.error) { flash('기록 실패: ' + pres.error.message); setBusy(false); return }
      flash('모먼 공유 완료! ✨')
      await loadPosts()
      await loadMoments()
      if (loc && mapRef.current) mapRef.current.setView([loc.lat, loc.lng], 15)
    } catch (err) { flash('오류: ' + (err.message || err)) }
    setBusy(false)
  }

  async function enablePush() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) { flash('이 브라우저는 푸시를 지원하지 않아요 (폰은 홈화면 추가 후)'); return }
      let perm = Notification.permission
      if (perm === 'default') perm = await Notification.requestPermission()
      if (perm !== 'granted') { flash('알림이 차단됐어요. 설정에서 허용해 주세요.'); return }
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY
      if (!vapid) { flash('VAPID 키가 없어요 (.env 확인)'); return }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) })
      const json = sub.toJSON()
      let res = await supabase.from('push_subscriptions').upsert({
        user_id: user.id, group_id: group.id,
        endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth,
      }, { onConflict: 'user_id,group_id,endpoint' })
      if (res.error) { flash('구독 저장 실패: ' + res.error.message); return }
      setPushOn(true)
      flash('알림 켜짐! 이제 모먼 알림을 받아요 🔔')
    } catch (e) { flash('알림 설정 실패: ' + (e.message || e)) }
  }
  async function disablePush() {
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          const ep = sub.endpoint
          await sub.unsubscribe()
          await supabase.from('push_subscriptions').delete().eq('user_id', user.id).eq('group_id', group.id).eq('endpoint', ep)
        }
      }
      setPushOn(false)
      flash('알림을 껐어요 🔕')
    } catch (e) { flash('알림 끄기 실패: ' + (e.message || e)) }
  }

  function togglePush() { pushOn ? disablePush() : enablePush() }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = window.atob(base64)
    const arr = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
    return arr
  }

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2600) }
  async function copyInviteLink() {
    const link = window.location.origin + '/?code=' + encodeURIComponent(group.invite_code)
    const text = `우리 ${group.name} 모먼핀 같이 쓰자! 📍\n이 링크 누르고 가입하면 끝:\n${link}`
    try { await navigator.clipboard.writeText(text) } catch {}
    flash('초대 링크 복사됨! 카톡에 붙여넣기 ✨')
  }

  // 열린 모먼 판정
  const _now = new Date(nowTick)
  const openMoments = moments.filter(m => new Date(m.fired_at) <= _now && _now <= new Date(m.deadline))
  // 사진 찍기용: 가장 먼저 시작된 열린 모먼으로 통일 (모두 같은 곳에 모이게)
  const openMoment = openMoments.slice().sort((a,b)=>new Date(a.fired_at)-new Date(b.fired_at))[0] || null
  // 가장 최근 모먼 (열린 게 없을 때 '지난 결과'로 보여주기 위함)
  const recentMoment = moments.slice().sort((a,b)=>new Date(b.fired_at)-new Date(a.fired_at))[0] || null
  // 표시용 모먼: 열린 모먼 있으면 그것들, 없으면 가장 최근 모먼 (사진은 다음 모먼 전까지 남김)
  const displayMomentIds = openMoments.length ? openMoments.map(m=>m.id) : (recentMoment ? [recentMoment.id] : [])
  // 참여/재촉용: 열린 모먼만 (지난 모먼은 재촉 안 함)
  const activeMomentIds = openMoments.map(m=>m.id)
  const activeMomentId = activeMomentIds[0] || null
  // 표시용 posts (지도/한눈에/피드) — 지난 결과 포함
  const displayPosts = posts.filter(p => displayMomentIds.includes(p.moment_id))
  // 참여 판정용 postByUser — 열린 모먼만 (재촉/현황 계산)
  const activePosts = posts.filter(p => activeMomentIds.includes(p.moment_id))
  const postByUser = {}
  activePosts.forEach(p => { if (!postByUser[p.user_id]) postByUser[p.user_id] = p })
  // 표시용 postByUser (지난 결과 보여줄 때 사용)
  const displayByUser = {}
  displayPosts.forEach(p => { if (!displayByUser[p.user_id]) displayByUser[p.user_id] = p })
  const remainSec = openMoment ? Math.max(0, Math.floor((new Date(openMoment.deadline) - _now)/1000)) : 0
  const remainLabel = Math.floor(remainSec/60) + ':' + String(remainSec%60).padStart(2,'0')
  const canShoot = !!openMoment
  const hasOpen = openMoments.length > 0
  openMomentRef.current = openMoment

  // 요약 (위치 공유한 사람만 거리 계산) — 표시용 기준
  const others = members.filter(m => m.user_id !== user.id)
  let farMember = null, farD = -1, sum = 0, cnt = 0
  others.forEach(m => { const p = displayByUser[m.user_id]; if (!hasLoc(p)) return; const d = distKm(myPosRef.current, p); if (d == null) return; sum += d; cnt++; if (d > farD) { farD = d; farMember = m } })
  const avgD = cnt ? sum / cnt : 0
  const allHere = cnt > 0 && others.every(m => { const p = displayByUser[m.user_id]; if (!hasLoc(p)) return true; const d = distKm(myPosRef.current, p); return d != null && d < 0.3 })

  // 참여 현황 (전원 도착)
  const joinedCount = members.filter(m => postByUser[m.user_id]).length
  const allJoined = members.length > 0 && joinedCount === members.length
  const waiting = members.filter(m => !postByUser[m.user_id])
  const iJoined = !!postByUser[user.id]

  return (
    <div style={S.app}>
      <div style={S.top}>
        <div style={S.logoRow}><div style={S.logoDot} /><div style={S.logoName}>모먼핀</div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.codeBtn} onClick={copyInviteLink}>🔗 초대</button>
          <button style={S.codeBtn} onClick={onOpenSettings}>⚙️</button>
        </div>
      </div>

      <div style={S.banner}>
        <div style={S.bannerGlow} />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={S.bTag}>{group.name}</div>
          {!hasOpen ? (
            <>
              <div style={S.bBig}>🌙 지금은 모먼 시간이 아니에요</div>
              <div style={S.bSmall}>{recentMoment ? '지난 순간을 둘러보세요 · 알림이 오면 다시 찍어요' : '알림이 오면 다 같이 찍어요'}</div>
            </>
          ) : allJoined ? (
            <>
              <div style={S.bBig}>✨ 전원 도착!</div>
              <div style={S.bSmall}>{members.length}명 모두 이 순간을 남겼어요 🎉</div>
            </>
          ) : !iJoined ? (
            <>
              <div style={S.bBig}>📍 아직 안 찍었어요!</div>
              <div style={S.bSmall}>지금 모먼을 남겨보세요 · {joinedCount}/{members.length} 참여</div>
            </>
          ) : (
            <>
              <div style={S.bBig}>📍 지금 이 순간</div>
              <div style={S.bSmall}>{joinedCount}/{members.length} 참여{waiting.length ? ' · ' + waiting.slice(0,2).map(m=>m.display_name).join(', ') + (waiting.length>2?' 외':'') + ' 대기 중' : ''}</div>
            </>
          )}
        </div>
      </div>

      <div style={S.toggle}>
        {[['map', '📍 지도'], ['grid', '▦ 한눈에'], ['feed', '☰ 피드']].map(([k, label]) => (
          <button key={k} style={{ ...S.tBtn, ...(tab === k ? S.tBtnOn : {}) }} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      <div style={S.body}>
        {tab === 'map' && (
          <>
            <div style={S.mapWrap}><div ref={mapBoxRef} style={S.map} /></div>
            <div style={S.summary}>
              <span style={S.sChip}><span style={S.sKey}>참여</span> <b>{members.filter(m => displayByUser[m.user_id]).length}/{members.length}</b></span>
              {allHere ? <span style={S.sChip}>✨ <b>모두 같은 곳에!</b></span> : (
                <>
                  <span style={S.sSep} />
                  <span style={S.sChip}><span style={S.sKey}>평균</span> <b>{cnt ? fmtKm(avgD) : '-'}</b></span>
                  {farMember && <><span style={S.sSep} /><span style={S.sChip}><span style={S.sKey}>가장 먼</span> <b>{farMember.display_name} {fmtKm(farD)}</b></span></>}
                </>
              )}
            </div>
          </>
        )}

        {tab === 'grid' && (
          <div style={{ ...S.grid, gridTemplateColumns: members.length <= 1 ? '1fr' : members.length <= 4 ? '1fr 1fr' : '1fr 1fr 1fr' }}>
            {members.map(m => {
              const p = displayByUser[m.user_id]
              const url = p ? signed[p.id] : ''
              const hidden = p && !hasLoc(p)
              return (
                <div key={m.id} style={S.gcell} onClick={() => p && setViewPost(p)}>
                  {url ? <img src={url} style={S.gimg} alt="" /> : <div style={S.gwait}>📷</div>}
                  <div style={S.gname}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ ...S.gdot, background: m.color }} />
                      {m.display_name}{hidden ? '' : (m.user_id !== user.id && p ? ' · ' + distLabel(myPosRef.current, p) : '')}
                    </div>
                    <div style={S.gloc}>{!p ? (hasOpen ? '대기 중' : '·') : (hasLoc(p) ? (p.place_label || '위치') : '🔒 위치 없이')}</div>
                  </div>
                  {p && <div style={S.gtime}>{hhmm(p.created_at)}</div>}
                </div>
              )
            })}
          </div>
        )}

        {tab === 'feed' && (
          <div style={S.feed}>
            {displayPosts.length === 0 ? (
              hasOpen
                ? <div style={S.empty}>아직 아무도 안 찍었어요 📍<br/>이번 모먼의 첫 순간을 남겨보세요</div>
                : <div style={S.empty}>지금은 모먼 시간이 아니에요 🌙<br/>알림이 오면 다 같이 찍어요</div>
            ) :
              displayPosts.map(p => {
                const url = signed[p.id]
                const hidden = !hasLoc(p)
                return (
                  <div key={p.id} style={S.card} onClick={() => setViewPost(p)}>
                    <div style={S.cardPhoto}>
                      {url ? <img src={url} style={S.cardImg} alt="" /> : <div style={S.cardNo}>📷</div>}
                      <div style={S.cardLoc}>{!hasLoc(p) ? '🔒 위치 없이' : '📍 ' + (p.place_label || '위치') + (p.user_id !== user.id ? ' · ' + distLabel(myPosRef.current, p) : '')}</div>
                      <div style={S.cardTime}>{p.is_late ? '⏰ 늦참 · ' : ''}{hhmm(p.created_at)}</div>
                    </div>
                    <div style={S.cardFoot}>
                      <div style={{ ...S.avatar, width: 30, height: 30, background: colorOf(p.user_id) }}>{nameOf(p.user_id)[0]}</div>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{nameOf(p.user_id)}{p.user_id === user.id && <span style={S.meTag}>나</span>}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9b9ba3' }}>{ago(p.created_at)}</span>
                    </div>
                  </div>
                )
              })}
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPickFile} />
        {canShoot ? (
          <>
            <div style={S.countdown}>📍 지금 찍어요! · ⏱️ <b>{remainLabel}</b> 남음</div>
            <button style={{ ...S.shoot, opacity: busy ? .6 : 1 }} disabled={busy} onClick={() => { includeLocRef.current = true; fileRef.current && fileRef.current.click() }}>{busy ? '올리는 중…' : '📍 모먼 찍기'}</button>
          </>
        ) : (
          <div style={S.waitBox}>
            <div style={S.waitTitle}>⏳ 지금은 모먼 시간이 아니에요</div>
            <div style={S.waitSub}>알림이 오면 다 같이 찍어요</div>
            {isOwner && <button style={{ ...S.startBtn, opacity: busy ? .6 : 1 }} disabled={busy} onClick={startMoment}>📍 지금 모먼 시작하기</button>}
          </div>
        )}

        <div style={S.label}>멤버</div>
        {loading ? <div style={S.muted}>불러오는 중…</div> : members.map(m => {
          const pActive = postByUser[m.user_id]   // 열린 모먼 참여 여부 (✓/대기)
          const pDisp = displayByUser[m.user_id]   // 표시용 (지난 결과 포함)
          const dist = pDisp && m.user_id !== user.id && hasLoc(pDisp) ? distLabel(myPosRef.current, pDisp) : ''
          return (
            <div key={m.id} style={S.memberRow}>
              <div style={{ position: 'relative' }}>
                <div style={{ ...S.avatar, background: m.color, opacity: pDisp ? 1 : 0.4 }}>{m.display_name[0]}</div>
                {hasOpen && <span style={{ ...S.statusDot, background: pActive ? '#13bca4' : '#d8d8de' }}>{pActive ? '✓' : ''}</span>}
              </div>
              <div style={{ flex: 1, fontWeight: 600 }}>
                {m.display_name}{m.user_id === user.id && <span style={S.meTag}>나</span>}
                {dist && <span style={S.distTag}>{dist}</span>}
              </div>
              <span style={S.shareTag}>{hasOpen && !pActive ? '⏳ 대기 중' : (!pDisp ? '·' : (hasLoc(pDisp) ? '📍 ' + (pDisp.place_label || '위치') : '🔒 위치 없이'))}</span>
            </div>
          )
        })}
      </div>

      {viewPost && (
        <div style={S.pop} onClick={() => setViewPost(null)}>
          <div style={S.popCard} onClick={e => e.stopPropagation()}>
            <div style={S.popPhoto}>{bigUrl ? <img src={bigUrl} style={S.popImg} alt="" /> : <div style={S.popLoading}>불러오는 중…</div>}</div>
            <div style={S.popInfo}>
              <div style={{ ...S.avatar, background: colorOf(viewPost.user_id) }}>{nameOf(viewPost.user_id)[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{nameOf(viewPost.user_id)}</div>
                <div style={{ fontSize: 12, color: '#9b9ba3' }}>{!hasLoc(viewPost) ? '🔒 위치 없이' : '📍 ' + (viewPost.place_label || '위치') + (viewPost.user_id !== user.id ? ' · ' + distLabel(myPosRef.current, viewPost) : '')} · {hhmm(viewPost.created_at)}</div>
              </div>
              <button style={S.popX} onClick={() => setViewPost(null)}>✕</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  )
}

const S = {
  app: { width: '100%', maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#fafafa', fontFamily: "'Outfit','Gowun Dodum',sans-serif", color: '#16161a', paddingBottom: 30 },
  top: { position: 'sticky', top: 0, zIndex: 1000, background: 'rgba(250,250,250,.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #efeff2', padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoRow: { display: 'flex', alignItems: 'center', gap: 8 },
  logoDot: { width: 24, height: 24, borderRadius: '8px 8px 8px 3px', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)' },
  logoName: { fontSize: 18, fontWeight: 700, letterSpacing: '-.4px' },
  codeBtn: { border: 'none', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', color: '#fff', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '8px 13px', borderRadius: 20, cursor: 'pointer', boxShadow: '0 4px 12px rgba(255,77,94,.3)' },
  banner: { position: 'relative', margin: '14px 14px 0', borderRadius: 22, overflow: 'hidden', background: 'linear-gradient(120deg,#16161a,#2a2030)', color: '#fff', boxShadow: '0 12px 40px rgba(20,20,30,.18)' },
  bannerGlow: { position: 'absolute', width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,.1)', right: -40, top: -40, filter: 'blur(10px)' },
  bTag: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: .8, padding: '18px 20px 0' },
  bBig: { fontSize: 24, fontWeight: 700, letterSpacing: '-.5px', padding: '3px 20px 0' },
  bSmall: { fontSize: 13, opacity: .85, padding: '3px 20px 18px' },
  toggle: { display: 'flex', gap: 6, background: '#f0f0f3', borderRadius: 24, padding: 4, margin: '14px 14px 0' },
  tBtn: { flex: 1, border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: '#9b9ba3', padding: 9, borderRadius: 20, cursor: 'pointer' },
  tBtnOn: { background: '#fff', color: '#16161a', boxShadow: '0 2px 8px rgba(0,0,0,.08)' },
  body: { padding: 14 },
  mapWrap: { position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 24px rgba(20,20,30,.07)', marginBottom: 12, zIndex: 0, isolation: 'isolate' },
  map: { width: '100%', height: 300 },
  summary: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', background: '#fff', borderRadius: 14, padding: '11px 14px', boxShadow: '0 4px 24px rgba(20,20,30,.07)', marginBottom: 16, fontSize: 13 },
  sChip: { display: 'inline-flex', alignItems: 'center', gap: 5 },
  sKey: { color: '#9b9ba3', fontWeight: 500 },
  sSep: { width: 1, height: 14, background: '#efeff2' },
  grid: { display: 'grid', gap: 8, marginBottom: 16 },
  gcell: { position: 'relative', aspectRatio: '3/4', borderRadius: 16, overflow: 'hidden', background: '#f0f0f3', cursor: 'pointer', boxShadow: '0 4px 16px rgba(20,20,30,.08)' },
  gimg: { width: '100%', height: '100%', objectFit: 'cover' },
  gwait: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#c4c4cc' },
  gname: { position: 'absolute', left: 7, bottom: 7, right: 7, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.7)' },
  gloc: { fontSize: 10, fontWeight: 600, opacity: .92 },
  gdot: { width: 7, height: 7, borderRadius: '50%', flex: 'none' },
  gtime: { position: 'absolute', right: 7, top: 7, background: 'rgba(0,0,0,.5)', color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 12 },
  feed: { display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 },
  empty: { textAlign: 'center', color: '#9b9ba3', padding: '40px 20px', fontSize: 14, lineHeight: 1.6 },
  card: { background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 24px rgba(20,20,30,.08)', cursor: 'pointer' },
  cardPhoto: { position: 'relative', aspectRatio: '4/5', background: '#222' },
  cardImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  cardNo: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60 },
  cardLoc: { position: 'absolute', left: 12, bottom: 12, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(8px)', color: '#fff', fontSize: 12.5, fontWeight: 500, padding: '7px 12px', borderRadius: 30 },
  cardTime: { position: 'absolute', right: 12, bottom: 12, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(8px)', color: '#fff', fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 30 },
  cardFoot: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' },
  shoot: { width: '100%', border: 'none', borderRadius: 16, padding: 16, fontFamily: 'inherit', fontSize: 16, fontWeight: 700, cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 8px 20px rgba(255,77,94,.3)', marginBottom: 10 },
  countdown: { textAlign: 'center', background: '#fff1ed', border: '1.5px solid #ffd9cc', color: '#e0593c', borderRadius: 14, padding: '11px 14px', fontSize: 14, fontWeight: 600, marginBottom: 10 },
  waitBox: { textAlign: 'center', background: '#fff', borderRadius: 18, padding: '22px 18px', boxShadow: '0 4px 24px rgba(20,20,30,.06)' },
  waitTitle: { fontSize: 15, fontWeight: 700, color: '#16161a', marginBottom: 4 },
  waitSub: { fontSize: 13, color: '#9b9ba3', marginBottom: 14 },
  startBtn: { border: 'none', borderRadius: 14, padding: '13px 20px', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 6px 16px rgba(255,77,94,.28)' },
  shootGhost: { width: '100%', border: '1.5px solid #efeff2', borderRadius: 14, padding: 13, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#6b6b73', background: '#fff', marginBottom: 14 },
  subBtns: { display: 'flex', gap: 10, marginBottom: 22 },
  subBtnOn: { background: '#eafaf6', borderColor: '#13bca4', color: '#0e9d88' },
  subBtn: { flex: 1, border: '1.5px solid #efeff2', background: '#fff', color: '#16161a', borderRadius: 14, padding: 12, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  label: { fontSize: 12, fontWeight: 600, color: '#9b9ba3', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 10 },
  muted: { color: '#9b9ba3', fontSize: 14 },
  memberRow: { display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderBottom: '1px solid #f4f4f6' },
  avatar: { width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, flex: 'none', fontSize: 14 },
  meTag: { fontSize: 11, color: '#9b9ba3', fontWeight: 600, marginLeft: 7 },
  statusDot: { position: 'absolute', right: -2, bottom: -2, width: 16, height: 16, borderRadius: '50%', border: '2px solid #fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 700 },
  distTag: { fontSize: 12, color: '#13bca4', fontWeight: 700, marginLeft: 7 },
  shareTag: { fontSize: 12, color: '#9b9ba3', fontWeight: 500 },
  statsBtn: { width: '100%', border: 'none', borderRadius: 14, padding: 14, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#16161a', background: 'linear-gradient(135deg,#fff1ed,#ffe9e0)', border: '1.5px solid #ffd9cc', marginTop: 24 },
  actions: { display: 'flex', gap: 10, marginTop: 24 },
  ghost: { flex: 1, border: '1.5px solid #efeff2', background: '#fff', color: '#16161a', borderRadius: 14, padding: 13, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  pop: { position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(10,10,14,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  popCard: { width: '100%', maxWidth: 360, background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.5)' },
  popPhoto: { aspectRatio: '4/5', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  popImg: { width: '100%', height: '100%', objectFit: 'cover' },
  popLoading: { color: '#fff', fontSize: 13 },
  popInfo: { display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px' },
  popX: { marginLeft: 'auto', background: '#f0f0f3', border: 'none', width: 34, height: 34, borderRadius: '50%', fontSize: 16, cursor: 'pointer', color: '#9b9ba3' },
  toast: { position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#16161a', color: '#fff', padding: '12px 20px', borderRadius: 30, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,.3)', zIndex: 4000 },
}
