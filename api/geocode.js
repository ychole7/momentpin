// api/geocode.js — 좌표를 받아 카카오 로컬 API로 행정동 이름을 돌려주는 프록시
// 클라이언트에 카카오 REST API 키를 노출하지 않기 위해 서버를 한 번 거침

const SIDO_SHORT = {
  '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구', '인천광역시': '인천',
  '광주광역시': '광주', '대전광역시': '대전', '울산광역시': '울산', '세종특별자치시': '세종',
  '경기도': '경기', '강원특별자치도': '강원', '강원도': '강원', '충청북도': '충북', '충청남도': '충남',
  '전북특별자치도': '전북', '전라북도': '전북', '전라남도': '전남', '경상북도': '경북', '경상남도': '경남',
  '제주특별자치도': '제주',
}

export default async function handler(req, res) {
  try {
    const lat = parseFloat(req.query.lat)
    const lng = parseFloat(req.query.lng)
    if (!isFinite(lat) || !isFinite(lng)) {
      return res.status(400).json({ error: 'lat/lng가 필요해요' })
    }

    const key = process.env.KAKAO_REST_API_KEY
    if (!key) return res.status(500).json({ error: '카카오 API 키가 설정되지 않았어요' })

    const url = `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${lng}&y=${lat}`
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } })
    if (!r.ok) {
      return res.status(502).json({ error: '카카오 API 호출 실패', status: r.status })
    }
    const j = await r.json()
    const docs = j.documents || []
    // region_type 'H'(행정동) 우선, 없으면 'B'(법정동)
    const region = docs.find(d => d.region_type === 'H') || docs[0]
    if (!region) return res.status(200).json({ label: '위치' })

    const sido = SIDO_SHORT[region.region_1depth_name] || region.region_1depth_name || ''
    const gu = region.region_2depth_name || ''
    const dong = region.region_3depth_name || ''

    const parts = []
    if (sido) parts.push(sido)
    if (gu && gu !== sido) parts.push(gu)
    if (dong && dong !== gu) parts.push(dong)
    const label = parts.join(' ') || sido || '위치'

    return res.status(200).json({ label })
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) })
  }
}
