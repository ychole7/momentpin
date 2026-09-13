// src/App.jsx
import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import GroupGate from './GroupGate'
import GroupList from './GroupList'
import BottomNav from './BottomNav'
import Home from './Home'
import MyPage from './MyPage'
import Stats from './Stats'
import Onboarding from './Onboarding'
import Privacy from './Privacy'
import Terms from './Terms'

// 초대코드 생성 (혼동 문자 제외)
function makeCode() {
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 4; i++) s += ch[Math.floor(Math.random() * ch.length)]
  return 'MP-' + s
}

export default function App() {
  const [session, setSession] = useState(null)
  const [group, setGroup] = useState(null)
  const [booting, setBooting] = useState(true)
  const [activeTab, setActiveTab] = useState('home')  // 'home' | 'group' | 'mypage' — 하단 탭
  const [showStats, setShowStats] = useState(false)
  const [statsMembers, setStatsMembers] = useState([])
  const [profileVersion, setProfileVersion] = useState(0)  // 프로필 변경 시 증가 → Home 멤버 리로드
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [ensuringGroup, setEnsuringGroup] = useState(false)  // 기본 그룹 자동 생성 진행 중
  const ensureStartedRef = useRef(null)  // 자동생성을 시도한 user_id (계정당 한 번만)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setBooting(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) { setGroup(null); setActiveTab('home') }
    })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (group) localStorage.setItem('mp_group', group.id)
  }, [group])

  // 하단 탭 전환 시 스크롤 위치를 맨 위로 리셋 (이전 탭의 스크롤이 남아 보이는 문제 방지)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [activeTab])

  // 딥링크: ?group=ID 또는 SW 알림 클릭 메시지로 해당 그룹 전환
  useEffect(() => {
    if (!session) return

    async function goToGroup(groupId) {
      if (!groupId) return
      // 관계(join) 조회 대신 2단계 조회를 사용합니다.
      // Supabase/PostgREST에서 members → groups 관계가 환경에 따라
      // 해석되지 않아 앱 진입 자체가 막히는 경우를 방지합니다.
      const { data: memberRows, error: memberError } = await supabase.from('members')
        .select('group_id')
        .eq('user_id', session.user.id)
      if (memberError) throw memberError
      const ids = [...new Set((memberRows || []).map(r => r.group_id).filter(Boolean))]
      if (!ids.length) return
      const { data: groupRows, error: groupError } = await supabase.from('groups')
        .select('id,name,invite_code,created_by,alarm_mode,fixed_times,random_start,random_end,window_min')
        .in('id', ids)
      if (groupError) throw groupError
      const groups = groupRows || []
      const target = groups.find(g => g.id === groupId)
      if (target) {
        window.history.replaceState({}, '', window.location.pathname)
        setGroup(target)
        setActiveTab('home')
      }
    }

    // (1) 앱 처음 열릴 때 URL 파라미터 확인
    try {
      const urlGroupId = new URLSearchParams(window.location.search).get('group')
      if (urlGroupId) goToGroup(urlGroupId)
    } catch {}

    // (2) 이미 열린 앱에서 알림 클릭 시 SW가 보낸 메시지 수신
    function onSWMessage(e) {
      if (e.data && e.data.type === 'deeplink' && e.data.url) {
        try {
          const gid = new URLSearchParams(e.data.url.split('?')[1] || '').get('group')
          if (gid) goToGroup(gid)
        } catch {}
      }
    }
    navigator.serviceWorker?.addEventListener('message', onSWMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onSWMessage)
  }, [session])

  useEffect(() => {
    if (session) {
      try { if (!localStorage.getItem('mp_onboarded')) setShowOnboarding(true) } catch {}
    } else {
      setShowOnboarding(false)
    }
  }, [session])

  function finishOnboarding() {
    try { localStorage.setItem('mp_onboarded', '1') } catch {}
    // 온보딩을 마친 직후 그룹 확인을 다시 허용합니다.
    if (session?.user?.id) ensureStartedRef.current = null
    setShowOnboarding(false)
  }

  // 최초 사용자(그룹 0개)에게 기본 그룹 "첫 닿음"을 자동 생성해 빈 화면을 없앰.
  // 계정당 한 번만 시도(ensureStartedRef)해서 StrictMode 이중 실행/무한 재생성을 막는다.
  useEffect(() => {
    if (!session || group) return
    if (ensureStartedRef.current === session.user.id) return  // 이 계정은 이미 시도함
    // 딥링크(?group=... 또는 ?code=...)로 들어온 경우엔 자동 생성하지 않음
    try {
      const q = new URLSearchParams(window.location.search)
      if (q.get('group') || q.get('code')) { ensureStartedRef.current = session.user.id; return }
    } catch {}

    ensureStartedRef.current = session.user.id  // 시도 표시 (동기적으로 즉시 잠금)
    let cancelled = false
    ;(async () => {
      setEnsuringGroup(true)
      try {
        // 이미 속한 그룹이 있으면 자동 생성 안 함
        // 중요: 여기서 members → groups 중첩 join을 사용하지 않습니다.
        // 기존 앱에서 이 관계 조회가 실패하면 '닿음 준비 중…' 이후
        // GroupGate로 넘어가는 과정 전체가 깨질 수 있습니다.
        const mres = await supabase.from('members')
          .select('group_id')
          .eq('user_id', session.user.id)
        if (mres.error) throw mres.error
        const groupIds = [...new Set((mres.data || []).map(r => r.group_id).filter(Boolean))]

        let existing = []
        if (groupIds.length) {
          const gres = await supabase.from('groups')
            .select('id,name,invite_code,created_by,alarm_mode,fixed_times,random_start,random_end,window_min')
            .in('id', groupIds)
          if (gres.error) throw gres.error
          existing = gres.data || []
        }
        if (cancelled) return
        if (existing.length > 0) {
          let saved = null
          try { saved = localStorage.getItem('mp_group') } catch {}
          const target = existing.find(g => g.id === saved) || existing[0]
          setGroup(target)
          setEnsuringGroup(false)
          return
        }

        // 그룹이 0개다. "진짜 신규 가입 직후"만 자동 생성한다.
        // 판단 기준: auth 계정의 created_at이 지금으로부터 아주 최근(2분 이내)인가.
        // localStorage나 profiles 존재 여부는 탈퇴 후 재가입, 브라우저 잔재 등으로
        // 오판되기 쉬워서(실제로 겪었음) 계정 생성 시각처럼 조작 불가능한 값을 쓴다.
        let isFreshSignup = false
        try {
          const createdAt = new Date(session.user.created_at).getTime()
          isFreshSignup = (Date.now() - createdAt) < 2 * 60 * 1000  // 2분 이내
        } catch {}
        if (!isFreshSignup) {
          // 가입한 지 오래된 계정인데 그룹이 없음(탈퇴 시도 중이거나 데이터 이슈)
          // → 자동 생성 없이 그룹 관문(GroupGate)으로 안전하게 보냄
          setEnsuringGroup(false)
          return
        }

        // 진짜 신규 사용자 → 기본 그룹 "첫 닿음" 생성
        const defaultName = (session.user.email || '').split('@')[0]?.slice(0, 12) || '나'

        let created = null
        for (let attempt = 0; attempt < 3 && !created; attempt++) {
          let res = await supabase.from('groups')
            .insert({ name: '첫 닿음', invite_code: makeCode(), created_by: session.user.id })
            .select().single()
          if (!res.error) { created = res.data; break }
          if (!String(res.error.message).includes('duplicate')) break
        }
        if (cancelled) return
        if (!created) { console.error('[첫닿음] 그룹 생성 최종 실패 — GroupGate로 전환') }
        if (created) {
          let mem = await supabase.from('members').insert({
            group_id: created.id, user_id: session.user.id,
            display_name: defaultName, color: '#ff4d5e',
          })
          if (mem.error) console.error('[첫닿음] members insert 실패', mem.error)
          // 프로필은 그룹 생성 성공 후에 저장 (경합 시에도 프로필만 남는 상황 방지)
          await supabase.from('profiles').upsert({
            user_id: session.user.id,
            display_name: defaultName,
            color: '#ff4d5e',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
          if (!cancelled) { setGroup(created); setActiveTab('home') }
        }
      } catch (e) {
        console.error('[첫닿음] 예외', e)
        // 오류가 나더라도 '준비 중' 화면에 갇히지 않도록 반드시 해제합니다.
      } finally {
        if (!cancelled) setEnsuringGroup(false)
      }
    })()

    return () => { cancelled = true }
  }, [session, group])

  async function signOut() {
    // 로그아웃 시 이 기기의 알림 구독도 함께 해제 (로그아웃 후 알림이 계속 오는 것 방지)
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
    } catch {}
    await supabase.auth.signOut()
    localStorage.removeItem('mp_group')
    setGroup(null)
    setActiveTab('home')
  }

  if (booting) return <div style={center}>닿음 여는 중…</div>
  if (!session) return <Auth />
  if (showOnboarding) return <Onboarding onDone={finishOnboarding} />
  if (!group) {
    // 기본 그룹 자동 생성이 진행 중이면 로딩 표시
    if (ensuringGroup) return <div style={center}>닿음 준비 중…</div>
    // 자동 생성 대상이 아닌 경우(초대 진입, 기존 사용자의 그룹 0개 등)엔
    // 그룹 관문(GroupGate)을 보여줌 — 여기서 그룹 만들기/참여/회원탈퇴 가능
    return <GroupGate user={session.user} onReady={g => { setGroup(g); setActiveTab('home') }} />
  }

  // 서브 화면들(설정 안 하단탭 없이 전체화면, 뒤로가기로 복귀)
  if (showPrivacy) return <Privacy onClose={() => { setShowPrivacy(false); setActiveTab('mypage') }} />
  if (showTerms) return <Terms onClose={() => { setShowTerms(false); setActiveTab('mypage') }} />
  if (showStats) return (
    <Stats
      user={session.user}
      group={group}
      members={statsMembers}
      onClose={() => { setShowStats(false); setActiveTab('mypage') }}
    />
  )

  return (
    <>
      <div style={{ paddingBottom: 74 }}>
        <div style={{ display: activeTab === 'home' ? 'block' : 'none' }}>
          <Home
            user={session.user}
            group={group}
            profileVersion={profileVersion}
            isActive={activeTab === 'home'}
            onMembersLoaded={(m) => setStatsMembers(m || [])}
          />
        </div>

        <div style={{ display: activeTab === 'group' ? 'block' : 'none' }}>
          <GroupList
            user={session.user}
            currentGroup={group}
            isActive={activeTab === 'group'}
            onSelectGroup={(g) => { setGroup(g); localStorage.setItem('mp_group', g.id); setActiveTab('home') }}
            onGroupUpdate={(g) => setGroup(g)}
            onCurrentGroupLeave={() => setGroup(null)}
            onMemberUpdate={() => setProfileVersion(v => v + 1)}
          />
        </div>

        <div style={{ display: activeTab === 'mypage' ? 'block' : 'none' }}>
          <MyPage
            user={session.user}
            group={group}
            members={statsMembers}
            onClose={() => setActiveTab('home')}
            onOpenStats={(m) => { setStatsMembers(m || []); setShowStats(true) }}
            onProfileUpdate={() => setProfileVersion(v => v + 1)}
            onSignOut={signOut}
            onOpenPrivacy={() => setShowPrivacy(true)}
            onOpenTerms={() => setShowTerms(true)}
          />
        </div>
      </div>

      <BottomNav active={activeTab} onChange={setActiveTab} />
    </>
  )
}

const center = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--mp-muted)', fontFamily: "'Outfit','Gowun Dodum',sans-serif", background: 'var(--mp-bg)',
}
