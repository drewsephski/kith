import type { Locale } from "./locales.js";

export type HomeCopy = {
  title: string;
  description: string;
  ogImageAlt: string;
  availableLanguage: string;
  skipToContent: string;
  starFallback: string;
  nav: { home: string; primary: string; menu: string; product: string };
  faq: { heading: string };
  footer: {
    navLabel: string;
    languagesLabel: string;
    links: {
      openClaw: string;
      changelog: string;
      alternatives: string;
      about: string;
      support: string;
      privacy: string;
      terms: string;
      grokAlternative: string;
      blog: string;
    };
  };
};

const HOME_COPY: Record<Locale, HomeCopy> = {
  en: {
    title: "Kith | Your personal AI assistant",
    description:
      "Kith is your personal AI assistant. It remembers what matters, gets work done, and shows you what happened.",
    ogImageAlt:
      "Kith is your personal AI assistant. It remembers what matters, gets work done, and shows you what happened.",
    availableLanguage: "English",
    skipToContent: "Skip to content",
    starFallback: "Star",
    nav: {
      home: "Kith home",
      primary: "Primary",
      menu: "Menu",
      product: "Product",
    },
    faq: {
      heading: "FAQ",
    },
    footer: {
      navLabel: "Footer",
      languagesLabel: "Language",
      links: {
        openClaw: "OpenClaw alternative",
        changelog: "Changelog",
        alternatives: "Alternatives",
        about: "About",
        support: "Support",
        privacy: "Privacy",
        terms: "Terms",
        grokAlternative: "Grok Bot alternative",
        blog: "Blog",
      },
    },
  },
  de: {
    title: "Kith | Dein persönlicher KI-Assistent",
    description:
      "Kith ist dein persönlicher KI-Assistent. Er merkt sich, was zählt, erledigt Aufgaben und zeigt dir, was passiert ist.",
    ogImageAlt:
      "Kith ist dein persönlicher KI-Assistent. Er merkt sich, was zählt, erledigt Aufgaben und zeigt dir, was passiert ist.",
    availableLanguage: "German",
    skipToContent: "Zum Inhalt springen",
    starFallback: "Star",
    nav: {
      home: "Kith-Startseite",
      primary: "Hauptnavigation",
      menu: "Menü",
      product: "Produkt",
    },
    faq: {
      heading: "FAQ",
    },
    footer: {
      navLabel: "Fußzeile",
      languagesLabel: "Sprache",
      links: {
        openClaw: "OpenClaw-Alternative",
        changelog: "Änderungsprotokoll",
        alternatives: "Alternativen",
        about: "Über uns",
        support: "Support",
        privacy: "Datenschutz",
        terms: "AGB",
        grokAlternative: "Grok-Bot-Alternative",
        blog: "Blog",
      },
    },
  },
  ko: {
    title: "Kith | 개인 AI 비서",
    description:
      "Kith는 개인 AI 비서입니다. 중요한 것을 기억하고, 일을 처리하고, 무엇을 했는지 보여줍니다.",
    ogImageAlt:
      "Kith는 개인 AI 비서입니다. 중요한 것을 기억하고, 일을 처리하고, 무엇을 했는지 보여줍니다.",
    availableLanguage: "Korean",
    skipToContent: "본문으로 건너뛰기",
    starFallback: "Star",
    nav: {
      home: "Kith 홈",
      primary: "주 메뉴",
      menu: "메뉴",
      product: "제품",
    },
    faq: {
      heading: "질문",
    },
    footer: {
      navLabel: "푸터",
      languagesLabel: "언어",
      links: {
        openClaw: "OpenClaw 대안",
        changelog: "변경 내역",
        alternatives: "대안",
        about: "소개",
        support: "지원",
        privacy: "개인정보 처리방침",
        terms: "이용약관",
        grokAlternative: "Grok Bot 대안",
        blog: "블로그",
      },
    },
  },
  zh: {
    title: "Kith | 你的个人 AI 助手",
    description: "Kith 是你的个人 AI 助手。它记住重要的事，完成工作，并让你了解发生了什么。",
    ogImageAlt: "Kith 是你的个人 AI 助手。它记住重要的事，完成工作，并让你了解发生了什么。",
    availableLanguage: "Chinese",
    skipToContent: "跳到主要内容",
    starFallback: "加星",
    nav: {
      home: "Kith 首页",
      primary: "主导航",
      menu: "菜单",
      product: "产品",
    },
    faq: {
      heading: "常见问题",
    },
    footer: {
      navLabel: "页脚",
      languagesLabel: "语言",
      links: {
        openClaw: "OpenClaw 替代方案",
        changelog: "更新日志",
        alternatives: "替代方案",
        about: "关于",
        support: "支持",
        privacy: "隐私",
        terms: "条款",
        grokAlternative: "Grok Bot 替代品",
        blog: "博客",
      },
    },
  },
};

export function getHomeCopy(locale: Locale): HomeCopy {
  return HOME_COPY[locale];
}
