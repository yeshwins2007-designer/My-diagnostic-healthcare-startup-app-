/**
 * Translations.
 *
 * Scope is deliberate: every string an elderly patient or a worried family
 * member might read is translated into all twelve languages. The ops console
 * and the lab portal are not — those are staff tools used in English, and
 * pretending otherwise would mean twelve copies of a dashboard nobody reads.
 *
 * BEFORE LAUNCH: have a native speaker review each language. These are
 * carefully written, but a machine-checked translation is not the same thing
 * as one a 78-year-old in Jayanagar reads without hesitating.
 */

import { DEFAULT_LOCALE, type Locale } from './locales';

export const KEYS = [
  // Elder Mode — the four tiles and their surroundings
  'elder.greeting',
  'elder.nextVisit',
  'elder.myReports',
  'elder.callForHelp',
  'elder.changeLanguage',
  'elder.readAloud',
  'elder.noVisitScheduled',
  'elder.visitOn',
  'elder.technicianComing',
  'elder.fastingReminder',
  'elder.nothingToWorry',

  // Stoplight — the plain-language result bands
  'stoplight.green.title',
  'stoplight.green.body',
  'stoplight.yellow.title',
  'stoplight.yellow.body',
  'stoplight.red.title',
  'stoplight.red.body',
  'stoplight.disclaimer',

  // Consent, spoken at the door
  'consent.title',
  'consent.body',
  'consent.agree',
  'consent.decline',

  // Common actions
  'common.yes',
  'common.no',
  'common.back',
  'common.next',
  'common.confirm',
  'common.cancel',
  'common.close',
  'common.help',
  'common.callUs',
  'common.loading',

  // Booking & visit
  'visit.arrivingBetween',
  'visit.yourTechnician',
  'visit.trackOnMap',
  'visit.runningLate',
  'visit.collected',
  'visit.reportReady',

  // Emergency — the one script that must never be softened
  'emergency.callNow',

  /*
   * Voice-assistant refusals.
   *
   * A refusal delivered in a language the caller cannot read is barely a
   * refusal at all — they hear a wall of English and keep pressing. These are
   * the three that matter for patient safety, so they are translated
   * everywhere. Diagnosis and value-read-out requests reuse `guard.clinical`;
   * a jailbreak attempt keeps the English scope message, because an attacker
   * is not the audience being served here.
   */
  'guard.clinical',
  'guard.medication',
  'guard.emergency',
] as const;

export type MessageKey = (typeof KEYS)[number];

type Dict = Record<MessageKey, string>;

const en: Dict = {
  'elder.greeting': 'Namaste',
  'elder.nextVisit': 'My next visit',
  'elder.myReports': 'My reports',
  'elder.callForHelp': 'Call for help',
  'elder.changeLanguage': 'Change language',
  'elder.readAloud': 'Read this to me',
  'elder.noVisitScheduled': 'No visit is scheduled right now.',
  'elder.visitOn': 'Visit on',
  'elder.technicianComing': 'is coming to you',
  'elder.fastingReminder': 'Please do not eat or drink anything except water before the visit.',
  'elder.nothingToWorry': 'There is nothing you need to do. We will come to you.',

  'stoplight.green.title': 'Green — all normal',
  'stoplight.green.body': 'Your results are within the normal range. Please continue as you are.',
  'stoplight.yellow.title': 'Yellow — please discuss',
  'stoplight.yellow.body': 'There are small changes. Please show this to your doctor at your next visit.',
  'stoplight.red.title': 'Red — please see a doctor',
  'stoplight.red.body': 'Please contact your doctor soon. We have already called your family.',
  'stoplight.disclaimer': 'This is information, not a diagnosis. It does not replace consulting your physician.',

  'consent.title': 'May we take your sample?',
  'consent.body': 'We will take a small blood sample and send it to the laboratory. Your report will be shared with the family member you have named.',
  'consent.agree': 'Yes, you may',
  'consent.decline': 'No, not today',

  'common.yes': 'Yes',
  'common.no': 'No',
  'common.back': 'Back',
  'common.next': 'Next',
  'common.confirm': 'Confirm',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.help': 'Help',
  'common.callUs': 'Call us',
  'common.loading': 'Please wait',

  'visit.arrivingBetween': 'Arriving between',
  'visit.yourTechnician': 'Your technician',
  'visit.trackOnMap': 'See where they are',
  'visit.runningLate': 'We are running late. We are sorry, and we have called you.',
  'visit.collected': 'Sample collected',
  'visit.reportReady': 'Report is ready',

  'emergency.callNow': 'Please call 108 now, or go to the nearest hospital.',
  'guard.clinical': 'I\'m not able to explain what results mean — only a doctor can do that. Please show the report to the doctor. I am asking one of our coordinators to call you back now.',
  'guard.medication': 'I can\'t advise on any medicine or dose — that has to come from the treating doctor. Please don\'t change anything without speaking to them. A coordinator will call you back.',
  'guard.emergency': 'If this is happening right now, please call 108 immediately, or take them to the nearest hospital. I am not able to give medical advice. I am alerting our coordinator to call you straight away.',
};

const hi: Dict = {
  'elder.greeting': 'नमस्ते',
  'elder.nextVisit': 'मेरी अगली विज़िट',
  'elder.myReports': 'मेरी रिपोर्ट',
  'elder.callForHelp': 'मदद के लिए फ़ोन करें',
  'elder.changeLanguage': 'भाषा बदलें',
  'elder.readAloud': 'इसे पढ़कर सुनाएँ',
  'elder.noVisitScheduled': 'अभी कोई विज़िट तय नहीं है।',
  'elder.visitOn': 'विज़िट की तारीख़',
  'elder.technicianComing': 'आपके पास आ रहे हैं',
  'elder.fastingReminder': 'विज़िट से पहले कृपया पानी के अलावा कुछ न खाएँ, न पिएँ।',
  'elder.nothingToWorry': 'आपको कुछ नहीं करना है। हम आपके पास आएँगे।',

  'stoplight.green.title': 'हरा — सब सामान्य है',
  'stoplight.green.body': 'आपकी रिपोर्ट सामान्य सीमा में है। जैसे चल रहे हैं, वैसे ही चलते रहिए।',
  'stoplight.yellow.title': 'पीला — डॉक्टर से बात करें',
  'stoplight.yellow.body': 'थोड़ा बदलाव दिख रहा है। अगली बार डॉक्टर को यह ज़रूर दिखाइए।',
  'stoplight.red.title': 'लाल — कृपया डॉक्टर को दिखाएँ',
  'stoplight.red.body': 'कृपया जल्दी डॉक्टर से संपर्क करें। हमने आपके परिवार को फ़ोन कर दिया है।',
  'stoplight.disclaimer': 'यह जानकारी है, निदान नहीं। यह डॉक्टर की सलाह का विकल्प नहीं है।',

  'consent.title': 'क्या हम आपका सैंपल ले सकते हैं?',
  'consent.body': 'हम थोड़ा-सा ख़ून लेंगे और उसे लैब भेजेंगे। आपकी रिपोर्ट उसी परिजन को दी जाएगी जिनका नाम आपने बताया है।',
  'consent.agree': 'हाँ, ले लीजिए',
  'consent.decline': 'नहीं, आज नहीं',

  'common.yes': 'हाँ',
  'common.no': 'नहीं',
  'common.back': 'पीछे',
  'common.next': 'आगे',
  'common.confirm': 'पक्का करें',
  'common.cancel': 'रद्द करें',
  'common.close': 'बंद करें',
  'common.help': 'मदद',
  'common.callUs': 'हमें फ़ोन करें',
  'common.loading': 'कृपया प्रतीक्षा करें',

  'visit.arrivingBetween': 'आने का समय',
  'visit.yourTechnician': 'आपके टेक्नीशियन',
  'visit.trackOnMap': 'देखिए वे कहाँ हैं',
  'visit.runningLate': 'हमें देर हो रही है। क्षमा करें, हमने आपको फ़ोन किया है।',
  'visit.collected': 'सैंपल ले लिया गया',
  'visit.reportReady': 'रिपोर्ट तैयार है',

  'emergency.callNow': 'कृपया अभी 108 पर फ़ोन करें, या पास के अस्पताल जाएँ।',
  'guard.clinical': 'रिपोर्ट का मतलब मैं नहीं बता सकती — यह केवल डॉक्टर ही बता सकते हैं। कृपया रिपोर्ट डॉक्टर को दिखाइए। मैं अभी हमारे समन्वयक से आपको फ़ोन करने के लिए कह रही हूँ।',
  'guard.medication': 'दवा या उसकी मात्रा के बारे में मैं कुछ नहीं कह सकती — यह इलाज करने वाले डॉक्टर से ही पूछें। उनसे बात किए बिना कुछ न बदलिए। हमारा समन्वयक आपको फ़ोन करेगा।',
  'guard.emergency': 'अगर यह अभी हो रहा है तो कृपया तुरंत 108 पर फ़ोन कीजिए, या पास के अस्पताल ले जाइए। मैं चिकित्सा सलाह नहीं दे सकती। मैं अभी हमारे समन्वयक को सूचित कर रही हूँ।',
};

const bn: Dict = {
  'elder.greeting': 'নমস্কার',
  'elder.nextVisit': 'আমার পরবর্তী ভিজিট',
  'elder.myReports': 'আমার রিপোর্ট',
  'elder.callForHelp': 'সাহায্যের জন্য ফোন করুন',
  'elder.changeLanguage': 'ভাষা বদলান',
  'elder.readAloud': 'আমাকে পড়ে শোনান',
  'elder.noVisitScheduled': 'এখন কোনো ভিজিট ঠিক করা নেই।',
  'elder.visitOn': 'ভিজিটের তারিখ',
  'elder.technicianComing': 'আপনার কাছে আসছেন',
  'elder.fastingReminder': 'ভিজিটের আগে জল ছাড়া কিছু খাবেন না, পান করবেন না।',
  'elder.nothingToWorry': 'আপনাকে কিছু করতে হবে না। আমরা আপনার কাছে আসব।',

  'stoplight.green.title': 'সবুজ — সব স্বাভাবিক',
  'stoplight.green.body': 'আপনার রিপোর্ট স্বাভাবিক সীমার মধ্যে আছে। যেমন চলছেন তেমনই চলুন।',
  'stoplight.yellow.title': 'হলুদ — ডাক্তারের সঙ্গে কথা বলুন',
  'stoplight.yellow.body': 'সামান্য পরিবর্তন দেখা যাচ্ছে। পরের বার ডাক্তারকে এটি দেখান।',
  'stoplight.red.title': 'লাল — ডাক্তার দেখান',
  'stoplight.red.body': 'দয়া করে শীঘ্রই ডাক্তারের সঙ্গে যোগাযোগ করুন। আমরা আপনার পরিবারকে ফোন করেছি।',
  'stoplight.disclaimer': 'এটি তথ্য, রোগনির্ণয় নয়। এটি ডাক্তারের পরামর্শের বিকল্প নয়।',

  'consent.title': 'আমরা কি আপনার নমুনা নিতে পারি?',
  'consent.body': 'আমরা অল্প রক্ত নেব এবং ল্যাবে পাঠাব। আপনার রিপোর্ট আপনার বলা পরিবারের সদস্যকে দেওয়া হবে।',
  'consent.agree': 'হ্যাঁ, নিন',
  'consent.decline': 'না, আজ নয়',

  'common.yes': 'হ্যাঁ',
  'common.no': 'না',
  'common.back': 'পিছনে',
  'common.next': 'পরবর্তী',
  'common.confirm': 'নিশ্চিত করুন',
  'common.cancel': 'বাতিল',
  'common.close': 'বন্ধ করুন',
  'common.help': 'সাহায্য',
  'common.callUs': 'আমাদের ফোন করুন',
  'common.loading': 'অপেক্ষা করুন',

  'visit.arrivingBetween': 'আসার সময়',
  'visit.yourTechnician': 'আপনার টেকনিশিয়ান',
  'visit.trackOnMap': 'দেখুন তিনি কোথায়',
  'visit.runningLate': 'আমাদের দেরি হচ্ছে। দুঃখিত, আমরা আপনাকে ফোন করেছি।',
  'visit.collected': 'নমুনা নেওয়া হয়েছে',
  'visit.reportReady': 'রিপোর্ট তৈরি',

  'emergency.callNow': 'দয়া করে এখনই 108 নম্বরে ফোন করুন, বা কাছের হাসপাতালে যান।',
  'guard.clinical': 'রিপোর্টের মানে আমি বলতে পারি না — এটি কেবল ডাক্তারই বলতে পারেন। দয়া করে রিপোর্টটি ডাক্তারকে দেখান। আমি এখনই আমাদের সমন্বয়ককে আপনাকে ফোন করতে বলছি।',
  'guard.medication': 'কোনো ওষুধ বা মাত্রা নিয়ে আমি পরামর্শ দিতে পারি না — এটি চিকিৎসকের কাছ থেকেই আসতে হবে। তাঁর সঙ্গে কথা না বলে কিছু বদলাবেন না। আমাদের সমন্বয়ক আপনাকে ফোন করবেন।',
  'guard.emergency': 'এটি যদি এখনই ঘটে থাকে, দয়া করে সঙ্গে সঙ্গে 108 নম্বরে ফোন করুন, বা কাছের হাসপাতালে নিয়ে যান। আমি চিকিৎসা পরামর্শ দিতে পারি না। আমি এখনই আমাদের সমন্বয়ককে জানাচ্ছি।',
};

const mr: Dict = {
  'elder.greeting': 'नमस्कार',
  'elder.nextVisit': 'माझी पुढील भेट',
  'elder.myReports': 'माझे रिपोर्ट',
  'elder.callForHelp': 'मदतीसाठी फोन करा',
  'elder.changeLanguage': 'भाषा बदला',
  'elder.readAloud': 'हे मला वाचून दाखवा',
  'elder.noVisitScheduled': 'सध्या कोणतीही भेट ठरलेली नाही.',
  'elder.visitOn': 'भेटीची तारीख',
  'elder.technicianComing': 'तुमच्याकडे येत आहेत',
  'elder.fastingReminder': 'भेटीपूर्वी कृपया पाण्याशिवाय काहीही खाऊ-पिऊ नका.',
  'elder.nothingToWorry': 'तुम्हाला काहीही करायचे नाही. आम्ही तुमच्याकडे येऊ.',

  'stoplight.green.title': 'हिरवा — सर्व सामान्य',
  'stoplight.green.body': 'तुमचे रिपोर्ट सामान्य मर्यादेत आहेत. आहे तसेच सुरू ठेवा.',
  'stoplight.yellow.title': 'पिवळा — डॉक्टरांशी बोला',
  'stoplight.yellow.body': 'थोडा बदल दिसतो आहे. पुढच्या वेळी डॉक्टरांना हे दाखवा.',
  'stoplight.red.title': 'लाल — कृपया डॉक्टरांना दाखवा',
  'stoplight.red.body': 'कृपया लवकर डॉक्टरांशी संपर्क साधा. आम्ही तुमच्या कुटुंबाला फोन केला आहे.',
  'stoplight.disclaimer': 'ही माहिती आहे, निदान नाही. हे डॉक्टरांच्या सल्ल्याला पर्याय नाही.',

  'consent.title': 'आम्ही तुमचा नमुना घेऊ का?',
  'consent.body': 'आम्ही थोडे रक्त घेऊ आणि ते प्रयोगशाळेत पाठवू. तुमचा रिपोर्ट तुम्ही सांगितलेल्या कुटुंबातील व्यक्तीला दिला जाईल.',
  'consent.agree': 'हो, घ्या',
  'consent.decline': 'नाही, आज नको',

  'common.yes': 'हो',
  'common.no': 'नाही',
  'common.back': 'मागे',
  'common.next': 'पुढे',
  'common.confirm': 'निश्चित करा',
  'common.cancel': 'रद्द करा',
  'common.close': 'बंद करा',
  'common.help': 'मदत',
  'common.callUs': 'आम्हाला फोन करा',
  'common.loading': 'कृपया थांबा',

  'visit.arrivingBetween': 'येण्याची वेळ',
  'visit.yourTechnician': 'तुमचे टेक्निशियन',
  'visit.trackOnMap': 'ते कुठे आहेत ते पहा',
  'visit.runningLate': 'आम्हाला उशीर होत आहे. क्षमस्व, आम्ही तुम्हाला फोन केला आहे.',
  'visit.collected': 'नमुना घेतला',
  'visit.reportReady': 'रिपोर्ट तयार आहे',

  'emergency.callNow': 'कृपया आत्ताच 108 वर फोन करा, किंवा जवळच्या रुग्णालयात जा.',
  'guard.clinical': 'अहवालाचा अर्थ मी सांगू शकत नाही — तो फक्त डॉक्टरच सांगू शकतात. कृपया अहवाल डॉक्टरांना दाखवा. मी आत्ताच आमच्या समन्वयकाला तुम्हाला फोन करायला सांगते आहे.',
  'guard.medication': 'औषध किंवा त्याच्या मात्रेबद्दल मी काही सांगू शकत नाही — ते उपचार करणाऱ्या डॉक्टरांकडूनच आले पाहिजे. त्यांच्याशी बोलल्याशिवाय काहीही बदलू नका. आमचा समन्वयक तुम्हाला फोन करेल.',
  'guard.emergency': 'हे आत्ता घडत असेल तर कृपया लगेच 108 वर फोन करा, किंवा जवळच्या रुग्णालयात न्या. मी वैद्यकीय सल्ला देऊ शकत नाही. मी आत्ताच आमच्या समन्वयकाला कळवते आहे.',
};

const te: Dict = {
  'elder.greeting': 'నమస్కారం',
  'elder.nextVisit': 'నా తదుపరి సందర్శన',
  'elder.myReports': 'నా రిపోర్టులు',
  'elder.callForHelp': 'సహాయం కోసం ఫోన్ చేయండి',
  'elder.changeLanguage': 'భాష మార్చండి',
  'elder.readAloud': 'దీన్ని నాకు చదివి వినిపించండి',
  'elder.noVisitScheduled': 'ప్రస్తుతం ఏ సందర్శనా నిర్ణయించలేదు.',
  'elder.visitOn': 'సందర్శన తేదీ',
  'elder.technicianComing': 'మీ దగ్గరకు వస్తున్నారు',
  'elder.fastingReminder': 'సందర్శనకు ముందు నీళ్లు తప్ప ఏమీ తినకండి, తాగకండి.',
  'elder.nothingToWorry': 'మీరు ఏమీ చేయనవసరం లేదు. మేమే మీ దగ్గరకు వస్తాము.',

  'stoplight.green.title': 'ఆకుపచ్చ — అంతా సాధారణం',
  'stoplight.green.body': 'మీ రిపోర్టు సాధారణ పరిధిలో ఉంది. ఇలాగే కొనసాగండి.',
  'stoplight.yellow.title': 'పసుపు — డాక్టర్‌తో మాట్లాడండి',
  'stoplight.yellow.body': 'చిన్న మార్పులు కనిపిస్తున్నాయి. తదుపరిసారి డాక్టర్‌కు ఇది చూపించండి.',
  'stoplight.red.title': 'ఎరుపు — డాక్టర్‌ను కలవండి',
  'stoplight.red.body': 'దయచేసి త్వరగా డాక్టర్‌ను సంప్రదించండి. మేము మీ కుటుంబానికి ఫోన్ చేశాము.',
  'stoplight.disclaimer': 'ఇది సమాచారం, రోగ నిర్ధారణ కాదు. ఇది వైద్యుని సలహాకు ప్రత్యామ్నాయం కాదు.',

  'consent.title': 'మేము మీ నమూనా తీసుకోవచ్చా?',
  'consent.body': 'మేము కొద్దిగా రక్తం తీసుకుని ల్యాబ్‌కు పంపుతాము. మీరు చెప్పిన కుటుంబ సభ్యునికి రిపోర్టు అందిస్తాము.',
  'consent.agree': 'అవును, తీసుకోండి',
  'consent.decline': 'వద్దు, ఈరోజు కాదు',

  'common.yes': 'అవును',
  'common.no': 'కాదు',
  'common.back': 'వెనుకకు',
  'common.next': 'తరువాత',
  'common.confirm': 'నిర్ధారించండి',
  'common.cancel': 'రద్దు చేయండి',
  'common.close': 'మూసివేయండి',
  'common.help': 'సహాయం',
  'common.callUs': 'మాకు ఫోన్ చేయండి',
  'common.loading': 'దయచేసి వేచి ఉండండి',

  'visit.arrivingBetween': 'వచ్చే సమయం',
  'visit.yourTechnician': 'మీ టెక్నీషియన్',
  'visit.trackOnMap': 'వారు ఎక్కడ ఉన్నారో చూడండి',
  'visit.runningLate': 'మాకు ఆలస్యం అవుతోంది. క్షమించండి, మేము మీకు ఫోన్ చేశాము.',
  'visit.collected': 'నమూనా తీసుకున్నాము',
  'visit.reportReady': 'రిపోర్టు సిద్ధంగా ఉంది',

  'emergency.callNow': 'దయచేసి ఇప్పుడే 108కి ఫోన్ చేయండి, లేదా దగ్గరి ఆసుపత్రికి వెళ్లండి.',
  'guard.clinical': 'రిపోర్టు అర్థం నేను చెప్పలేను — అది డాక్టర్ మాత్రమే చెప్పగలరు. దయచేసి రిపోర్టు డాక్టర్‌కు చూపించండి. మా సమన్వయకర్త మీకు ఇప్పుడే ఫోన్ చేసేలా చూస్తున్నాను.',
  'guard.medication': 'ఏ మందు గురించి కానీ మోతాదు గురించి కానీ నేను సలహా ఇవ్వలేను — అది చికిత్స చేస్తున్న డాక్టర్ నుంచే రావాలి. వారితో మాట్లాడకుండా ఏదీ మార్చవద్దు. మా సమన్వయకర్త మీకు ఫోన్ చేస్తారు.',
  'guard.emergency': 'ఇది ఇప్పుడే జరుగుతుంటే దయచేసి వెంటనే 108కి ఫోన్ చేయండి, లేదా దగ్గరి ఆసుపత్రికి తీసుకెళ్లండి. నేను వైద్య సలహా ఇవ్వలేను. మా సమన్వయకర్తకు ఇప్పుడే తెలియజేస్తున్నాను.',
};

const ta: Dict = {
  'elder.greeting': 'வணக்கம்',
  'elder.nextVisit': 'எனது அடுத்த வருகை',
  'elder.myReports': 'எனது அறிக்கைகள்',
  'elder.callForHelp': 'உதவிக்கு அழையுங்கள்',
  'elder.changeLanguage': 'மொழியை மாற்று',
  'elder.readAloud': 'இதை எனக்குப் படித்துக் காட்டுங்கள்',
  'elder.noVisitScheduled': 'இப்போது எந்த வருகையும் நிர்ணயிக்கப்படவில்லை.',
  'elder.visitOn': 'வருகை நாள்',
  'elder.technicianComing': 'உங்களிடம் வருகிறார்',
  'elder.fastingReminder': 'வருகைக்கு முன் தண்ணீரைத் தவிர எதுவும் சாப்பிடவோ குடிக்கவோ வேண்டாம்.',
  'elder.nothingToWorry': 'நீங்கள் எதுவும் செய்யத் தேவையில்லை. நாங்களே உங்களிடம் வருவோம்.',

  'stoplight.green.title': 'பச்சை — அனைத்தும் இயல்பு',
  'stoplight.green.body': 'உங்கள் அறிக்கை இயல்பான வரம்பில் உள்ளது. இப்படியே தொடருங்கள்.',
  'stoplight.yellow.title': 'மஞ்சள் — மருத்துவரிடம் பேசுங்கள்',
  'stoplight.yellow.body': 'சிறிய மாற்றங்கள் தெரிகின்றன. அடுத்த முறை மருத்துவரிடம் இதைக் காட்டுங்கள்.',
  'stoplight.red.title': 'சிவப்பு — மருத்துவரைப் பாருங்கள்',
  'stoplight.red.body': 'தயவுசெய்து விரைவில் மருத்துவரைத் தொடர்பு கொள்ளுங்கள். உங்கள் குடும்பத்திற்கு நாங்கள் அழைத்துவிட்டோம்.',
  'stoplight.disclaimer': 'இது தகவல், நோய் கண்டறிதல் அல்ல. இது மருத்துவர் ஆலோசனைக்கு மாற்று அல்ல.',

  'consent.title': 'உங்கள் மாதிரியை எடுக்கலாமா?',
  'consent.body': 'சிறிதளவு இரத்தம் எடுத்து ஆய்வகத்திற்கு அனுப்புவோம். நீங்கள் சொன்ன குடும்ப உறுப்பினருக்கு அறிக்கை வழங்கப்படும்.',
  'consent.agree': 'ஆம், எடுத்துக்கொள்ளுங்கள்',
  'consent.decline': 'இல்லை, இன்று வேண்டாம்',

  'common.yes': 'ஆம்',
  'common.no': 'இல்லை',
  'common.back': 'பின்',
  'common.next': 'அடுத்து',
  'common.confirm': 'உறுதிப்படுத்து',
  'common.cancel': 'ரத்து',
  'common.close': 'மூடு',
  'common.help': 'உதவி',
  'common.callUs': 'எங்களை அழையுங்கள்',
  'common.loading': 'தயவுசெய்து காத்திருங்கள்',

  'visit.arrivingBetween': 'வரும் நேரம்',
  'visit.yourTechnician': 'உங்கள் தொழில்நுட்பர்',
  'visit.trackOnMap': 'அவர் எங்கே இருக்கிறார் என்று பாருங்கள்',
  'visit.runningLate': 'எங்களுக்குத் தாமதமாகிறது. மன்னிக்கவும், உங்களை அழைத்துவிட்டோம்.',
  'visit.collected': 'மாதிரி எடுக்கப்பட்டது',
  'visit.reportReady': 'அறிக்கை தயார்',

  'emergency.callNow': 'தயவுசெய்து இப்போதே 108 ஐ அழையுங்கள், அல்லது அருகிலுள்ள மருத்துவமனைக்குச் செல்லுங்கள்.',
  'guard.clinical': 'அறிக்கையின் அர்த்தத்தை என்னால் சொல்ல முடியாது — அதை மருத்துவர் மட்டுமே சொல்ல முடியும். தயவுசெய்து அறிக்கையை மருத்துவரிடம் காட்டுங்கள். எங்கள் ஒருங்கிணைப்பாளர் இப்போதே உங்களை அழைப்பார்.',
  'guard.medication': 'எந்த மருந்து பற்றியும் அளவு பற்றியும் என்னால் ஆலோசனை சொல்ல முடியாது — அது சிகிச்சை அளிக்கும் மருத்துவரிடமிருந்தே வர வேண்டும். அவரிடம் பேசாமல் எதையும் மாற்ற வேண்டாம். எங்கள் ஒருங்கிணைப்பாளர் உங்களை அழைப்பார்.',
  'guard.emergency': 'இது இப்போது நடந்து கொண்டிருந்தால் தயவுசெய்து உடனே 108 ஐ அழையுங்கள், அல்லது அருகிலுள்ள மருத்துவமனைக்குக் கொண்டு செல்லுங்கள். என்னால் மருத்துவ ஆலோசனை வழங்க முடியாது. எங்கள் ஒருங்கிணைப்பாளருக்கு இப்போதே தெரிவிக்கிறேன்.',
};

const kn: Dict = {
  'elder.greeting': 'ನಮಸ್ಕಾರ',
  'elder.nextVisit': 'ನನ್ನ ಮುಂದಿನ ಭೇಟಿ',
  'elder.myReports': 'ನನ್ನ ವರದಿಗಳು',
  'elder.callForHelp': 'ಸಹಾಯಕ್ಕಾಗಿ ಕರೆ ಮಾಡಿ',
  'elder.changeLanguage': 'ಭಾಷೆ ಬದಲಾಯಿಸಿ',
  'elder.readAloud': 'ಇದನ್ನು ನನಗೆ ಓದಿ ಹೇಳಿ',
  'elder.noVisitScheduled': 'ಈಗ ಯಾವುದೇ ಭೇಟಿ ನಿಗದಿಯಾಗಿಲ್ಲ.',
  'elder.visitOn': 'ಭೇಟಿಯ ದಿನಾಂಕ',
  'elder.technicianComing': 'ನಿಮ್ಮ ಬಳಿ ಬರುತ್ತಿದ್ದಾರೆ',
  'elder.fastingReminder': 'ಭೇಟಿಗೆ ಮೊದಲು ನೀರು ಬಿಟ್ಟು ಬೇರೇನೂ ತಿನ್ನಬೇಡಿ, ಕುಡಿಯಬೇಡಿ.',
  'elder.nothingToWorry': 'ನೀವು ಏನೂ ಮಾಡಬೇಕಿಲ್ಲ. ನಾವೇ ನಿಮ್ಮ ಬಳಿ ಬರುತ್ತೇವೆ.',

  'stoplight.green.title': 'ಹಸಿರು — ಎಲ್ಲವೂ ಸಾಮಾನ್ಯ',
  'stoplight.green.body': 'ನಿಮ್ಮ ವರದಿ ಸಾಮಾನ್ಯ ಮಿತಿಯಲ್ಲಿದೆ. ಹೀಗೆಯೇ ಮುಂದುವರಿಸಿ.',
  'stoplight.yellow.title': 'ಹಳದಿ — ವೈದ್ಯರೊಂದಿಗೆ ಮಾತನಾಡಿ',
  'stoplight.yellow.body': 'ಸಣ್ಣ ಬದಲಾವಣೆಗಳಿವೆ. ಮುಂದಿನ ಬಾರಿ ವೈದ್ಯರಿಗೆ ಇದನ್ನು ತೋರಿಸಿ.',
  'stoplight.red.title': 'ಕೆಂಪು — ದಯವಿಟ್ಟು ವೈದ್ಯರನ್ನು ಭೇಟಿ ಮಾಡಿ',
  'stoplight.red.body': 'ದಯವಿಟ್ಟು ಬೇಗ ವೈದ್ಯರನ್ನು ಸಂಪರ್ಕಿಸಿ. ನಿಮ್ಮ ಕುಟುಂಬಕ್ಕೆ ನಾವು ಕರೆ ಮಾಡಿದ್ದೇವೆ.',
  'stoplight.disclaimer': 'ಇದು ಮಾಹಿತಿ, ರೋಗನಿರ್ಣಯವಲ್ಲ. ಇದು ವೈದ್ಯರ ಸಲಹೆಗೆ ಪರ್ಯಾಯವಲ್ಲ.',

  'consent.title': 'ನಿಮ್ಮ ಮಾದರಿ ತೆಗೆದುಕೊಳ್ಳಬಹುದೇ?',
  'consent.body': 'ಸ್ವಲ್ಪ ರಕ್ತ ತೆಗೆದು ಪ್ರಯೋಗಾಲಯಕ್ಕೆ ಕಳುಹಿಸುತ್ತೇವೆ. ನೀವು ಹೇಳಿದ ಕುಟುಂಬ ಸದಸ್ಯರಿಗೆ ವರದಿ ನೀಡಲಾಗುತ್ತದೆ.',
  'consent.agree': 'ಹೌದು, ತೆಗೆದುಕೊಳ್ಳಿ',
  'consent.decline': 'ಇಲ್ಲ, ಇಂದು ಬೇಡ',

  'common.yes': 'ಹೌದು',
  'common.no': 'ಇಲ್ಲ',
  'common.back': 'ಹಿಂದೆ',
  'common.next': 'ಮುಂದೆ',
  'common.confirm': 'ದೃಢೀಕರಿಸಿ',
  'common.cancel': 'ರದ್ದುಮಾಡಿ',
  'common.close': 'ಮುಚ್ಚಿ',
  'common.help': 'ಸಹಾಯ',
  'common.callUs': 'ನಮಗೆ ಕರೆ ಮಾಡಿ',
  'common.loading': 'ದಯವಿಟ್ಟು ಕಾಯಿರಿ',

  'visit.arrivingBetween': 'ಬರುವ ಸಮಯ',
  'visit.yourTechnician': 'ನಿಮ್ಮ ತಂತ್ರಜ್ಞ',
  'visit.trackOnMap': 'ಅವರು ಎಲ್ಲಿದ್ದಾರೆ ಎಂದು ನೋಡಿ',
  'visit.runningLate': 'ನಮಗೆ ತಡವಾಗುತ್ತಿದೆ. ಕ್ಷಮಿಸಿ, ನಾವು ನಿಮಗೆ ಕರೆ ಮಾಡಿದ್ದೇವೆ.',
  'visit.collected': 'ಮಾದರಿ ಸಂಗ್ರಹಿಸಲಾಗಿದೆ',
  'visit.reportReady': 'ವರದಿ ಸಿದ್ಧವಾಗಿದೆ',

  'emergency.callNow': 'ದಯವಿಟ್ಟು ಈಗಲೇ 108ಕ್ಕೆ ಕರೆ ಮಾಡಿ, ಅಥವಾ ಹತ್ತಿರದ ಆಸ್ಪತ್ರೆಗೆ ಹೋಗಿ.',
  'guard.clinical': 'ವರದಿಯ ಅರ್ಥವನ್ನು ನಾನು ಹೇಳಲಾರೆ — ಅದನ್ನು ವೈದ್ಯರು ಮಾತ್ರ ಹೇಳಬಲ್ಲರು. ದಯವಿಟ್ಟು ವರದಿಯನ್ನು ವೈದ್ಯರಿಗೆ ತೋರಿಸಿ. ನಮ್ಮ ಸಂಯೋಜಕರು ಈಗಲೇ ನಿಮಗೆ ಕರೆ ಮಾಡುತ್ತಾರೆ.',
  'guard.medication': 'ಯಾವುದೇ ಔಷಧ ಅಥವಾ ಪ್ರಮಾಣದ ಬಗ್ಗೆ ನಾನು ಸಲಹೆ ನೀಡಲಾರೆ — ಅದು ಚಿಕಿತ್ಸೆ ನೀಡುತ್ತಿರುವ ವೈದ್ಯರಿಂದಲೇ ಬರಬೇಕು. ಅವರೊಂದಿಗೆ ಮಾತನಾಡದೆ ಏನನ್ನೂ ಬದಲಾಯಿಸಬೇಡಿ. ನಮ್ಮ ಸಂಯೋಜಕರು ನಿಮಗೆ ಕರೆ ಮಾಡುತ್ತಾರೆ.',
  'guard.emergency': 'ಇದು ಈಗಲೇ ನಡೆಯುತ್ತಿದ್ದರೆ ದಯವಿಟ್ಟು ತಕ್ಷಣ 108ಕ್ಕೆ ಕರೆ ಮಾಡಿ, ಅಥವಾ ಹತ್ತಿರದ ಆಸ್ಪತ್ರೆಗೆ ಕರೆದೊಯ್ಯಿರಿ. ನಾನು ವೈದ್ಯಕೀಯ ಸಲಹೆ ನೀಡಲಾರೆ. ನಮ್ಮ ಸಂಯೋಜಕರಿಗೆ ಈಗಲೇ ತಿಳಿಸುತ್ತಿದ್ದೇನೆ.',
};

const gu: Dict = {
  'elder.greeting': 'નમસ્તે',
  'elder.nextVisit': 'મારી આગળની મુલાકાત',
  'elder.myReports': 'મારા રિપોર્ટ',
  'elder.callForHelp': 'મદદ માટે ફોન કરો',
  'elder.changeLanguage': 'ભાષા બદલો',
  'elder.readAloud': 'આ મને વાંચી સંભળાવો',
  'elder.noVisitScheduled': 'અત્યારે કોઈ મુલાકાત નક્કી નથી.',
  'elder.visitOn': 'મુલાકાતની તારીખ',
  'elder.technicianComing': 'તમારી પાસે આવી રહ્યા છે',
  'elder.fastingReminder': 'મુલાકાત પહેલાં પાણી સિવાય કંઈ ખાશો કે પીશો નહીં.',
  'elder.nothingToWorry': 'તમારે કંઈ કરવાનું નથી. અમે તમારી પાસે આવીશું.',

  'stoplight.green.title': 'લીલો — બધું સામાન્ય',
  'stoplight.green.body': 'તમારો રિપોર્ટ સામાન્ય મર્યાદામાં છે. જેમ ચાલે છે તેમ ચાલુ રાખો.',
  'stoplight.yellow.title': 'પીળો — ડૉક્ટર સાથે વાત કરો',
  'stoplight.yellow.body': 'થોડો ફેરફાર દેખાય છે. આવતી વખતે ડૉક્ટરને આ બતાવો.',
  'stoplight.red.title': 'લાલ — કૃપા કરીને ડૉક્ટરને બતાવો',
  'stoplight.red.body': 'કૃપા કરીને જલદી ડૉક્ટરનો સંપર્ક કરો. અમે તમારા પરિવારને ફોન કરી દીધો છે.',
  'stoplight.disclaimer': 'આ માહિતી છે, નિદાન નથી. તે ડૉક્ટરની સલાહનો વિકલ્પ નથી.',

  'consent.title': 'શું અમે તમારો નમૂનો લઈ શકીએ?',
  'consent.body': 'અમે થોડું લોહી લઈને લેબમાં મોકલીશું. તમે જણાવેલ પરિવારજનને રિપોર્ટ આપવામાં આવશે.',
  'consent.agree': 'હા, લઈ લો',
  'consent.decline': 'ના, આજે નહીં',

  'common.yes': 'હા',
  'common.no': 'ના',
  'common.back': 'પાછળ',
  'common.next': 'આગળ',
  'common.confirm': 'ખાતરી કરો',
  'common.cancel': 'રદ કરો',
  'common.close': 'બંધ કરો',
  'common.help': 'મદદ',
  'common.callUs': 'અમને ફોન કરો',
  'common.loading': 'કૃપા કરીને રાહ જુઓ',

  'visit.arrivingBetween': 'આવવાનો સમય',
  'visit.yourTechnician': 'તમારા ટેકનિશિયન',
  'visit.trackOnMap': 'તેઓ ક્યાં છે તે જુઓ',
  'visit.runningLate': 'અમને મોડું થઈ રહ્યું છે. માફ કરશો, અમે તમને ફોન કર્યો છે.',
  'visit.collected': 'નમૂનો લેવાઈ ગયો',
  'visit.reportReady': 'રિપોર્ટ તૈયાર છે',

  'emergency.callNow': 'કૃપા કરીને હમણાં જ 108 પર ફોન કરો, અથવા નજીકની હોસ્પિટલમાં જાઓ.',
  'guard.clinical': 'રિપોર્ટનો અર્થ હું કહી શકતી નથી — તે માત્ર ડૉક્ટર જ કહી શકે. કૃપા કરીને રિપોર્ટ ડૉક્ટરને બતાવો. અમારા સંયોજક તમને હમણાં જ ફોન કરશે.',
  'guard.medication': 'કોઈ પણ દવા કે તેની માત્રા વિશે હું સલાહ આપી શકતી નથી — તે સારવાર કરતા ડૉક્ટર પાસેથી જ આવવી જોઈએ. તેમની સાથે વાત કર્યા વગર કંઈ બદલશો નહીં. અમારા સંયોજક તમને ફોન કરશે.',
  'guard.emergency': 'જો આ અત્યારે થઈ રહ્યું હોય તો કૃપા કરીને તરત જ 108 પર ફોન કરો, અથવા નજીકની હોસ્પિટલમાં લઈ જાઓ. હું તબીબી સલાહ આપી શકતી નથી. હું અમારા સંયોજકને હમણાં જ જાણ કરું છું.',
};

const ml: Dict = {
  'elder.greeting': 'നമസ്കാരം',
  'elder.nextVisit': 'എന്റെ അടുത്ത സന്ദർശനം',
  'elder.myReports': 'എന്റെ റിപ്പോർട്ടുകൾ',
  'elder.callForHelp': 'സഹായത്തിന് വിളിക്കുക',
  'elder.changeLanguage': 'ഭാഷ മാറ്റുക',
  'elder.readAloud': 'ഇത് എനിക്ക് വായിച്ചു കേൾപ്പിക്കൂ',
  'elder.noVisitScheduled': 'ഇപ്പോൾ ഒരു സന്ദർശനവും നിശ്ചയിച്ചിട്ടില്ല.',
  'elder.visitOn': 'സന്ദർശന തീയതി',
  'elder.technicianComing': 'നിങ്ങളുടെ അടുത്തേക്ക് വരുന്നു',
  'elder.fastingReminder': 'സന്ദർശനത്തിന് മുൻപ് വെള്ളമല്ലാതെ ഒന്നും കഴിക്കുകയോ കുടിക്കുകയോ ചെയ്യരുത്.',
  'elder.nothingToWorry': 'നിങ്ങൾ ഒന്നും ചെയ്യേണ്ടതില്ല. ഞങ്ങൾ നിങ്ങളുടെ അടുത്തേക്ക് വരും.',

  'stoplight.green.title': 'പച്ച — എല്ലാം സാധാരണം',
  'stoplight.green.body': 'നിങ്ങളുടെ റിപ്പോർട്ട് സാധാരണ പരിധിയിലാണ്. ഇതുപോലെ തുടരുക.',
  'stoplight.yellow.title': 'മഞ്ഞ — ഡോക്ടറോട് സംസാരിക്കുക',
  'stoplight.yellow.body': 'ചെറിയ മാറ്റങ്ങൾ കാണുന്നു. അടുത്ത തവണ ഡോക്ടറെ ഇത് കാണിക്കുക.',
  'stoplight.red.title': 'ചുവപ്പ് — ദയവായി ഡോക്ടറെ കാണുക',
  'stoplight.red.body': 'ദയവായി ഉടൻ ഡോക്ടറെ ബന്ധപ്പെടുക. ഞങ്ങൾ നിങ്ങളുടെ കുടുംബത്തെ വിളിച്ചിട്ടുണ്ട്.',
  'stoplight.disclaimer': 'ഇത് വിവരമാണ്, രോഗനിർണയമല്ല. ഇത് ഡോക്ടറുടെ ഉപദേശത്തിന് പകരമല്ല.',

  'consent.title': 'നിങ്ങളുടെ സാമ്പിൾ എടുക്കാമോ?',
  'consent.body': 'അല്പം രക്തം എടുത്ത് ലാബിലേക്ക് അയക്കും. നിങ്ങൾ പറഞ്ഞ കുടുംബാംഗത്തിന് റിപ്പോർട്ട് നൽകും.',
  'consent.agree': 'അതെ, എടുത്തോളൂ',
  'consent.decline': 'വേണ്ട, ഇന്ന് വേണ്ട',

  'common.yes': 'അതെ',
  'common.no': 'അല്ല',
  'common.back': 'പിന്നോട്ട്',
  'common.next': 'അടുത്തത്',
  'common.confirm': 'സ്ഥിരീകരിക്കുക',
  'common.cancel': 'റദ്ദാക്കുക',
  'common.close': 'അടയ്ക്കുക',
  'common.help': 'സഹായം',
  'common.callUs': 'ഞങ്ങളെ വിളിക്കുക',
  'common.loading': 'ദയവായി കാത്തിരിക്കുക',

  'visit.arrivingBetween': 'എത്തുന്ന സമയം',
  'visit.yourTechnician': 'നിങ്ങളുടെ ടെക്നീഷ്യൻ',
  'visit.trackOnMap': 'അവർ എവിടെയാണെന്ന് നോക്കുക',
  'visit.runningLate': 'ഞങ്ങൾക്ക് വൈകുന്നു. ക്ഷമിക്കണം, ഞങ്ങൾ നിങ്ങളെ വിളിച്ചിട്ടുണ്ട്.',
  'visit.collected': 'സാമ്പിൾ എടുത്തു',
  'visit.reportReady': 'റിപ്പോർട്ട് തയ്യാറാണ്',

  'emergency.callNow': 'ദയവായി ഇപ്പോൾ തന്നെ 108 വിളിക്കുക, അല്ലെങ്കിൽ അടുത്തുള്ള ആശുപത്രിയിൽ പോകുക.',
  'guard.clinical': 'റിപ്പോർട്ടിന്റെ അർത്ഥം എനിക്ക് പറയാൻ കഴിയില്ല — അത് ഡോക്ടർക്ക് മാത്രമേ പറയാൻ കഴിയൂ. ദയവായി റിപ്പോർട്ട് ഡോക്ടറെ കാണിക്കുക. ഞങ്ങളുടെ കോർഡിനേറ്റർ ഉടൻ നിങ്ങളെ വിളിക്കും.',
  'guard.medication': 'ഏതെങ്കിലും മരുന്നിനെക്കുറിച്ചോ അളവിനെക്കുറിച്ചോ എനിക്ക് ഉപദേശിക്കാൻ കഴിയില്ല — അത് ചികിത്സിക്കുന്ന ഡോക്ടറിൽ നിന്നു തന്നെ വരണം. അവരോട് സംസാരിക്കാതെ ഒന്നും മാറ്റരുത്. ഞങ്ങളുടെ കോർഡിനേറ്റർ നിങ്ങളെ വിളിക്കും.',
  'guard.emergency': 'ഇത് ഇപ്പോൾ സംഭവിക്കുന്നെങ്കിൽ ദയവായി ഉടൻ 108 വിളിക്കുക, അല്ലെങ്കിൽ അടുത്തുള്ള ആശുപത്രിയിൽ കൊണ്ടുപോകുക. എനിക്ക് വൈദ്യോപദേശം നൽകാൻ കഴിയില്ല. ഞങ്ങളുടെ കോർഡിനേറ്ററെ ഉടൻ അറിയിക്കുന്നു.',
};

const pa: Dict = {
  'elder.greeting': 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ',
  'elder.nextVisit': 'ਮੇਰੀ ਅਗਲੀ ਮੁਲਾਕਾਤ',
  'elder.myReports': 'ਮੇਰੀਆਂ ਰਿਪੋਰਟਾਂ',
  'elder.callForHelp': 'ਮਦਦ ਲਈ ਫ਼ੋਨ ਕਰੋ',
  'elder.changeLanguage': 'ਭਾਸ਼ਾ ਬਦਲੋ',
  'elder.readAloud': 'ਇਹ ਮੈਨੂੰ ਪੜ੍ਹ ਕੇ ਸੁਣਾਓ',
  'elder.noVisitScheduled': 'ਹੁਣ ਕੋਈ ਮੁਲਾਕਾਤ ਤੈਅ ਨਹੀਂ ਹੈ।',
  'elder.visitOn': 'ਮੁਲਾਕਾਤ ਦੀ ਤਾਰੀਖ਼',
  'elder.technicianComing': 'ਤੁਹਾਡੇ ਕੋਲ ਆ ਰਹੇ ਹਨ',
  'elder.fastingReminder': 'ਮੁਲਾਕਾਤ ਤੋਂ ਪਹਿਲਾਂ ਪਾਣੀ ਤੋਂ ਬਿਨਾਂ ਕੁਝ ਨਾ ਖਾਓ, ਨਾ ਪੀਓ।',
  'elder.nothingToWorry': 'ਤੁਹਾਨੂੰ ਕੁਝ ਨਹੀਂ ਕਰਨਾ। ਅਸੀਂ ਤੁਹਾਡੇ ਕੋਲ ਆਵਾਂਗੇ।',

  'stoplight.green.title': 'ਹਰਾ — ਸਭ ਠੀਕ ਹੈ',
  'stoplight.green.body': 'ਤੁਹਾਡੀ ਰਿਪੋਰਟ ਆਮ ਹੱਦ ਵਿੱਚ ਹੈ। ਇਸੇ ਤਰ੍ਹਾਂ ਜਾਰੀ ਰੱਖੋ।',
  'stoplight.yellow.title': 'ਪੀਲਾ — ਡਾਕਟਰ ਨਾਲ ਗੱਲ ਕਰੋ',
  'stoplight.yellow.body': 'ਥੋੜ੍ਹਾ ਬਦਲਾਅ ਦਿਖ ਰਿਹਾ ਹੈ। ਅਗਲੀ ਵਾਰ ਡਾਕਟਰ ਨੂੰ ਇਹ ਦਿਖਾਓ।',
  'stoplight.red.title': 'ਲਾਲ — ਕਿਰਪਾ ਕਰਕੇ ਡਾਕਟਰ ਨੂੰ ਮਿਲੋ',
  'stoplight.red.body': 'ਕਿਰਪਾ ਕਰਕੇ ਜਲਦੀ ਡਾਕਟਰ ਨਾਲ ਸੰਪਰਕ ਕਰੋ। ਅਸੀਂ ਤੁਹਾਡੇ ਪਰਿਵਾਰ ਨੂੰ ਫ਼ੋਨ ਕਰ ਦਿੱਤਾ ਹੈ।',
  'stoplight.disclaimer': 'ਇਹ ਜਾਣਕਾਰੀ ਹੈ, ਤਸ਼ਖ਼ੀਸ ਨਹੀਂ। ਇਹ ਡਾਕਟਰ ਦੀ ਸਲਾਹ ਦਾ ਬਦਲ ਨਹੀਂ।',

  'consent.title': 'ਕੀ ਅਸੀਂ ਤੁਹਾਡਾ ਨਮੂਨਾ ਲੈ ਸਕਦੇ ਹਾਂ?',
  'consent.body': 'ਅਸੀਂ ਥੋੜ੍ਹਾ ਖ਼ੂਨ ਲੈ ਕੇ ਲੈਬ ਭੇਜਾਂਗੇ। ਤੁਹਾਡੀ ਰਿਪੋਰਟ ਉਸ ਪਰਿਵਾਰਕ ਮੈਂਬਰ ਨੂੰ ਦਿੱਤੀ ਜਾਵੇਗੀ ਜਿਸ ਦਾ ਨਾਂ ਤੁਸੀਂ ਦੱਸਿਆ ਹੈ।',
  'consent.agree': 'ਹਾਂ, ਲੈ ਲਵੋ',
  'consent.decline': 'ਨਹੀਂ, ਅੱਜ ਨਹੀਂ',

  'common.yes': 'ਹਾਂ',
  'common.no': 'ਨਹੀਂ',
  'common.back': 'ਪਿੱਛੇ',
  'common.next': 'ਅੱਗੇ',
  'common.confirm': 'ਪੱਕਾ ਕਰੋ',
  'common.cancel': 'ਰੱਦ ਕਰੋ',
  'common.close': 'ਬੰਦ ਕਰੋ',
  'common.help': 'ਮਦਦ',
  'common.callUs': 'ਸਾਨੂੰ ਫ਼ੋਨ ਕਰੋ',
  'common.loading': 'ਕਿਰਪਾ ਕਰਕੇ ਉਡੀਕ ਕਰੋ',

  'visit.arrivingBetween': 'ਆਉਣ ਦਾ ਸਮਾਂ',
  'visit.yourTechnician': 'ਤੁਹਾਡੇ ਟੈਕਨੀਸ਼ੀਅਨ',
  'visit.trackOnMap': 'ਵੇਖੋ ਉਹ ਕਿੱਥੇ ਹਨ',
  'visit.runningLate': 'ਸਾਨੂੰ ਦੇਰ ਹੋ ਰਹੀ ਹੈ। ਮਾਫ਼ ਕਰਨਾ, ਅਸੀਂ ਤੁਹਾਨੂੰ ਫ਼ੋਨ ਕੀਤਾ ਹੈ।',
  'visit.collected': 'ਨਮੂਨਾ ਲੈ ਲਿਆ ਗਿਆ',
  'visit.reportReady': 'ਰਿਪੋਰਟ ਤਿਆਰ ਹੈ',

  'emergency.callNow': 'ਕਿਰਪਾ ਕਰਕੇ ਹੁਣੇ 108 ’ਤੇ ਫ਼ੋਨ ਕਰੋ, ਜਾਂ ਨੇੜਲੇ ਹਸਪਤਾਲ ਜਾਓ।',
  'guard.clinical': 'ਰਿਪੋਰਟ ਦਾ ਮਤਲਬ ਮੈਂ ਨਹੀਂ ਦੱਸ ਸਕਦੀ — ਇਹ ਸਿਰਫ਼ ਡਾਕਟਰ ਹੀ ਦੱਸ ਸਕਦੇ ਹਨ। ਕਿਰਪਾ ਕਰਕੇ ਰਿਪੋਰਟ ਡਾਕਟਰ ਨੂੰ ਦਿਖਾਓ। ਸਾਡਾ ਕੋਆਰਡੀਨੇਟਰ ਹੁਣੇ ਤੁਹਾਨੂੰ ਫ਼ੋਨ ਕਰੇਗਾ।',
  'guard.medication': 'ਕਿਸੇ ਵੀ ਦਵਾਈ ਜਾਂ ਮਾਤਰਾ ਬਾਰੇ ਮੈਂ ਸਲਾਹ ਨਹੀਂ ਦੇ ਸਕਦੀ — ਇਹ ਇਲਾਜ ਕਰ ਰਹੇ ਡਾਕਟਰ ਤੋਂ ਹੀ ਆਉਣੀ ਚਾਹੀਦੀ ਹੈ। ਉਨ੍ਹਾਂ ਨਾਲ ਗੱਲ ਕੀਤੇ ਬਿਨਾਂ ਕੁਝ ਨਾ ਬਦਲੋ। ਸਾਡਾ ਕੋਆਰਡੀਨੇਟਰ ਤੁਹਾਨੂੰ ਫ਼ੋਨ ਕਰੇਗਾ।',
  'guard.emergency': 'ਜੇ ਇਹ ਹੁਣੇ ਹੋ ਰਿਹਾ ਹੈ ਤਾਂ ਕਿਰਪਾ ਕਰਕੇ ਤੁਰੰਤ 108 ’ਤੇ ਫ਼ੋਨ ਕਰੋ, ਜਾਂ ਨੇੜਲੇ ਹਸਪਤਾਲ ਲੈ ਜਾਓ। ਮੈਂ ਡਾਕਟਰੀ ਸਲਾਹ ਨਹੀਂ ਦੇ ਸਕਦੀ। ਮੈਂ ਸਾਡੇ ਕੋਆਰਡੀਨੇਟਰ ਨੂੰ ਹੁਣੇ ਦੱਸ ਰਹੀ ਹਾਂ।',
};

const ur: Dict = {
  'elder.greeting': 'السلام علیکم',
  'elder.nextVisit': 'میری اگلی ملاقات',
  'elder.myReports': 'میری رپورٹس',
  'elder.callForHelp': 'مدد کے لیے فون کریں',
  'elder.changeLanguage': 'زبان تبدیل کریں',
  'elder.readAloud': 'یہ مجھے پڑھ کر سنائیں',
  'elder.noVisitScheduled': 'ابھی کوئی ملاقات طے نہیں ہے۔',
  'elder.visitOn': 'ملاقات کی تاریخ',
  'elder.technicianComing': 'آپ کے پاس آ رہے ہیں',
  'elder.fastingReminder': 'ملاقات سے پہلے پانی کے علاوہ کچھ نہ کھائیں، نہ پئیں۔',
  'elder.nothingToWorry': 'آپ کو کچھ نہیں کرنا۔ ہم آپ کے پاس آئیں گے۔',

  'stoplight.green.title': 'سبز — سب معمول کے مطابق',
  'stoplight.green.body': 'آپ کی رپورٹ معمول کی حد میں ہے۔ اسی طرح جاری رکھیں۔',
  'stoplight.yellow.title': 'پیلا — ڈاکٹر سے بات کریں',
  'stoplight.yellow.body': 'تھوڑی تبدیلی نظر آ رہی ہے۔ اگلی بار ڈاکٹر کو یہ دکھائیں۔',
  'stoplight.red.title': 'سرخ — براہِ کرم ڈاکٹر سے ملیں',
  'stoplight.red.body': 'براہِ کرم جلد ڈاکٹر سے رابطہ کریں۔ ہم نے آپ کے گھر والوں کو فون کر دیا ہے۔',
  'stoplight.disclaimer': 'یہ معلومات ہیں، تشخیص نہیں۔ یہ ڈاکٹر کے مشورے کا متبادل نہیں۔',

  'consent.title': 'کیا ہم آپ کا نمونہ لے سکتے ہیں؟',
  'consent.body': 'ہم تھوڑا سا خون لے کر لیبارٹری بھیجیں گے۔ آپ کی رپورٹ اُسی گھر والے کو دی جائے گی جن کا نام آپ نے بتایا ہے۔',
  'consent.agree': 'جی ہاں، لے لیں',
  'consent.decline': 'نہیں، آج نہیں',

  'common.yes': 'جی ہاں',
  'common.no': 'نہیں',
  'common.back': 'واپس',
  'common.next': 'آگے',
  'common.confirm': 'تصدیق کریں',
  'common.cancel': 'منسوخ کریں',
  'common.close': 'بند کریں',
  'common.help': 'مدد',
  'common.callUs': 'ہمیں فون کریں',
  'common.loading': 'براہِ کرم انتظار کریں',

  'visit.arrivingBetween': 'آنے کا وقت',
  'visit.yourTechnician': 'آپ کے ٹیکنیشین',
  'visit.trackOnMap': 'دیکھیں وہ کہاں ہیں',
  'visit.runningLate': 'ہمیں دیر ہو رہی ہے۔ معذرت، ہم نے آپ کو فون کیا ہے۔',
  'visit.collected': 'نمونہ لے لیا گیا',
  'visit.reportReady': 'رپورٹ تیار ہے',

  'emergency.callNow': 'براہِ کرم ابھی 108 پر فون کریں، یا قریبی اسپتال جائیں۔',
  'guard.clinical': 'رپورٹ کا مطلب میں نہیں بتا سکتی — یہ صرف ڈاکٹر ہی بتا سکتے ہیں۔ براہِ کرم رپورٹ ڈاکٹر کو دکھائیں۔ ہمارا کوآرڈینیٹر ابھی آپ کو فون کرے گا۔',
  'guard.medication': 'کسی دوا یا اس کی مقدار کے بارے میں میں مشورہ نہیں دے سکتی — یہ علاج کرنے والے ڈاکٹر ہی سے آنا چاہیے۔ اُن سے بات کیے بغیر کچھ تبدیل نہ کریں۔ ہمارا کوآرڈینیٹر آپ کو فون کرے گا۔',
  'guard.emergency': 'اگر یہ ابھی ہو رہا ہے تو براہِ کرم فوراً 108 پر فون کریں، یا قریبی اسپتال لے جائیں۔ میں طبی مشورہ نہیں دے سکتی۔ میں ہمارے کوآرڈینیٹر کو ابھی اطلاع دے رہی ہوں۔',
};

const as: Dict = {
  'elder.greeting': 'নমস্কাৰ',
  'elder.nextVisit': 'মোৰ পৰৱৰ্তী ভ্ৰমণ',
  'elder.myReports': 'মোৰ ৰিপৰ্ট',
  'elder.callForHelp': 'সহায়ৰ বাবে ফোন কৰক',
  'elder.changeLanguage': 'ভাষা সলনি কৰক',
  'elder.readAloud': 'ইয়াক মোক পঢ়ি শুনাওক',
  'elder.noVisitScheduled': 'এতিয়া কোনো ভ্ৰমণ নিৰ্ধাৰিত হোৱা নাই।',
  'elder.visitOn': 'ভ্ৰমণৰ তাৰিখ',
  'elder.technicianComing': 'আপোনাৰ ওচৰলৈ আহি আছে',
  'elder.fastingReminder': 'ভ্ৰমণৰ আগতে পানীৰ বাহিৰে একো নাখাব, নাপান কৰিব।',
  'elder.nothingToWorry': 'আপুনি একো কৰিব নালাগে। আমিয়েই আপোনাৰ ওচৰলৈ আহিম।',

  'stoplight.green.title': 'সেউজীয়া — সকলো স্বাভাৱিক',
  'stoplight.green.body': 'আপোনাৰ ৰিপৰ্ট স্বাভাৱিক সীমাৰ ভিতৰত আছে। এনেদৰেই চলি থাকক।',
  'stoplight.yellow.title': 'হালধীয়া — চিকিৎসকৰ সৈতে কথা পাতক',
  'stoplight.yellow.body': 'সামান্য পৰিৱৰ্তন দেখা গৈছে। পিছৰ বাৰ চিকিৎসকক এইটো দেখুৱাব।',
  'stoplight.red.title': 'ৰঙা — অনুগ্ৰহ কৰি চিকিৎসকক দেখুৱাওক',
  'stoplight.red.body': 'অনুগ্ৰহ কৰি সোনকালে চিকিৎসকৰ সৈতে যোগাযোগ কৰক। আমি আপোনাৰ পৰিয়ালক ফোন কৰিছোঁ।',
  'stoplight.disclaimer': 'এইটো তথ্য, ৰোগ নিৰ্ণয় নহয়। ই চিকিৎসকৰ পৰামৰ্শৰ বিকল্প নহয়।',

  'consent.title': 'আমি আপোনাৰ নমুনা ল’ব পাৰোঁনে?',
  'consent.body': 'আমি অলপ তেজ লৈ পৰীক্ষাগাৰলৈ পঠিয়াম। আপুনি কোৱা পৰিয়ালৰ সদস্যক ৰিপৰ্ট দিয়া হ’ব।',
  'consent.agree': 'হয়, লওক',
  'consent.decline': 'নহয়, আজি নালাগে',

  'common.yes': 'হয়',
  'common.no': 'নহয়',
  'common.back': 'পিছলৈ',
  'common.next': 'পৰৱৰ্তী',
  'common.confirm': 'নিশ্চিত কৰক',
  'common.cancel': 'বাতিল কৰক',
  'common.close': 'বন্ধ কৰক',
  'common.help': 'সহায়',
  'common.callUs': 'আমাক ফোন কৰক',
  'common.loading': 'অনুগ্ৰহ কৰি অপেক্ষা কৰক',

  'visit.arrivingBetween': 'অহাৰ সময়',
  'visit.yourTechnician': 'আপোনাৰ টেকনিচিয়ান',
  'visit.trackOnMap': 'তেওঁ ক’ত আছে চাওক',
  'visit.runningLate': 'আমাৰ পলম হৈছে। ক্ষমা কৰিব, আমি আপোনাক ফোন কৰিছোঁ।',
  'visit.collected': 'নমুনা লোৱা হ’ল',
  'visit.reportReady': 'ৰিপৰ্ট সাজু',

  'emergency.callNow': 'অনুগ্ৰহ কৰি এতিয়াই 108 নম্বৰত ফোন কৰক, বা ওচৰৰ চিকিৎসালয়লৈ যাওক।',
  'guard.clinical': 'ৰিপৰ্টৰ অৰ্থ মই ক’ব নোৱাৰো — এইটো কেৱল চিকিৎসকেহে ক’ব পাৰে। অনুগ্ৰহ কৰি ৰিপৰ্টখন চিকিৎসকক দেখুৱাওক। আমাৰ সমন্বয়কে এতিয়াই আপোনাক ফোন কৰিব।',
  'guard.medication': 'কোনো ঔষধ বা ইয়াৰ মাত্ৰাৰ বিষয়ে মই পৰামৰ্শ দিব নোৱাৰো — এইটো চিকিৎসা কৰা চিকিৎসকৰ পৰাই আহিব লাগিব। তেওঁৰ সৈতে কথা নাপাতি একো সলনি নকৰিব। আমাৰ সমন্বয়কে আপোনাক ফোন কৰিব।',
  'guard.emergency': 'যদি এইটো এতিয়াই ঘটি আছে তেন্তে অনুগ্ৰহ কৰি লগে লগে 108 নম্বৰত ফোন কৰক, বা ওচৰৰ চিকিৎসালয়লৈ লৈ যাওক। মই চিকিৎসা পৰামৰ্শ দিব নোৱাৰো। আমাৰ সমন্বয়কক এতিয়াই জনাই আছোঁ।',
};

export const DICTIONARIES: Record<Locale, Dict> = {
  en,
  hi,
  bn,
  mr,
  te,
  ta,
  kn,
  gu,
  ml,
  pa,
  ur,
  as,
};

/**
 * Look up a message, falling back to English rather than rendering a raw key.
 * A missing translation must never show a 78-year-old the string
 * "elder.nextVisit".
 */
export function t(locale: Locale, key: MessageKey): string {
  return DICTIONARIES[locale]?.[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
}

/** Curried form for components that already know their locale. */
export function translator(locale: Locale) {
  return (key: MessageKey) => t(locale, key);
}
