const fs = require('fs');
const files = ['public/index.html', 'public/features.html', 'public/pricing.html', 'public/dashboard.html'];

const correctScript = `
      // Setup Clerk
      const clerkPubKey = 'pk_test_c3VwZXItYW50ZWxvcGUtNzMuY2xlcmsuYWNjb3VudHMuZGV2JA';
      const script = document.createElement('script');
      script.setAttribute('data-clerk-publishable-key', clerkPubKey);
      script.async = true;
      script.src = 'https://super-antelope-73.clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);

      script.addEventListener('load', async function () {
        await window.Clerk.load();
        window.ClerkIsReady = true;
        
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
          loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Redirecting to Clerk Sign In...');
            // Direct navigation to Clerk Hosted Sign-In to bypass UI component issues
            window.location.href = 'https://super-antelope-73.clerk.accounts.dev/sign-in?redirect_url=' + encodeURIComponent(window.location.href);
          });
        }
        
        if (window.Clerk.user) {
          if (loginBtn) loginBtn.style.display = 'none';
          document.getElementById('user-button').innerHTML = '';
          window.Clerk.mountUserButton(document.getElementById('user-button'));
          document.getElementById('startTestingBtn').textContent = 'Open Dashboard';
        }
      });
`;

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  
  // Regex to match everything between <script> // Setup Clerk ... </script>
  content = content.replace(/<script>\s*\/\/ Setup Clerk[\s\S]*?<\/script>/, '<script>\n' + correctScript + '\n    </script>');
  
  fs.writeFileSync(f, content);
});
console.log('Replaced entire script blocks cleanly.');
