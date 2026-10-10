import type { Locale } from "./locales";

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
  source: string;
  releases: string;
  install: string;
  unavailable: string;
  noInstallers: string;
  webUnavailable: string;
  webUnavailableBody: string;
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
        title: "A little less explaining.",
        body: "Keep your preferences and context with one continuing assistant. See what Kith remembers, edit it, or ask it to forget.",
      },
      {
        title: "A little more done.",
        body: "Prepare for your day, find an email, or turn your inbox into a to-do list. Connect the accounts you choose, when you need them.",
      },
      {
        title: "Nothing left to guess.",
        body: "See what Kith checked, follow the sources, and review actions that need your permission. Results stay with the conversation.",
      },
    ],
    steps: [
      {
        title: "Choose your platform",
        body: "Open Kith in your browser, or check Desktop availability.",
      },
      {
        title: "Connect what you need",
        body: "An account connection is optional. Start with one, or just start chatting.",
      },
      {
        title: "Delegate something real",
        body: "Tell Kith what’s on your mind. Come back to the work, results, and questions that need you.",
      },
    ],
    openTitle: "Your assistant. Your choice.",
    openBody:
      "Open source under Apache-2.0. Choose a compatible model, run Kith on your own infrastructure, and keep control of your data. Advanced setup is there when you want it.",
    faq: [
      {
        question: "Do I have to connect an account?",
        answer:
          "No. You can chat immediately when a model is available. Connect Calendar or email only when you want help with that private information.",
      },
      {
        question: "Do I need my own model key?",
        answer:
          "That depends on the service you use. When the operator provides a model, Kith skips model setup. Otherwise, connect a supported provider or a local OpenAI-compatible model.",
      },
      {
        question: "Can Kith act without asking?",
        answer:
          "Tasks and routines use the permissions you give them. Consequential actions retain approval checks, and you can inspect the task history and verified sources.",
      },
      {
        question: "Is Desktop available?",
        answer:
          "The download page shows configured release links. If an installer has not been published, use the source-build guide or continue on Web. Signing and availability vary by release.",
      },
    ],
    close: "Make a little room for yourself.",
    downloadTitle: "Kith, on your desktop.",
    downloadBody:
      "Use a published installer for your platform, then sign in to the same service as Web. Your assistant and conversations stay together.",
    source: "Build from source",
    releases: "Check releases",
    install: "Download",
    noInstallers:
      "Desktop installers aren’t available here yet. Check releases or build from source.",
    unavailable: "No installer configured for this platform. Check releases or build from source.",
    webUnavailable: "Web service isn’t configured yet.",
    webUnavailableBody:
      "This site has not been connected to a hosted Kith application. You can check Desktop releases or run Kith yourself.",
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
    openTitle: "Dein Assistent. Deine Wahl.",
    openBody:
      "Open Source unter Apache-2.0. Wähle ein kompatibles Modell, betreibe Kith selbst und behalte die Kontrolle über deine Daten. Erweiterte Einrichtung bleibt verfügbar.",
    faq: [
      {
        question: "Muss ich ein Konto verbinden?",
        answer:
          "Nein. Sobald ein Modell verfügbar ist, kannst du chatten. Verbinde Kalender oder E-Mail nur, wenn Kith mit diesen privaten Daten helfen soll.",
      },
      {
        question: "Brauche ich einen Modellschlüssel?",
        answer:
          "Wenn der Betreiber ein Modell bereitstellt, entfällt die Einrichtung. Andernfalls verbindest du einen unterstützten Anbieter oder ein lokales OpenAI-kompatibles Modell.",
      },
      {
        question: "Handelt Kith ohne Rückfrage?",
        answer:
          "Aufgaben und Routinen verwenden deine Berechtigungen. Folgenreiche Aktionen behalten ihre Bestätigungen. Verlauf und geprüfte Quellen sind einsehbar.",
      },
      {
        question: "Ist Desktop verfügbar?",
        answer:
          "Die Downloadseite zeigt konfigurierte Release-Links. Ohne veröffentlichten Installer kannst du aus dem Quellcode bauen oder Web nutzen. Signierung und Verfügbarkeit hängen vom Release ab.",
      },
    ],
    close: "Schaffe dir etwas Freiraum.",
    downloadTitle: "Kith auf deinem Desktop.",
    downloadBody:
      "Installiere eine veröffentlichte Version und melde dich beim selben Dienst wie im Web an. Assistent und Gespräche bleiben zusammen.",
    source: "Aus Quellcode bauen",
    releases: "Releases ansehen",
    install: "Herunterladen",
    noInstallers:
      "Desktop-Installer sind hier noch nicht verfügbar. Prüfe die Releases oder baue aus dem Quellcode.",
    unavailable:
      "Kein Installer für diese Plattform konfiguriert. Prüfe die Releases oder baue aus dem Quellcode.",
    webUnavailable: "Der Webdienst ist noch nicht eingerichtet.",
    webUnavailableBody:
      "Diese Seite ist noch nicht mit einer gehosteten Kith-App verbunden. Prüfe Desktop-Releases oder betreibe Kith selbst.",
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
      { title: "플랫폼 선택", body: "브라우저에서 Kith를 열거나 데스크톱 출시 현황을 확인하세요." },
      {
        title: "필요한 계정 연결",
        body: "계정 연결은 선택입니다. 하나만 연결하거나 바로 대화하세요.",
      },
      {
        title: "실제 작업 맡기기",
        body: "필요한 것을 말해 주세요. 나중에 작업, 결과, 질문을 이어서 확인하세요.",
      },
    ],
    openTitle: "나의 비서. 나의 선택.",
    openBody:
      "Apache-2.0 오픈 소스입니다. 호환 모델을 선택하고 직접 호스팅하며 데이터를 관리하세요. 고급 설정도 언제든 사용할 수 있습니다.",
    faq: [
      {
        question: "계정을 연결해야 하나요?",
        answer:
          "아니요. 모델이 준비되어 있으면 바로 대화할 수 있습니다. 개인 정보에 대한 도움이 필요할 때만 캘린더나 이메일을 연결하세요.",
      },
      {
        question: "모델 키가 필요한가요?",
        answer:
          "운영자가 모델을 제공하면 설정을 건너뜁니다. 그렇지 않으면 지원 제공업체나 로컬 OpenAI 호환 모델을 연결하세요.",
      },
      {
        question: "Kith가 승인 없이 작업하나요?",
        answer:
          "작업과 루틴은 부여한 권한을 따릅니다. 중요한 작업은 승인을 유지하며 기록과 확인된 출처를 볼 수 있습니다.",
      },
      {
        question: "데스크톱 앱이 있나요?",
        answer:
          "다운로드 페이지에 설정된 출시 링크가 표시됩니다. 설치 파일이 없으면 소스에서 빌드하거나 웹을 사용하세요. 서명과 지원 플랫폼은 출시에 따라 다릅니다.",
      },
    ],
    close: "나를 위한 여유를 만드세요.",
    downloadTitle: "데스크톱의 Kith.",
    downloadBody:
      "출시된 설치 파일을 사용하고 웹과 같은 서비스에 로그인하세요. 비서와 대화가 함께 유지됩니다.",
    source: "소스에서 빌드",
    releases: "출시 확인",
    install: "다운로드",
    noInstallers: "아직 데스크톱 설치 파일이 없습니다. 출시를 확인하거나 소스에서 빌드하세요.",
    unavailable:
      "이 플랫폼의 설치 파일이 설정되지 않았습니다. 출시를 확인하거나 소스에서 빌드하세요.",
    webUnavailable: "웹 서비스가 아직 설정되지 않았습니다.",
    webUnavailableBody:
      "이 사이트는 아직 호스팅된 Kith 앱에 연결되지 않았습니다. 데스크톱 출시를 확인하거나 직접 호스팅하세요.",
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
      { title: "选择平台", body: "在浏览器中打开 Kith，或查看桌面版的发布情况。" },
      { title: "连接所需账户", body: "连接账户是可选的。先连接一个，或直接开始聊天。" },
      {
        title: "委托一项实际任务",
        body: "告诉 Kith 你需要什么。稍后回来查看工作、结果和需要你回答的问题。",
      },
    ],
    openTitle: "你的助手。你的选择。",
    openBody:
      "采用 Apache-2.0 开源许可证。选择兼容模型，自行部署 Kith，掌控你的数据。需要时再使用高级设置。",
    faq: [
      {
        question: "必须连接账户吗？",
        answer: "不必。模型可用时即可聊天。只有需要助手处理私人信息时，才连接日历或邮箱。",
      },
      {
        question: "需要自己的模型密钥吗？",
        answer:
          "如果服务运营者提供模型，Kith 会跳过模型设置。否则，请连接受支持的提供商或本地 OpenAI 兼容模型。",
      },
      {
        question: "Kith 会未经询问就操作吗？",
        answer: "任务和例行工作遵循你授予的权限。重要操作仍需审批，你可以查看历史和核实过的来源。",
      },
      {
        question: "桌面版可用吗？",
        answer:
          "下载页展示已配置的发布链接。如果尚无安装包，可从源码构建或使用网页版。签名和平台支持取决于具体发布。",
      },
    ],
    close: "给自己留一点空间。",
    downloadTitle: "桌面上的 Kith。",
    downloadBody: "使用已发布的安装包，登录与网页版相同的服务。你的助手和对话始终在一起。",
    source: "从源码构建",
    releases: "查看发布",
    install: "下载",
    noInstallers: "这里暂时没有桌面安装包。请查看发布或从源码构建。",
    unavailable: "尚未配置此平台的安装包。请查看发布或从源码构建。",
    webUnavailable: "网页版服务尚未配置。",
    webUnavailableBody: "此网站尚未连接托管的 Kith 应用。你可以查看桌面版发布或自行部署。",
  },
};

export function getJourneyCopy(locale: Locale): JourneyCopy {
  return COPY[locale];
}
