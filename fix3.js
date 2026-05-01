const fs = require('fs');
const files = ['public/index.html', 'public/features.html', 'public/pricing.html', 'public/dashboard.html'];
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  
  // Replace openSignIn with mountSignIn
  content = content.replace(
    'window.Clerk.openSignIn();',
    `
              let modalOverlay = document.getElementById('clerk-modal-overlay');
              if (!modalOverlay) {
                modalOverlay = document.createElement('div');
                modalOverlay.id = 'clerk-modal-overlay';
                modalOverlay.style.position = 'fixed';
                modalOverlay.style.top = '0';
                modalOverlay.style.left = '0';
                modalOverlay.style.width = '100vw';
                modalOverlay.style.height = '100vh';
                modalOverlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
                modalOverlay.style.display = 'flex';
                modalOverlay.style.alignItems = 'center';
                modalOverlay.style.justifyContent = 'center';
                modalOverlay.style.zIndex = '9999';
                
                // Add a close button
                const closeBtn = document.createElement('button');
                closeBtn.innerText = 'Close';
                closeBtn.style.position = 'absolute';
                closeBtn.style.top = '20px';
                closeBtn.style.right = '20px';
                closeBtn.style.zIndex = '10000';
                closeBtn.onclick = () => { modalOverlay.style.display = 'none'; };
                modalOverlay.appendChild(closeBtn);
                
                const clerkContainer = document.createElement('div');
                modalOverlay.appendChild(clerkContainer);
                document.body.appendChild(modalOverlay);
                
                window.Clerk.mountSignIn(clerkContainer);
              }
              modalOverlay.style.display = 'flex';
    `
  );
  
  fs.writeFileSync(f, content);
});
console.log('Switched to mountSignIn.');
