const fs = require('fs');
const files = ['public/index.html', 'public/features.html', 'public/dashboard.html'];

files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    
    // Remove Pricing from header nav
    content = content.replace(/<a href="\/pricing\.html">Pricing<\/a>\s*/g, '');
    
    // Replace View Pricing button on index
    content = content.replace(/<a class="secondary-link" href="#pricing">View Pricing<\/a>/g, '<a class="secondary-link" href="/dashboard.html">Free Open Beta</a>');
    
    fs.writeFileSync(f, content);
  }
});

if (fs.existsSync('public/pricing.html')) {
  fs.unlinkSync('public/pricing.html');
}

console.log('Removed all Pricing references and set to absolutely free.');
