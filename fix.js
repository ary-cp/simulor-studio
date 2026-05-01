const fs = require('fs');
const files = ['public/index.html', 'public/features.html', 'public/pricing.html', 'public/dashboard.html'];
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  
  // Add onclick to the button
  content = content.replace(
    'id="loginBtn">Sign In</button>',
    'id="loginBtn" onclick="window.Clerk ? window.Clerk.openSignIn() : alert(\'Authentication is loading, please wait a second...\')">Sign In</button>'
  );
  
  // Remove the old event listener logic
  content = content.replace(
    "const loginBtn = document.getElementById('loginBtn');\n        if (loginBtn) {\n          loginBtn.addEventListener('click', () => window.Clerk.openSignIn());\n        }",
    "const loginBtn = document.getElementById('loginBtn');"
  );
  
  fs.writeFileSync(f, content);
});
console.log('Added inline onclick to loginBtn.');
