// src/App.jsx
import { useEffect, useState } from 'react'
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

  // 딥링크: ?group=ID 또는 SW 알림 클릭 메시지로 해당 그룹 전환
  useEffect(() => {
    if (!session) return

    async function goToGroup(groupId) {
      if (!groupId) return
      const { data } = await supabase.from('members')
        .select('groups(id,name,invite_code,created_by,alarm_mode,fixed_times,random_start,random_end,window_min)')
        .eq('user_id', session.user.id)
      const groups = (data || []).map(r => r.groups).filter(Boolean)
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
    setShowOnboarding(false)
  }

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
  if (!group) return <GroupGate user={session.user} onReady={g => { setGroup(g); setActiveTab('home') }} />

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
        {activeTab === 'home' && (
          <Home
            user={session.user}
            group={group}
            profileVersion={profileVersion}
            onOpenSettings={() => setActiveTab('mypage')}
            onMembersLoaded={(m) => setStatsMembers(m || [])}
            onOpenSwitcher={() => setActiveTab('group')}
          />
        )}

        {activeTab === 'group' && (
          <GroupList
            user={session.user}
            currentGroup={group}
            onSelectGroup={(g) => { setGroup(g); localStorage.setItem('mp_group', g.id); setActiveTab('home') }}
          />
        )}

        {activeTab === 'mypage' && (
          <MyPage
            user={session.user}
            group={group}
            members={statsMembers}
            onClose={() => setActiveTab('home')}
            onOpenStats={(m) => { setStatsMembers(m || []); setShowStats(true) }}
            onGroupUpdate={(g) => setGroup(g)}
            onProfileUpdate={() => setProfileVersion(v => v + 1)}
            onLeaveGroup={() => { setGroup(null); setActiveTab('home') }}
            onSignOut={signOut}
            onOpenPrivacy={() => setShowPrivacy(true)}
            onOpenTerms={() => setShowTerms(true)}
          />
        )}
      </div>

      <BottomNav active={activeTab} onChange={setActiveTab} />
    </>
  )
}

const center = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--mp-muted)', fontFamily: "'Outfit','Gowun Dodum',sans-serif", background: 'var(--mp-bg)',
}
