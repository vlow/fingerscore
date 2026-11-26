// React, React DOM and the router in a chunk of their own. It imports no app code, so a change to the app's own code
// leaves its file name, and visitors' cached copy, as they are (scripts/vendor-chunk.test.ts).
// It does import Rolldown's runtime chunk, which holds the helpers the whole build uses. The name therefore also
// changes when a dependency elsewhere brings or drops a helper (adding or removing jszip or a MIDI library), and with
// an upgrade of Rolldown, Vite or the React plugin.
// Only the shell's packages: a group that matched all of node_modules would pull jsPDF and the file readers into the shell.

export const VENDOR_PACKAGES = ['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom', '@remix-run/router'] as const;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = VENDOR_PACKAGES.map(p => escape(p).replace('/', '[\\\\/]')).join('|');

export const vendorChunking = {
  groups: [{ name: 'vendor' as const, test: new RegExp(`[\\\\/]node_modules[\\\\/](?:${names})[\\\\/]`) }],
};
