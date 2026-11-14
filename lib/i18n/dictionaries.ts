import type { SupportedLocale, TranslationDictionary } from "./types";
import { APP_CONFIG } from "@/config/app";

export const enDictionary: TranslationDictionary = {
  common: {
    appName: APP_CONFIG.name,
    tagline: APP_CONFIG.tagline,
    loading: "Loading...",
    retry: "Retry",
    save: "Save",
    cancel: "Cancel",
    confirm: "Confirm",
    delete: "Delete",
    back: "Back",
    next: "Next",
    skip: "Skip",
    search: "Search",
    filter: "Filter",
    all: "All",
    more: "More",
    offline: "Offline",
  },
  nav: {
    overview: "Overview",
    documents: "Documents",
    shippingBills: "Shipping Bills",
    matches: "IRM & Matching",
    incentives: "Incentives & Scrips",
    ebrc: "Bulk eBRC Export",
    team: "Team",
    billing: "Billing & Plans",
    learn: "Learn EXIM",
    freeTools: "Free Tools",
  },
  dashboard: {
    unclaimedIncentives: "Unclaimed Incentives",
    atRiskRealisation: "At Risk (Realisation < 60d)",
    matchedAndClosed: "Matched & Closed",
    scripsExpiring: "Scrips Expiring in 90d",
    daysLeft: "days left",
    overdue: "Overdue",
  },
  trust: {
    noDscPromise: "We never ask for your DSC token or portal passwords",
    privateDataPromise: "Your export documents are private to your organization",
    deleteAnytimePromise: "You can export or delete your data at any time",
  },
};

/**
 * Hindi scaffolding dictionary ready for localization.
 * High-frequency compliance terms (RoDTEP, eBRC, IRM, IEC) are intentionally maintained
 * in English script or common Indian commercial parlance.
 */
export const hiDictionary: TranslationDictionary = {
  common: {
    appName: APP_CONFIG.name,
    tagline: "निर्यात प्रोत्साहन एवं eBRC ट्रैकर",
    loading: "लोड हो रहा है...",
    retry: "पुनः प्रयास करें",
    save: "सहेजें",
    cancel: "रद्द करें",
    confirm: "पुष्टि करें",
    delete: "हटाएं",
    back: "पीछे",
    next: "आगे",
    skip: "छोड़ें",
    search: "खोजें",
    filter: "फ़िल्टर",
    all: "सभी",
    more: "और",
    offline: "ऑफ़लाइन",
  },
  nav: {
    overview: "अवलोकन",
    documents: "दस्तावेज़",
    shippingBills: "शिपिंग बिल",
    matches: "IRM और मिलान",
    incentives: "प्रोत्साहन और स्क्रिप्स",
    ebrc: "बल्क eBRC निर्यात",
    team: "टीम",
    billing: "बिलिंग और योजनाएं",
    learn: "EXIM सीखें",
    freeTools: "मुफ्त टूल्स",
  },
  dashboard: {
    unclaimedIncentives: "दावा न किए गए प्रोत्साहन",
    atRiskRealisation: "जोखिम में (वसूली < 60 दिन)",
    matchedAndClosed: "मिलान और बंद",
    scripsExpiring: "90 दिनों में समाप्त होने वाली स्क्रिप्स",
    daysLeft: "दिन शेष",
    overdue: "अतिदेय",
  },
  trust: {
    noDscPromise: "हम कभी भी आपका DSC टोकन या पोर्टल पासवर्ड नहीं मांगते",
    privateDataPromise: "आपके निर्यात दस्तावेज़ केवल आपके संगठन के लिए निजी हैं",
    deleteAnytimePromise: "आप किसी भी समय अपना डेटा निर्यात या हटा सकते हैं",
  },
};

export const dictionaries: Record<SupportedLocale, TranslationDictionary> = {
  en: enDictionary,
  hi: hiDictionary,
};
