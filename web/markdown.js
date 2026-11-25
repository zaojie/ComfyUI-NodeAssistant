import { marked } from "./vendor/marked.mjs";
import createDOMPurify from "./vendor/purify.mjs";

export function renderMarkdown(target, text) {
    const purifier = createDOMPurify(target.ownerDocument.defaultView);
    const fragment = purifier.sanitize(marked.parse(text, { async: false, gfm: true, breaks: true }), {
        ALLOWED_TAGS: ["p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "del",
            "ul", "ol", "li", "blockquote", "pre", "code", "a", "table", "thead", "tbody", "tr", "th", "td"],
        ALLOWED_ATTR: ["href", "title", "start", "align"],
        RETURN_DOM_FRAGMENT: true,
    });
    for (const link of fragment.querySelectorAll("a")) {
        if (!/^(https?:\/\/|mailto:)/i.test(link.getAttribute("href") || "")) link.removeAttribute("href");
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
    }
    target.replaceChildren(fragment);
}
