# Maple로 IB Chemistry Wiki를 함께 만들어가는 방법

이 문서는 IB 시험을 가르치는 학원에서 Maple을 사용해 IB Chemistry Wiki를 함께 관리하고, 학생용 공개 웹사이트로 배포하는 방법을 설명합니다.

현재 IB Wiki는 단순한 자료 보관함이 아니라, IB Chemistry 수업 자료와 문제 자료를 학생이 읽기 쉬운 단원별 학습 위키로 바꾸는 프로젝트입니다.

## 1. 가장 중요한 운영 구조: Share & Publish

IB Wiki는 두 가지 사용자를 염두에 두고 운영하는 것이 좋습니다.

- 학원 내부 담당자: Maple 앱에서 자료를 추가하고, 위키를 수정하고, 배포합니다.
- 학생 또는 외부 독자: 공개 웹사이트에서 단원별 `Concepts`와 `Problem patterns`를 읽습니다.

Maple의 `Share & Publish`는 이 두 흐름을 연결하는 기능입니다.

- GitHub는 학원 내부 팀이 같은 workspace를 함께 관리하기 위한 private sync 공간입니다.
- Vercel은 학생이 보는 read-only 공개 웹사이트입니다.
- Maple은 로컬 workspace에서 작업하고, Share & Publish를 통해 GitHub와 공개 사이트에 반영합니다.

즉, 선생님과 운영자는 Maple + GitHub로 관리하고, 학생은 Vercel 공개 사이트로 읽는 구조입니다.

## 2. Share & Publish 화면 열기

1. Maple에서 IB Wiki workspace를 엽니다.
2. 오른쪽 위 `...` 메뉴를 클릭합니다.
3. `Share & Publish`를 선택합니다.

Share & Publish에는 다음 영역이 있습니다.

- `Publish Changes`: 현재 변경 사항을 GitHub와 공개 사이트용 export에 반영합니다.
- `Team Workspace`: GitHub repo URL, 팀 이름, repo 연결, 최신 변경 받기를 관리합니다.
- `Edit Session`: 한 번에 한 명이 편집하도록 작업 잠금을 관리합니다.
- `Public Website`: 공개 사이트 URL, Vercel project URL, 원본 소스 공개 여부를 관리합니다.
- `History`: 이전 publish 기록을 보고 필요하면 특정 버전으로 복원합니다.

## 3. GitHub 초대가 완료된 상태에서 시작하기

이 문서는 GitHub repo 초대가 이미 발송된 상태를 전제로 합니다. 따라서 새로 초대하는 절차보다, 초대를 받은 사람이 repo 접근을 수락하고 Maple에서 workspace를 여는 흐름이 중요합니다.

설정 담당자가 확인할 것:

1. `Share & Publish`를 엽니다.
2. `Team Workspace`에서 팀 이름을 입력합니다.
3. GitHub repo URL을 입력합니다.
4. `Save`를 클릭합니다.
5. `Connect repo`를 클릭합니다.
6. `Copy repo link`로 팀원에게 전달할 workspace repo 링크를 복사합니다.

초대를 받은 팀원이 할 일:

1. GitHub 초대 메일 또는 알림에서 repo 초대를 수락합니다.
2. Maple을 엽니다.
3. `Join team workspace`를 클릭합니다.
4. 전달받은 GitHub repo URL을 붙여넣습니다.
5. 로컬에 저장할 폴더를 선택합니다.
6. `Join workspace`를 클릭합니다.

만약 `Join workspace`가 실패하면 먼저 GitHub 초대를 수락했는지, 해당 GitHub 계정으로 이 Mac에서 접근 가능한지 확인합니다. Maple은 GitHub 권한 자체를 대신 부여하지 않고, 이미 받은 repo 접근 권한을 사용합니다.

공개 웹사이트 설정:

1. `Public Website`에서 public site URL에 `https://ib-wiki-nine.vercel.app`을 입력합니다.
2. Vercel project URL에 `https://vercel.com/ib-wiki/ib-wiki`를 입력합니다.
3. `Publish original source files publicly` 옵션을 확인합니다.
4. 일반적으로 학생용 사이트라면 이 옵션은 꺼두는 것을 권장합니다.

현재 사이트 링크:

- Public site URL: [https://ib-wiki-nine.vercel.app](https://ib-wiki-nine.vercel.app)
- Vercel project URL: [https://vercel.com/ib-wiki/ib-wiki](https://vercel.com/ib-wiki/ib-wiki)

기본 공개 정책은 안전한 쪽입니다.

- 공개 사이트에는 위키 페이지와 위키 이미지 assets만 포함됩니다.
- 원본 PDF, worksheet, markscheme, 내부 자료는 기본적으로 공개되지 않습니다.
- `Publish original source files publicly`를 켠 경우에만 원본 소스 파일이 공개 사이트에 포함됩니다.

## 4. 평소 작업과 배포 흐름

IB Wiki를 운영할 때는 아래 흐름을 반복하면 됩니다.

1. 작업을 시작하기 전에 항상 `Share & Publish`에서 `Pull latest`를 눌러 최신 상태를 받습니다.
2. `Edit Session`에 본인 이름을 입력합니다.
3. `Start editing`을 눌러 편집 세션을 시작합니다.
4. 자료 추가, `Build wiki`, `Ask Wiki`, `Maintain` 작업을 합니다.
5. 생성된 변경을 짧게 확인하고 `Done reviewing`을 누릅니다.
6. 다시 `Share & Publish`로 돌아갑니다.
7. `Publish & release lock`을 눌러 GitHub와 공개 사이트 export를 갱신하고 편집 세션을 종료합니다.
8. 1~2분 정도 기다린 뒤 `Open site`로 학생용 사이트가 잘 반영되었는지 확인합니다.

버튼 의미:

- `Pull latest`: 다른 담당자가 publish한 최신 변경을 내 workspace로 가져옵니다.
- `Start editing`: 지금부터 내가 이 workspace를 편집하겠다고 잠금을 잡습니다.
- `Publish & release lock`: 변경 사항을 GitHub에 올리고 공개 사이트용 파일도 갱신한 뒤 잠금을 해제합니다. 실제 Vercel 공개 사이트에 반영되기까지는 보통 1~2분 정도 걸릴 수 있습니다.
- `Publish only`: 변경 사항을 올리지만 계속 내가 편집합니다.
- `Release lock`: 변경 없이 편집 잠금만 해제합니다.
- `Force unlock`: 잠금이 오래되었거나 담당자가 해제할 수 없을 때만 사용합니다.
- `Restore`: 이전 버전으로 되돌리는 새 commit을 만듭니다. 기존 기록을 지우는 기능은 아닙니다.

실무 규칙:

- 작업 전에는 반드시 `Pull latest`를 먼저 누릅니다. 이 단계를 건너뛰면 다른 담당자의 최신 변경을 보지 못한 상태에서 작업할 수 있습니다.
- 큰 변경보다 단원별 작은 변경을 자주 publish하는 편이 안전합니다.
- 학생에게 공개하기 전에는 원본 소스 공개 옵션이 의도와 맞는지만 꼭 확인합니다.
- 다른 담당자가 editing lock을 잡고 있으면 기다리거나, 정말 필요한 경우에만 `Force unlock`을 사용합니다.

## 5. 현재 IB Wiki의 구조

현재 위키는 IB Chemistry를 학생용 단원 페이지로 정리하는 방향입니다.

핵심 구조:

```text
workspace/
  sources/
    _core/
      Chem Syllabus Bullet points.docx
      IB Chemistry Key concept Overview.docx
    ...
  wiki/
    units/
      chemistry/
        s1-1-classification-of-matter.md
        s1-2-s1-3-atomic-structure.md
    assets/
  index.md
  schema.md
```

현재 `index.md`에는 다음 단원이 들어가 있습니다.

- `S1.1 Classification of Matter`
- `S1.2-S1.3 Atomic structure`

각 단원 페이지는 학생이 보는 공개 콘텐츠입니다.

- `Concepts`: IB Chemistry 개념 설명, key concept, syllabus bullet, 공식, 오개념, 예시를 정리합니다.
- `Problem patterns`: 반복 출제되는 문제 유형, 알아보는 신호, 풀이 전략, markscheme 포인트를 정리합니다.

중요한 점은 `schema.md`에 이미 이 workspace의 자세한 작성 규칙이 들어 있다는 것입니다. 따라서 매번 Build wiki 요청에 모든 규칙을 길게 다시 적을 필요는 없습니다.

## 6. 어떤 자료를 추가하면 좋은가

Maple에 넣는 원본 자료는 `sources/`에 보관됩니다. 원본 자료는 가능한 한 그대로 두고, 학생용 정리본은 `wiki/` 아래에 만들어갑니다.

우선순위가 높은 자료:

- IB Chemistry syllabus bullet 자료
- 학원에서 정의한 key concept 정리
- 단원별 강의 PDF 또는 슬라이드
- 학생용 worksheet
- past paper 또는 자체 제작 문제 세트
- markscheme, model answer, 해설 자료
- 자주 묻는 질문과 학생 오답 사례
- 개념 설명에 필요한 그림, 표, 그래프, 실험 이미지

자료는 한 번에 전 과목을 넣기보다 단원별로 나누어 추가하는 편이 좋습니다.

예시:

- `S1.1 Classification of Matter` 관련 자료만 먼저 추가
- 그다음 `Atomic structure` 관련 문제 세트와 markscheme 추가
- 이후 `Bonding`, `Energetics`, `Acids and bases`처럼 단원 단위로 확장

## 7. Build wiki를 사용할 때

`Build wiki`는 새로 추가한 자료를 위키에 반영하는 기능입니다.

이 workspace의 세부 작성 규칙은 `schema.md`에 이미 있습니다. 예를 들어 단원 페이지는 `wiki/units/chemistry/` 아래에 두고, 공개 페이지는 `Concepts`와 `Problem patterns` 두 탭 구조를 유지하며, key concept 목록과 syllabus bullet ID는 core 자료를 기준으로 유지해야 한다는 규칙이 들어 있습니다.

따라서 Build wiki 요청은 길게 규칙을 반복하기보다 다음 세 가지만 분명히 적는 것이 좋습니다.

- 어떤 단원 자료인지
- 기존 페이지를 보강하는지, 새 단원을 추가하는지
- 특히 어떤 내용을 강화하고 싶은지

또 하나 중요한 것은 자료 순서입니다. `Build wiki` 창에 여러 자료가 보이면, Maple이 읽을 순서를 의도에 맞게 지정해 주세요. 예를 들어 syllabus/core 자료를 먼저 두고, 그다음 강의 자료, worksheet, markscheme 순서로 두면 위키가 더 안정적으로 정리됩니다. 같은 단원의 문제 세트와 해설은 서로 가까이 배치하는 것이 좋습니다.

기존 단원 보강 예시:

```text
이 자료는 Atomic structure 단원 보강 자료입니다.
`schema.md`의 IB Chemistry Wiki 규칙을 따르고, 새 페이지를 따로 만들기보다 기존 Atomic structure unit page에 통합해 주세요.
특히 mass spectrum 계산, electron configuration, ionization energy 문제 패턴을 보강해 주세요.
```

문제 세트와 markscheme 추가 예시:

```text
이 자료는 S1.1 Classification of Matter 문제 세트와 markscheme입니다.
기존 S1.1 unit page의 Problem patterns 탭을 보강해 주세요.
학생이 문제를 알아보는 신호, 풀이 순서, 자주 틀리는 부분, markscheme에서 점수를 주는 표현을 정리해 주세요.
```

새 단원 추가 예시:

```text
이 자료는 Bonding 단원 자료입니다.
`schema.md`의 현재 IB Chemistry unit page 구조를 따라 새 chemistry unit page를 만들고, `index.md`에도 연결해 주세요.
Concepts에는 key concept 중심 설명을, Problem patterns에는 반복 시험 문제 유형을 정리해 주세요.
```

피해야 할 요청:

- "전체를 알아서 잘 정리해 주세요."
- "좋게 만들어 주세요."
- "`schema.md`와 다른 구조로 새 페이지를 많이 만들어 주세요." 단, 구조를 바꾸려는 의도가 있다면 `Maintain`의 `Update rules`를 먼저 사용합니다.

## 8. Ask Wiki를 수업 준비에 활용하기

`Ask Wiki`는 현재 만들어진 위키와 자료를 바탕으로 질문하는 기능입니다.

선생님이 사용할 수 있는 질문 예시:

- "S1.1에서 학생들이 가장 먼저 헷갈릴 만한 개념은 뭐야?"
- "Atomic structure에서 4s/3d 전자배치 관련 함정을 수업에서 어떻게 설명하면 좋을까?"
- "이 단원에서 SL 학생과 HL 학생에게 다르게 강조해야 할 부분이 있어?"
- "이 문제는 어떤 problem pattern에 넣는 게 자연스러워?"
- "이 markscheme에서 학생들이 놓치기 쉬운 채점 포인트를 정리해줘."

좋은 답변이 나오면 `Apply to wiki`로 단원 페이지에 반영할 수 있습니다.

차이점:

- `Ask Wiki`: 질문하고 이해하기 위한 기능
- `Apply to wiki`: 좋은 답변을 위키에 저장하는 기능
- `Build wiki`: 새 자료를 단원 페이지에 반영하는 기능
- `Maintain`: 위키 구조, 품질, 규칙, 소스 정리를 관리하는 기능

## 9. Maintain으로 위키를 관리하기

`Maintain`은 단원 페이지가 늘어날 때 위키의 구조와 품질을 관리하는 영역입니다. Build wiki가 "새 자료를 위키로 반영"하는 기능이라면, Maintain은 "이미 만들어진 위키를 더 좋은 학습 시스템으로 다듬는" 기능입니다.

Maintain에는 네 가지 주요 작업이 있습니다.

## 10. Wiki healthcheck

`Wiki healthcheck`는 위키 상태를 점검하는 작업입니다. 별도 지시 없이도 실행할 수 있고, 특정 부분이 걱정될 때는 focus를 적을 수 있습니다.

IB Wiki에서 확인하기 좋은 항목:

- `index.md`가 실제 unit page를 잘 연결하는지
- 단원 페이지가 `Concepts` / `Problem patterns` 구조를 유지하는지
- key concept, syllabus bullet, SL/HL 정보가 빠지거나 깨지지 않았는지
- 출처 링크가 부족하거나 오래된 설명이 있는지
- 문제 패턴 설명이 너무 약한 단원이 있는지
- 공개 사이트 export에 방해될 만한 Markdown 구조 문제가 있는지

요청 예시:

```text
현재 IB Chemistry Wiki를 점검해 주세요.
단원 페이지가 Concepts / Problem patterns 구조를 지키는지,
syllabus bullet ID와 key concept 연결이 빠진 곳은 없는지,
공개 사이트에서 문제가 될 만한 구조가 있는지 확인해 주세요.
```

## 11. Improve wiki

`Improve wiki`는 실제 위키 내용을 개선하는 작업입니다. 설명을 더 쉽게 만들거나, 문제 패턴을 보강하거나, 단원 페이지 스타일을 맞추는 데 사용합니다.

IB Wiki에서 유용한 상황:

- 특정 단원 설명이 학생에게 너무 어렵거나 짧을 때
- `Problem patterns`가 부족할 때
- 두 단원의 문체와 설명 깊이가 다를 때
- 학생 오답 사례를 단원 페이지에 반영하고 싶을 때
- 기존 위키 내용에 새 출처 자료를 참고해 보강하고 싶을 때

새 원본 자료까지 참고해야 한다면 `Use sources`를 켜고 관련 source를 선택하는 것이 좋습니다.

요청 예시:

```text
Atomic structure 페이지를 학생용 설명으로 더 다듬어 주세요.
각 KC 설명은 직관적 설명, 정확한 정의, 예시, 자주 하는 실수 순서로 정리해 주세요.
```

```text
S1.1 Classification of Matter의 Problem patterns를 더 시험 중심으로 보강해 주세요.
분리 방법, heating curve, pure substance vs mixture 구분 문제를 중심으로 recognition signals와 markscheme checks를 추가해 주세요.
```

## 12. Organize sources

`Organize sources`는 `sources/` 안의 원본 자료를 이동하거나 이름을 정리하는 작업입니다. 소스 파일 내용은 바꾸지 않습니다.

IB Wiki에서 유용한 상황:

- 단원별로 자료가 섞여 있어서 찾기 어려울 때
- worksheet, markscheme, slides, past paper를 단원별 폴더로 나누고 싶을 때
- 파일명이 너무 모호해서 나중에 관리하기 어려울 때

예시 구조:

```text
sources/
  _core/
  chemistry/
    s1-1-classification-of-matter/
      slides/
      worksheets/
      markschemes/
    s1-2-s1-3-atomic-structure/
      slides/
      worksheets/
      markschemes/
```

요청 예시:

```text
소스 내용을 바꾸지 말고, Chemistry 자료를 단원별 폴더로 정리해 주세요.
S1.1, Atomic structure, Bonding처럼 단원 기준으로 나누고, worksheet와 markscheme은 구분해 주세요.
```

## 13. Update rules

`Update rules`는 앞으로 계속 지켜야 할 규칙을 `schema.md`에 저장하는 작업입니다. 한 번만 적용할 요청은 Build wiki나 Improve wiki에 적고, 앞으로 반복 적용할 기준은 Update rules에 저장하는 것이 좋습니다.

IB Wiki에서 저장할 만한 규칙:

- 모든 unit page는 `Concepts`와 `Problem patterns` 두 탭을 유지한다.
- key concept 이름과 순서는 core 자료를 기준으로 유지한다.
- Problem patterns에는 항상 recognition signals, solving moves, common traps, markscheme checks를 포함한다.
- SL/HL 구분은 visible text와 metadata에 모두 유지한다.
- 학생용 설명은 쉬운 직관, 정확한 정의, 예시, 시험 함정 순서로 쓴다.

요청 예시:

```text
앞으로 IB Chemistry의 모든 Problem patterns에는 recognition signals, solving moves, common traps, markscheme checks를 포함하도록 규칙을 저장해 주세요.
```

```text
앞으로 새 unit page를 만들 때는 일반 concepts/summaries/guides 폴더를 만들지 말고, 학생용 내용은 `wiki/units/chemistry/` 아래 unit page에 통합하도록 규칙을 저장해 주세요.
```

## 14. 확인은 짧게만 하면 됩니다

Maple은 AI 변경 사항을 바로 확정하지 않고 먼저 보여줍니다. 다만 매번 긴 검토를 할 필요는 없습니다.

실무적으로는 이 정도만 확인하면 됩니다.

- 올바른 단원 페이지가 업데이트되었는가?
- key concept, syllabus bullet, SL/HL 구분이 이상하게 바뀌지 않았는가?
- 학생에게 보여주면 안 되는 내부 메모가 들어가지 않았는가?
- 공개할 자료라면 원본 소스 공개 설정이 의도와 맞는가?

문제가 없으면 `Done reviewing`을 누르면 됩니다. 방향이 많이 틀렸다면 `Undo last operation` 후 요청을 더 구체적으로 적어 다시 실행합니다.

## 15. 학생용 공개 사이트를 어떻게 쓰게 할 것인가

학생에게 공개 사이트를 제공할 때는 다음 방식이 좋습니다.

- 수업 전: 해당 단원의 `Concepts`를 먼저 읽게 합니다.
- 수업 중: 선생님 설명과 연결되는 KC를 같이 봅니다.
- 문제 풀이 전: `Problem patterns`에서 문제 유형을 먼저 확인하게 합니다.
- 오답 후: 문제 패턴의 common traps와 markscheme checks를 보게 합니다.
- 복습 때: syllabus code 기준으로 빠진 단원을 찾아 읽게 합니다.

공개 사이트는 "자료 다운로드 폴더"가 아니라 "학생이 따라가는 학습 지도"로 안내하는 것이 좋습니다.

## 16. 권장 운영 방식

초기 구축 단계:

- 현재 있는 `S1.1`, `Atomic structure` 두 단원을 먼저 완성도 있게 다듬습니다.
- 다음 단원은 한 번에 하나씩 추가합니다.
- 각 단원마다 Concepts와 Problem patterns가 모두 있는지 확인합니다.
- 문제 세트와 markscheme은 가능한 한 단원별로 묶어 추가합니다.

정착 단계:

- 새 수업 자료가 생기면 해당 단원에 추가합니다.
- 시험 시즌 전에는 Problem patterns를 집중적으로 보강합니다.
- 학생 질문이 반복되면 Ask Wiki로 정리한 뒤 Apply to wiki로 저장합니다.
- 공개 사이트는 큰 업데이트 후 `Publish & release lock`으로 갱신합니다.

팀 운영 원칙:

- 작업 전 반드시 `Pull latest`
- 작업 시작 시 `Start editing`
- 작업 후 간단 확인
- 공유 준비가 되면 `Publish & release lock`
- 원본 소스 공개는 기본적으로 off

## 17. 한 줄 요약

이 IB Wiki는 학원의 IB Chemistry 자료를 학생이 실제로 공부할 수 있는 단원별 웹 위키로 바꾸는 작업입니다.

Maple에서는 `Share & Publish`로 내부 팀 작업과 학생용 공개 사이트를 관리하고, `Build wiki`로 새 자료를 단원 페이지에 반영하며, `Maintain`으로 설명 품질, 문제 패턴, 소스 정리, 장기 규칙을 다듬으면 됩니다.
