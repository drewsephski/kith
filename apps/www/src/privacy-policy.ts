export const PRIVACY_EFFECTIVE_DATE = "October 10, 2026";

export const PRIVACY_INTRO =
  "This policy covers the Kith apps, this website, and the hosted Kith service linked from this website.";

export const PRIVACY_SECTIONS: readonly {
  heading: string;
  paragraphs: readonly string[];
  items?: readonly string[];
}[] = [
  {
    heading: "Information we process",
    paragraphs: [],
    items: [
      "Account: your email, name or display name, account ID, sign-in records, and preferences. If you use a password, we store its hash.",
      "Conversations and tasks: your messages, Kith’s replies, saved memories, task instructions and history, and any photos, documents, or files you share.",
      "Voice: audio from your microphone, transcripts, and spoken replies when you use voice features. Your device or its speech service may recognize speech. The voice provider processes the audio needed for that feature.",
      "Connected accounts: access credentials and information read or sent through services you connect, such as email, calendar events, or documents. This follows the permissions you grant.",
      "Information needed to run the app: connection details, IP addresses, device and browser information, error and activity logs, and delivery tokens for push notifications you enable. Hosting and update services also receive requests from your device.",
      "Support and website submissions: information you send when requesting help or signing up for website updates.",
    ],
  },
  {
    heading: "How information is used",
    paragraphs: [
      "We use this information to sign you in, keep your conversations and tasks available, generate replies, and carry out the actions you request. It also supports notifications, account emails, customer support, and the service’s reliability and security.",
    ],
  },
  {
    heading: "AI and connected services",
    paragraphs: [
      "To answer a question or complete a task, Kith sends relevant messages, files, memories, or connected-account information to the AI or service used for that feature. Kith asks for consent before sharing data with an AI recipient. Review who receives the data and the permissions before continuing. Each service has its own policies for storing information and training models.",
      "You choose whether to connect an account. Disconnecting it stops further use through that connection. It does not erase information the other service already holds.",
    ],
  },
  {
    heading: "Sharing and security",
    paragraphs: [
      "Providers receive the information needed for the features you use, including hosting, sign-in emails, AI, voice, notifications, updates, and account connections. Members of a shared Space can access content shared there. We may also share information when the law requires it or when needed to protect the service and its users.",
      "We use authentication, access controls, HTTPS for the hosted service, and protected credential storage. No storage or transmission method can guarantee absolute security. Providers may process information in countries other than your own.",
    ],
  },
  {
    heading: "Website analytics",
    paragraphs: [
      "If website analytics is enabled, PostHog processes page visits, browser and device information, interactions, and related identifiers. Signing up on the website may link your submitted email to that signup. Your browser may store analytics identifiers. Website analytics is separate from your assistant conversations.",
    ],
  },
  {
    heading: "Retention and deletion",
    paragraphs: [
      "We keep account information, conversations, memories, files, and tasks so your history and ongoing work remain available until deleted. Security logs, backups, support messages, and legally required records may be kept separately. Other services apply their own retention policies to copies already sent to them.",
      "To delete your account, open Account in the mobile app, choose Delete account, complete the identity check, and confirm. This removes your account and personal Space data. Shared content belonging to other members may remain. For help when you cannot sign in, use the support page.",
    ],
  },
  {
    heading: "Your choices",
    paragraphs: [
      "You can decline AI data sharing, leave accounts disconnected, revoke connections, and delete your account. Manage camera, photo, microphone, speech, and notification permissions in your device settings. Contact support to request a copy, correction, or deletion of personal information, or to ask about other rights where you live. We may need to verify your identity.",
    ],
  },
  {
    heading: "Children and policy changes",
    paragraphs: [
      "Kith is a general-purpose assistant and is not directed to children under 13. Contact support if you believe a child has provided personal information. We will update this page when our practices change and revise the effective date.",
    ],
  },
];
