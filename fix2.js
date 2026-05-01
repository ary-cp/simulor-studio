const fs = require('fs');
const files = ['public/index.html', 'public/features.html', 'public/pricing.html', 'public/dashboard.html'];
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  
  // Remove inline onclick
  content = content.replace(
    /onclick="[^"]*"/g,
    ''
  );
  
  // Add robust event listener
  content = content.replace(
    'window.ClerkIsReady = true;',
    `window.ClerkIsReady = true;
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
          loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Clerk object:', window.Clerk);
            try { 
              window.Clerk.openSignIn(); 
            } catch(err) { 
              alert('Error opening Clerk: ' + err.message); 
            }
          });
        }`
  );
  
  fs.writeFileSync(f, content);
});
console.log('Fixed loginBtn event listener again.');
