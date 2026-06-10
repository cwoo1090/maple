const year = document.querySelector("#year");

if (year) {
  year.textContent = String(new Date().getFullYear());
}

const languageStorageKey = "maple-language";
const supportedLanguages = new Set(["en", "ko"]);

const pageKey = (() => {
  const pathname = window.location.pathname;
  if (pathname.endsWith("/guide.html")) return "guide";
  if (pathname.endsWith("/download-macos.html")) return "download";
  return "home";
})();

const translations = {
  en: {
    common: {
      brandLabel: "Maple home",
      navLabel: "Primary navigation",
      toggleText: "한국어",
      toggleLabel: "Switch language to Korean",
      nav: {
        download: "Download",
        demo: "Demo",
        workflow: "Workflow",
        guide: "Guide",
        privacy: "Privacy",
      },
    },
    meta: {
      home: {
        title: "Maple - Download the AI wiki builder",
        description:
          "Maple turns PDFs, notes, links, and research scraps into a local AI-maintained wiki using your own ChatGPT/Codex or Claude subscription.",
        ogTitle: "Maple - Local AI wiki builder",
        ogDescription:
          "Build a local AI wiki from your sources using your own ChatGPT/Codex or Claude subscription.",
      },
      guide: {
        title: "Maple Guide - Sources, rules, and Maintain",
        description:
          "Learn Maple's workspace model: sources, wiki pages, schema.md rules, Build wiki, Explore, Update wiki, Maintain, review, and undo.",
        ogTitle: "Maple Guide - Sources, rules, and Maintain",
        ogDescription:
          "Learn Maple's local workspace model and how Build wiki, Explore, Maintain, review, and undo work.",
      },
      download: {
        title: "Downloading Maple for macOS",
        description:
          "Download Maple for Apple silicon Macs and build local AI wikis with your own ChatGPT/Codex or Claude subscription.",
      },
    },
    home: {
      heroKicker: "Local AI wiki builder",
      heroCopy:
        "Turn PDFs, notes, links, and research scraps into a local wiki that you can review, explore, and keep on your Mac.",
      downloadCta: "Download for macOS",
      demoCta: "Watch the demo",
      releaseNote:
        "For Apple silicon Macs. Requires macOS 12 or newer and your own ChatGPT/Codex or Claude subscription.",
      heroImageAlt:
        "Maple desktop workspace showing a source tree, generated wiki page, and Explore Chat.",
      demoKicker: "47-second demo",
      demoTitle: "Watch Maple turn source material into a wiki",
      demoCopy:
        "The launch demo shows the core flow: create a workspace, import sources, build with AI, review generated pages, explore with chat, and maintain the wiki over time.",
      demoLabel: "Maple launch demo video",
      videoFallback: "Your browser does not support the video tag.",
      launchKicker: "Bring your own AI",
      launchTitle: "Use the AI subscription you already have",
      launchCopy:
        "Maple does not sell AI credits or require a Maple account. It runs wiki operations through your ChatGPT/Codex or Claude setup.",
      launchCards: [
        [
          "Requirements",
          "Apple silicon Mac, macOS 12 or newer, and either Codex or Claude installed.",
        ],
        [
          "Your subscription",
          "Build and update wikis through your own ChatGPT/Codex or Claude subscription.",
        ],
        [
          "Local workspaces",
          "Sources and generated wiki pages stay in ordinary folders on your Mac.",
        ],
      ],
      workflowKicker: "Workflow",
      workflowTitle: "From scattered sources to a maintained wiki",
      workflowIntro:
        'Inspired by <a href="https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f" target="_blank" rel="noreferrer">Andrej Karpathy\'s LLM Wiki</a>: keep raw sources separate while an AI-maintained wiki becomes the working layer for learning and research.',
      workflowCards: [
        [
          "Create a wiki workspace",
          "Start with one topic, course, archive, project, or skill path.",
        ],
        [
          "Import sources",
          "Add PDFs, Markdown, text notes, links, screenshots, or papers.",
        ],
        [
          "Build wiki",
          "Use ChatGPT/Codex or Claude to compile summaries, concepts, and guides.",
        ],
        ["Explore", "Read pages, follow links, and ask questions from your wiki."],
        [
          "Update wiki",
          "Turn useful Q&A or selected chat messages into reviewable wiki changes.",
        ],
        [
          "Maintain",
          "Improve pages, run healthchecks, clean up links, and keep the wiki useful as it grows.",
        ],
      ],
      guideKicker: "Beginner guide",
      guideTitle: "What Maple means by an AI wiki",
      guideIntro:
        "Maple is not a blank Markdown editor or a one-off document chat. It keeps your original material untouched, then asks AI to compile that material into a local, linked wiki you can review, explore, and improve over time.",
      primerTitle: "Think of it as a study notebook that keeps getting organized.",
      primerCopy:
        "In a normal chat, the useful explanation disappears into the conversation. In Maple, useful explanations become pages, links, guides, and reviewable updates inside a workspace that stays on your Mac.",
      primerCta: "Read the full guide",
      primerItems: [
        [
          "Sources are the reference shelf.",
          "PDFs, notes, links, screenshots, and papers stay as the original evidence.",
        ],
        [
          "The wiki is the working layer.",
          "AI drafts summaries, concepts, guides, links, and navigation from those sources.",
        ],
        [
          "Changes stay reviewable.",
          "Generated edits are shown as drafts, so you can inspect them before relying on them.",
        ],
      ],
      privacyKicker: "Local first",
      privacyTitle: "Your archive stays inspectable",
      privacyCopy:
        "Maple is built around plain local folders: sources stay immutable, generated wiki pages are reviewable, and the workspace can be opened outside the app when you need it.",
      privacyCards: [
        ["No Maple account", "The MVP does not add app accounts, payments, or sync."],
        [
          "Local file storage",
          "Workspaces use readable folders like sources, wiki, index.md, and log.md.",
        ],
        [
          "Reviewable AI changes",
          "Generated edits are tracked so you can inspect what changed.",
        ],
      ],
    },
    guide: {
      heroKicker: "Maple guide",
      heroTitle: "Sources, rules, and Maintain",
      heroCopy:
        "Maple turns source material into a local wiki. This guide explains the words you will see in the app, what each action does, and how to stay in control of AI-generated changes.",
      tocLabel: "Guide contents",
      toc: [
        "Workspace",
        "Sources",
        "Build wiki",
        "schema.md and rules",
        "Explore vs Update",
        "Maintain",
        "Review and undo",
      ],
      workspace: {
        kicker: "Workspace",
        title: "What is a Maple workspace?",
        copy:
          "A workspace is one local folder for one subject: a course, research topic, project, archive, or skill path. Maple keeps the raw material and the generated wiki in separate places so the wiki can improve without rewriting your original files.",
        cards: [
          ["Sources", "The original files you import. They are the evidence Maple reads from."],
          [
            "Wiki pages",
            "The readable layer Maple drafts: summaries, concepts, guides, links, and assets.",
          ],
          [
            "Rules",
            "The workspace instructions that tell AI how this wiki should be written and maintained.",
          ],
          [
            "Reviewable changes",
            "Generated edits are shown as changed files, so you can inspect them before trusting them.",
          ],
        ],
      },
      sources: {
        kicker: "Sources",
        title: "What are sources?",
        copy:
          "Sources are the original material you want Maple to learn from. They can be PDFs, slides, notes, transcripts, screenshots, Markdown files, papers, or captured web links. Think of them as the reference shelf, not the notebook.",
        split: [
          [
            "Sources should stay original",
            "Maple treats source contents as immutable. Build wiki and Maintain may read sources, but they should not rewrite what a PDF, note, or transcript originally said.",
          ],
          [
            "Pending source changes",
            "When you add, remove, or replace files under Sources, Maple marks them as pending. Build wiki processes those changes into the wiki.",
          ],
        ],
        table: [
          ["Source state", "What it means"],
          ["New", "A file was added and has not been built into the wiki yet."],
          [
            "Modified",
            "A source changed after the last build. Maple treats this carefully because sources are meant to be stable.",
          ],
          [
            "Removed",
            "A file that existed during the last build is no longer in Sources.",
          ],
          ["Unchanged", "The source already matches the last known built state."],
        ],
      },
      build: {
        kicker: "Build wiki",
        title: "What does Build wiki do?",
        copy:
          "Build wiki asks AI to read pending source changes and integrate them into the existing wiki. It should not simply dump one summary per file; it should strengthen the knowledge base you will keep using.",
        cards: [
          ["Summaries", "Digests for substantial sources, such as a lecture, paper, or long note."],
          [
            "Concept pages",
            "Reusable explanations of durable ideas, formulas, entities, comparisons, or processes.",
          ],
          [
            "Guides",
            "Learning paths, review paths, onboarding routes, and synthesis pages across multiple topics.",
          ],
          [
            "Links and navigation",
            "Wikilinks, index updates, and graph connections that help you move through the material.",
          ],
          [
            "Assets",
            "Useful derived visuals from source material, saved separately from the original files.",
          ],
          ["Log entries", "A short history of what operation changed the wiki and why."],
        ],
      },
      rules: {
        kicker: "Rules",
        title: "What is schema.md?",
        copy:
          "<code>schema.md</code> is the local rulebook for a workspace. It tells AI what page types to use, how to cite sources, how links should work, what the wiki is for, and what Maintain should check.",
        calloutTitle: "You usually do not need to edit this file directly.",
        calloutCopy:
          'In the app, use Update rules when you want Maple to remember a future preference, such as "make every guide beginner-friendly" or "always include practice questions in study guides."',
        split: [
          [
            "One-time instruction",
            '"For this build, focus on exam review." Maple uses it for the current operation and does not make it a permanent rule.',
          ],
          [
            "Durable rule",
            '"From now on, add source citations to every formula." Maple should save this as a workspace rule for future operations.',
          ],
        ],
      },
      explore: {
        kicker: "Explore and update",
        title: "Explore Chat is different from Update wiki",
        copy:
          "Maple separates asking questions from changing the wiki. This keeps normal chat safe and makes permanent edits intentional.",
        table: [
          ["Action", "Use it when", "What changes"],
          [
            "Explore Chat",
            "You want to ask a question, understand a page, or compare ideas.",
            "Nothing by default. It is read-only.",
          ],
          [
            "Update wiki",
            "A chat answer is worth keeping for later.",
            "Maple drafts reviewable edits to wiki pages, navigation, or logs.",
          ],
        ],
      },
      maintain: {
        kicker: "Maintain",
        title: "What are the Maintain functions?",
        copy:
          "Maintain is where you improve an existing workspace after the first build. Use it when the wiki needs cleanup, restructuring, better rules, or source organization.",
        cards: [
          [
            "Wiki healthcheck",
            "A conservative check for broken links, stale index entries, weak pages, missing citations, and similar quality issues.",
            "Use when the wiki feels messy or stale.",
          ],
          [
            "Improve wiki",
            "A user-directed improvement pass for creating guides, connecting pages, reshaping structure, or improving explanations.",
            "Use when you know what quality improvement you want.",
          ],
          [
            "Organize sources",
            "Moves or renames source files and folders without changing source contents. For example, group slides and transcripts by lecture.",
            "Use when the source tree is hard to navigate.",
          ],
          [
            "Update rules",
            "Saves durable preferences for future wiki work. This is the app action behind updating the workspace rulebook.",
            "Use when you want Maple to remember a convention.",
          ],
        ],
      },
      review: {
        kicker: "Review and undo",
        title: "How do reviewable changes work?",
        copy:
          "AI output is treated as a draft. After Build wiki, Update wiki, or a Maintain operation, Maple marks generated files so you can inspect what changed before moving on.",
        steps: [
          [
            "Open changed files",
            "Review the generated summaries, concepts, guides, index updates, or rule changes.",
          ],
          [
            "Finish review",
            "Mark the generated changes as reviewed when they look useful enough to keep.",
          ],
          [
            "Undo last operation",
            "If the operation went in the wrong direction, restore the previous workspace state.",
          ],
        ],
      },
    },
    download: {
      kicker: "Direct download",
      title: "Downloading Maple for macOS",
      status: "Finding the latest Apple silicon DMG from the Maple release page.",
      fallback: "Open latest release",
    },
  },
  ko: {
    common: {
      brandLabel: "Maple 홈",
      navLabel: "주요 메뉴",
      toggleText: "English",
      toggleLabel: "영어로 보기",
      nav: {
        download: "다운로드",
        demo: "데모",
        workflow: "흐름",
        guide: "가이드",
        privacy: "로컬 저장",
      },
    },
    meta: {
      home: {
        title: "Maple - AI 위키 빌더 다운로드",
        description:
          "Maple은 PDF, 노트, 링크를 내 Mac 안의 AI 위키로 정리해주는 앱입니다. 사용 중인 ChatGPT/Codex나 Claude 구독을 그대로 사용합니다.",
        ogTitle: "Maple - 로컬 AI 위키 빌더",
        ogDescription:
          "사용 중인 ChatGPT/Codex나 Claude로 내 자료를 로컬 AI 위키로 정리하세요.",
      },
      guide: {
        title: "Maple 가이드 - 원본 자료와 위키 관리",
        description:
          "Maple의 워크스페이스, 원본 자료, Build wiki, Explore Chat, Update wiki, Maintain, 검토와 되돌리기가 어떻게 작동하는지 설명합니다.",
        ogTitle: "Maple 가이드 - 원본 자료와 위키 관리",
        ogDescription:
          "원본 자료는 보관하고, AI가 만든 위키는 확인하며, 계속 다듬어가는 Maple의 기본 흐름을 설명합니다.",
      },
      download: {
        title: "macOS용 Maple 다운로드",
        description:
          "Apple silicon Mac용 Maple을 다운로드해 사용 중인 ChatGPT/Codex나 Claude 구독으로 로컬 AI 위키를 만들 수 있습니다.",
      },
    },
    home: {
      heroKicker: "내 Mac에 만드는 AI 위키",
      heroCopy:
        "PDF, 노트, 링크를 넣으면 AI가 로컬 위키로 정리합니다. 원본은 건드리지 않고, 만들어진 페이지는 직접 확인하며 쌓아갈 수 있습니다.",
      downloadCta: "macOS용 다운로드",
      demoCta: "데모 보기",
      releaseNote:
        "Apple silicon Mac용입니다. macOS 12 이상과 ChatGPT/Codex 또는 Claude 구독이 필요합니다.",
      heroImageAlt:
        "원본 자료 목록, 생성된 위키 페이지, Explore Chat이 함께 보이는 Maple 데스크톱 화면.",
      demoKicker: "47초 데모",
      demoTitle: "자료가 위키로 정리되는 과정을 보세요",
      demoCopy:
        "워크스페이스를 만들고, 자료를 넣고, AI로 위키를 만든 뒤 생성된 페이지를 확인하고 채팅으로 탐색하는 흐름을 담았습니다.",
      demoLabel: "Maple 데모 영상",
      videoFallback: "이 브라우저는 비디오 태그를 지원하지 않습니다.",
      launchKicker: "ChatGPT/Codex 또는 Claude",
      launchTitle: "이미 쓰는 구독으로 시작하세요",
      launchCopy:
        "Maple은 AI 크레딧을 따로 팔지 않고 Maple 계정도 요구하지 않습니다. 사용 중인 ChatGPT/Codex나 Claude로 위키 만들기와 업데이트를 실행합니다.",
      launchCards: [
        ["필요한 환경", "Apple silicon Mac, macOS 12 이상, Codex 또는 Claude가 필요합니다."],
        [
          "내 구독 그대로",
          "이미 결제 중인 ChatGPT/Codex나 Claude 구독을 사용합니다.",
        ],
        [
          "파일은 내 Mac에",
          "원본 자료와 위키 페이지는 Mac의 일반 폴더에 저장됩니다.",
        ],
      ],
      workflowKicker: "기본 흐름",
      workflowTitle: "흩어진 자료를 다시 찾기 쉬운 위키로",
      workflowIntro:
        '<a href="https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f" target="_blank" rel="noreferrer">Andrej Karpathy의 LLM Wiki</a>에서 아이디어를 얻었습니다. 원본 자료는 따로 보관하고, AI가 정리한 위키를 학습과 리서치에 쓰는 방식입니다.',
      workflowCards: [
        ["워크스페이스 만들기", "강의, 리서치 주제, 프로젝트처럼 하나의 주제로 시작합니다."],
        ["자료 가져오기", "PDF, Markdown, 텍스트 노트, 링크, 스크린샷, 논문을 넣습니다."],
        ["AI로 위키 만들기", "ChatGPT/Codex나 Claude가 요약, 개념 페이지, 가이드를 만듭니다."],
        ["읽고 물어보기", "페이지를 따라 읽고, 궁금한 점은 위키에 질문합니다."],
        ["좋은 답변 저장하기", "나중에 다시 볼 답변은 검토 가능한 위키 변경으로 남깁니다."],
        ["계속 정리하기", "페이지 품질을 점검하고, 링크와 구조를 다듬습니다."],
      ],
      guideKicker: "처음 쓰는 분을 위한 안내",
      guideTitle: "Maple의 AI 위키는 무엇이 다른가요?",
      guideIntro:
        "Maple은 빈 Markdown 편집기도, 문서 하나에 질문만 하는 챗봇도 아닙니다. 원본 자료는 그대로 보관하고, AI가 읽어 만든 로컬 위키를 사용자가 확인하고 탐색하며 키워가는 앱입니다.",
      primerTitle: "좋은 답변을 대화창에 묻어두지 않습니다.",
      primerCopy:
        "채팅으로 얻은 설명은 금방 흘러갑니다. Maple에서는 쓸 만한 설명을 페이지, 링크, 가이드, 검토할 변경으로 남깁니다.",
      primerCta: "전체 가이드 읽기",
      primerItems: [
        ["원본은 그대로 둡니다.", "PDF, 노트, 링크, 스크린샷, 논문은 근거 자료로 남습니다."],
        ["위키는 AI가 정리합니다.", "요약, 개념, 가이드, 링크 구조를 먼저 만들고 사용자가 확인합니다."],
        ["변경은 보고 반영합니다.", "AI가 만든 편집은 바뀐 파일로 표시되어 확인한 뒤 사용할 수 있습니다."],
      ],
      privacyKicker: "로컬 저장",
      privacyTitle: "내 자료는 내 Mac에 남습니다",
      privacyCopy:
        "Maple은 일반 로컬 폴더를 중심으로 동작합니다. 원본은 그대로 보관하고, 만들어진 위키 페이지는 변경 내용을 확인할 수 있으며, 필요하면 앱 밖에서도 열 수 있습니다.",
      privacyCards: [
        ["Maple 계정 없음", "계정 생성, 결제, 동기화 없이 시작합니다."],
        ["읽을 수 있는 파일 구조", "워크스페이스는 sources, wiki, index.md, log.md처럼 읽을 수 있는 폴더와 파일로 구성됩니다."],
        ["AI 변경 확인", "무엇이 바뀌었는지 보고 다음 단계로 넘어갈 수 있습니다."],
      ],
    },
    guide: {
      heroKicker: "Maple 가이드",
      heroTitle: "원본 자료와 위키 관리하기",
      heroCopy:
        "Maple은 원본 자료를 읽어 내 Mac 안에 위키를 만듭니다. 이 가이드는 워크스페이스 구조, 주요 버튼, AI가 만든 변경을 확인하는 방법을 설명합니다.",
      tocLabel: "가이드 목차",
      toc: ["워크스페이스", "원본 자료", "위키 만들기", "규칙", "탐색과 업데이트", "정리하기", "검토/되돌리기"],
      workspace: {
        kicker: "워크스페이스",
        title: "Maple 워크스페이스란?",
        copy:
          "워크스페이스는 강의, 리서치 주제, 프로젝트처럼 한 주제를 담는 로컬 폴더입니다. Maple은 원본 자료와 AI가 만든 위키를 나눠 보관하므로, 원본 파일을 건드리지 않고 위키만 계속 다듬을 수 있습니다.",
        cards: [
          ["원본 자료", "가져온 파일입니다. Maple이 읽는 근거가 됩니다."],
          ["위키 페이지", "AI가 정리해 만든 읽기용 페이지입니다. 요약, 개념, 가이드, 링크, 이미지가 들어갑니다."],
          ["규칙", "이 위키를 어떤 방식으로 쓰고 관리할지 AI에게 알려주는 지침입니다."],
          ["검토할 변경", "AI가 만든 편집은 바뀐 파일로 표시되어 확인한 뒤 사용할 수 있습니다."],
        ],
      },
      sources: {
        kicker: "원본 자료",
        title: "원본 자료는 어떤 역할인가요?",
        copy:
          "원본 자료는 Maple이 읽는 근거입니다. PDF, 슬라이드, 노트, 녹취록, 스크린샷, Markdown 파일, 논문, 저장한 웹 링크가 여기에 들어갑니다. 직접 쓰는 노트라기보다 위키가 참고하는 자료실에 가깝습니다.",
        split: [
          ["원본은 건드리지 않습니다", "Maple은 원본 자료를 수정하지 않는 파일로 다룹니다. Build wiki와 Maintain은 내용을 읽지만 PDF, 노트, 녹취록 자체를 다시 쓰지 않습니다."],
          ["새로 넣은 자료를 알려줍니다", "파일을 추가, 제거, 교체하면 아직 위키에 반영되지 않은 내용으로 표시합니다."],
        ],
        table: [
          ["자료 상태", "의미"],
          ["새 자료", "아직 위키에 반영하지 않은 파일입니다."],
          ["수정됨", "마지막 위키 생성 뒤 원본 자료가 바뀌었습니다."],
          ["삭제됨", "예전에 있던 파일이 원본 자료 폴더에서 사라졌습니다."],
          ["변경 없음", "마지막 빌드 때와 같은 상태입니다."],
        ],
      },
      build: {
        kicker: "위키 만들기",
        title: "Build wiki를 누르면 어떤 일이 일어나나요?",
        copy:
          "Build wiki는 새로 넣었거나 바뀐 원본 자료를 AI가 읽고 기존 위키에 반영하는 작업입니다. 파일별 요약을 늘어놓는 대신, 나중에 다시 찾아보기 좋은 지식 베이스를 만드는 것이 목표입니다.",
        cards: [
          ["요약", "긴 강의, 논문, 노트의 핵심을 빠르게 볼 수 있게 정리합니다."],
          ["개념 페이지", "공식, 인물, 비교, 과정처럼 여러 자료에서 반복되는 내용을 별도 페이지로 만듭니다."],
          ["가이드", "여러 자료를 묶어 학습 순서, 복습 경로, 온보딩 문서로 정리합니다."],
          ["링크와 탐색", "페이지끼리 이어주는 위키 링크, index 업데이트, 그래프 연결을 만듭니다."],
          ["이미지/자료 자산", "이해에 도움이 되는 시각 자료를 원본과 분리해 저장합니다."],
          ["작업 기록", "무슨 작업으로 무엇이 바뀌었는지 짧게 남깁니다."],
        ],
      },
      rules: {
        kicker: "규칙",
        title: "schema.md는 무엇인가요?",
        copy:
          "<code>schema.md</code>는 워크스페이스의 규칙집입니다. 어떤 페이지를 만들지, 원본 자료를 어떻게 인용할지, 링크를 어떻게 쓸지, Maintain이 무엇을 점검해야 할지 AI에게 알려줍니다.",
        calloutTitle: "대부분의 경우 직접 열지 않아도 됩니다.",
        calloutCopy:
          'Maple이 앞으로도 지켰으면 하는 방식은 앱에서 Update rules로 저장합니다. 예: "모든 가이드는 초보자도 읽기 쉽게 써줘", "공식 설명에는 항상 출처를 붙여줘".',
        split: [
          ["이번 작업에만 쓸 요청", '"이번 빌드는 시험 대비 위주로 정리해줘." 지금 작업에만 반영되고 규칙으로 저장되지는 않습니다.'],
          ["앞으로도 지킬 규칙", '"앞으로 공식에는 항상 출처를 붙여줘." 이후 작업에도 적용되도록 워크스페이스 규칙에 저장할 수 있습니다.'],
        ],
      },
      explore: {
        kicker: "탐색과 업데이트",
        title: "Explore Chat과 Update wiki는 무엇이 다른가요?",
        copy:
          "Maple은 질문하는 일과 위키를 바꾸는 일을 분리합니다. 평소 채팅은 읽기 전용으로 쓰고, 정말 남기고 싶은 내용만 의도적으로 위키에 반영합니다.",
        table: [
          ["기능", "언제 쓰나요", "무엇이 바뀌나요"],
          ["Explore Chat", "페이지를 이해하거나 질문하고 싶을 때.", "기본적으로 아무것도 바뀌지 않습니다."],
          ["Update wiki", "채팅 답변을 나중에 다시 보고 싶을 때.", "위키 페이지, 링크, 작업 기록에 들어갈 변경이 만들어집니다."],
        ],
      },
      maintain: {
        kicker: "정리하기",
        title: "Maintain에서는 무엇을 하나요?",
        copy:
          "Maintain은 한 번 만든 위키를 계속 쓰기 좋게 다듬는 영역입니다. 위키가 지저분해졌거나, 구조를 바꾸고 싶거나, 앞으로의 작성 규칙을 정하고 싶을 때 씁니다.",
        cards: [
          ["Wiki healthcheck", "끊어진 링크, 오래된 index, 약한 설명, 빠진 출처처럼 품질 문제를 찾아봅니다.", "위키가 산만하거나 믿기 어려워졌을 때."],
          ["Improve wiki", "특정 목표에 맞춰 가이드 추가, 페이지 연결, 구조 정리, 설명 개선을 요청합니다.", "어떻게 다듬고 싶은지 어느 정도 알고 있을 때."],
          ["Organize sources", "원본 내용은 바꾸지 않고 폴더와 파일 이름을 정리합니다. 예: 강의별로 슬라이드와 녹취록 묶기.", "원본 자료 폴더가 복잡해졌을 때."],
          ["Update rules", "앞으로의 작업에 계속 적용할 선호와 규칙을 저장합니다.", "Maple이 특정 작성 방식을 기억해야 할 때."],
        ],
      },
      review: {
        kicker: "검토와 되돌리기",
        title: "AI가 만든 변경은 어떻게 확인하나요?",
        copy:
          "AI가 만든 결과는 바로 확정하지 않고 먼저 확인합니다. Build wiki, Update wiki, Maintain이 끝나면 Maple이 바뀐 파일을 표시하므로 다음 단계로 넘어가기 전에 확인할 수 있습니다.",
        steps: [
          ["바뀐 파일 열기", "생성된 요약, 개념 페이지, 가이드, index 업데이트, 규칙 변경을 확인합니다."],
          ["검토 완료 표시", "변경이 괜찮아 보이면 검토 완료로 표시합니다."],
          ["마지막 작업 되돌리기", "방향이 잘못되었다면 이전 워크스페이스 상태로 되돌립니다."],
        ],
      },
    },
    download: {
      kicker: "다운로드",
      title: "macOS용 Maple을 다운로드합니다",
      status: "최신 Apple silicon용 DMG를 찾는 중입니다.",
      fallback: "GitHub 릴리스 열기",
    },
  },
};

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
}

function setHtml(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.innerHTML = value;
  });
}

function setAttr(selector, attr, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.setAttribute(attr, value);
  });
}

function setMeta(selector, value) {
  const element = document.head.querySelector(selector);
  if (element) {
    element.setAttribute("content", value);
  }
}

function applyCards(selector, items, includeNote = false) {
  document.querySelectorAll(selector).forEach((article, index) => {
    const item = items[index];
    if (!item) return;
    const [title, copy, note] = item;
    const heading = article.querySelector("h3");
    const paragraph = article.querySelector("p");
    const noteElement = article.querySelector("span");
    if (heading) heading.textContent = title;
    if (paragraph) paragraph.textContent = copy;
    if (includeNote && noteElement) noteElement.textContent = note;
  });
}

function applyTable(tableSelector, rows) {
  const table = document.querySelector(tableSelector);
  if (!table) return;
  table.querySelectorAll("tr").forEach((row, rowIndex) => {
    const cells = row.querySelectorAll("th, td");
    const values = rows[rowIndex];
    if (!values) return;
    cells.forEach((cell, cellIndex) => {
      if (values[cellIndex]) {
        cell.textContent = values[cellIndex];
      }
    });
  });
}

function applyCommon(language) {
  const copy = translations[language].common;
  document.documentElement.lang = language;
  document.body.dataset.language = language;

  setAttr(".brand", "aria-label", copy.brandLabel);
  setAttr(".site-nav", "aria-label", copy.navLabel);

  document.querySelectorAll(".site-nav a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href.includes("download-macos.html") || href.includes("/releases/download/")) {
      link.textContent = copy.nav.download;
    }
    if (href.includes("#hero-demo")) link.textContent = copy.nav.demo;
    if (href.includes("#workflow")) link.textContent = copy.nav.workflow;
    if (href.includes("guide.html")) link.textContent = copy.nav.guide;
    if (href.includes("#privacy")) link.textContent = copy.nav.privacy;
  });

  document.querySelectorAll("[data-language-toggle]").forEach((button) => {
    button.textContent = copy.toggleText;
    button.setAttribute("aria-label", copy.toggleLabel);
  });

  const meta = translations[language].meta[pageKey];
  if (meta) {
    document.title = meta.title;
    setMeta('meta[name="description"]', meta.description);
    setMeta('meta[property="og:title"]', meta.ogTitle || meta.title);
    setMeta('meta[property="og:description"]', meta.ogDescription || meta.description);
    setMeta('meta[name="twitter:title"]', meta.ogTitle || meta.title);
    setMeta('meta[name="twitter:description"]', meta.ogDescription || meta.description);
  }
}

function applyHome(language) {
  const copy = translations[language].home;
  if (!copy) return;

  setText(".hero .eyebrow", copy.heroKicker);
  setText(".hero-copy", copy.heroCopy);
  setText(".hero-actions .primary", copy.downloadCta);
  setText(".hero-actions .secondary", copy.demoCta);
  setText(".release-note", copy.releaseNote);
  setAttr(".hero-demo-video", "aria-label", copy.demoLabel);
  setText(".video-fallback", copy.videoFallback);
  setText(".launch-section .section-kicker", copy.launchKicker);
  setText("#launch-title", copy.launchTitle);
  setText(".launch-section .section-intro", copy.launchCopy);
  applyCards(".launch-grid article", copy.launchCards);
  setText(".workflow-section .section-kicker", copy.workflowKicker);
  setText("#workflow-title", copy.workflowTitle);
  setHtml(".workflow-section .section-intro", copy.workflowIntro);
  applyCards(".workflow-grid article", copy.workflowCards);
  setText(".guide-section .section-kicker", copy.guideKicker);
  setText("#guide-title", copy.guideTitle);
  setText(".guide-section > .section-heading .section-intro", copy.guideIntro);
  setText(".guide-primer h3", copy.primerTitle);
  setText(".guide-primer > div > p", copy.primerCopy);
  setText(".guide-cta", copy.primerCta);
  document.querySelectorAll(".guide-primer ol li").forEach((item, index) => {
    const translation = copy.primerItems[index];
    if (!translation) return;
    item.querySelector("strong").textContent = translation[0];
    item.querySelector("p").textContent = translation[1];
  });
  setText(".privacy-copy .section-kicker", copy.privacyKicker);
  setText("#privacy-title", copy.privacyTitle);
  setText(".privacy-copy p:not(.section-kicker)", copy.privacyCopy);
  applyCards(".principles article", copy.privacyCards);
}

function setGuideSection(sectionId, copy, useHtml = false) {
  setText(`#${sectionId} .section-kicker`, copy.kicker);
  setText(`#${sectionId} h2`, copy.title);
  if (useHtml) {
    setHtml(`#${sectionId} > p:not(.section-kicker)`, copy.copy);
  } else {
    setText(`#${sectionId} > p:not(.section-kicker)`, copy.copy);
  }
}

function applyGuide(language) {
  const copy = translations[language].guide;
  if (!copy) return;

  setText(".guide-doc-hero .section-kicker", copy.heroKicker);
  setText("#guide-doc-title", copy.heroTitle);
  setText(".guide-doc-hero p:not(.section-kicker)", copy.heroCopy);
  setAttr(".guide-doc-toc", "aria-label", copy.tocLabel);
  document.querySelectorAll(".guide-doc-toc a").forEach((link, index) => {
    if (copy.toc[index]) link.textContent = copy.toc[index];
  });

  setGuideSection("workspace", copy.workspace);
  applyCards("#workspace .guide-layer-grid article", copy.workspace.cards);

  setGuideSection("sources", copy.sources);
  document.querySelectorAll("#sources .guide-split > div").forEach((panel, index) => {
    const translation = copy.sources.split[index];
    if (!translation) return;
    panel.querySelector("h3").textContent = translation[0];
    panel.querySelector("p").textContent = translation[1];
  });
  applyTable("#sources .guide-table", copy.sources.table);

  setGuideSection("build-wiki", copy.build);
  applyCards("#build-wiki .guide-created-grid article", copy.build.cards);

  setGuideSection("rules", copy.rules, true);
  setText("#rules .guide-callout strong", copy.rules.calloutTitle);
  setText("#rules .guide-callout p", copy.rules.calloutCopy);
  document.querySelectorAll("#rules .guide-split > div").forEach((panel, index) => {
    const translation = copy.rules.split[index];
    if (!translation) return;
    panel.querySelector("h3").textContent = translation[0];
    panel.querySelector("p").textContent = translation[1];
  });

  setGuideSection("explore-update", copy.explore);
  applyTable("#explore-update .guide-table", copy.explore.table);

  setGuideSection("maintain", copy.maintain);
  applyCards("#maintain .maintain-guide-grid article", copy.maintain.cards, true);

  setGuideSection("review-undo", copy.review);
  document.querySelectorAll(".guide-step-list li").forEach((step, index) => {
    const translation = copy.review.steps[index];
    if (!translation) return;
    step.querySelector("h3").textContent = translation[0];
    step.querySelector("p").textContent = translation[1];
  });
}

function applyDownload(language) {
  const copy = translations[language].download;
  if (!copy) return;

  setText(".download-redirect .section-kicker", copy.kicker);
  setText("#download-title", copy.title);
  setText("#download-status", copy.status);
  setText("#download-fallback", copy.fallback);
}

function applyLanguage(language) {
  applyCommon(language);
  applyHome(language);
  applyGuide(language);
  applyDownload(language);
  window.dispatchEvent(new CustomEvent("maple-language-change", { detail: { language } }));
}

function readInitialLanguage() {
  const params = new URLSearchParams(window.location.search);
  const queryLanguage = params.get("lang");
  if (supportedLanguages.has(queryLanguage)) {
    localStorage.setItem(languageStorageKey, queryLanguage);
    return queryLanguage;
  }

  const storedLanguage = localStorage.getItem(languageStorageKey);
  if (supportedLanguages.has(storedLanguage)) {
    return storedLanguage;
  }

  return "en";
}

function updateLanguageUrl(language) {
  const url = new URL(window.location.href);
  if (language === "ko") {
    url.searchParams.set("lang", "ko");
  } else {
    url.searchParams.delete("lang");
  }
  window.history.replaceState({}, "", url);
}

let currentLanguage = readInitialLanguage();
applyLanguage(currentLanguage);

document.querySelectorAll("[data-language-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    currentLanguage = currentLanguage === "ko" ? "en" : "ko";
    localStorage.setItem(languageStorageKey, currentLanguage);
    updateLanguageUrl(currentLanguage);
    applyLanguage(currentLanguage);
  });
});
