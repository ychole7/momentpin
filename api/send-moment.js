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
    //    - groupId 지정되면 그 그룹만, 없으면 "지금 시각에 모먼 울릴 그룹" 자동 탐색
    const now = new Date()
    let targetGroupIds = []

    if (req.query.groupId) {
      targetGroupIds = [req.query.groupId]
    } else {
      // 고정 모드: fixed_times에 현재 시:분이 포함된 그룹
      const hh = String(now.getHours()).padStart(2, '0')
      const mm = String(now.getMinutes()).padStart(2, '0')
      const nowHM = `${hh}:${mm}`
      let g = await supabase.from('groups').select('id,name,alarm_mode,fixed_times,random_start,random_end')
      const groups = g.data || []
      for (const grp of groups) {
        if (grp.alarm_mode === 'fixed') {
          const times = Array.isArray(grp.fixed_times) ? grp.fixed_times : []
          if (times.includes(nowHM)) targetGroupIds.push(grp.id)
        }
        // random 모드는 B단계에서 별도 처리 (지금은 fixed만)
      }
    }

    if (targetGroupIds.length === 0) {
      return res.status(200).json({ sent: 0, message: '보낼 그룹 없음' })
    }

    // 5) 각 그룹의 구독자에게 푸시 발송
    let sent = 0, failed = 0
    for (const gid of targetGroupIds) {
      // 모먼 하나 생성 (찍을 시간 기준)
      const deadline = new Date(now.getTime() + 5 * 60000)
      await supabase.from('moments').insert({
        group_id: gid, fired_at: now.toISOString(), deadline: deadline.toISOString()
      })

      let subs = await supabase.from('push_subscriptions').select('*').eq('group_id', gid)
      const list = subs.data || []
      let grpInfo = await supabase.from('groups').select('name').eq('id', gid).single()
      const gname = grpInfo.data ? grpInfo.data.name : '모먼핀'

      const payload = JSON.stringify({
        title: '📸 모먼 시간!',
        body: `${gname} · 지금 다 같이 찍어요`,
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
