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
async function reverseGeocode(lat, lng) {
  try {
    // 서버의 /api/geocode 프록시를 거쳐 카카오 로컬 API로 행정동 이름을 받아옴
    // (카카오 REST API 키를 클라이언트에 노출하지 않기 위함)
    const url = `/api/geocode?lat=${lat}&lng=${lng}`
    const r = await fetch(url)
    if (!r.ok) return '위치'
    const j = await r.json()
    return j.label || '위치'
  } catch { return '위치' }
}
function hhmm(ts) { const d = new Date(ts); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') }
function ago(ts) { const d = (Date.now() - new Date(ts).getTime()) / 1000; if (d < 60) return '방금'; if (d < 3600) return Math.floor(d / 60) + '분 전'; return Math.floor(d / 3600) + '시간 전' }

export default function Home({ user, group, profileVersion, isActive, onMembersLoaded }) {
  const [members, setMembers] = useState([])
  const [posts, setPosts] = useState([])
  const [streak, setStreak] = useState(null)          // 스트릭: {count, best, week, missing, todayDone}
  const [showStreak, setShowStreak] = useState(false) // 스트릭 상세 모달
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [uploadStep, setUploadStep] = useState('')  // '위치', '업로드', '기록'
  const [toast, setToast] = useState('')
  const [tab, setTab] = useState('map')
  const [viewPost, setViewPost] = useState(null)
  const [bigUrl, setBigUrl] = useState('')
  const [signed, setSigned] = useState({})
  const [pushOn, setPushOn] = useState(false)
  const [moments, setMoments] = useState([])
  const [likes, setLikes] = useState([])
  const [confetti, setConfetti] = useState(false)
  const [poppingHeart, setPoppingHeart] = useState(null)
  const prevAllJoinedRef = useRef(false)
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
  // 프로필(이름·색) 변경 시 멤버 다시 불러오기
  useEffect(() => { if (profileVersion) loadMembers() }, [profileVersion])
  useEffect(() => { loadMoments() }, [group.id])
  useEffect(() => { loadLikes() }, [group.id])
  // 앱이 백그라운드에 있다가 다시 화면에 보이게 될 때(예: 알림 클릭으로 복귀) 최신 안부 상태를 재조회.
  // 실시간 구독이 백그라운드 동안 이벤트를 놓쳤을 수 있어, 포그라운드 복귀 시점에 한 번 더 확인한다.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        loadMoments(); loadPosts(); loadLikes()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [group.id])
  // 다른 탭(그룹/마이페이지)에 있다가 홈 탭으로 다시 돌아올 때도 최신화
  useEffect(() => {
    if (isActive) { loadMoments(); loadPosts(); loadLikes() }
  }, [isActive])
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const lch = supabase.channel('likes-' + group.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_likes', filter: 'group_id=eq.' + group.id }, () => loadLikes())
      .subscribe()
    return () => { supabase.removeChannel(lch) }
  }, [group.id])
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
    let res = await supabase.from('members').select('id,user_id,share_location,display_name,color').eq('group_id', group.id).order('joined_at', { ascending: true })
    if (res.error) { flash(res.error.message); setLoading(false); return }
    let list = res.data || []
    // 이름·색 우선순위: 그룹별 설정(members) > 계정 기본 프로필(profiles)
    const uids = list.map(m => m.user_id).filter(Boolean)
    if (uids.length) {
      let pres = await supabase.from('profiles').select('user_id,display_name,color').in('user_id', uids)
      const pmap = {}
      if (!pres.error && pres.data) pres.data.forEach(p => { pmap[p.user_id] = p })
      list = list.map(m => {
        const p = pmap[m.user_id]
        return {
          ...m,
          // members에 그룹별 값이 있으면 그걸, 없으면 프로필 기본값, 그것도 없으면 fallback
          display_name: m.display_name || (p && p.display_name) || '?',
          color: m.color || (p && p.color) || '#888',
        }
      })
    }
    setMembers(list); membersRef.current = list
    setLoading(false)
    drawPins()
    loadStreak()
    if (onMembersLoaded) onMembersLoaded(list)
  }

  async function loadPosts() {
    let res = await supabase.from('posts').select('id,moment_id,user_id,img_back,img_front,lat,lng,place_label,created_at,is_late').eq('group_id', group.id).order('created_at', { ascending: false })
    if (res.error) { flash(res.error.message); return }
    const seen = {}, latest = []
    for (const p of (res.data || [])) { if (seen[p.user_id]) continue; seen[p.user_id] = true; latest.push(p) }
    setPosts(latest)
    loadStreak()
  }

  // ── 스트릭: 그룹 전원이 그날 안부를 남기면 1일 적립 ──
  async function loadStreak() {
    // 최근 120일치 (날짜, user_id)만 가볍게 조회
    const since = new Date(Date.now() - 120 * 86400000).toISOString()
    let res = await supabase.from('posts').select('user_id,created_at').eq('group_id', group.id).gte('created_at', since)
    if (res.error) return
    const mems = membersRef.current
    if (!mems.length) return
    const memberIds = new Set(mems.map(m => m.user_id))

    // KST 날짜별 참여 유저셋
    const byDay = {}
    for (const p of (res.data || [])) {
      const kst = new Date(new Date(p.created_at).getTime() + 9 * 3600000)
      const key = kst.toISOString().slice(0, 10)
      if (!byDay[key]) byDay[key] = new Set()
      if (memberIds.has(p.user_id)) byDay[key].add(p.user_id)
    }
    const isFull = key => byDay[key] && byDay[key].size >= memberIds.size

    // 오늘(KST) 키
    const todayKey = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)
    const dayKey = offset => new Date(Date.now() + 9 * 3600000 - offset * 86400000).toISOString().slice(0, 10)

    // 연속일: 오늘 완료면 오늘부터, 아니면 어제부터 역산
    let count = 0
    let start = isFull(todayKey) ? 0 : 1
    for (let i = start; i < 120; i++) {
      if (isFull(dayKey(i))) count++
      else break
    }

    // 최고 기록 (120일 범위 내)
    let best = 0, run = 0
    for (let i = 119; i >= 0; i--) {
      if (isFull(dayKey(i))) { run++; if (run > best) best = run }
      else run = 0
    }

    // 이번 주 (월~일) 달성 현황
    const kstNow = new Date(Date.now() + 9 * 3600000)
    const dow = (kstNow.getUTCDay() + 6) % 7  // 월=0
    const week = []
    for (let i = 0; i < 7; i++) {
      const key = dayKey(dow - i)
      week.push({ label: ['월','화','수','목','금','토','일'][i], key, done: isFull(key), isToday: key === todayKey, future: i > dow })
    }

    // 오늘 아직 안 남긴 멤버 수
    const todaySet = byDay[todayKey] || new Set()
    const missing = mems.filter(m => !todaySet.has(m.user_id)).length

    setStreak({ count, best, week, missing, todayDone: isFull(todayKey) })
  }

  async function loadLikes() {
    let res = await supabase.from('post_likes').select('post_id,user_id').eq('group_id', group.id)
    if (!res.error) setLikes(res.data || [])
  }

  async function toggleLike(post) {
    const mine = likes.some(l => l.post_id === post.id && l.user_id === user.id)
    if (!mine) { setPoppingHeart(post.id); setTimeout(() => setPoppingHeart(null), 450) }
    // 낙관적 업데이트
    if (mine) setLikes(prev => prev.filter(l => !(l.post_id === post.id && l.user_id === user.id)))
    else setLikes(prev => [...prev, { post_id: post.id, user_id: user.id }])
    if (mine) {
      await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', user.id)
    } else {
      await supabase.from('post_likes').upsert({ post_id: post.id, group_id: group.id, user_id: user.id }, { onConflict: 'post_id,user_id' })
    }
  }

  function likeInfo(postId) {
    let count = 0, mine = false
    for (const l of likes) { if (l.post_id === postId) { count++; if (l.user_id === user.id) mine = true } }
    return { count, mine }
  }

  async function loadMoments() {
    let res = await supabase.from('moments').select('id,fired_at,deadline').eq('group_id', group.id).order('fired_at', { ascending: false }).limit(20)
    if (!res.error) { setMoments(res.data || []); setNowTick(Date.now()) }  // moments 로드 후 즉시 리렌더
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
  function hasLoc(p) { return !!(p && p.lat != null && p.lng != null) }  // 그 안부에 위치가 포함됐는지

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
      // 위치 포함 안부만 핀 표시 (lat/lng 없으면 이미 위에서 skip)
      let imgUrl = signed[p.id] || ''
      if (!imgUrl && p.img_back) { let s = await supabase.storage.from('moments').createSignedUrl(p.img_back, 3600); if (!s.error && s.data) imgUrl = s.data.signedUrl }
      const color = colorOf(p.user_id)
      const nm = nameOf(p.user_id)
      const pinBg = imgUrl
        ? `background-image:url('${imgUrl}');background-size:cover;background-position:center;`
        : `background:${color};`
      // 물방울(핀) 모양: 원 + 아래로 뾰족한 꼬리. clip-path로 형태를 잡고 사진/색은 배경으로 채움
      const inner = `
        <div style="position:relative;width:46px;height:58px;filter:drop-shadow(0 4px 10px rgba(0,0,0,.35));">
          <div style="position:absolute;inset:0;background:#fff;clip-path:path('M23 0C10.3 0 0 10.3 0 23c0 15 23 35 23 35s23-20 23-35C46 10.3 35.7 0 23 0Z');"></div>
          <div style="position:absolute;top:3px;left:3px;right:3px;bottom:13px;border-radius:50%;${pinBg}display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;">${imgUrl ? '' : nm[0]}</div>
        </div>`
      const label = `<div style="margin-top:2px;background:#16161a;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3);">${nm}</div>`
      const html = `<div style="display:flex;flex-direction:column;align-items:center;">${inner}${label}</div>`
      const icon = L.divIcon({ html, className: '', iconSize: [60, 82], iconAnchor: [30, 58] })
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
    if (!isOwner) { flash('그룹을 만든 사람만 안부를 시작할 수 있어요'); return }
    setBusy(true)
    const now = new Date()
    // 이미 열린 안부 시간이 있으면 새로 만들지 않고 재사용 (중복 방지)
    let openRes = await supabase.from('moments').select('id')
      .eq('group_id', group.id)
      .lte('fired_at', now.toISOString())
      .gte('deadline', now.toISOString())
      .limit(1)
    if (openRes.data && openRes.data.length > 0) {
      setBusy(false)
      await loadMoments()
      flash('이미 안부 시간이 진행 중이에요 📍')
      try { fetch(window.location.origin + '/api/send-moment?groupId=' + group.id) } catch {}
      return
    }
    // 하루 발동 횟수 제한 (마감시간 재설정으로 무제한 촬영되는 것 방지)
    // 정해진 시간 모드: 하루 허용 = 설정된 시간 개수, 랜덤 모드: 하루 1회. 최소 1, 안전상한 5.
    const modeTimes = Array.isArray(group.fixed_times) ? group.fixed_times.length : 0
    const dailyLimit = Math.min(5, Math.max(1, group.alarm_mode === 'random' ? 1 : modeTimes))
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0)
    let todayRes = await supabase.from('moments')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', group.id)
      .gte('fired_at', startOfDay.toISOString())
    const firedToday = todayRes.count || 0
    if (firedToday >= dailyLimit) {
      setBusy(false)
      flash('오늘은 이미 안부를 다 남겼어요 (하루 ' + dailyLimit + '회) 🌙')
      return
    }
    const deadline = new Date(now.getTime() + (group.window_min || 3) * 60000)
    let res = await supabase.from('moments').insert({ group_id: group.id, fired_at: now.toISOString(), deadline: deadline.toISOString() }).select().single()
    setBusy(false)
    if (res.error) { flash('안부 시작 실패: ' + res.error.message); return }
    await loadMoments()
    flash('📍 안부 시간 시작! 다 같이 안부를 전해요 (' + (group.window_min||3) + '분)')
    try { fetch(window.location.origin + '/api/send-moment?groupId=' + group.id) } catch {}
  }

    async function onPickFile(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setUploadStep('위치')
    try {
      const loc = await getLoc()
      if (!loc) { flash('위치를 가져올 수 없어요. 위치 권한을 켜주세요 📍'); setBusy(false); setUploadStep(''); return }
      const dongLabel = await reverseGeocode(loc.lat, loc.lng)
      setUploadStep('업로드')
      const postId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))
      const path = `${group.id}/${postId}_back.jpg`
      let up = await supabase.storage.from('moments').upload(path, file, { upsert: true })
      if (up.error) { flash('업로드 실패: ' + up.error.message); setBusy(false); setUploadStep(''); return }
      // 열린 안부에만 제출 (열린 안부 없으면 찍기 자체가 막혀있음)
      const target = openMomentRef.current
      if (!target) { flash('지금은 안부 시간이 아니에요'); setBusy(false); setUploadStep(''); return }
      const momentId = target.id
      const late = new Date() > new Date(target.deadline)
      setUploadStep('기록')
      let pres = await supabase.from('posts').upsert({
        moment_id: momentId, group_id: group.id, user_id: user.id,
        img_back: path, lat: loc.lat, lng: loc.lng,
        place_label: dongLabel, is_late: late,
      }, { onConflict: 'moment_id,user_id' })
      if (pres.error) { flash('기록 실패: ' + pres.error.message); setBusy(false); setUploadStep(''); return }
      flash('안부 전했어요! ✨')
      await loadPosts()
      await loadMoments()
      if (loc && mapRef.current) mapRef.current.setView([loc.lat, loc.lng], 15)
    } catch (err) { flash('오류: ' + (err.message || err)) }
    setBusy(false); setUploadStep('')
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
        user_id: user.id,
        endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth,
      }, { onConflict: 'endpoint' })
      if (res.error) { flash('구독 저장 실패: ' + res.error.message); return }
      setPushOn(true)
      flash('알림 켜짐! 이제 안부 알림을 받아요 🔔')
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
          await supabase.from('push_subscriptions').delete().eq('endpoint', ep)
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
    const text = `우리 ${group.name} 닿음 같이 쓰자! 📍\n이 링크 누르고 가입하면 끝:\n${link}`
    try { await navigator.clipboard.writeText(text) } catch {}
    flash('초대 링크 복사됨! 카톡에 붙여넣기 ✨')
  }

  // 열린 안부 판정
  const _now = new Date(nowTick)
  const openMoments = moments.filter(m => new Date(m.fired_at) <= _now && _now <= new Date(m.deadline))
  // 사진 찍기용: 가장 먼저 시작된 열린 안부로 통일 (모두 같은 곳에 모이게)
  const openMoment = openMoments.slice().sort((a,b)=>new Date(a.fired_at)-new Date(b.fired_at))[0] || null
  // 가장 최근 안부 (열린 게 없을 때 '지난 결과'로 보여주기 위함)
  const recentMoment = moments.slice().sort((a,b)=>new Date(b.fired_at)-new Date(a.fired_at))[0] || null
  // 표시용 안부: 열린 안부 있으면 그것들, 없으면 가장 최근 안부 (사진은 다음 안부 전까지 남김)
  const displayMomentIds = openMoments.length ? openMoments.map(m=>m.id) : (recentMoment ? [recentMoment.id] : [])
  // 참여/재촉용: 열린 안부만 (지난 안부는 재촉 안 함)
  const activeMomentIds = openMoments.map(m=>m.id)
  const activeMomentId = activeMomentIds[0] || null
  // 표시용 posts (지도/한눈에/피드) — 지난 결과 포함
  const displayPosts = posts.filter(p => displayMomentIds.includes(p.moment_id))
  // 참여 판정용 postByUser — 열린 안부만 (재촉/현황 계산)
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

  useEffect(() => {
    if (!hasOpen || !allJoined || !openMoment) { prevAllJoinedRef.current = hasOpen && allJoined; return }
    // 이 안부에 대해 이미 축하했는지 확인 (설정 갔다 오거나 새로고침해도 재생 안 되게)
    const celebKey = 'mp_celebrated_' + openMoment.id
    let alreadyCelebrated = false
    try { alreadyCelebrated = sessionStorage.getItem(celebKey) === '1' } catch {}
    if (!prevAllJoinedRef.current && !alreadyCelebrated) {
      setConfetti(true)
      setTimeout(() => setConfetti(false), 2600)
      try { sessionStorage.setItem(celebKey, '1') } catch {}
    }
    prevAllJoinedRef.current = hasOpen && allJoined
  }, [allJoined, hasOpen, openMoment?.id])

  return (
    <div style={S.app}>
      {confetti && <Confetti />}
      <div style={S.top}>
        <div style={S.logoRow}>
          <img src="/logo.svg" alt="닿음" style={S.logoDot} />
          <div>
            <div style={S.logoName}>닿음</div>
            <div style={S.groupLabel}>{group.name}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.codeBtn} onClick={copyInviteLink}>🔗 초대</button>
        </div>
      </div>

      {(() => {
        const now = new Date();
        const isXmas = now.getMonth() === 11 && now.getDate() === 25;
        // 테스트용: 주소 뒤에 ?xmas=1 붙이면 날짜 상관없이 배너 표시
        const forceXmas = new URLSearchParams(window.location.search).get('xmas') === '1';
        if (!isXmas && !forceXmas) return null;
        return (
          <a href="https://xmas-gift-ten.vercel.app" target="_blank" rel="noopener noreferrer" style={S.xmasBanner}>
            <span style={{ fontSize: 20 }}>🎁</span>
            <span style={S.xmasBannerText}>
              <b>크리스마스 선물이 도착했어요</b>
              <span style={S.xmasBannerSub}>올 한 해 우리의 순간들을 열어보세요 →</span>
            </span>
          </a>
        );
      })()}


      <div style={S.banner}>
        <div style={S.bannerGlow} />
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={S.bTag}>{group.name}</div>
          {!hasOpen ? (
            <>
              <div style={S.bBig}>🌙 지금은 안부 시간이 아니에요</div>
              <div style={S.bSmall}>{recentMoment ? '지난 안부를 둘러보세요 · 알림이 오면 다시 전해요' : '안부 시간이 되면 알림이 와요'}</div>
            </>
          ) : allJoined ? (
            <>
              <div style={S.bBig} className="pop-in">✨ 모두의 안부가 도착했어요</div>
              <div style={S.bSmall}>{members.length}명 모두 이 순간을 남겼어요 🎉</div>
            </>
          ) : !iJoined ? (
            <>
              <div style={S.bBig}>📍 아직 안부를 안 전했어요</div>
              <div style={S.bSmall}>지금 안부를 남겨보세요 · {joinedCount}/{members.length} 참여</div>
            </>
          ) : (
            <>
              <div style={S.bBig}>📍 지금, 안부를 전할 시간</div>
              <div style={S.bSmall}>{joinedCount}/{members.length} 참여{waiting.length ? ' · ' + waiting.slice(0,2).map(m=>m.display_name).join(', ') + (waiting.length>2?' 외':'') + ' 대기 중' : ''}</div>
            </>
          )}
        </div>
      </div>

      {/* 혼자일 때 초대 유도 배너 (콜드 스타트 해소) */}
      {members.length <= 1 && (
        <button style={S.inviteBanner} onClick={copyInviteLink}>
          <span style={S.inviteIcon}>💌</span>
          <span style={{ flex: 1, textAlign: 'left' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#7a2e14' }}>가족·친구를 초대해보세요</span>
            <span style={{ display: 'block', fontSize: 11.5, color: '#9e5a3e', marginTop: 2 }}>함께여야 안부를 나눌 수 있어요 · 탭하면 초대 링크 복사</span>
          </span>
          <span style={S.inviteArrow}>🔗</span>
        </button>
      )}

      {/* 스트릭 배너 */}
      {streak && streak.count > 0 && (
        <button style={S.streakBanner} onClick={() => setShowStreak(true)}>
          <span style={{ fontSize: 20 }}>🔥</span>
          <span style={{ flex: 1, textAlign: 'left' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{streak.count}일 연속 안부</span>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--mp-muted)', marginTop: 1 }}>{group.name}이(가) 함께 이어온 기록이에요</span>
          </span>
          <span style={{ color: '#ff7a45', fontSize: 12, fontWeight: 700 }}>D+{streak.count}</span>
        </button>
      )}

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
                <div key={m.id} style={S.gcellWrap} onClick={() => p && setViewPost(p)}>
                  <div style={S.gcell}>
                    {url ? <img src={url} style={S.gimg} alt="" /> : <div style={S.gwait}>📷</div>}
                  </div>
                  <div style={S.gMeta}>
                    <span style={{ ...S.gdot, background: m.color }} />
                    <span style={S.gMetaName}>{m.display_name}</span>
                    {p && hasLoc(p) && <><span style={S.gMetaSep}>·</span><span style={S.gMetaLoc}>📍 {p.place_label || '위치'}</span></>}
                    {!p && hasOpen && <><span style={S.gMetaSep}>·</span><span style={S.gMetaLoc}>⏳ 대기 중</span></>}
                    {p && <span style={S.gMetaTime}>{hhmm(p.created_at)}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'feed' && (
          <div style={S.feed}>
            {displayPosts.length === 0 ? (
              hasOpen
                ? <div style={S.empty}>아직 아무도 안 남겼어요 📍<br/>이번 시간의 첫 안부를 전해보세요</div>
                : <div style={S.empty}>아직 나눈 안부가 없어요 🌙<br/>첫 안부를 기다리고 있어요</div>
            ) :
              displayPosts.map(p => {
                const url = signed[p.id]
                const hidden = !hasLoc(p)
                return (
                  <div key={p.id} style={S.card} onClick={() => setViewPost(p)}>
                    <div style={S.cardPhoto}>
                      {url ? <img src={url} style={S.cardImg} alt="" /> : <div style={S.cardNo}>📷</div>}
                    </div>
                    <div style={S.gMeta}>
                      <span style={{ ...S.gdot, background: colorOf(p.user_id) }} />
                      <span style={S.gMetaName}>{nameOf(p.user_id)}{p.user_id === user.id && <span style={S.meTag}>나</span>}</span>
                      {hasLoc(p) && <><span style={S.gMetaSep}>·</span><span style={S.gMetaLoc}>📍 {p.place_label || '위치'}</span></>}
                      <span style={S.gMetaTime}>{p.is_late ? '⏰ · ' : ''}{hhmm(p.created_at)}</span>
                    </div>
                    {/* 하단: 경과시간 + 좋아요 */}
                    <div style={S.cardFoot}>
                      <span style={{ fontSize: 12, color: 'var(--mp-muted)' }}>{ago(p.created_at)}</span>
                      {(() => { const li = likeInfo(p.id); return (
                        <button style={{ ...S.likeBtn, marginLeft: 'auto', ...(li.mine ? S.likeBtnOn : {}) }} onClick={(e) => { e.stopPropagation(); toggleLike(p) }}>
                          <span className={poppingHeart === p.id ? 'heart-pop' : ''} style={{ display: 'inline-block' }}>{li.mine ? '❤️' : '🤍'}</span>{li.count > 0 && <span style={S.likeCount}>{li.count}</span>}
                        </button>
                      )})()}
                    </div>
                  </div>
                )
              })}
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPickFile} />
        {tab === 'map' && (canShoot ? (
          <>
            <div style={S.countdown}>📍 지금 찍어요! · ⏱️ <b>{remainLabel}</b> 남음</div>
            <button style={{ ...S.shoot, opacity: busy ? .85 : 1 }} disabled={busy} onClick={() => { includeLocRef.current = true; fileRef.current && fileRef.current.click() }}>
              {busy
                ? <span style={S.stepWrap}>
                    <span>{uploadStep === '위치' ? '위치 확인 중' : uploadStep === '업로드' ? '사진 올리는 중' : '안부 전하는 중'}</span>
                    <span style={S.stepDots}>
                      {['위치','업로드','기록'].map((s,i) => {
                        const order = ['위치','업로드','기록'].indexOf(uploadStep)
                        return <span key={s} style={{ ...S.stepDot, ...(i <= order ? S.stepDotOn : {}) }} />
                      })}
                    </span>
                  </span>
                : '📍 안부 남기기'}
            </button>
          </>
        ) : (
          <div style={S.waitBox}>
            <div style={S.waitTitle}>🌙 안부를 기다리는 중</div>
            <div style={S.waitSub}>시간이 되면 다 같이 안부를 나눠요</div>
          </div>
        ))}

        {tab === 'map' && <div style={S.label}>멤버</div>}
        {loading ? <MemberSkeleton /> : members.map(m => {
          if (tab !== 'map') return null   // 지도 탭에서만 멤버 리스트 표시
          const pActive = postByUser[m.user_id]   // 열린 안부 참여 여부 (✓/대기)
          const pDisp = displayByUser[m.user_id]   // 표시용 (지난 결과 포함)
          const dist = pDisp && m.user_id !== user.id && hasLoc(pDisp) ? distLabel(myPosRef.current, pDisp) : ''
          return (
            <div key={m.id} style={S.memberRow}>
              <div style={{ position: 'relative' }}>
                <div style={{ ...S.avatar, background: m.color, opacity: pDisp ? 1 : 0.4 }}>{m.display_name[0]}</div>
                {hasOpen && <span style={{ ...S.statusDot, background: pActive ? '#13bca4' : '#d8d8de' }}>{pActive ? '✓' : ''}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                  {m.display_name}{m.user_id === group.created_by && <span style={S.crown} title="그룹장">👑</span>}{m.user_id === user.id && <span style={S.meTag}>나</span>}
                  {dist && <span style={S.distTag}>{dist}</span>}
                  <span style={{ fontSize: 11, color: 'var(--mp-muted)', fontWeight: 500 }}>
                    {hasOpen && !pActive ? '⏳ 대기 중' : (!pDisp ? '' : (hasLoc(pDisp) ? '· 📍 ' + (pDisp.place_label || '위치') : '· 🔒 위치 없이'))}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {viewPost && (
        <div style={S.pop} onClick={() => setViewPost(null)}>
          <div style={S.popCard} onClick={e => e.stopPropagation()}>
            <div style={S.popPhoto}>{bigUrl ? <ZoomImage src={bigUrl} /> : <div style={S.popLoading}>불러오는 중…</div>}</div>
            <div style={S.popInfo}>
              <div style={{ ...S.avatar, background: colorOf(viewPost.user_id) }}>{nameOf(viewPost.user_id)[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{nameOf(viewPost.user_id)}</div>
                <div style={{ fontSize: 12, color: 'var(--mp-muted)' }}>{!hasLoc(viewPost) ? '🔒 위치 없이' : '📍 ' + (viewPost.place_label || '위치') + (viewPost.user_id !== user.id ? ' · ' + distLabel(myPosRef.current, viewPost) : '')} · {hhmm(viewPost.created_at)}</div>
              </div>
              {(() => { const li = likeInfo(viewPost.id); return (
                <button style={{ ...S.likeBtn, ...(li.mine ? S.likeBtnOn : {}) }} onClick={() => toggleLike(viewPost)}>
                  <span className={poppingHeart === viewPost.id ? 'heart-pop' : ''} style={{ display: 'inline-block' }}>{li.mine ? '❤️' : '🤍'}</span>{li.count > 0 && <span style={S.likeCount}>{li.count}</span>}
                </button>
              )})()}
              <button style={S.popX} onClick={() => setViewPost(null)}>✕</button>
            </div>
          </div>
        </div>
      )}

      {/* 스트릭 상세 모달 */}
      {showStreak && streak && (
        <div style={S.pop} onClick={() => setShowStreak(false)}>
          <div style={{ ...S.popCard, padding: '24px 20px' }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 44, lineHeight: 1 }}>🔥</div>
              <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>{streak.count}일 연속</div>
              <div style={{ fontSize: 12.5, color: 'var(--mp-muted)', marginTop: 3 }}>{group.name} · 최고 기록 {streak.best}일</div>
            </div>

            {/* 이번 주 달성 현황 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, margin: '18px 0 14px' }}>
              {streak.week.map(d => (
                <div key={d.key} style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', margin: '0 auto',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, boxSizing: 'border-box',
                    background: d.done ? '#ff7a45' : 'var(--mp-card2)',
                    border: d.isToday && !d.done ? '2px dashed #ff7a45' : 'none',
                    color: d.done ? '#fff' : (d.isToday ? '#ff7a45' : 'var(--mp-muted)'),
                  }}>{d.done ? '✓' : (d.isToday ? '오늘' : '')}</div>
                  <div style={{ fontSize: 10, marginTop: 3, color: d.isToday ? 'var(--mp-ink)' : 'var(--mp-muted)', fontWeight: d.isToday ? 700 : 400 }}>{d.label}</div>
                </div>
              ))}
            </div>

            {/* 오늘 미참여 안내 */}
            {!streak.todayDone && streak.missing > 0 && (
              <div style={{ background: 'var(--mp-card2)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span>⏰</span>
                <span>오늘 아직 <b style={{ color: '#ff7a45' }}>{streak.missing}명</b>이 안부를 안 남겼어요 — 기록을 지켜주세요!</span>
              </div>
            )}
            {streak.todayDone && (
              <div style={{ background: 'var(--mp-card2)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <span>🎉</span>
                <span>오늘도 모두의 안부가 닿았어요!</span>
              </div>
            )}

            <button style={{ ...S.popX, position: 'absolute', top: 14, right: 14 }} onClick={() => setShowStreak(false)}>✕</button>
          </div>
        </div>
      )}

      {toast && <div style={S.toast}>{toast}</div>}
    </div>
  )
}

function ZoomImage({ src }) {
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const st = useRef({ pinchStart: 0, scaleStart: 1, lastX: 0, lastY: 0, dragging: false, lastTap: 0 })

  function dist(t) {
    const dx = t[0].clientX - t[1].clientX
    const dy = t[0].clientY - t[1].clientY
    return Math.hypot(dx, dy)
  }
  function onTouchStart(e) {
    if (e.touches.length === 2) {
      st.current.pinchStart = dist(e.touches)
      st.current.scaleStart = scale
    } else if (e.touches.length === 1) {
      st.current.lastX = e.touches[0].clientX
      st.current.lastY = e.touches[0].clientY
      st.current.dragging = scale > 1
      // 더블탭 감지
      const now = Date.now()
      if (now - st.current.lastTap < 300) {
        if (scale > 1) { setScale(1); setTx(0); setTy(0) }
        else setScale(2.5)
      }
      st.current.lastTap = now
    }
  }
  function onTouchMove(e) {
    if (e.touches.length === 2 && st.current.pinchStart) {
      e.preventDefault()
      const ratio = dist(e.touches) / st.current.pinchStart
      const next = Math.min(4, Math.max(1, st.current.scaleStart * ratio))
      setScale(next)
      if (next === 1) { setTx(0); setTy(0) }
    } else if (e.touches.length === 1 && st.current.dragging && scale > 1) {
      e.preventDefault()
      const dx = e.touches[0].clientX - st.current.lastX
      const dy = e.touches[0].clientY - st.current.lastY
      st.current.lastX = e.touches[0].clientX
      st.current.lastY = e.touches[0].clientY
      const max = (scale - 1) * 150
      setTx(v => Math.max(-max, Math.min(max, v + dx)))
      setTy(v => Math.max(-max, Math.min(max, v + dy)))
    }
  }
  function onTouchEnd(e) {
    if (e.touches.length === 0) { st.current.pinchStart = 0; st.current.dragging = false }
  }
  return (
    <div className="zoomable" style={{ width: '100%', height: '100%', overflow: 'hidden', touchAction: 'none' }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <img src={src} alt="" draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `translate(${tx}px,${ty}px) scale(${scale})`, transition: st.current.dragging ? 'none' : 'transform .2s', transformOrigin: 'center' }} />
    </div>
  )
}

function MemberSkeleton() {
  return (
    <>
      {[0,1,2].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 0', borderBottom: '1px solid var(--mp-line)' }}>
          <div className="skel" style={{ width: 44, height: 44, borderRadius: '50%' }} />
          <div style={{ flex: 1 }}>
            <div className="skel" style={{ width: '40%', height: 13, marginBottom: 7 }} />
            <div className="skel" style={{ width: '25%', height: 11 }} />
          </div>
        </div>
      ))}
    </>
  )
}

function Confetti() {
  const colors = ['#ff4d5e', '#ff7a45', '#13bca4', '#5b8def', '#e0972e', '#9c4dcc']
  const pieces = Array.from({ length: 40 }, (_, i) => i)
  return (
    <>
      {pieces.map(i => {
        const left = Math.random() * 100
        const delay = Math.random() * 0.5
        const dur = 1.8 + Math.random() * 1.2
        const color = colors[i % colors.length]
        const rot = Math.random() * 360
        return <span key={i} className="confetti-piece" style={{ left: left + 'vw', background: color, animationDelay: delay + 's', animationDuration: dur + 's', transform: 'rotate(' + rot + 'deg)', borderRadius: i % 2 ? '50%' : '2px' }} />
      })}
    </>
  )
}

const S = {
  app: { width: '100%', maxWidth: 480, margin: '0 auto', minHeight: '100dvh', background: 'var(--mp-bg)', fontFamily: "'Outfit','Gowun Dodum',sans-serif", color: 'var(--mp-ink)', paddingBottom: 30 },
  top: { position: 'sticky', top: 0, zIndex: 1000, background: 'var(--mp-topbar)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--mp-line)', padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoRow: { display: 'flex', alignItems: 'center', gap: 8 },
  logoDot: { width: 36, height: 36, objectFit: 'contain' },
  groupLabel: { fontSize: 12, fontWeight: 600, color: 'var(--mp-muted)', marginTop: 2, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  logoName: { fontSize: 18, fontWeight: 700, letterSpacing: '-.4px', color: 'var(--mp-ink)' },
  codeBtn: { border: 'none', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', color: '#fff', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '8px 13px', borderRadius: 20, cursor: 'pointer', boxShadow: '0 4px 12px rgba(255,77,94,.3)' },
  xmasBanner: { display: 'flex', alignItems: 'center', gap: 12, margin: '10px 14px 0', padding: '13px 16px', borderRadius: 16, textDecoration: 'none', background: 'linear-gradient(135deg,#c0392b,#7d1f1f)', boxShadow: '0 8px 22px rgba(140,20,20,.35)', border: '1px solid rgba(255,217,138,.35)' },
  xmasBannerText: { display: 'flex', flexDirection: 'column', gap: 2, color: '#fff', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.3 },
  xmasBannerSub: { fontSize: 11.5, fontWeight: 500, color: 'rgba(255,240,220,.85)' },
  welcome: { position: 'relative', margin: '14px 16px 0', background: 'linear-gradient(135deg,#fff,#fff8f5)', border: '1.5px solid #ffe0d3', borderRadius: 18, padding: '20px 18px', boxShadow: '0 8px 30px rgba(255,122,69,.12)' },
  welcomeX: { position: 'absolute', top: 12, right: 12, width: 26, height: 26, border: 'none', background: 'var(--mp-card2)', borderRadius: '50%', fontSize: 12, cursor: 'pointer', color: 'var(--mp-muted)' },
  welcomeTitle: { fontSize: 16, fontWeight: 700, marginBottom: 8 },
  welcomeBody: { fontSize: 13.5, color: 'var(--mp-sub)', lineHeight: 1.6, marginBottom: 14 },
  welcomeSteps: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 },
  wStep: { display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--mp-ink)', fontWeight: 500 },
  wNum: { width: 20, height: 20, borderRadius: '50%', background: '#ff7a45', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' },
  welcomeBtn: { width: '100%', border: 'none', borderRadius: 12, padding: 12, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)' },
  banner: { position: 'relative', margin: '14px 14px 0', borderRadius: 22, overflow: 'hidden', background: 'linear-gradient(120deg,#16161a,#2a2030)', color: '#fff', boxShadow: '0 12px 40px rgba(20,20,30,.18)' },
  bannerGlow: { position: 'absolute', width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,.1)', right: -40, top: -40, filter: 'blur(10px)' },
  bTag: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: .8, padding: '18px 20px 0' },
  bBig: { fontSize: 24, fontWeight: 700, letterSpacing: '-.5px', padding: '3px 20px 0' },
  bSmall: { fontSize: 13, opacity: .85, padding: '3px 20px 18px' },
  streakBanner: { display: 'flex', alignItems: 'center', gap: 10, width: 'calc(100% - 28px)', margin: '12px 14px 0', padding: '11px 14px', background: 'var(--mp-card)', border: '1px solid var(--mp-line)', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--mp-ink)' },
  inviteBanner: { display: 'flex', alignItems: 'center', gap: 12, width: 'calc(100% - 28px)', margin: '12px 14px 0', padding: '14px 16px', background: 'linear-gradient(135deg,#fff1ed,#ffe9e0)', border: '1.5px solid #ffd9cc', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 18px rgba(255,122,69,.12)' },
  inviteIcon: { fontSize: 24, flex: 'none' },
  inviteArrow: { fontSize: 16, flex: 'none' },
  toggle: { display: 'flex', gap: 6, background: 'var(--mp-card2)', borderRadius: 24, padding: 4, margin: '14px 14px 0' },
  tBtn: { flex: 1, border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--mp-muted)', padding: 9, borderRadius: 20, cursor: 'pointer' },
  tBtnOn: { background: 'var(--mp-card)', color: 'var(--mp-ink)', boxShadow: '0 2px 8px rgba(0,0,0,.08)' },
  body: { padding: 14 },
  mapWrap: { position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 24px rgba(20,20,30,.07)', marginBottom: 12, zIndex: 0, isolation: 'isolate' },
  map: { width: '100%', height: 300 },
  summary: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--mp-card)', borderRadius: 14, padding: '11px 14px', boxShadow: '0 4px 24px rgba(20,20,30,.07)', marginBottom: 16, fontSize: 13 },
  sChip: { display: 'inline-flex', alignItems: 'center', gap: 5 },
  sKey: { color: 'var(--mp-muted)', fontWeight: 500 },
  sSep: { width: 1, height: 14, background: '#efeff2' },
  grid: { display: 'grid', gap: 8, marginBottom: 16 },
  gcellWrap: { display: 'flex', flexDirection: 'column', cursor: 'pointer', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 16px rgba(20,20,30,.08)', background: 'var(--mp-card2)' },
  gcell: { position: 'relative', aspectRatio: '3/4', overflow: 'hidden' },
  gimg: { width: '100%', height: '100%', objectFit: 'cover' },
  gwait: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#c4c4cc' },
  gdot: { width: 8, height: 8, borderRadius: '50%', flex: 'none' },
  gMeta: { display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', background: 'var(--mp-card)' },
  gMetaName: { fontSize: 13, fontWeight: 700, color: 'var(--mp-ink)', whiteSpace: 'nowrap' },
  gMetaSep: { color: 'var(--mp-muted)', fontSize: 11 },
  gMetaLoc: { fontSize: 12, color: 'var(--mp-sub)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  gMetaTime: { fontSize: 12, color: 'var(--mp-muted)', whiteSpace: 'nowrap', marginLeft: 'auto' },
  feed: { display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 },
  empty: { textAlign: 'center', color: 'var(--mp-muted)', padding: '40px 20px', fontSize: 14, lineHeight: 1.6 },
  card: { background: 'var(--mp-card)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 24px rgba(20,20,30,.08)', cursor: 'pointer' },
  cardPhoto: { position: 'relative', aspectRatio: '4/5', background: '#222' },
  cardImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  cardNo: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60 },
  cardLoc: { position: 'absolute', left: 12, bottom: 12, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(8px)', color: '#fff', fontSize: 12.5, fontWeight: 500, padding: '7px 12px', borderRadius: 30 },
  cardTime: { position: 'absolute', right: 12, bottom: 12, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(8px)', color: '#fff', fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 30 },
  cardOverlayBot: { position: 'absolute', left: 8, bottom: 8, right: 8, display: 'flex', flexDirection: 'column', gap: 2, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.7)', fontSize: 12, fontWeight: 700 },
  likeBtn: { display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'var(--mp-card2)', borderRadius: 20, padding: '6px 11px', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer', color: 'var(--mp-ink)' },
  likeBtnOn: { background: '#fff1f2' },
  likeCount: { fontSize: 12, fontWeight: 700, color: '#e0395a' },
  cardFoot: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' },
  stepWrap: { display: 'inline-flex', alignItems: 'center', gap: 9 },
  stepDots: { display: 'inline-flex', gap: 5 },
  stepDot: { width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,.4)', transition: 'background .2s' },
  stepDotOn: { background: 'var(--mp-card)' },
  shoot: { width: '100%', border: 'none', borderRadius: 16, padding: 16, fontFamily: 'inherit', fontSize: 16, fontWeight: 700, cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 8px 20px rgba(255,77,94,.3)', marginBottom: 10 },
  countdown: { textAlign: 'center', background: 'var(--mp-card2)', border: '1.5px solid var(--mp-coral)', color: 'var(--mp-coral)', borderRadius: 14, padding: '11px 14px', fontSize: 14, fontWeight: 600, marginBottom: 10 },
  timerPillWrap: { display: 'flex', justifyContent: 'center', margin: '10px 14px 0' },
  timerPill: { display: 'inline-flex', alignItems: 'center', gap: 10, background: 'var(--mp-card2)', border: '1.5px solid var(--mp-coral)', color: 'var(--mp-coral)', borderRadius: 22, padding: '8px 16px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' },
  timerPillGo: { fontSize: 12, fontWeight: 700, opacity: .85 },
  waitBox: { textAlign: 'center', background: 'var(--mp-card)', borderRadius: 18, padding: '22px 18px', boxShadow: '0 4px 24px rgba(20,20,30,.06)' },
  waitTitle: { fontSize: 15, fontWeight: 700, color: 'var(--mp-ink)', marginBottom: 4 },
  waitSub: { fontSize: 13, color: 'var(--mp-muted)', marginBottom: 14 },
  startBtn: { border: 'none', borderRadius: 14, padding: '13px 20px', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#fff', background: 'linear-gradient(135deg,#ff7a45,#ff4d5e)', boxShadow: '0 6px 16px rgba(255,77,94,.28)' },
  shootGhost: { width: '100%', border: '1.5px solid var(--mp-line)', borderRadius: 14, padding: 13, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--mp-sub)', background: 'var(--mp-card)', marginBottom: 14 },
  subBtns: { display: 'flex', gap: 10, marginBottom: 22 },
  subBtnOn: { background: '#eafaf6', borderColor: '#13bca4', color: '#0e9d88' },
  subBtn: { flex: 1, border: '1.5px solid var(--mp-line)', background: 'var(--mp-card)', color: 'var(--mp-ink)', borderRadius: 14, padding: 12, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  label: { fontSize: 12, fontWeight: 600, color: 'var(--mp-muted)', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 10 },
  muted: { color: 'var(--mp-muted)', fontSize: 14 },
  memberRow: { display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderBottom: '1px solid var(--mp-line)' },
  avatar: { width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, flex: 'none', fontSize: 14 },
  crown: { fontSize: 13, marginLeft: 5 },
  meTag: { fontSize: 11, color: 'var(--mp-muted)', fontWeight: 600, marginLeft: 7 },
  statusDot: { position: 'absolute', right: -2, bottom: -2, width: 16, height: 16, borderRadius: '50%', border: '2px solid #fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 700 },
  distTag: { fontSize: 12, color: '#13bca4', fontWeight: 700, marginLeft: 7 },
  shareTag: { fontSize: 12, color: 'var(--mp-muted)', fontWeight: 500 },
  statsBtn: { width: '100%', borderRadius: 14, padding: 14, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: 'var(--mp-ink)', background: 'linear-gradient(135deg,#fff1ed,#ffe9e0)', border: '1.5px solid #ffd9cc', marginTop: 24 },
  actions: { display: 'flex', gap: 10, marginTop: 24 },
  ghost: { flex: 1, border: '1.5px solid var(--mp-line)', background: 'var(--mp-card)', color: 'var(--mp-ink)', borderRadius: 14, padding: 13, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  pop: { position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(10,10,14,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  popCard: { position: 'relative', width: '100%', maxWidth: 360, background: 'var(--mp-card)', borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,.5)' },
  popPhoto: { aspectRatio: '4/5', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  popImg: { width: '100%', height: '100%', objectFit: 'cover' },
  popLoading: { color: '#fff', fontSize: 13 },
  popInfo: { display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px' },
  popX: { marginLeft: 'auto', background: 'var(--mp-card2)', border: 'none', width: 34, height: 34, borderRadius: '50%', fontSize: 16, cursor: 'pointer', color: 'var(--mp-muted)' },
  toast: { position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#16161a', color: '#fff', padding: '12px 20px', borderRadius: 30, fontSize: 13, fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,.3)', zIndex: 4000 },
}
