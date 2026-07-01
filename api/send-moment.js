// api/send-moment.js — 그룹에 "지금 찍어!" 푸시를 쏘는 서버 함수
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    // 1) Cron이나 수동 호출 보호 (간단한 시크릿)
    const secret = req.query.secret || req.headers['x-cron-secret']
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'unauthorized' })
    }

    // 2) VAPID 설정
    webpush.setVapidDetails(
      'mailto:admin@momentpin.app',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    )

    // 3) Supabase (service_role: RLS 우회해서 전체 구독 읽기)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // 4) 보낼 대상 결정
    //    - groupId 지정되면 그 그룹만, 없으면 자동 탐색 (fixed + random)
    const now = new Date()
    let targetGroupIds = []

    // KST 기준 현재 시각/날짜
    const kst = new Date(now.getTime() + 9 * 3600 * 1000)
    const nowHM = String(kst.getUTCHours()).padStart(2, '0') + ':' + String(kst.getUTCMinutes()).padStart(2, '0')
    const today = kst.toISOString().slice(0, 10)

    if (req.query.groupId) {
      targetGroupIds = [req.query.groupId]
    } else {
      let g = await supabase.from('groups').select('id,name,alarm_mode,fixed_times,random_start,random_end,random_today_hm,random_picked_date,last_fired_date')
      const groups = g.data || []
      for (const grp of groups) {
        if (grp.alarm_mode === 'fixed') {
          const times = Array.isArray(grp.fixed_times) ? grp.fixed_times : []
          if (times.includes(nowHM)) targetGroupIds.push(grp.id)
        } else if (grp.alarm_mode === 'random') {
          // (a) 오늘 시각 아직 안 뽑았으면 뽑아서 저장
          if (grp.random_picked_date !== today) {
            const startHM = (grp.random_start || '09:00').slice(0, 5)
            const endHM = (grp.random_end || '21:00').slice(0, 5)
            const [sh, sm] = startHM.split(':').map(Number)
            const [eh, em] = endHM.split(':').map(Number)
            const startMin = sh * 60 + sm, endMin = eh * 60 + em
            const pick = startMin + Math.floor(Math.random() * Math.max(1, endMin - startMin))
            const pickedHM = String(Math.floor(pick / 60)).padStart(2, '0') + ':' + String(pick % 60).padStart(2, '0')
            await supabase.from('groups').update({ random_today_hm: pickedHM, random_picked_date: today }).eq('id', grp.id)
            grp.random_today_hm = pickedHM
            grp.random_picked_date = today
          }
          // (b) 지금이 뽑힌 시각이고 + 오늘 아직 안 보냈으면 발송
          if (grp.random_today_hm === nowHM && grp.last_fired_date !== today) {
            targetGroupIds.push(grp.id)
            await supabase.from('groups').update({ last_fired_date: today }).eq('id', grp.id)
          }
        }
      }
    }

    if (targetGroupIds.length === 0) {
      return res.status(200).json({ sent: 0, message: '보낼 그룹 없음', nowHM, today })
    }

    // 5) 각 그룹의 구독자에게 푸시 발송
    let sent = 0, failed = 0
    for (const gid of targetGroupIds) {
      // 그룹 정보 (이름, 마감시간)
      let grpInfo = await supabase.from('groups').select('name,window_min,alarm_mode,fixed_times').eq('id', gid).single()
      const gname = grpInfo.data ? grpInfo.data.name : '모먼핀'
      const winMin = (grpInfo.data && grpInfo.data.window_min) ? grpInfo.data.window_min : 3
      // 이미 열린 모먼이 있으면 새로 만들지 않음 (중복 방지)
      const nowISO = now.toISOString()
      let openCheck = await supabase.from('moments')
        .select('id').eq('group_id', gid)
        .lte('fired_at', nowISO).gte('deadline', nowISO)
        .limit(1)
      const hasOpen = openCheck.data && openCheck.data.length > 0
      if (!hasOpen) {
        // 하루 발동 횟수 제한 (마감시간 재설정 악용/알림폭탄 방지)
        // 정해진 시간 모드: 하루 허용 = 설정된 시간 개수, 랜덤 모드: 하루 1회. 최소 1, 안전상한 5.
        const gmode = grpInfo.data ? grpInfo.data.alarm_mode : 'fixed'
        const gtimes = (grpInfo.data && Array.isArray(grpInfo.data.fixed_times)) ? grpInfo.data.fixed_times.length : 0
        const DAILY_LIMIT = Math.min(5, Math.max(1, gmode === 'random' ? 1 : gtimes))
        const startOfDay = new Date(now)
        startOfDay.setHours(0, 0, 0, 0)
        let todayCount = await supabase.from('moments')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', gid)
          .gte('fired_at', startOfDay.toISOString())
        const firedToday = todayCount.count || 0
        if (firedToday >= DAILY_LIMIT) {
          // 오늘 한도 초과 — 이 그룹은 건너뜀
          continue
        }
        // 열린 모먼이 없을 때만 새로 생성 (그룹이 정한 window_min 사용)
        const deadline = new Date(now.getTime() + winMin * 60000)
        await supabase.from('moments').insert({
          group_id: gid, fired_at: now.toISOString(), deadline: deadline.toISOString()
        })
      }

      let subs = await supabase.from('push_subscriptions').select('*').eq('group_id', gid)
      const list = subs.data || []

      const payload = JSON.stringify({
        title: '📍 안부를 전할 시간이에요',
        body: `${gname} · 지금 다 같이 안부를 나눠요`,
        url: '/',
      })

      for (const s of list) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          )
          sent++
        } catch (e) {
          failed++
          // 만료된 구독(410)은 삭제
          if (e.statusCode === 410 || e.statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('id', s.id)
          }
        }
      }
    }

    return res.status(200).json({ sent, failed, groups: targetGroupIds.length })
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) })
  }
}
