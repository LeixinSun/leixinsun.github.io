# xlsota 个人博客

这是一个基于极简主义、专注于纯粹内容与极致阅读体验的静态个人博客网站。风格参考了 **Andrej Karpathy's Blog**，并升级了响应式设计和优雅的亮色/暗色主题。

## 目录层次与文章存放结构

为了保证文章存放的目录结构清晰，博客内容存放在 `content/posts/` 目录下，并以**类别文件夹**进行划分：

```
content/posts/
├── tech/             # 技术、深度学习与开发思考
│   └── neural-networks-from-scratch.md
├── thoughts/         # 个人洞察、极简主义与杂谈
│   └── on-minimalism.md
└── life/             # 读书笔记、旅行和日常生活
    └── reading-list-2026.md
```

## 编写一篇新文章

1. 在 `content/posts/[category]/` 目录下创建一个新的 `.md` 文件（如 `my-new-post.md`）。
2. 在文件头部添加 Markdown Front-matter 元数据：

```markdown
---
title: 我的新文章标题
date: 2026-05-23
category: tech
description: 这是一个简短的文章描述，会被自动编译为页面的 SEO meta 描述。
---

这里是您的文章正文内容，支持标准的 Markdown 语法（包括标题、加粗、引用、列表、代码块等）。
```

## 常用命令

项目依赖已配置，您可以使用以下命令：

### 1. 编译网站
当您新增或修改文章后，运行此命令将 Markdown 文件重新编译为超轻量的静态 HTML 文件：
```bash
npm run build
```
编译结果会自动输出至 `dist/` 文件夹下，保持与源文件一模一样的类目层级。

### 2. 本地预览
启动本地轻量级静态服务器预览生成的网站：
```bash
npm start
```
启动后在浏览器中打开 `http://localhost:3000` (或控制台输出的对应端口) 即可进行实时浏览。

## 自定义扩展

* **页面样式与色彩系统**：在 `public/css/style.css` 中，您可以通过修改开头的 `:root` HSL 颜色变量，轻松调整网站的配色风格。
* **添加自定义分类**：您可以在 `build.js` 的 `CATEGORY_MAP` 字典中添加您的分类 ID 与对应的展示名称，编译引擎将自动按您的自定义类名对首页文章进行归档分组。
