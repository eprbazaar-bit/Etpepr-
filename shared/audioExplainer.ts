export type AudioLanguage = 'en' | 'hi';
export type AudioVoiceName = 'Charon' | 'Fenrir' | 'Puck';
export type AudioTtsModel = 'gemini-3.8-flash-tts' | 'gemini-3.8-flash-lite-tts';

export const PREFERRED_TTS_MODEL: AudioTtsModel = 'gemini-3.8-flash-tts';
export const FALLBACK_TTS_MODEL: AudioTtsModel = 'gemini-3.8-flash-lite-tts';

export const MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_NARRATION_SCRIPT_CHARS = 6000;

export const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
] as const;

export const VOICE_OPTIONS: { id: AudioVoiceName; label: string; description: string }[] = [
  {
    id: 'Charon',
    label: 'Charon (Recommended — Executive Male)',
    description: 'Warm, deep corporate narrator voice suited for Indian English and Hindi.',
  },
  {
    id: 'Fenrir',
    label: 'Fenrir (Clear Presentation Male)',
    description: 'Articulate, steady male business voice with crisp section pacing.',
  },
  {
    id: 'Puck',
    label: 'Puck (Approachable Male)',
    description: 'Friendly, conversational male voice for welcoming platform walkthroughs.',
  },
];

export const DEFAULT_AUDIO_METADATA: Record<
  AudioLanguage,
  {
    id: AudioLanguage;
    language: AudioLanguage;
    languageLabel: string;
    nativeLabel: string;
    title: string;
    voiceStylePrompt: string;
    defaultScript: string;
  }
> = {
  en: {
    id: 'en',
    language: 'en',
    languageLabel: 'English',
    nativeLabel: 'English',
    title: 'How EPR Bazaar Works (English)',
    voiceStylePrompt:
      'Professional Indian male corporate narrator speaking clear, natural Indian English in a friendly business presentation tone at a moderate, steady speaking pace with clear pronunciation and brief professional pauses between paragraphs.',
    defaultScript: [
      'Welcome to EPR Bazaar, India’s dedicated B2B EPR Credit Trading Platform, operated by Nyanvi EcoClean Private Limited.',
      'EPR Bazaar is designed for two key groups of businesses across India: authorized Recyclers and waste processors who generate valid EPR credits, and Producers, Importers, and Brand Owners—commonly known as PIBOs—who need credits to meet their annual Extended Producer Responsibility obligations.',
      'Getting started is simple and structured. Businesses sign in with their authorized corporate account and complete their company profile with business details, contact information, and the EPR categories they deal in.',
      'To maintain marketplace trust, every participant undergoes KYC, GSTIN, and applicable CPCB or EPR registration document verification. Companies upload supporting registration and compliance documents in their private document vault for review by the EPR Bazaar verification desk.',
      'Once registered, verified Recyclers can list their available EPR credit inventory across supported categories—including Plastic, E-Waste, Battery, Tyre, and Used Oil—by entering the subcategory, financial year, available quantity, and expected selling rate. Listings are reviewed before going live on the marketplace.',
      'On the buying side, PIBOs can explore active marketplace inventory, review desk-published EPR reference rates by category, and submit their buying requirements with their required quantity, financial year, and maximum target rate.',
      'When a buyer requirement and seller inventory align, EPR Bazaar’s matching engine identifies the opportunity while protecting counterparty confidentiality. Authorized EPR Bazaar facilitators coordinate independent offers, counteroffers, and rate agreement between both parties, followed by structured order confirmation, GST invoice records, and status tracking.',
      'Throughout the process, EPR Bazaar promotes commercial transparency with clear rate visibility, chronological negotiation logs, organized GST invoices, and secure compliance documentation records.',
      'Visit EPR Bazaar today, register your business, and experience a transparent, well-managed way to trade EPR credits in India.',
    ].join('\n\n'),
  },
  hi: {
    id: 'hi',
    language: 'hi',
    languageLabel: 'Hindi',
    nativeLabel: 'हिंदी',
    title: 'EPR Bazaar कैसे काम करता है (हिंदी)',
    voiceStylePrompt:
      'Professional Indian male corporate narrator speaking clear, natural, polite Hindi with standard Indian pronunciation in a friendly business presentation style at a moderate, steady speaking speed with brief professional pauses between paragraphs.',
    defaultScript: [
      'नमस्कार। EPR Bazaar में आपका स्वागत है — भारत का समर्पित B2B EPR क्रेडिट ट्रेडिंग प्लेटफॉर्म, जिसे न्यानवी इकोक्लीन प्राइवेट लिमिटेड द्वारा संचालित किया जाता है।',
      'EPR Bazaar दो प्रमुख व्यावसायिक वर्गों के लिए बनाया गया है: अधिकृत रिसाइकिलर और वेस्ट प्रोसेसर जो EPR क्रेडिट उपलब्ध कराते हैं, तथा प्रोड्यूसर, इम्पोर्टर और ब्रांड ओनर्स — यानी PIBOs — जिन्हें अपनी वार्षिक एक्सटेंडेड प्रोड्यूसर रिस्पॉन्सिबिलिटी आवश्यकताओं को पूरा करने के लिए EPR क्रेडिट की ज़रूरत होती है।',
      'प्लेटफॉर्म पर शुरुआत करना आसान और व्यवस्थित है। व्यवसाय अपने अधिकृत कॉर्पोरेट अकाउंट से रजिस्ट्रेशन करते हैं और अपनी कंपनी की जानकारी, संपर्क विवरण तथा संबंधित EPR श्रेणियों का प्रोफ़ाइल पूरा करते हैं।',
      'विश्वसनीयता और पारदर्शिता बनाए रखने के लिए प्रत्येक प्रतिभागी का KYC, GSTIN तथा लागू CPCB और EPR पंजीकरण दस्तावेज़ों का सत्यापन किया जाता है। कंपनियाँ अपने सुरक्षित डॉक्यूमेंट वॉल्ट में आवश्यक दस्तावेज़ अपलोड करती हैं, जिनकी समीक्षा EPR Bazaar की वेरिफिकेशन टीम द्वारा की जाती है।',
      'सत्यापन के बाद, रिसाइकिलर प्लास्टिक, ई-वेस्ट, बैटरी, टायर और यूज़्ड ऑयल जैसी श्रेणियों में अपनी उपलब्ध EPR सर्टिफिकेट इन्वेंटरी, वित्तीय वर्ष, मात्रा और अपेक्षित विक्रय दर सूचीबद्ध कर सकते हैं। नई लिस्टिंग सत्यापन के बाद मार्केटप्लेस पर लाइव होती हैं।',
      'दूसरी ओर, PIBOs उपलब्ध इन्वेंटरी देख सकते हैं, श्रेणी के अनुसार प्रकाशित संदर्भ दरों की तुलना कर सकते हैं, और अपनी आवश्यक मात्रा, वित्तीय वर्ष तथा अधिकतम क्रय दर के साथ अपनी खरीद आवश्यकता दर्ज कर सकते हैं।',
      'जब खरीदार की आवश्यकता और विक्रेता की इन्वेंटरी मेल खाती है, तो EPR Bazaar का मैचिंग सिस्टम दोनों पक्षों की गोपनीयता बनाए रखते हुए अवसर तैयार करता है। हमारे अधिकृत फैसिलिटेटर ऑफर, काउंटरऑफर और दर सहमति का समन्वय करते हैं, जिसके बाद ऑर्डर कन्फर्मेशन, GST इनवॉइस और प्रक्रिया ट्रैकिंग व्यवस्थित रूप से पूरी की जाती है।',
      'पूरे लेन-देन के दौरान EPR Bazaar स्पष्ट दर जानकारी, नेगोशिएशन रिकॉर्ड, GST इनवॉइस और व्यवस्थित दस्तावेज़ों के माध्यम से पारदर्शिता और EPR अनुपालन डॉक्यूमेंटेशन में सहायता करता है।',
      'आज ही EPR Bazaar पर जाएँ, अपनी कंपनी रजिस्टर करें, और भारत में EPR क्रेडिट ट्रेडिंग का एक सुरक्षित और पारदर्शी अनुभव प्राप्त करें।',
    ].join('\n\n'),
  },
};

export function formatAudioDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function normalizeAudioLanguage(lang: unknown): AudioLanguage {
  return lang === 'hi' ? 'hi' : 'en';
}

export function normalizeAudioVoice(voice: unknown): AudioVoiceName {
  if (voice === 'Fenrir' || voice === 'Puck') return voice;
  return 'Charon';
}

export function normalizeAudioModel(model: unknown): AudioTtsModel {
  return model === 'gemini-3.8-flash-lite-tts' ? 'gemini-3.8-flash-lite-tts' : PREFERRED_TTS_MODEL;
}

export function isAllowedAudioMimeType(mimeType: string): boolean {
  const lower = (mimeType || '').trim().toLowerCase().split(';')[0];
  return (ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(lower);
}

export function validateNarrationScript(script: string): { valid: boolean; error?: string; clean: string } {
  const clean = (script || '').trim();
  if (clean.length < 30) {
    return { valid: false, clean, error: 'Narration script must be at least 30 characters long.' };
  }
  if (clean.length > MAX_NARRATION_SCRIPT_CHARS) {
    return {
      valid: false,
      clean,
      error: `Narration script cannot exceed ${MAX_NARRATION_SCRIPT_CHARS} characters.`,
    };
  }
  return { valid: true, clean };
}
