const paths = {
  directory: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3" /></>,
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /><path d="M9 7h6" /></>,
  groceries: <><path d="M3 4h2l3 12h11l2-8H6" /><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>,
  news: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h4v4H7zM15 8h2M15 12h2M7 16h10" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 11h18M7 15h2M13 15h2M7 18h2" /></>,
  projects: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7" /></>,
  photos: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-5 5 6" /></>,
  recipes: <><path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M17 3v18M17 3c-4 3-4 9 0 9h3V3" /></>,
  documents: <><path d="M14 3H5v18h14V8ZM14 3v5h5M8 12h8M8 16h8" /></>,
};

export default function Icon({ name }) {
  return <svg className="line-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
