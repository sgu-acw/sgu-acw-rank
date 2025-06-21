import MarkdownIt from "markdown-it";
import hljs from 'highlight.js';

import katex from 'markdown-it-katex';
import "@/styles/hljs.css"
// import "@/styles/markdown-it.css"


// 初始化 highlight.js 配置（可选）
hljs.configure({
    classPrefix: 'hljs-',  // 类前缀
    languages: ['javascript', 'typescript', 'html', 'css', 'python', 'java', 'cpp'], // 预加载的语言
});

export const extractTitleAndContent = (markdown: string) => {
    const lines = markdown.split("\n");
    let title = "";
    let markdownContent = markdown;

    // 更健壮的标题提取，支持多级标题
    if (lines.length > 0 && lines[0].startsWith("#")) {
        title = lines[0].replace(/^#+\s*/, '').trim();
        markdownContent = lines.slice(1).join("\n");
    }

    return { title, markdown: markdownContent };
};

export const renderMarkdown = (markdown: string) => {
    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
        highlight: function (str, lang) {
            // 当前时间加随机数生成唯一的id标识
            const codeIndex = Date.now() + Math.floor(Math.random() * 10000000)
            // 复制功能主要使用的是 clipboard.js
            // let html = `<button class="copy-btn" type="button" data-clipboard-action="copy" data-clipboard-target="#copy${codeIndex}">复制</button>`
            let html = ``
            const linesLength = str.split(/\n/).length - 1
            // 生成行号
            let linesNum = '<span aria-hidden="true" class="line-numbers-rows">'
            for (let index = 0; index < linesLength; index++) {
                linesNum = linesNum + '<span></span>'
            }
            linesNum += '</span>'
            if (lang && hljs.getLanguage(lang)) {
                try {
                    // highlight.js 高亮代码
                    const preCode = hljs.highlight(lang, str, true).value
                    html = html + preCode
                    if (linesLength) {
                        html += '<b class="name">' + lang + '</b>'
                    }
                    // 将代码包裹在 textarea 中，由于防止textarea渲染出现问题，这里将 "<" 用 "&lt;" 代替，不影响复制功能
                    return `<pre class="hljs"><code>${html}</code>${linesNum}</pre><textarea style="position: absolute;top: -9999px;left: -9999px;z-index: -9999;" id="copy${codeIndex}">${str.replace(/<\/textarea>/g, '&lt;/textarea>')}</textarea>`
                } catch (error) {
                    console.log(error)
                }
            }

            const preCode = md.utils.escapeHtml(str)
            html = html + preCode
            return `<pre class="hljs"><code>${html}</code>${linesNum}</pre><textarea style="position: absolute;top: -9999px;left: -9999px;z-index: -9999;" id="copy${codeIndex}">${str.replace(/<\/textarea>/g, '&lt;/textarea>')}</textarea>`
        }


        // 移除内置的 highlight 函数，因为 markdown-it-highlightjs 会处理
    })
        .use(katex)
    // .use(markdownItHighlightjs, {
    //     hljs,
    //     auto: true,    // 自动检测语言
    //     code: true     // 对代码块高亮
    // });

    return md.render(markdown);
};