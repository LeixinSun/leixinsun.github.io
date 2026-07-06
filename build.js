const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

// Configure marked options
marked.setOptions({
  headerIds: true,
  mangle: false,
  gfm: true
});

const CONTENT_DIR = path.join(__dirname, 'content', 'posts');
const PAGES_DIR = path.join(__dirname, 'content', 'pages');
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DIST_DIR = path.join(__dirname, 'dist');

function formatChineseDate(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return dateInput;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// Map of category slug to human-friendly display titles
const CATEGORY_MAP = {
  'tech': 'Technology & AI',
  'thoughts': 'General Thoughts',
  'life': 'Life & Books'
};

// Simple utility to copy directory recursively
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Simple utility to calculate reading time (approx. 300 Chinese characters or 200 English words per min)
function calculateReadingTime(text) {
  const cnCharCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const enWordCount = (text.replace(/[\u4e00-\u9fa5]/g, '').match(/\b\w+\b/g) || []).length;
  const minutes = Math.ceil(cnCharCount / 300 + enWordCount / 200);
  return minutes || 1;
}

// Find all files in a directory recursively
function getFilesRecursively(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      getFilesRecursively(filePath, fileList);
    } else if (file.endsWith('.md')) {
      fileList.push(filePath);
    }
  }

  return fileList;
}

function build() {
  console.log('🚀 Starting plain website build process...');

  // 1. Clean and recreate dist directory
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
    console.log('🧹 Cleaned existing dist/ folder.');
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // 2. Copy static public assets (CSS, JS)
  if (fs.existsSync(PUBLIC_DIR)) {
    copyDirSync(PUBLIC_DIR, DIST_DIR);
    console.log('📂 Copied static assets to dist/.');
  }

  // 3. Load Layout Templates
  const indexTemplatePath = path.join(TEMPLATES_DIR, 'index.html');
  const postTemplatePath = path.join(TEMPLATES_DIR, 'post.html');

  if (!fs.existsSync(indexTemplatePath) || !fs.existsSync(postTemplatePath)) {
    console.error('❌ Error: Templates index.html and post.html must exist under templates/.');
    process.exit(1);
  }

  const indexTemplate = fs.readFileSync(indexTemplatePath, 'utf-8');
  const postTemplate = fs.readFileSync(postTemplatePath, 'utf-8');

  // 4. Gather and parse all markdown posts
  const markdownFiles = getFilesRecursively(CONTENT_DIR);
  const pageFiles = getFilesRecursively(PAGES_DIR);
  const posts = [];

  console.log(`📝 Found ${markdownFiles.length} markdown articles to compile.`);

  for (const filePath of markdownFiles) {
    const relativePath = path.relative(CONTENT_DIR, filePath);
    const category = path.dirname(relativePath) !== '.' ? path.dirname(relativePath) : 'general';
    const slug = path.basename(filePath, '.md');

    // Read file and parse front matter
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = matter(fileContent);

    // Render markdown to HTML
    const htmlContent = marked.parse(content);

    // Calculate metadata
    const title = data.title || 'Untitled Post';
    const displayDate = data.date ? formatChineseDate(data.date) : '2026年1月1日';
    const rawDateString = data.date ? new Date(data.date).toISOString().split('T')[0] : '2026-01-01';
    const description = data.description || '';
    const readTime = calculateReadingTime(content);

    // Compile into post.html template
    let compiledPost = postTemplate
      .replace(/{{TITLE}}/g, title)
      .replace(/{{DESCRIPTION}}/g, description)
      .replace(/{{DATE}}/g, displayDate)
      .replace(/{{DATETIME}}/g, rawDateString)
      .replace(/{{READ_TIME}}/g, readTime)
      .replace(/{{CATEGORY}}/g, CATEGORY_MAP[category] || category.charAt(0).toUpperCase() + category.slice(1))
      .replace(/{{CONTENT}}/g, htmlContent);

    // Write to production dist folder mirroring folder structure
    const outputSubdir = path.join(DIST_DIR, 'posts', category);
    fs.mkdirSync(outputSubdir, { recursive: true });
    
    const outputPath = path.join(outputSubdir, `${slug}.html`);
    fs.writeFileSync(outputPath, compiledPost, 'utf-8');

    // Store parsed post metadata for homepage list
    posts.push({
      title,
      displayDate,
      description,
      category,
      readTime,
      url: `/posts/${category}/${slug}.html`,
      rawDate: data.date ? new Date(data.date) : new Date()
    });

    console.log(`  └─ Compiled: posts/${category}/${slug}.html`);
  }

  console.log(`📄 Found ${pageFiles.length} standalone pages to compile.`);

  for (const filePath of pageFiles) {
    const slug = path.basename(filePath, '.md');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = matter(fileContent);
    const htmlContent = marked.parse(content);
    const title = data.title || slug;
    const displayDate = data.date ? formatChineseDate(data.date) : '2026年1月1日';
    const rawDateString = data.date ? new Date(data.date).toISOString().split('T')[0] : '2026-01-01';
    const description = data.description || '';
    const readTime = calculateReadingTime(content);
    const categoryLabel = data.category || 'Pages';

    const compiledPage = postTemplate
      .replace(/{{TITLE}}/g, title)
      .replace(/{{DESCRIPTION}}/g, description)
      .replace(/{{DATE}}/g, displayDate)
      .replace(/{{DATETIME}}/g, rawDateString)
      .replace(/{{READ_TIME}}/g, readTime)
      .replace(/{{CATEGORY}}/g, categoryLabel)
      .replace(/{{CONTENT}}/g, htmlContent);

    const outputSubdir = path.join(DIST_DIR, slug);
    fs.mkdirSync(outputSubdir, { recursive: true });
    fs.writeFileSync(path.join(outputSubdir, 'index.html'), compiledPage, 'utf-8');

    console.log(`  └─ Compiled: ${slug}/index.html`);
  }

  // 5. Generate Home page chronologically (Flat Plain Style)
  // Sort posts by date descending
  posts.sort((a, b) => b.rawDate - a.rawDate);

  // Generate flat definition list — title first, date muted underneath.
  let postsHtml = '<dl class="posts">\n';
  for (const post of posts) {
    postsHtml += `  <dt><a href="${post.url}">${post.title}</a></dt>\n`;
    postsHtml += `  <dd class="date">${post.displayDate}</dd>\n`;
    if (post.description) {
      postsHtml += `  <dd>${post.description}</dd>\n`;
    }
  }
  postsHtml += '</dl>\n';

  // Replace content in index template and write
  const compiledIndex = indexTemplate.replace(/{{POSTS_CONTENT}}/g, postsHtml);
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), compiledIndex, 'utf-8');
  console.log('🏠 Compiled Home page index.html with plain layout.');

  console.log('🎉 Personal blog build completed successfully! Everything generated in dist/.');
}

build();
