export const PRIVACY_EFFECTIVE_DATE = "October 10, 2026";

export const PRIVACY_INTRO = "This policy covers the Kith apps, this website, and the hosted Kith service linked from this website. If you connect to a separately operated or self-hosted server, that operator controls the server's data handling and policies.";

export const PRIVACY_SECTIONS: readonly {
  heading: string;
  paragraphs: readonly string[];
  items?: readonly string[];
}[] = [
  {
    "heading": "Information we process",
    "paragraphs": [],
    "items": [
      "Account information: your email address, name or display name, account identifier, authentication records, and preferences. Password authentication stores a password hash.",
      "Conversation and task content: messages, assistant responses, saved memories, task instructions, activity records, and the photos, documents, or other files you choose to provide.",
      "Voice: microphone input, transcripts, and generated speech when you use voice features. Speech recognition may be processed by your device or its speech service; configured voice providers process audio needed for the feature.",
      "Connected services: authorization credentials and the information retrieved or sent through services you connect, such as email, calendar events, or documents, according to the permissions you grant.",
      "Technical information: connection and request information, IP addresses, device or browser information, error and activity logs, and notification tokens when you enable push notifications. Hosting and update services also receive technical requests from your device.",
      "Support and website submissions: information you send when requesting help or signing up for website updates."
    ]
  },
  {
    "heading": "How information is used",
    "paragraphs": [
      "We use this information to authenticate you, keep your conversations and tasks available, produce assistant responses, perform the actions you request, deliver notifications and account emails, provide support, and maintain the service's reliability and security."
    ]
  },
  {
    "heading": "AI and connected services",
    "paragraphs": [
      "Assistant features send relevant conversation, file, memory, or connected-service content to the model or service configured for that feature. Kith asks for consent before sharing data with a configured AI recipient. Review the recipient and the permissions you grant before continuing. These services process information under their own policies; their retention and model-training practices can differ.",
      "You can choose compatible providers or your own server where supported. Connecting an external account is optional. Disconnecting a service prevents further use through that connection but does not erase information already held by that service."
    ]
  },
  {
    "heading": "Sharing and security",
    "paragraphs": [
      "Information is shared with providers needed to run the features you use, including hosting, authentication email, model, voice, notification, update, and integration services. Members of a shared Space can access content shared in that Space. We may also disclose information when required by law or necessary to protect the service and its users.",
      "We use authentication, access controls, HTTPS for the hosted service, and protected credential storage. No storage or transmission method can guarantee absolute security. Providers may process information in countries other than your own."
    ]
  },
  {
    "heading": "Website analytics",
    "paragraphs": [
      "When website analytics is enabled, PostHog processes page visits, browser and device information, interactions, and associated identifiers. A website signup may associate your submitted email with that signup. Browser storage may retain analytics identifiers. This website's analytics is separate from your assistant conversations."
    ]
  },
  {
    "heading": "Retention and deletion",
    "paragraphs": [
      "Account, conversation, memory, file, and task data is kept to provide your saved history and ongoing work until it is deleted. Security logs, backups, support correspondence, and records needed to meet legal obligations may be retained separately. Copies already sent to third-party services are governed by their retention policies.",
      "To delete your account, open Account in the mobile app, choose Delete account, complete the identity check, and confirm. This removes your account and personal Space data. Shared content belonging to other members may remain. For help when you cannot sign in, use the support page."
    ]
  },
  {
    "heading": "Your choices",
    "paragraphs": [
      "You can decline AI data sharing, leave external services disconnected, revoke connections, manage camera, photo, microphone, speech, and notification permissions in your device settings, and delete your account. Contact support to request access, correction, or deletion of personal information or to ask about other rights available where you live. We may need to verify your identity."
    ]
  },
  {
    "heading": "Children and policy changes",
    "paragraphs": [
      "Kith is a general-purpose assistant and is not directed to children under 13. Contact support if you believe a child has provided personal information. We will update this page when our practices change and revise the effective date."
    ]
  }
];
