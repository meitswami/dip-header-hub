import { useState, useEffect, useCallback } from 'react';

export type Lang = 'en' | 'hi';

const translations: Record<string, Record<Lang, string>> = {
  // Sidebar
  'nav.dashboard': { en: 'Dashboard', hi: 'डैशबोर्ड' },
  'nav.cases': { en: 'Cases', hi: 'मामले' },
  'nav.upload': { en: 'Data Upload', hi: 'डेटा अपलोड' },
  'nav.chat': { en: 'AI Analyst', hi: 'AI विश्लेषक' },
  'nav.reports': { en: 'Reports', hi: 'रिपोर्ट' },
  'nav.documents': { en: 'Documents', hi: 'दस्तावेज़' },
  'nav.kb': { en: 'Knowledge Base', hi: 'ज्ञान आधार' },
  'nav.legal': { en: 'Legal Reference', hi: 'कानूनी संदर्भ' },
  'nav.users': { en: 'User Management', hi: 'उपयोगकर्ता प्रबंधन' },
  'nav.settings': { en: 'Settings', hi: 'सेटिंग्स' },
  'nav.navigation': { en: 'Navigation', hi: 'नेविगेशन' },
  'nav.admin': { en: 'Administration', hi: 'प्रशासन' },
  'nav.signout': { en: 'Sign Out', hi: 'साइन आउट' },
  'nav.platform': { en: 'Investigation Platform', hi: 'जांच मंच' },

  // Dashboard
  'dash.title': { en: 'Dashboard', hi: 'डैशबोर्ड' },
  'dash.welcome': { en: 'Welcome back', hi: 'वापस स्वागत है' },
  'dash.total': { en: 'Total Cases', hi: 'कुल मामले' },
  'dash.active': { en: 'Active', hi: 'सक्रिय' },
  'dash.pending': { en: 'Pending Analysis', hi: 'विश्लेषण लंबित' },
  'dash.alerts': { en: 'Alerts', hi: 'अलर्ट' },
  'dash.upload': { en: 'Upload Data', hi: 'डेटा अपलोड' },
  'dash.upload_desc': { en: 'Import CDR/IPDR/SDR files', hi: 'CDR/IPDR/SDR फ़ाइलें आयात करें' },
  'dash.ai': { en: 'AI Analyst', hi: 'AI विश्लेषक' },
  'dash.ai_desc': { en: 'Query your case data', hi: 'अपने मामले के डेटा से पूछें' },
  'dash.manage': { en: 'Manage Cases', hi: 'मामले प्रबंधित करें' },
  'dash.manage_desc': { en: 'View all investigation cases', hi: 'सभी जांच मामले देखें' },
  'dash.recent': { en: 'Recent Cases', hi: 'हाल के मामले' },
  'dash.search': { en: 'Search cases...', hi: 'मामले खोजें...' },
  'dash.new_case': { en: 'New Case', hi: 'नया मामला' },
  'dash.no_cases': { en: 'No cases found.', hi: 'कोई मामला नहीं मिला।' },

  // Common
  'common.select_case': { en: 'Select case...', hi: 'मामला चुनें...' },
  'common.loading': { en: 'Loading...', hi: 'लोड हो रहा है...' },
  'common.train_ai': { en: 'Train AI on Case', hi: 'मामले पर AI प्रशिक्षित करें' },
  'common.training_logs': { en: 'Training Logs', hi: 'प्रशिक्षण लॉग' },
  'common.no_new_data': { en: 'No new data since last training', hi: 'अंतिम प्रशिक्षण के बाद कोई नया डेटा नहीं' },
  'common.export_pdf': { en: 'Export PDF', hi: 'PDF निर्यात' },
  'common.export_docx': { en: 'Export DOCX', hi: 'DOCX निर्यात' },
};

// Event bus for language changes
const langListeners = new Set<() => void>();

function getStoredLang(): Lang {
  return (localStorage.getItem('dip-lang') as Lang) || 'en';
}

let currentLang: Lang = getStoredLang();

export function t(key: string): string {
  return translations[key]?.[currentLang] || translations[key]?.en || key;
}

export function useLang() {
  const [lang, setLangState] = useState<Lang>(currentLang);

  useEffect(() => {
    const cb = () => setLangState(currentLang);
    langListeners.add(cb);
    return () => { langListeners.delete(cb); };
  }, []);

  const setLang = useCallback((l: Lang) => {
    currentLang = l;
    localStorage.setItem('dip-lang', l);
    langListeners.forEach(fn => fn());
  }, []);

  return { lang, setLang, t };
}
