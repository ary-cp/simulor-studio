const fs = require('fs');
const files = ['public/index.html', 'public/features.html', 'public/pricing.html', 'public/dashboard.html'];
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  
  // Replace the jsdelivr CDN URL with the Clerk Frontend API URL
  content = content.replace(
    'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js',
    'https://super-antelope-73.clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js'
  );
  
  // Clean up the previous mountSignIn hack and revert to simple openSignIn, as the correct script will have UI components
  content = content.replace(
    /let modalOverlay = document\.getElementById\('clerk-modal-overlay'\);[\s\S]*?modalOverlay\.style\.display = 'flex';/m,
    'window.Clerk.openSignIn();'
  );
  
  fs.writeFileSync(f, content);
});
console.log('Fixed Clerk script source.');
