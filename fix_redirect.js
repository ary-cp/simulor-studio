const fs = require('fs');
const files = ['public/index.html', 'public/features.html', 'public/pricing.html', 'public/dashboard.html'];
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  
  content = content.replace(
    'window.Clerk.openSignIn();',
    'window.Clerk.redirectToSignIn();'
  );
  
  fs.writeFileSync(f, content);
});
console.log('Switched to redirectToSignIn.');
