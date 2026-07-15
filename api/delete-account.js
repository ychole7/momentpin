// api/delete-account.js — 회원 탈퇴 (계정 + 모든 데이터 완전 삭제)
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' })
  }
  try {
    // 1) 요청자 본인 확인 — Authorization 헤더의 액세스 토큰으로 누구인지 검증
    const authHeader = req.headers['authorization'] || ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) return res.status(401).json({ error: '인증 토큰 없음' })

    const url = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // 토큰으로 사용자 신원 확인 (anon 클라이언트 + 토큰)
    const userClient = createClient(url, serviceKey)
    let { data: userData, error: userErr } = await userClient.auth.getUser(token)
    if (userErr || !userData || !userData.user) {
      return res.status(401).json({ error: '유효하지 않은 토큰' })
    }
    const userId = userData.user.id

    // 2) service_role 클라이언트로 삭제 진행
    const admin = createClient(url, serviceKey)

    // 2-1) 이 사용자가 '그룹장(created_by)'인 그룹들 처리
    //  - 멤버가 본인뿐 → 아래에서 그룹째 삭제
    //  - 다른 멤버가 있고 + 나도 그 그룹의 멤버다 → 탈퇴 막기(먼저 위임/삭제 필요)
    //  - 다른 멤버가 있지만 + 나는 이미 그 그룹을 나갔다(멤버 아님) → 소유권을 남은 멤버에게 자동 이전
    let ownedRes = await admin.from('groups').select('id').eq('created_by', userId)
    const ownedGroups = ownedRes.data || []
    const soloOwnedGroups = []  // 본인뿐인 소유 그룹(삭제 대상)

    for (const g of ownedGroups) {
      let mem = await admin.from('members').select('user_id').eq('group_id', g.id)
      const memberIds = (mem.data || []).map(m => m.user_id)
      const memberCount = memberIds.length
      const iAmMember = memberIds.includes(userId)

      if (memberCount <= 1) {
        // 나 혼자거나 아무도 없음 → 삭제 대상
        soloOwnedGroups.push(g)
        continue
      }

      // 멤버가 2명 이상
      if (iAmMember) {
        // 내가 아직 이 그룹의 멤버 → 먼저 위임/삭제하도록 막음
        return res.status(409).json({
          error: 'owner_has_members',
          message: '회원님이 그룹장인 그룹에 다른 멤버가 있어요. 먼저 그룹을 삭제하거나 넘겨주세요.'
        })
      } else {
        // 나는 이미 이 그룹을 나감 → 소유권을 남은 멤버 중 한 명에게 이전
        const nextOwner = memberIds.find(id => id !== userId)
        if (nextOwner) {
          await admin.from('groups').update({ created_by: nextOwner }).eq('id', g.id)
        }
        // 이전 후에는 이 그룹을 삭제 대상에 넣지 않음 (다른 멤버가 계속 사용)
      }
    }

    // 본인뿐인 소유 그룹은 통째로 삭제
    for (const g of soloOwnedGroups) {
      await admin.from('post_likes').delete().eq('group_id', g.id)
      await admin.from('posts').delete().eq('group_id', g.id)
      await admin.from('moments').delete().eq('group_id', g.id)
      await admin.from('members').delete().eq('group_id', g.id)
      await admin.from('push_subscriptions').delete().eq('group_id', g.id)
      await admin.from('groups').delete().eq('id', g.id)
    }

    // 2-2) 내가 남긴 개인 데이터 (다른 그룹에서)
    await admin.from('post_likes').delete().eq('user_id', userId)
    await admin.from('posts').delete().eq('user_id', userId)
    await admin.from('push_subscriptions').delete().eq('user_id', userId)
    await admin.from('members').delete().eq('user_id', userId)

    // 2-3) auth 계정 삭제 (이게 진짜 탈퇴)
    let delErr = await admin.auth.admin.deleteUser(userId)
    if (delErr.error) {
      return res.status(500).json({ error: '계정 삭제 실패: ' + delErr.error.message })
    }

    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) })
  }
}
