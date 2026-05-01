const fs = require('fs');
const files = ['public/index.html', 'public/features.html', 'public/dashboard.html'];

files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    
    // Add Pricing back to header nav (before Dashboard)
    if (!content.includes('pricing.html')) {
       content = content.replace(
         '<a href="/dashboard.html">Dashboard</a>',
         '<a href="/pricing.html">Pricing</a>\n      <a href="/dashboard.html">Dashboard</a>'
       );
    }
    
    // Revert View Pricing button on index
    content = content.replace(
      '<a class="secondary-link" href="/dashboard.html">Free Open Beta</a>',
      '<a class="secondary-link" href="/pricing.html">View Pricing</a>'
    );
    
    fs.writeFileSync(f, content);
  }
});

console.log('Restored Pricing links with Beta messaging.');
