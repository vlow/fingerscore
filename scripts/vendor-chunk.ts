// React, React DOM and the router in a chunk of their own. It imports no app code, so its content hash, and with it
// its file name, changes only when one of these packages changes: a deploy of app code leaves it in visitors' caches.
// Only the shell's packages: a group that matched all of node_modules would pull jsPDF and the file readers into the shell.

export const VENDOR_PACKAGES = ['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom', '@remix-run/router'] as const;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = VENDOR_PACKAGES.map(p => escape(p).replace('/', '[\\\\/]')).join('|');

export const vendorChunking = {
  groups: [{ name: 'vendor' as const, test: new RegExp(`[\\\\/]node_modules[\\\\/](?:${names})[\\\\/]`) }],
};
