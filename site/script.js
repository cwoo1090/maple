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
          "Maple turns PDFs, Office files, notes, data, links, and images into a local AI-maintained wiki using your own ChatGPT or Claude subscription.",
        ogTitle: "Maple - Local AI wiki builder",
        ogDescription:
          "Build a local AI wiki from your sources using your own ChatGPT or Claude subscription.",
      },
      guide: {
        title: "Maple Guide - Sources, Ask Wiki, and Maintain",
        description:
          "Learn Maple's workspace model: AI connection, source preparation, Build wiki, Ask Wiki, Apply to wiki, Maintain, review, and undo.",
        ogTitle: "Maple Guide - Sources, Ask Wiki, and Maintain",
        ogDescription:
          "Learn Maple's local workspace model and how source prep, Build wiki, Ask Wiki, Maintain, review, and undo work.",
      },
      download: {
        title: "Downloading Maple for macOS",
        description:
          "Download Maple for Apple silicon Macs and build local AI wikis with your own ChatGPT or Claude subscription.",
      },
    },
    home: {
      heroKicker: "Local AI wiki builder",
      heroCopy:
        "Turn PDFs, slides, documents, notes, data, links, and images into a local wiki that you can review, ask, and maintain on your Mac.",
      downloadCta: "Download for macOS",
      demoCta: "Watch the demo",
      releaseNote:
        "For Apple silicon Macs. Requires macOS 12 or newer and your own ChatGPT or Claude subscription.",
      heroImageAlt:
        "Maple desktop workspace showing a source tree, generated wiki page, and Ask Wiki.",
      demoKicker: "51-second demo",
      demoTitle: "Watch Maple turn source material into a wiki",
      demoCopy:
        "The launch demo shows the core flow: create a workspace, import sources, build with AI, review generated pages, ask the wiki questions, apply useful answers, and maintain the wiki over time.",
      demoLabel: "Maple launch demo video",
      videoFallback: "Your browser does not support the video tag.",
      launchKicker: "Bring your own AI",
      launchTitle: "Use the AI subscription you already have",
      launchCopy:
        "Maple does not sell AI credits or require a Maple account. It connects on this Mac to your signed-in ChatGPT or Claude subscription.",
      launchCards: [
        [
          "Mac-first MVP",
          "Apple silicon Mac and macOS 12 or newer. Maple guides any one-time connection setup it needs.",
        ],
        [
          "Your AI account",
          "Build, ask, apply, and maintain through your own ChatGPT or Claude subscription.",
        ],
        [
          "Local workspaces",
          "Sources, wiki pages, review state, and generated artifacts stay in ordinary folders on your Mac.",
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
          "Add PDFs, Office files, Markdown, text, JSON, CSV, HTML, links, or images.",
        ],
        [
          "Build wiki",
          "Maple prepares readable artifacts when needed, then asks AI to compile summaries, concepts, and guides.",
        ],
        [
          "Review changes",
          "Open generated files, inspect the result, then choose Done reviewing or Undo last operation.",
        ],
        [
          "Ask Wiki and apply",
          "Ask about the wiki or selected source, then turn useful answers into reviewable wiki edits.",
        ],
        [
          "Maintain",
          "Run healthchecks, improve structure, organize sources, and update durable workspace rules.",
        ],
      ],
      guideKicker: "Beginner guide",
      guideTitle: "What Maple means by an AI wiki",
      guideIntro:
        "Maple is not a blank Markdown editor or a one-off document chat. It keeps your original material untouched, prepares readable copies when needed, then asks AI to compile that material into a local, linked wiki you can review, ask, and improve over time.",
      primerTitle: "Think of it as a study notebook that keeps getting organized.",
      primerCopy:
        "In a normal chat, the useful explanation disappears into the conversation. In Maple, useful explanations can become pages, links, guides, and reviewable updates inside a workspace that stays on your Mac.",
      primerCta: "Read the full guide",
      primerItems: [
        [
          "Sources are the reference shelf.",
          "PDFs, Office files, notes, data, links, screenshots, and papers stay as original evidence.",
        ],
        [
          "The wiki is the working layer.",
          "AI drafts summaries, concepts, guides, links, images, and navigation from those sources.",
        ],
        [
          "Ask and apply stay separate.",
          "Ask Wiki is read-only by default. Apply to wiki creates reviewable edits only when you choose it.",
        ],
      ],
      privacyKicker: "Local first",
      privacyTitle: "Your archive stays inspectable",
      privacyCopy:
        "Maple is built around plain local folders: sources stay immutable, prepared artifacts live under .aiwiki, generated wiki pages are reviewable, and the workspace can be opened outside the app when you need it.",
      privacyCards: [
        ["No Maple account", "The MVP does not add app accounts, payments, or sync."],
        [
          "Local file storage",
          "Workspaces use readable folders like sources, wiki, index.md, log.md, schema.md, and AGENTS.md.",
        ],
        [
          "Review and undo",
          "Generated edits are tracked so you can inspect or undo the last AI operation.",
        ],
      ],
    },
    guide: {
      heroKicker: "Maple guide",
      heroTitle: "Sources, Ask Wiki, and Maintain",
      heroCopy:
        "Maple turns local source material into a local wiki. This guide explains the current app words: AI connection, source preparation, Build wiki, Ask Wiki, Apply to wiki, Maintain, review, and undo.",
      tocLabel: "Guide contents",
      toc: [
        "Workspace",
        "AI connection",
        "Sources",
        "Source preparation",
        "Build wiki",
        "Ask Wiki and Apply",
        "Maintain",
        "Rules",
        "Review and undo",
        "Maple Guide",
      ],
      workspace: {
        kicker: "Workspace",
        title: "What is a Maple workspace?",
        copy:
          "A workspace is one local folder for one subject: a course, research topic, project, archive, or skill path. Maple keeps raw material, generated wiki pages, review state, and AI instructions in predictable local files.",
        cards: [
          ["Sources", "The original files you import. They are the evidence Maple reads from."],
          [
            "Wiki pages",
            "The readable layer Maple drafts: summaries, concepts, guides, links, and assets.",
          ],
          [
            "Workspace rules",
            "schema.md and AGENTS.md tell AI how this wiki should be written and maintained.",
          ],
          [
            ".aiwiki metadata",
            "Snapshots, reports, chat records, review state, and prepared source artifacts live here.",
          ],
        ],
      },
      ai: {
        kicker: "AI connection",
        title: "How does Maple use AI?",
        copy:
          "Maple uses the AI subscription you already have. The app can guide setup for ChatGPT or Claude, check sign-in, and reuse that connection for Build wiki, Ask Wiki, Maintain, and Maple Guide.",
        cards: [
          [
            "No Maple billing",
            "The MVP does not add Maple accounts, API-key billing, AI credits, or sync.",
          ],
          [
            "Connection card",
            "If AI is not ready, Maple shows Connect AI, sign-in, install, or recheck actions.",
          ],
          [
            "Settings",
            "Use Settings to switch app language, AI account, model, reasoning effort, or reading text size.",
          ],
          [
            "Skip for now",
            "You can import and browse files without AI. Build, ask, apply, and maintain need AI later.",
          ],
        ],
      },
      sources: {
        kicker: "Sources",
        title: "What are sources?",
        copy:
          "Sources are the original material you want Maple to learn from. They can be PDFs, PowerPoint, Word, Excel, Markdown, text, JSON, JSONL, CSV, TSV, HTML, images, notes, transcripts, papers, or saved web pages.",
        split: [
          [
            "Sources should stay original",
            "Maple treats source contents as immutable. It may read sources or create prepared artifacts, but it should not rewrite what the source originally said.",
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
      sourcePrep: {
        kicker: "Source preparation",
        title: "What does source preparation mean?",
        copy:
          "Maple prepares readable artifacts before AI reads some files. The original source remains unchanged; extracted Markdown, page images, manifests, cache records, and readiness state are stored under .aiwiki.",
        split: [
          [
            "Readable artifacts",
            "PDFs and DOCX files can be converted to Markdown or page images. Office previews can be rendered through LibreOffice when available.",
          ],
          [
            "Build choices",
            "For PDFs, Maple may show a Reading mode: Mostly text, Text with diagrams, or Mostly visual.",
          ],
        ],
        table: [
          ["Readiness", "What it means"],
          ["Ready", "Maple has a readable source or prepared artifact."],
          ["Preparing", "Maple is converting the source before AI can use it."],
          ["Needs prep", "The prepared artifact is missing, stale, or not created yet."],
          ["Failed", "Preparation failed. For Office files, check LibreOffice or the visible row error."],
        ],
      },
      build: {
        kicker: "Build wiki",
        title: "What does Build wiki do?",
        copy:
          "Build wiki asks AI to read pending source changes and integrate them into the existing wiki. Maple may prepare sources first, then produces reviewable changes instead of silently treating AI output as final.",
        cards: [
          ["Context prompt", "Tell Maple what the wiki is for: class, audience, detail level, outputs, and rules."],
          [
            "Source readiness",
            "If sources are still preparing, use Build when ready or build only the ready sources.",
          ],
          [
            "Generated pages",
            "AI drafts summaries, concept pages, guides, links, assets, index updates, and log entries.",
          ],
          [
            "Layered builds",
            "Start with a small related batch, review the structure, then add more sources.",
          ],
          [
            "Existing wiki",
            "If a workspace already has a wiki, Maple can keep it as the baseline instead of rewriting everything.",
          ],
          [
            "Operation report",
            "Maple records what ran and shows changed files for review after the build.",
          ],
        ],
      },
      explore: {
        kicker: "Ask Wiki and Apply",
        title: "Ask Wiki is different from Apply to wiki",
        copy:
          "Maple separates asking questions from changing the wiki. Ask Wiki is for learning from the current wiki or selected source. Apply to wiki is the deliberate step that turns useful answers into reviewable edits.",
        table: [
          ["Action", "Use it when", "What changes"],
          [
            "Ask Wiki",
            "You want to ask about the wiki, a selected source, or the current page.",
            "Nothing by default. It is read-only.",
          ],
          [
            "Apply to wiki",
            "A completed Ask Wiki answer is worth keeping for later.",
            "Maple drafts reviewable edits to wiki pages, navigation, or logs.",
          ],
          [
            "Web search",
            "Current or external context is needed and the selected provider supports search.",
            "The answer may cite web-derived claims, but the local workspace remains the main source.",
          ],
        ],
      },
      maintain: {
        kicker: "Maintain",
        title: "What are the Maintain functions?",
        copy:
          "Maintain is where you improve an existing workspace after the first build. Use it when the wiki needs cleanup, restructuring, better rules, source organization, or a source-grounded improvement pass.",
        cards: [
          [
            "Wiki healthcheck",
            "A conservative check for broken links, stale index entries, weak pages, missing citations, and similar quality issues.",
            "Use when the wiki feels messy or stale.",
          ],
          [
            "Improve wiki",
            "A user-directed improvement pass for creating guides, connecting pages, reshaping structure, or improving explanations. It can re-read selected sources when source grounding is on.",
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
      rules: {
        kicker: "Rules",
        title: "What are schema.md and AGENTS.md?",
        copy:
          "<code>schema.md</code> is the local rulebook for a workspace. <code>AGENTS.md</code> carries workspace instructions for AI agents. Together they tell AI what page types to use, how to cite sources, how links should work, and what Maintain should check.",
        calloutTitle: "You usually do not need to edit these files directly.",
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
      review: {
        kicker: "Review and undo",
        title: "How do reviewable changes work?",
        copy:
          "AI output is treated as a draft. After Build wiki, Apply to wiki, or a Maintain operation, Maple marks generated files so you can inspect what changed before moving on.",
        steps: [
          [
            "Open changed files",
            "Review the generated summaries, concepts, guides, index updates, or rule changes.",
          ],
          [
            "Finish review",
            "Click Done reviewing when the changed files look useful enough to keep.",
          ],
          [
            "Undo last operation",
            "If the operation went in the wrong direction, restore the previous workspace state.",
          ],
        ],
      },
      mapleGuide: {
        kicker: "Maple Guide",
        title: "What is Maple Guide?",
        copy:
          "Maple Guide is the lower-left help chat for using the app. It explains buttons, panels, connection setup, review, undo, imports, Build wiki, Ask Wiki, and Maintain. It is different from Ask Wiki.",
        cards: [
          ["Maple Guide", "Use it for app usage help: what to click, what a status means, or what to do first."],
          ["Ask Wiki", "Use it for your study content, source files, generated pages, and selected document."],
          ["Needs AI", "Maple Guide uses the same connected AI account, so it may ask you to connect ChatGPT or Claude first."],
          ["Read-only help", "Maple Guide cannot directly import files, edit the wiki, run builds, or sign in for you."],
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
          "Maple은 PDF, Office 파일, 노트, 데이터, 링크, 이미지를 내 Mac 안의 AI 위키로 정리해주는 앱입니다. 사용 중인 ChatGPT나 Claude 구독을 그대로 사용합니다.",
        ogTitle: "Maple - 로컬 AI 위키 빌더",
        ogDescription:
          "사용 중인 ChatGPT나 Claude로 내 자료를 로컬 AI 위키로 정리하세요.",
      },
      guide: {
        title: "Maple 가이드 - 소스, Ask Wiki, Maintain",
        description:
          "Maple의 AI 연결, 소스 준비, Build wiki, Ask Wiki, Apply to wiki, Maintain, 검토와 되돌리기가 어떻게 작동하는지 설명합니다.",
        ogTitle: "Maple 가이드 - 소스, Ask Wiki, Maintain",
        ogDescription:
          "원본 자료는 보관하고, AI가 만든 위키는 확인하며, Ask Wiki와 Maintain으로 계속 다듬어가는 Maple의 기본 흐름을 설명합니다.",
      },
      download: {
        title: "macOS용 Maple 다운로드",
        description:
          "Apple silicon Mac용 Maple을 다운로드해 사용 중인 ChatGPT나 Claude 구독으로 로컬 AI 위키를 만들 수 있습니다.",
      },
    },
    home: {
      heroKicker: "내 Mac에 만드는 AI 위키",
      heroCopy:
        "PDF, 슬라이드, 문서, 노트, 데이터, 링크, 이미지를 넣으면 AI가 로컬 위키로 정리합니다. 원본은 건드리지 않고, 만든 페이지는 직접 확인하며 다듬을 수 있습니다.",
      downloadCta: "macOS용 다운로드",
      demoCta: "데모 보기",
      releaseNote:
        "Apple silicon Mac용입니다. macOS 12 이상과 ChatGPT 또는 Claude 구독이 필요합니다.",
      heroImageAlt:
        "원본 자료 목록, 생성된 위키 페이지, Ask Wiki가 함께 보이는 Maple 데스크톱 화면.",
      demoKicker: "51초 데모",
      demoTitle: "자료가 위키로 정리되는 과정을 보세요",
      demoCopy:
        "워크스페이스를 만들고, 자료를 넣고, AI로 위키를 만든 뒤 생성된 페이지를 확인하고 Ask Wiki, Apply to wiki, Maintain으로 이어가는 흐름을 담았습니다.",
      demoLabel: "Maple 데모 영상",
      videoFallback: "이 브라우저는 비디오 태그를 지원하지 않습니다.",
      launchKicker: "ChatGPT 또는 Claude",
      launchTitle: "이미 쓰는 구독으로 시작하세요",
      launchCopy:
        "Maple은 AI 크레딧을 따로 팔지 않고 Maple 계정도 요구하지 않습니다. 이 Mac에서 로그인한 ChatGPT나 Claude 구독에 연결해 위키 작업을 실행합니다.",
      launchCards: [
        ["Mac 우선 MVP", "Apple silicon Mac과 macOS 12 이상이 필요합니다. 필요한 1회 연결 설정은 Maple이 안내합니다."],
        [
          "내 AI 계정 그대로",
          "이미 결제 중인 ChatGPT나 Claude 구독으로 Build, Ask, Apply, Maintain을 실행합니다.",
        ],
        [
          "파일은 내 Mac에",
          "원본 자료, 위키 페이지, 검토 상태, 생성된 준비 파일은 Mac의 일반 폴더에 저장됩니다.",
        ],
      ],
      workflowKicker: "기본 흐름",
      workflowTitle: "흩어진 자료를 다시 찾기 쉬운 위키로",
      workflowIntro:
        '<a href="https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f" target="_blank" rel="noreferrer">Andrej Karpathy의 LLM Wiki</a>에서 아이디어를 얻었습니다. 원본 자료는 따로 보관하고, AI가 정리한 위키를 학습과 리서치에 쓰는 방식입니다.',
      workflowCards: [
        ["워크스페이스 만들기", "강의, 리서치 주제, 프로젝트처럼 하나의 주제로 시작합니다."],
        ["자료 가져오기", "PDF, Office 파일, Markdown, 텍스트, JSON, CSV, HTML, 링크, 이미지를 넣습니다."],
        ["AI로 위키 만들기", "필요한 자료를 읽을 수 있게 준비한 뒤 AI가 요약, 개념 페이지, 가이드를 만듭니다."],
        ["변경 검토하기", "생성된 파일을 열어 확인하고, 괜찮으면 검토 완료, 아니면 마지막 작업을 되돌립니다."],
        ["Ask Wiki와 적용", "위키나 선택한 소스에 질문하고, 좋은 답변은 검토 가능한 변경으로 적용합니다."],
        ["계속 정리하기", "품질 점검, 구조 개선, 소스 정리, 장기 규칙 업데이트를 실행합니다."],
      ],
      guideKicker: "처음 쓰는 분을 위한 안내",
      guideTitle: "Maple의 AI 위키는 무엇이 다른가요?",
      guideIntro:
        "Maple은 빈 Markdown 편집기도, 문서 하나에 질문만 하는 챗봇도 아닙니다. 원본 자료는 그대로 보관하고, 필요한 읽기용 파일을 만든 뒤, AI가 정리한 로컬 위키를 사용자가 확인하고 질문하며 키워가는 앱입니다.",
      primerTitle: "좋은 답변을 대화창에 묻어두지 않습니다.",
      primerCopy:
        "채팅으로 얻은 설명은 금방 흘러갑니다. Maple에서는 쓸 만한 설명을 페이지, 링크, 가이드, 검토할 변경으로 남길 수 있습니다.",
      primerCta: "전체 가이드 읽기",
      primerItems: [
        ["원본은 그대로 둡니다.", "PDF, Office 파일, 노트, 데이터, 링크, 스크린샷, 논문은 근거 자료로 남습니다."],
        ["위키는 AI가 정리합니다.", "요약, 개념, 가이드, 링크, 이미지, 탐색 구조를 먼저 만들고 사용자가 확인합니다."],
        ["질문과 적용을 나눕니다.", "Ask Wiki는 기본적으로 읽기 전용이고, Apply to wiki를 눌렀을 때만 검토할 변경을 만듭니다."],
      ],
      privacyKicker: "로컬 저장",
      privacyTitle: "내 자료는 내 Mac에 남습니다",
      privacyCopy:
        "Maple은 일반 로컬 폴더를 중심으로 동작합니다. 원본은 그대로 보관하고, 준비된 읽기 파일은 .aiwiki 아래에 만들며, 생성된 위키 페이지는 변경 내용을 확인한 뒤 사용할 수 있습니다.",
      privacyCards: [
        ["Maple 계정 없음", "계정 생성, 결제, 동기화 없이 시작합니다."],
        ["읽을 수 있는 파일 구조", "워크스페이스는 sources, wiki, index.md, log.md, schema.md, AGENTS.md처럼 읽을 수 있는 파일로 구성됩니다."],
        ["검토와 되돌리기", "무엇이 바뀌었는지 확인하고, 필요하면 마지막 AI 작업을 되돌릴 수 있습니다."],
      ],
    },
    guide: {
      heroKicker: "Maple 가이드",
      heroTitle: "소스, Ask Wiki, Maintain",
      heroCopy:
        "Maple은 로컬 소스를 읽어 내 Mac 안에 위키를 만듭니다. 이 가이드는 AI 연결, 소스 준비, Build wiki, Ask Wiki, Apply to wiki, Maintain, 검토, 되돌리기를 설명합니다.",
      tocLabel: "가이드 목차",
      toc: ["워크스페이스", "AI 연결", "소스", "소스 준비", "위키 만들기", "Ask Wiki와 적용", "Maintain", "규칙", "검토/되돌리기", "Maple 가이드"],
      workspace: {
        kicker: "워크스페이스",
        title: "Maple 워크스페이스란?",
        copy:
          "워크스페이스는 강의, 리서치 주제, 프로젝트처럼 한 주제를 담는 로컬 폴더입니다. Maple은 원본 자료, 생성된 위키 페이지, 검토 상태, AI 지침을 예측 가능한 로컬 파일로 보관합니다.",
        cards: [
          ["소스", "가져온 원본 파일입니다. Maple이 읽는 근거가 됩니다."],
          ["위키 페이지", "AI가 정리해 만든 읽기용 페이지입니다. 요약, 개념, 가이드, 링크, 이미지가 들어갑니다."],
          ["워크스페이스 규칙", "schema.md와 AGENTS.md가 이 위키의 작성과 관리 방식을 AI에게 알려줍니다."],
          [".aiwiki 메타데이터", "스냅샷, 리포트, 채팅 기록, 검토 상태, 준비된 소스 파일이 저장됩니다."],
        ],
      },
      ai: {
        kicker: "AI 연결",
        title: "Maple은 AI를 어떻게 사용하나요?",
        copy:
          "Maple은 이미 사용 중인 AI 구독을 사용합니다. 앱 안에서 ChatGPT 또는 Claude 연결을 안내하고, 로그인 상태를 확인한 뒤 Build wiki, Ask Wiki, Maintain, Maple Guide에 같은 연결을 사용합니다.",
        cards: [
          ["Maple 과금 없음", "MVP에서는 Maple 계정, API 키 과금, AI 크레딧, 동기화를 추가하지 않습니다."],
          ["연결 카드", "AI가 준비되지 않으면 Connect AI, 로그인, 설치, 다시 확인 같은 작업을 보여줍니다."],
          ["Settings", "앱 언어, AI 계정, 모델, 추론 강도, 읽기 글자 크기를 바꿀 때 사용합니다."],
          ["나중에 연결", "AI 없이도 소스를 가져오고 볼 수 있습니다. Build, Ask, Apply, Maintain은 나중에 AI 연결이 필요합니다."],
        ],
      },
      sources: {
        kicker: "소스",
        title: "소스는 어떤 역할인가요?",
        copy:
          "소스는 Maple이 읽는 원본 근거입니다. PDF, PowerPoint, Word, Excel, Markdown, 텍스트, JSON, JSONL, CSV, TSV, HTML, 이미지, 노트, 녹취록, 논문, 저장한 웹 페이지가 들어갈 수 있습니다.",
        split: [
          ["원본은 건드리지 않습니다", "Maple은 소스 내용을 원본으로 다룹니다. 읽거나 준비 파일을 만들 수는 있지만 소스 자체를 다시 쓰지 않아야 합니다."],
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
      sourcePrep: {
        kicker: "소스 준비",
        title: "소스 준비는 무엇인가요?",
        copy:
          "일부 파일은 AI가 읽기 전에 읽기용 산출물로 준비됩니다. 원본 소스는 바뀌지 않고, 추출한 Markdown, 페이지 이미지, 매니페스트, 캐시, 준비 상태는 .aiwiki 아래에 저장됩니다.",
        split: [
          ["읽기용 산출물", "PDF와 DOCX는 Markdown이나 페이지 이미지로 준비될 수 있습니다. Office 미리보기는 LibreOffice가 있을 때 렌더링할 수 있습니다."],
          ["빌드 선택", "PDF에는 Mostly text, Text with diagrams, Mostly visual 같은 Reading mode가 보일 수 있습니다."],
        ],
        table: [
          ["준비 상태", "의미"],
          ["Ready", "Maple이 읽을 수 있는 소스나 준비 파일을 가지고 있습니다."],
          ["Preparing", "AI가 쓰기 전에 소스를 변환하는 중입니다."],
          ["Needs prep", "준비 파일이 없거나 오래되었거나 아직 생성되지 않았습니다."],
          ["Failed", "준비에 실패했습니다. Office 파일이라면 LibreOffice나 표시된 오류를 확인하세요."],
        ],
      },
      build: {
        kicker: "위키 만들기",
        title: "Build wiki를 누르면 어떤 일이 일어나나요?",
        copy:
          "Build wiki는 새로 넣었거나 바뀐 소스를 AI가 읽고 기존 위키에 반영하는 작업입니다. 필요한 경우 먼저 소스를 준비하고, AI 결과를 바로 확정하지 않고 검토 가능한 변경으로 보여줍니다.",
        cards: [
          ["목적 설명", "수업, 대상 독자, 자세한 정도, 원하는 결과물, 특별한 규칙을 알려주면 좋습니다."],
          ["소스 준비 상태", "아직 준비 중인 소스가 있으면 Build when ready나 준비된 소스만 빌드를 사용할 수 있습니다."],
          ["생성되는 페이지", "요약, 개념 페이지, 가이드, 링크, 이미지, index 업데이트, log 항목을 만듭니다."],
          ["나눠서 빌드", "처음에는 관련된 작은 묶음으로 시작하고, 구조를 확인한 뒤 다음 소스를 추가하는 편이 좋습니다."],
          ["기존 위키", "이미 위키가 있는 워크스페이스라면 전체를 다시 쓰지 않고 현재 위키를 기준선으로 유지할 수 있습니다."],
          ["작업 리포트", "실행 내용과 변경 파일을 기록하고 빌드 후 검토할 수 있게 보여줍니다."],
        ],
      },
      explore: {
        kicker: "Ask Wiki와 적용",
        title: "Ask Wiki와 Apply to wiki는 무엇이 다른가요?",
        copy:
          "Maple은 질문하는 일과 위키를 바꾸는 일을 분리합니다. Ask Wiki는 현재 위키나 선택한 소스에 대해 배우는 곳이고, Apply to wiki는 좋은 답변을 검토 가능한 편집으로 바꾸는 의도적인 단계입니다.",
        table: [
          ["기능", "언제 쓰나요", "무엇이 바뀌나요"],
          ["Ask Wiki", "위키, 선택한 소스, 현재 페이지에 대해 질문하고 싶을 때.", "기본적으로 아무것도 바뀌지 않습니다."],
          ["Apply to wiki", "완료된 Ask Wiki 답변을 나중에 다시 보고 싶을 때.", "위키 페이지, 링크, 작업 기록에 들어갈 검토 가능한 변경이 만들어집니다."],
          ["웹 검색", "현재 정보나 외부 맥락이 필요하고 선택한 AI가 검색을 지원할 때.", "웹 근거는 표시될 수 있지만 로컬 워크스페이스가 중심입니다."],
        ],
      },
      maintain: {
        kicker: "Maintain",
        title: "Maintain에서는 무엇을 하나요?",
        copy:
          "Maintain은 한 번 만든 위키를 계속 쓰기 좋게 다듬는 영역입니다. 정리, 구조 변경, 규칙 저장, 소스 정리, 소스 근거 기반 개선이 필요할 때 씁니다.",
        cards: [
          ["Wiki healthcheck", "끊어진 링크, 오래된 index, 약한 설명, 빠진 출처처럼 품질 문제를 찾아봅니다.", "위키가 산만하거나 믿기 어려워졌을 때."],
          ["Improve wiki", "특정 목표에 맞춰 가이드 추가, 페이지 연결, 구조 정리, 설명 개선을 요청합니다. 소스 근거를 켜면 선택한 소스를 다시 읽을 수 있습니다.", "어떻게 다듬고 싶은지 어느 정도 알고 있을 때."],
          ["Organize sources", "원본 내용은 바꾸지 않고 폴더와 파일 이름을 정리합니다. 예: 강의별로 슬라이드와 녹취록 묶기.", "원본 자료 폴더가 복잡해졌을 때."],
          ["Update rules", "앞으로의 작업에 계속 적용할 선호와 규칙을 저장합니다.", "Maple이 특정 작성 방식을 기억해야 할 때."],
        ],
      },
      rules: {
        kicker: "규칙",
        title: "schema.md와 AGENTS.md는 무엇인가요?",
        copy:
          "<code>schema.md</code>는 워크스페이스의 규칙집이고, <code>AGENTS.md</code>는 AI 에이전트가 따를 작업 지침입니다. 어떤 페이지를 만들지, 소스를 어떻게 인용할지, 링크를 어떻게 쓸지, Maintain이 무엇을 점검할지 알려줍니다.",
        calloutTitle: "대부분의 경우 직접 열지 않아도 됩니다.",
        calloutCopy:
          'Maple이 앞으로도 지켰으면 하는 방식은 앱에서 Update rules로 저장합니다. 예: "모든 가이드는 초보자도 읽기 쉽게 써줘", "공식 설명에는 항상 출처를 붙여줘".',
        split: [
          ["이번 작업에만 쓸 요청", '"이번 빌드는 시험 대비 위주로 정리해줘." 지금 작업에만 반영되고 규칙으로 저장되지는 않습니다.'],
          ["앞으로도 지킬 규칙", '"앞으로 공식에는 항상 출처를 붙여줘." 이후 작업에도 적용되도록 워크스페이스 규칙에 저장할 수 있습니다.'],
        ],
      },
      review: {
        kicker: "검토와 되돌리기",
        title: "AI가 만든 변경은 어떻게 확인하나요?",
        copy:
          "AI가 만든 결과는 바로 확정하지 않고 먼저 확인합니다. Build wiki, Apply to wiki, Maintain이 끝나면 Maple이 바뀐 파일을 표시하므로 다음 단계로 넘어가기 전에 확인할 수 있습니다.",
        steps: [
          ["바뀐 파일 열기", "생성된 요약, 개념 페이지, 가이드, index 업데이트, 규칙 변경을 확인합니다."],
          ["검토 완료 표시", "변경이 괜찮아 보이면 Done reviewing을 눌러 검토 완료로 표시합니다."],
          ["마지막 작업 되돌리기", "방향이 잘못되었다면 이전 워크스페이스 상태로 되돌립니다."],
        ],
      },
      mapleGuide: {
        kicker: "Maple 가이드",
        title: "Maple Guide는 무엇인가요?",
        copy:
          "Maple Guide는 앱 사용법을 묻는 왼쪽 아래 도움말 채팅입니다. 버튼, 패널, 연결 설정, 검토, 되돌리기, 가져오기, Build wiki, Ask Wiki, Maintain을 설명합니다. Ask Wiki와는 역할이 다릅니다.",
        cards: [
          ["Maple Guide", "무엇을 눌러야 하는지, 상태가 무슨 뜻인지, 처음에 무엇을 해야 하는지 물어볼 때 씁니다."],
          ["Ask Wiki", "내 학습 내용, 소스 파일, 생성된 페이지, 선택한 문서에 대해 질문할 때 씁니다."],
          ["AI 연결 필요", "Maple Guide도 같은 AI 연결을 쓰므로 ChatGPT나 Claude 연결을 먼저 요청할 수 있습니다."],
          ["읽기 전용 도움말", "Maple Guide가 직접 파일을 가져오거나 위키를 편집하거나 빌드를 실행하거나 로그인해주지는 않습니다."],
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

  setGuideSection("ai-connection", copy.ai);
  applyCards("#ai-connection .guide-layer-grid article", copy.ai.cards);

  setGuideSection("sources", copy.sources);
  document.querySelectorAll("#sources .guide-split > div").forEach((panel, index) => {
    const translation = copy.sources.split[index];
    if (!translation) return;
    panel.querySelector("h3").textContent = translation[0];
    panel.querySelector("p").textContent = translation[1];
  });
  applyTable("#sources .guide-table", copy.sources.table);

  setGuideSection("source-preparation", copy.sourcePrep);
  document.querySelectorAll("#source-preparation .guide-split > div").forEach((panel, index) => {
    const translation = copy.sourcePrep.split[index];
    if (!translation) return;
    panel.querySelector("h3").textContent = translation[0];
    panel.querySelector("p").textContent = translation[1];
  });
  applyTable("#source-preparation .guide-table", copy.sourcePrep.table);

  setGuideSection("build-wiki", copy.build);
  applyCards("#build-wiki .guide-created-grid article", copy.build.cards);

  setGuideSection("ask-apply", copy.explore);
  applyTable("#ask-apply .guide-table", copy.explore.table);

  setGuideSection("maintain", copy.maintain);
  applyCards("#maintain .maintain-guide-grid article", copy.maintain.cards, true);

  setGuideSection("rules", copy.rules, true);
  setText("#rules .guide-callout strong", copy.rules.calloutTitle);
  setText("#rules .guide-callout p", copy.rules.calloutCopy);
  document.querySelectorAll("#rules .guide-split > div").forEach((panel, index) => {
    const translation = copy.rules.split[index];
    if (!translation) return;
    panel.querySelector("h3").textContent = translation[0];
    panel.querySelector("p").textContent = translation[1];
  });

  setGuideSection("review-undo", copy.review);
  document.querySelectorAll(".guide-step-list li").forEach((step, index) => {
    const translation = copy.review.steps[index];
    if (!translation) return;
    step.querySelector("h3").textContent = translation[0];
    step.querySelector("p").textContent = translation[1];
  });

  setGuideSection("maple-guide", copy.mapleGuide);
  applyCards("#maple-guide .guide-layer-grid article", copy.mapleGuide.cards);
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
