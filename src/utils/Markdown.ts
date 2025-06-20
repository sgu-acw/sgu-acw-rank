import MarkdownIt from "markdown-it";

export const extractTitleAndContent = (markdown: string) => {
    //  这里一个简单的提取标题的方式，可以根据你的实际情况修改
    const lines = markdown.split("\n");
    let title = "";
    let markdownContent = markdown;
    if (lines.length > 0 && lines[0].startsWith("# ")) {
        title = lines[0].slice(2).trim();
        markdownContent = lines.slice(1).join("\n");
    }
    return { title, markdown: markdownContent };
};

export const renderMarkdown = (markdown: string) => {
    const md = new MarkdownIt();
    return md.render(markdown);
};