const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf-8');

// Extract views
const extractView = (html, viewId) => {
  const startTag = `<div id="${viewId}" class="view-section"`;
  const startIndex = html.indexOf(startTag);
  if (startIndex === -1) {
    const activeStartTag = `<div id="${viewId}" class="view-section active">`;
    const activeStartIndex = html.indexOf(activeStartTag);
    if (activeStartIndex === -1) return '';
    const endTag = `</div> <!-- /${viewId} -->`;
    const endIndex = html.indexOf(endTag, activeStartIndex);
    return html.substring(activeStartIndex, endIndex + endTag.length);
  }
  const endTag = `</div> <!-- /${viewId} -->`;
  const endIndex = html.indexOf(endTag, startIndex);
  return html.substring(startIndex, endIndex + endTag.length);
};

const viewHome = extractView(html, 'view-home');
const viewFeatures = extractView(html, 'view-features');
const viewPricing = extractView(html, 'view-pricing');
const viewDashboard = extractView(html, 'view-dashboard');

// The dashboard has extra closing tags because of the nested `<section>` ? Let's check `</main>`
const mainStart = html.indexOf('<main>');
const mainEnd = html.indexOf('</main>');
const beforeMain = html.substring(0, mainStart + 6);
const afterMain = html.substring(mainEnd);

// Fix navigation links to point to physical HTML pages
const fixNav = (content) => {
  let fixed = content
    .replace(/href="#features"/g, 'href="/features.html"')
    .replace(/href="#workflow"/g, 'href="/features.html#workflow"')
    .replace(/href="#pricing"/g, 'href="/pricing.html"')
    .replace(/href="#dashboard"/g, 'href="/dashboard.html"')
    .replace(/href="#home"/g, 'href="/index.html"')
    .replace(/href="#runner"/g, 'href="/dashboard.html#runner"')
    .replace(/href="#target"/g, 'href="/dashboard.html#target"');
  return fixed;
};

// Also we need to add a dedicated Login button
const addLoginButton = (content) => {
  return content.replace(
    '<a class="nav-cta" href="/dashboard.html#runner" id="startTestingBtn">Start Testing</a>',
    '<button class="nav-cta" style="background:transparent;border:1px solid var(--mint);" id="loginBtn">Sign In</button>\n        <a class="nav-cta" href="/dashboard.html#runner" id="startTestingBtn">Start Testing</a>'
  );
};

// Base layout creator
const createPage = (content) => {
  const fixedHeader = addLoginButton(fixNav(beforeMain));
  return fixedHeader + '\n' + content + '\n' + fixNav(afterMain);
};

// We need to un-hide the views
const unhide = (content) => content.replace('style="display: none;"', '').replace('class="view-section"', 'class="view-section active"');

fs.writeFileSync('public/index.html', createPage(viewHome));
fs.writeFileSync('public/features.html', createPage(unhide(viewFeatures)));
fs.writeFileSync('public/pricing.html', createPage(unhide(viewPricing)));
fs.writeFileSync('public/dashboard.html', createPage(unhide(viewDashboard)));

console.log("Pages generated successfully.");
