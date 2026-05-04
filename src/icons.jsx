// icons.jsx — Hand-stroked SVG icon set.

const Icon = ({ d, size = 22, stroke = 'currentColor', fill = 'none', sw = 1.6, children, vb = '0 0 24 24', style }) => (
  <svg width={size} height={size} viewBox={vb} fill={fill} stroke={stroke}
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {d ? <path d={d} /> : children}
  </svg>
);

export const ICONS = {
  pen:     (p) => <Icon {...p} d="M3 21l3.8-1 11-11-2.8-2.8-11 11L3 21zM14 7l3 3M16.5 4.5L18 3l3 3-1.5 1.5" />,
  mic:     (p) => <Icon {...p}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v4M8 22h8"/></Icon>,
  camera:  (p) => <Icon {...p}><path d="M3 8a2 2 0 012-2h2.5l1.5-2h6l1.5 2H19a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/><circle cx="12" cy="13" r="4"/></Icon>,
  clip:    (p) => <Icon {...p} d="M21 11.5l-9 9a5.5 5.5 0 11-7.78-7.78l9-9a3.6 3.6 0 015.1 5.1l-9 9a1.8 1.8 0 11-2.55-2.55l8.5-8.5" />,
  search:  (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></Icon>,
  sparkle: (p) => <Icon {...p} sw={1.2} d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM19 14l.7 1.8L21.5 16.5l-1.8.7L19 19l-.7-1.8L16.5 16.5l1.8-.7L19 14zM5 16l.5 1.3L6.8 17.8l-1.3.5L5 19.6l-.5-1.3L3.2 17.8l1.3-.5L5 16z" />,
  chat:    (p) => <Icon {...p} d="M4 6a3 3 0 013-3h10a3 3 0 013 3v8a3 3 0 01-3 3H10l-5 4v-4H7a3 3 0 01-3-3V6z" />,
  list:    (p) => <Icon {...p}><path d="M4 6h16M4 12h16M4 18h10"/></Icon>,
  tag:     (p) => <Icon {...p} d="M3 11V4a1 1 0 011-1h7l10 10-8 8L3 11zM7 7h.01" />,
  back:    (p) => <Icon {...p} d="M15 5l-7 7 7 7" />,
  more:    (p) => <Icon {...p}><circle cx="12" cy="5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="19" r="1.2" fill="currentColor"/></Icon>,
  plus:    (p) => <Icon {...p} d="M12 5v14M5 12h14" />,
  send:    (p) => <Icon {...p} d="M4 12l16-8-5 17-3-7-8-2z" />,
  close:   (p) => <Icon {...p} d="M6 6l12 12M18 6L6 18" />,
  pin:     (p) => <Icon {...p} d="M12 2v8M8 10h8l-2 5h-4l-2-5zM12 15v6" />,
  check:   (p) => <Icon {...p} d="M5 12l5 5L20 7" />,
  bolt:    (p) => <Icon {...p} d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />,
  book:    (p) => <Icon {...p} d="M4 4h7a3 3 0 013 3v13a2 2 0 00-2-2H4V4zM20 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8V4z" />,
  filter:  (p) => <Icon {...p} d="M3 5h18l-7 9v6l-4-2v-4L3 5z" />,
  calendar:(p) => <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></Icon>,
  pause:   (p) => <Icon {...p}><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></Icon>,
  play:    (p) => <Icon {...p} d="M6 4l14 8-14 8V4z" fill="currentColor" />,
  expand:  (p) => <Icon {...p}><path d="M9 4H4v5M4 4l6 6M15 4h5v5M20 4l-6 6M9 20H4v-5M4 20l6-6M15 20h5v-5M20 20l-6-6"/></Icon>,
  collapse:(p) => <Icon {...p}><path d="M10 4v6H4M14 4v6h6M10 20v-6H4M14 20v-6h6"/></Icon>,
  globe:   (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></Icon>,
  trash:   (p) => <Icon {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13"/></Icon>,
  settings:(p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z"/></Icon>,
  square:  (p) => <Icon {...p} fill="currentColor" sw={0}><rect x="6" y="6" width="12" height="12" rx="2"/></Icon>,
};
