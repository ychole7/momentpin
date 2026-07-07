// src/Terms.jsx — 이용약관
export default function Terms({ onClose }) {
  return (
    <div style={S.app}>
      <div style={S.top}>
        <button style={S.back} onClick={onClose}>←</button>
        <div style={S.title}>이용약관</div>
        <div style={{ width: 32 }} />
      </div>
      <div style={S.body}>
        <p style={S.date}>시행일: 2026년 ○월 ○일</p>
        <p style={S.intro}>본 약관은 닿음(이하 "서비스")의 이용과 관련하여 서비스와 이용자 간의 권리, 의무 및 책임 사항을 규정합니다.</p>

        <Sec n="제1조" t="목적">
          본 약관은 이용자가 서비스를 이용함에 있어 필요한 조건 및 절차, 서비스와 이용자의 권리·의무·책임 사항을 정함을 목적으로 합니다.
        </Sec>
        <Sec n="제2조" t="용어의 정의">
          · <b>서비스</b>: 닿음이 제공하는 그룹 기반 위치·순간 공유 앱<br/>
          · <b>이용자</b>: 약관에 동의하고 서비스를 이용하는 회원<br/>
          · <b>그룹</b>: 모먼을 함께 공유하기 위해 구성한 모임<br/>
          · <b>모먼</b>: 정해진/임의 시각에 함께 남기는 사진과 위치<br/>
          · <b>콘텐츠</b>: 이용자가 게시·전송하는 사진, 위치, 텍스트 등
        </Sec>
        <Sec n="제3조" t="약관의 효력 및 변경">
          · 약관은 서비스 화면에 게시함으로써 효력이 발생합니다.<br/>· 관련 법령을 위반하지 않는 범위에서 변경될 수 있으며, 변경 시 서비스 내 공지로 안내합니다.<br/>· 변경 약관에 동의하지 않으면 이용을 중단하고 탈퇴할 수 있습니다.
        </Sec>
        <Sec n="제4조" t="회원가입 및 이용계약">
          · 이용계약은 약관 동의 및 가입 절차 완료로 성립합니다.<br/>· 만 14세 미만 아동의 회원가입을 받지 않습니다.<br/>· 정확한 정보를 제공해야 하며, 허위 정보로 인한 불이익은 이용자가 부담합니다.
        </Sec>
        <Sec n="제5조" t="서비스의 제공 및 변경">
          · 그룹 내 모먼 공유, 위치 확인, 알림 등을 제공합니다.<br/>· 운영·기술상 필요에 따라 기능이 변경될 수 있습니다.<br/>· 무료로 제공되며, 일부 기능 유료 전환 시 사전 공지합니다.
        </Sec>
        <Sec n="제6조" t="이용자의 콘텐츠">
          · 게시한 콘텐츠의 권리와 책임은 해당 이용자에게 있습니다.<br/>· 서비스는 운영 목적 범위 내에서만 이용하며 외부에 판매·제공하지 않습니다.<br/>· 탈퇴하거나 삭제 시 콘텐츠는 파기됩니다.
        </Sec>
        <Sec n="제7조" t="이용자의 의무 및 금지 행위">
          다음 행위를 해서는 안 됩니다.<br/>
          · 타인의 사진·위치를 동의 없이 외부에 유포<br/>· 타인의 위치를 스토킹·감시 등 부적절한 목적으로 이용<br/>· 음란·폭력·혐오 등 부적절한 콘텐츠 게시<br/>· 타인 사칭 또는 허위 정보 게시<br/>· 서비스의 정상 운영 방해<br/>· 관련 법령 또는 약관 위배 행위
        </Sec>
        <Sec n="제8조" t="그룹 운영">
          · 그룹장은 그룹 이름, 모먼 시간 등을 설정할 수 있습니다.<br/>· 구성원은 언제든 그룹에서 나갈 수 있습니다.<br/>· 그룹장이 그룹을 삭제하면 모든 데이터가 파기됩니다.
        </Sec>
        <Sec n="제9조" t="서비스 이용 제한">
          · 약관·법령 위반 시 이용 제한, 계정 정지·삭제가 될 수 있습니다.<br/>· 부적절한 콘텐츠·행위는 삭제될 수 있습니다.
        </Sec>
        <Sec n="제10조" t="서비스의 중단">
          · 점검, 천재지변, 기술 장애 등으로 일시 중단될 수 있습니다.<br/>· 사전 공지 후 중단할 수 있으며, 부득이한 경우 사후 공지할 수 있습니다.
        </Sec>
        <Sec n="제11조" t="책임의 제한">
          · 무료 서비스 이용과 관련해 법령에 특별 규정이 없는 한 책임지지 않습니다.<br/>· 이용자 간 분쟁이나 이용자 콘텐츠로 인한 문제에 책임지지 않습니다.<br/>· 불가항력으로 인한 중단에 책임지지 않습니다.
        </Sec>
        <Sec n="제12조" t="회원 탈퇴">
          · 언제든 회원 탈퇴 기능으로 이용계약을 해지할 수 있습니다.<br/>· 탈퇴 시 계정과 관련 데이터는 즉시 파기됩니다.
        </Sec>
        <Sec n="제13조" t="준거법 및 관할">
          본 약관은 대한민국 법령에 따라 해석되며, 분쟁은 관련 법령이 정한 절차에 따릅니다.
        </Sec>
        <Sec n="제14조" t="문의">
          · 문의 이메일: ○○○@○○○
        </Sec>

        <p style={S.note}>본 약관은 표준 양식 기반 초안이며, 출시 전 법률 전문가 검토를 권장합니다.</p>
      </div>
    </div>
  )
}

function Sec({ n, t, children }) {
  return (
    <div style={S.sec}>
      <div style={S.secTitle}>{n} ({t})</div>
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
