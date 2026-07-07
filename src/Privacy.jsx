// src/Privacy.jsx — 개인정보처리방침
export default function Privacy({ onClose }) {
  return (
    <div style={S.app}>
      <div style={S.top}>
        <button style={S.back} onClick={onClose}>←</button>
        <div style={S.title}>개인정보처리방침</div>
        <div style={{ width: 32 }} />
      </div>
      <div style={S.body}>
        <p style={S.date}>시행일: 2026년 ○월 ○일</p>
        <p style={S.intro}>닿음(이하 "서비스")은 이용자의 개인정보를 중요하게 생각하며, 「개인정보 보호법」 및 「위치정보의 보호 및 이용 등에 관한 법률」 등 관련 법령을 준수합니다.</p>

        <Sec n="1" t="수집하는 개인정보 항목">
          <b>회원가입·계정</b><br/>· 이메일 주소<br/>· 비밀번호(암호화 저장)<br/><br/>
          <b>서비스 이용 과정</b><br/>· 프로필: 표시 이름, 색상<br/>· 위치 정보: 안부를 남길 때의 좌표 및 행정구역 명칭<br/>· 사진: 안부로 업로드한 이미지<br/>· 푸시 알림 토큰(동의 시)<br/>· 그룹 활동: 참여 안부, 좋아요 등
        </Sec>
        <Sec n="2" t="수집·이용 목적">
          · 회원 식별 및 계정 관리<br/>· 그룹 내 위치·순간 공유 제공<br/>· 안부 알림 발송<br/>· 서비스 통계 및 개선
        </Sec>
        <Sec n="3" t="위치정보의 처리">
          · 위치는 안부를 남기는 시점에만 수집되며 상시 수집하지 않습니다.<br/>· 같은 그룹 구성원에게만 공유됩니다.<br/>· 안부를 남기지 않으면 위치 공유에 참여하지 않을 수 있습니다.<br/>· 제3자에게 제공되지 않습니다.
        </Sec>
        <Sec n="4" t="보관 및 이용 기간">
          · 회원 자격 유지 동안 보관합니다.<br/>· 탈퇴 시 모든 개인정보가 지체 없이 파기됩니다.<br/>· 법령상 보존 의무가 있는 경우 해당 기간 보관할 수 있습니다.
        </Sec>
        <Sec n="5" t="개인정보의 파기">
          · 앱 내 "회원 탈퇴" 시 계정과 관련 데이터(안부·사진·위치·좋아요·프로필)가 즉시 영구 삭제됩니다.<br/>· 그룹 탈퇴/삭제 시 관련 데이터도 함께 삭제됩니다.
        </Sec>
        <Sec n="6" t="제3자 제공 및 처리위탁">
          · 개인정보를 외부에 판매·제공하지 않습니다.<br/>· 운영 인프라: 데이터 저장·인증(Supabase), 호스팅(Vercel). 서비스 제공 목적 범위 내에서만 처리됩니다.
        </Sec>
        <Sec n="7" t="이용자의 권리">
          · 개인정보 조회·수정(프로필 설정)<br/>· 처리 정지 및 삭제(회원 탈퇴)<br/>· 알림 수신 동의 철회(알림 설정)
        </Sec>
        <Sec n="8" t="안전성 확보 조치">
          · 비밀번호 암호화 저장<br/>· 그룹 구성원으로 접근 제한(행 수준 보안, RLS)<br/>· 통신 구간 암호화(HTTPS)
        </Sec>
        <Sec n="9" t="만 14세 미만 아동">
          서비스는 만 14세 미만 아동의 회원가입을 받지 않습니다. 가입 시 만 14세 이상임을 확인하며, 만 14세 미만임이 확인될 경우 해당 계정과 정보는 파기됩니다.
        </Sec>
        <Sec n="10" t="개인정보 보호책임자 및 문의처">
          · 보호책임자: ○○○<br/>· 문의 이메일: ○○○@○○○
        </Sec>
        <Sec n="11" t="고지의 의무">
          본 방침 변경 시 서비스 내 공지를 통해 안내합니다.
        </Sec>

        <p style={S.note}>본 방침은 표준 양식 기반 초안이며, 출시 전 법률 전문가 검토를 권장합니다.</p>
      </div>
    </div>
  )
}

function Sec({ n, t, children }) {
  return (
    <div style={S.sec}>
      <div style={S.secTitle}>{n}. {t}</div>
      <div style={S.secBody}>{children}</div>
    </div>
  )
}

const S = {
  app: { width: '100%', maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: 'var(--mp-bg)', fontFamily: "'Outfit','Gowun Dodum',sans-serif", color: 'var(--mp-ink)', paddingBottom: 40 },
  top: { position: 'sticky', top: 0, zIndex: 100, background: 'var(--mp-topbar)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--mp-line)', padding: 'max(calc(env(safe-area-inset-top, 0px) + 13px), 13px) 14px 13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 32, height: 32, border: 'none', background: 'var(--mp-card2)', borderRadius: '50%', fontSize: 18, cursor: 'pointer', color: 'var(--mp-ink)' },
  title: { fontWeight: 700, fontSize: 16 },
  body: { padding: '18px 18px' },
  date: { fontSize: 13, color: 'var(--mp-muted)', fontWeight: 600, marginBottom: 14 },
  intro: { fontSize: 13.5, color: 'var(--mp-sub)', lineHeight: 1.7, marginBottom: 8 },
  sec: { marginTop: 22 },
  secTitle: { fontSize: 15, fontWeight: 700, marginBottom: 8 },
  secBody: { fontSize: 13.5, color: 'var(--mp-sub)', lineHeight: 1.8 },
  note: { fontSize: 12, color: 'var(--mp-muted)', lineHeight: 1.6, marginTop: 28, padding: 14, background: 'var(--mp-card2)', borderRadius: 12 },
}
