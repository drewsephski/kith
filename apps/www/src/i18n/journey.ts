import type { Locale } from "./locales.js";

type JourneyCopy = {
  heading: string;
  lead: string;
  web: string;
  desktop: string;
  signIn: string;
  start: string;
  how: string;
  demo: string;
  benefits: { title: string; body: string }[];
  steps: { title: string; body: string }[];
  openTitle: string;
  openBody: string;
  faq: { question: string; answer: string }[];
  close: string;
  downloadTitle: string;
  downloadBody: string;
  releases: string;
  install: string;
  unavailable: string;
  noInstallers: string;
};

const COPY: Record<Locale, JourneyCopy> = {
  en: {
    heading: "A little help.\nA lot off your mind.",
    lead: "Kith is your personal AI assistant. It remembers what matters, gets work done, and shows you what happened.",
    web: "Continue on Web",
    desktop: "Get Kith for Desktop",
    signIn: "Sign in",
    start: "Get started",
    how: "How it works",
    demo: "Try the demo · illustrative conversations, no connected accounts",
    benefits: [
      {
        title: "Arrive ready.",
        body: "Ask for a brief for your next meeting, with the agenda, relevant email, and questions to ask. Connect Calendar and email when you want Kith to check them.",
      },
      {
        title: "Find the next step.",
        body: "Turn a long email thread into a short summary and a draft reply. Compare a few options with links you can check before choosing.",
      },
      {
        title: "Keep the context.",
        body: "Share your preferences once and return to the same conversation. Review memories, follow task progress, and approve actions when needed.",
      },
    ],
    steps: [
      {
        title: "Open Kith",
        body: "Sign in on Web or use a published Desktop download.",
      },
      {
        title: "Give it one useful task",
        body: "Try “Help me prepare for tomorrow’s meeting” or “Summarize this document.” Add the context Kith needs.",
      },
      {
        title: "Review and keep going",
        body: "Check the result and its sources. Give feedback, then return to the same assistant for the next task.",
      },
    ],
    openTitle: "Helpful context. On your terms.",
    openBody:
      "Connect the accounts you want help with. Review what Kith remembers, change it, or ask it to forget. Your assistant becomes more useful as you share what matters to you.",
    faq: [
      {
        question: "Do I have to connect an account?",
        answer:
          "No. You can chat immediately when a model is available. Connect Calendar or email only when you want help with that private information.",
      },
      {
        question: "What will Kith remember?",
        answer:
          "Kith can save preferences and context you want to use again, such as how you like a meeting brief or what a project is about. Review, edit, or remove saved memories in the app.",
      },
      {
        question: "Can Kith act without asking?",
        answer:
          "Tasks and routines use the permissions you give them. Consequential actions retain approval checks, and you can inspect the task history and verified sources.",
      },
      {
        question: "Is Desktop available?",
        answer:
          "The download page lists published installers. If yours is not available yet, continue on Web or check back for a release.",
      },
    ],
    close: "Make a little room for yourself.",
    downloadTitle: "Kith, on your desktop.",
    downloadBody:
      "Use a published installer for your platform, then sign in with the same account you use on Web. Your assistant and conversations stay together.",
    releases: "Check releases",
    install: "Download",
    noInstallers:
      "Desktop downloads are not available here yet. Check releases or continue on Web.",
    unavailable:
      "A download is not available for this platform yet. Check releases or continue on Web.",
  },
  de: {
    heading: "Ein wenig Hilfe.\nViel weniger im Kopf.",
    lead: "Kith ist dein persönlicher KI-Assistent. Er merkt sich, was zählt, erledigt Aufgaben und zeigt dir, was passiert ist.",
    web: "Im Web fortfahren",
    desktop: "Kith für Desktop",
    signIn: "Anmelden",
    start: "Loslegen",
    how: "So funktioniert’s",
    demo: "Demo ausprobieren · Beispielgespräche, keine verbundenen Konten",
    benefits: [
      {
        title: "Weniger erklären.",
        body: "Deine Vorlieben und dein Kontext bleiben bei einem Assistenten. Sieh dir Erinnerungen an, bearbeite oder lösche sie.",
      },
      {
        title: "Mehr erledigt.",
        body: "Bereite deinen Tag vor, finde E-Mails oder mache deinen Posteingang zur Aufgabenliste. Verbinde nur die Konten, die du brauchst.",
      },
      {
        title: "Nachvollziehbare Ergebnisse.",
        body: "Sieh, was Kith geprüft hat, folge den Quellen und bestätige Aktionen, die deine Erlaubnis brauchen. Ergebnisse bleiben im Gespräch.",
      },
    ],
    steps: [
      {
        title: "Plattform wählen",
        body: "Öffne Kith im Browser oder prüfe die Desktop-Verfügbarkeit.",
      },
      {
        title: "Verbinden, was du brauchst",
        body: "Konten sind optional. Beginne mit einem oder chatte einfach.",
      },
      {
        title: "Eine echte Aufgabe delegieren",
        body: "Sag Kith, was dich beschäftigt. Kehre zu Aufgaben, Ergebnissen und offenen Fragen zurück.",
      },
    ],
    openTitle: "Hilfreicher Kontext. Deine Entscheidung.",
    openBody:
      "Verbinde die Konten, bei denen du Hilfe möchtest. Prüfe, bearbeite oder lösche Kiths Erinnerungen. Teile, was dir wichtig ist, damit dein Assistent besser helfen kann.",
    faq: [
      {
        question: "Muss ich ein Konto verbinden?",
        answer:
          "Nein. Sobald ein Modell verfügbar ist, kannst du chatten. Verbinde Kalender oder E-Mail nur, wenn Kith mit diesen privaten Daten helfen soll.",
      },
      {
        question: "Was merkt sich Kith?",
        answer:
          "Kith kann Vorlieben und hilfreichen Kontext speichern, etwa für Besprechungen oder Projekte. Du kannst gespeicherte Erinnerungen in der App prüfen, ändern oder löschen.",
      },
      {
        question: "Handelt Kith ohne Rückfrage?",
        answer:
          "Aufgaben und Routinen verwenden deine Berechtigungen. Folgenreiche Aktionen behalten ihre Bestätigungen. Verlauf und geprüfte Quellen sind einsehbar.",
      },
      {
        question: "Ist Desktop verfügbar?",
        answer:
          "Die Downloadseite zeigt veröffentlichte Installer. Wenn deine Version fehlt, nutze Web oder schau später nach einer Veröffentlichung.",
      },
    ],
    close: "Schaffe dir etwas Freiraum.",
    downloadTitle: "Kith auf deinem Desktop.",
    downloadBody:
      "Installiere eine veröffentlichte Version und melde dich mit demselben Konto wie im Web an. Assistent und Gespräche bleiben zusammen.",
    releases: "Releases ansehen",
    install: "Herunterladen",
    noInstallers:
      "Desktop-Downloads sind hier noch nicht verfügbar. Prüfe die Releases oder nutze Web.",
    unavailable:
      "Für diese Plattform gibt es hier noch keinen Download. Prüfe die Releases oder nutze Web.",
  },
  ko: {
    heading: "작은 도움.\n한결 가벼운 마음.",
    lead: "Kith는 개인 AI 비서입니다. 중요한 것을 기억하고, 일을 처리하고, 무엇을 했는지 보여줍니다.",
    web: "웹에서 계속",
    desktop: "데스크톱용 Kith",
    signIn: "로그인",
    start: "시작하기",
    how: "사용 방법",
    demo: "데모 체험 · 예시 대화이며 연결된 계정은 없습니다",
    benefits: [
      {
        title: "설명은 줄이고.",
        body: "하나의 비서가 취향과 맥락을 이어갑니다. 기억을 확인하고 수정하거나 삭제하세요.",
      },
      {
        title: "할 일은 끝내고.",
        body: "하루를 준비하고 이메일을 찾거나 받은편지함을 할 일 목록으로 정리하세요. 필요한 계정만 연결하세요.",
      },
      {
        title: "결과는 확인하고.",
        body: "Kith가 확인한 내용과 출처를 보고 승인이 필요한 작업을 검토하세요. 결과는 대화에 남습니다.",
      },
    ],
    steps: [
      {
        title: "플랫폼 선택",
        body: "브라우저에서 Kith를 열거나 데스크톱 출시 현황을 확인하세요.",
      },
      {
        title: "필요한 계정 연결",
        body: "계정 연결은 선택입니다. 하나만 연결하거나 바로 대화하세요.",
      },
      {
        title: "실제 작업 맡기기",
        body: "필요한 것을 말해 주세요. 나중에 작업, 결과, 질문을 이어서 확인하세요.",
      },
    ],
    openTitle: "도움이 되는 맥락. 선택은 나에게.",
    openBody:
      "도움이 필요한 계정만 연결하세요. Kith의 기억을 확인하고 수정하거나 삭제할 수 있습니다. 중요한 것을 알려주면 비서가 더 유용하게 도와줍니다.",
    faq: [
      {
        question: "계정을 연결해야 하나요?",
        answer:
          "아니요. 모델이 준비되어 있으면 바로 대화할 수 있습니다. 개인 정보에 대한 도움이 필요할 때만 캘린더나 이메일을 연결하세요.",
      },
      {
        question: "Kith는 무엇을 기억하나요?",
        answer:
          "회의 준비 방식이나 프로젝트 정보처럼 다시 쓰고 싶은 취향과 맥락을 저장할 수 있습니다. 앱에서 저장된 기억을 확인하고 수정하거나 삭제하세요.",
      },
      {
        question: "Kith가 승인 없이 작업하나요?",
        answer:
          "작업과 루틴은 부여한 권한을 따릅니다. 중요한 작업은 승인을 유지하며 기록과 확인된 출처를 볼 수 있습니다.",
      },
      {
        question: "데스크톱 앱이 있나요?",
        answer:
          "다운로드 페이지에 출시된 설치 파일이 표시됩니다. 필요한 버전이 없으면 웹을 사용하거나 다음 출시를 확인하세요.",
      },
    ],
    close: "나를 위한 여유를 만드세요.",
    downloadTitle: "데스크톱의 Kith.",
    downloadBody:
      "출시된 설치 파일을 사용하고 웹에서 사용하는 계정으로 로그인하세요. 비서와 대화가 함께 유지됩니다.",
    releases: "출시 확인",
    install: "다운로드",
    noInstallers: "아직 데스크톱 다운로드가 없습니다. 출시를 확인하거나 웹을 사용하세요.",
    unavailable: "이 플랫폼의 다운로드는 아직 없습니다. 출시를 확인하거나 웹을 사용하세요.",
  },
  zh: {
    heading: "一点帮助。\n少一些牵挂。",
    lead: "Kith 是你的个人 AI 助手。它记住重要的事，完成工作，并让你了解发生了什么。",
    web: "继续使用网页版",
    desktop: "获取 Kith 桌面版",
    signIn: "登录",
    start: "开始使用",
    how: "如何使用",
    demo: "试用演示 · 示例对话，未连接任何账户",
    benefits: [
      {
        title: "少一点重复解释。",
        body: "同一个助手持续了解你的偏好和上下文。查看、编辑或删除它的记忆。",
      },
      {
        title: "多一点实际成果。",
        body: "准备一天的安排、查找邮件或将收件箱整理成待办清单。按需连接你选择的账户。",
      },
      {
        title: "每个结果都有依据。",
        body: "查看 Kith 检查了什么，追溯来源，审核需要授权的操作。结果始终留在对话中。",
      },
    ],
    steps: [
      {
        title: "选择平台",
        body: "在浏览器中打开 Kith，或查看桌面版的发布情况。",
      },
      {
        title: "连接所需账户",
        body: "连接账户是可选的。先连接一个，或直接开始聊天。",
      },
      {
        title: "委托一项实际任务",
        body: "告诉 Kith 你需要什么。稍后回来查看工作、结果和需要你回答的问题。",
      },
    ],
    openTitle: "有用的背景。由你决定。",
    openBody:
      "只连接你需要帮助的账户。查看、编辑或删除 Kith 的记忆。告诉它什么对你重要，让助手更好地帮忙。",
    faq: [
      {
        question: "必须连接账户吗？",
        answer: "不必。模型可用时即可聊天。只有需要助手处理私人信息时，才连接日历或邮箱。",
      },
      {
        question: "Kith 会记住什么？",
        answer:
          "Kith 可以保存你希望以后继续使用的偏好和背景，例如会议简报的格式或项目情况。你可以在应用中查看、编辑或删除这些记忆。",
      },
      {
        question: "Kith 会未经询问就操作吗？",
        answer: "任务和例行工作遵循你授予的权限。重要操作仍需审批，你可以查看历史和核实过的来源。",
      },
      {
        question: "桌面版可用吗？",
        answer: "下载页列出已发布的安装包。如果你的版本尚未发布，可以使用网页版或稍后查看新版本。",
      },
    ],
    close: "给自己留一点空间。",
    downloadTitle: "桌面上的 Kith。",
    downloadBody: "使用已发布的安装包，登录与网页版相同的账户。你的助手和对话始终在一起。",
    releases: "查看发布",
    install: "下载",
    noInstallers: "这里暂时没有桌面版下载。请查看发布信息或使用网页版。",
    unavailable: "此平台暂时没有下载。请查看发布信息或使用网页版。",
  },
};

export function getJourneyCopy(locale: Locale): JourneyCopy {
  return COPY[locale];
}
