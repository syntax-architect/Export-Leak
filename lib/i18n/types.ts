export type SupportedLocale = "en" | "hi";

export interface TranslationDictionary {
  common: {
    appName: string;
    tagline: string;
    loading: string;
    retry: string;
    save: string;
    cancel: string;
    confirm: string;
    delete: string;
    back: string;
    next: string;
    skip: string;
    search: string;
    filter: string;
    all: string;
    more: string;
    offline: string;
  };
  nav: {
    overview: string;
    documents: string;
    shippingBills: string;
    matches: string;
    incentives: string;
    ebrc: string;
    team: string;
    billing: string;
    learn: string;
    freeTools: string;
  };
  dashboard: {
    unclaimedIncentives: string;
    atRiskRealisation: string;
    matchedAndClosed: string;
    scripsExpiring: string;
    daysLeft: string;
    overdue: string;
  };
  trust: {
    noDscPromise: string;
    privateDataPromise: string;
    deleteAnytimePromise: string;
  };
}
