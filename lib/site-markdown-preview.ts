const CODE_FOLD_LINE_THRESHOLD = 24;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Group consecutive images into 2-column rows (same as hugo-cfBlog / sakura site). */
const initPreviewImageRows = (body: HTMLElement) => {
  const isImageOnlyElement = (el: Element) => {
    if (el.tagName === "IMG") return true;
    if (el.tagName !== "P") return false;
    const children = [...el.childNodes];
    return (
      children.some(
        (node) => node.nodeType === 1 && (node as Element).tagName === "IMG",
      ) &&
      children.every((node) => {
        if (node.nodeType === 3) return (node.textContent ?? "").trim() === "";
        if (node.nodeType === 1) {
          const tag = (node as Element).tagName;
          return tag === "IMG" || tag === "BR";
        }
        return false;
      })
    );
  };

  const getImagesFromElement = (el: Element): HTMLImageElement[] =>
    el.tagName === "IMG"
      ? [el as HTMLImageElement]
      : [...el.querySelectorAll<HTMLImageElement>(":scope > img")];

  const buildImageRows = (imgs: HTMLImageElement[]) => {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < imgs.length; i += 2) {
      const row = document.createElement("div");
      row.className = "post-image-row";
      const pair = imgs.slice(i, i + 2);
      if (pair.length === 1) row.classList.add("post-image-row--single");
      pair.forEach((img) => {
        const item = document.createElement("div");
        item.className = "post-image-row__item";
        item.appendChild(img);
        row.appendChild(item);
      });
      fragment.appendChild(row);
    }
    return fragment;
  };

  const findConsecutiveImgRuns = (parent: Element) => {
    const runs: HTMLImageElement[][] = [];
    let current: HTMLImageElement[] = [];
    for (const node of parent.childNodes) {
      if (node.nodeType === 1 && (node as Element).tagName === "IMG") {
        current.push(node as HTMLImageElement);
      } else if (
        current.length > 0 &&
        ((node.nodeType === 3 && (node.textContent ?? "").trim() === "") ||
          (node.nodeType === 1 && (node as Element).tagName === "BR"))
      ) {
        continue;
      } else {
        if (current.length >= 2) runs.push([...current]);
        current = [];
      }
    }
    if (current.length >= 2) runs.push(current);
    return runs;
  };

  const hasMeaningfulContentBesides = (
    parent: Element,
    excludeNodes: Node[],
  ) =>
    [...parent.childNodes].some((node) => {
      if (excludeNodes.includes(node)) return false;
      if (node.nodeType === 3) return (node.textContent ?? "").trim() !== "";
      if (node.nodeType === 1) return (node as Element).tagName !== "BR";
      return true;
    });

  const wrapImgRun = (paragraph: Element, imgs: HTMLImageElement[]) => {
    const wrapper = document.createElement("div");
    wrapper.className = "post-image-group";
    wrapper.appendChild(buildImageRows(imgs));
    if (hasMeaningfulContentBesides(paragraph, imgs)) {
      paragraph.insertAdjacentElement("afterend", wrapper);
    } else {
      paragraph.replaceWith(wrapper);
    }
  };

  body.querySelectorAll("p").forEach((paragraph) => {
    if (paragraph.closest(".post-image-group")) return;
    findConsecutiveImgRuns(paragraph)
      .reverse()
      .forEach((imgs) => wrapImgRun(paragraph, imgs));
  });

  const wrapImages = (
    imgs: HTMLImageElement[],
    insertBefore: Element,
    removeNodes: Element[] = [],
  ) => {
    if (imgs.length < 2) return;
    const wrapper = document.createElement("div");
    wrapper.className = "post-image-group";
    wrapper.appendChild(buildImageRows(imgs));
    insertBefore.parentNode?.insertBefore(wrapper, insertBefore);
    removeNodes.forEach((node) => node.remove());
  };

  const flushBatch = (batch: Element[]) => {
    if (!batch.length) return;
    const imgs = batch.flatMap(getImagesFromElement);
    if (imgs.length < 2) return;
    wrapImages(imgs, batch[0], batch);
  };

  const batchContainers = [body, ...body.querySelectorAll("li, blockquote")];
  batchContainers.forEach((container) => {
    let batch: Element[] = [];
    [...container.children].forEach((node) => {
      if (
        node.nodeType === 1 &&
        isImageOnlyElement(node) &&
        getImagesFromElement(node).length === 1
      ) {
        batch.push(node);
        return;
      }
      flushBatch(batch);
      batch = [];
    });
    flushBatch(batch);
  });

  // Remove empty leftovers that create large vertical gaps around image groups.
  const isInsignificantNode = (node: Node) => {
    if (node.nodeType === 3) {
      return (node.textContent ?? "").replace(/\u00a0/g, " ").trim() === "";
    }
    if (node.nodeType === 1) {
      const el = node as Element;
      const tag = el.tagName;
      if (tag === "BR" || tag === "WBR") return true;
      // marked sometimes leaves empty inline wrappers
      if (
        (tag === "SPAN" || tag === "FONT") &&
        (el.textContent ?? "").replace(/\u00a0/g, " ").trim() === "" &&
        !el.querySelector("img, video, svg, picture")
      ) {
        return true;
      }
    }
    return false;
  };

  const trimParagraphEdges = (paragraph: Element) => {
    while (paragraph.firstChild && isInsignificantNode(paragraph.firstChild)) {
      paragraph.removeChild(paragraph.firstChild);
    }
    while (paragraph.lastChild && isInsignificantNode(paragraph.lastChild)) {
      paragraph.removeChild(paragraph.lastChild);
    }
    // Collapse consecutive mid-paragraph <br> runs longer than one (from soft breaks).
    const nodes = [...paragraph.childNodes];
    let brRun = 0;
    for (const node of nodes) {
      if (node.nodeType === 1 && (node as Element).tagName === "BR") {
        brRun += 1;
        if (brRun > 1) node.parentNode?.removeChild(node);
      } else if (node.nodeType === 3 && (node.textContent ?? "").trim() === "") {
        continue;
      } else {
        brRun = 0;
      }
    }
  };

  body.querySelectorAll("p").forEach((paragraph) => {
    if (paragraph.closest(".post-image-group")) return;
    trimParagraphEdges(paragraph);
    const meaningful = [...paragraph.childNodes].some(
      (node) => !isInsignificantNode(node),
    );
    if (!meaningful) paragraph.remove();
  });
};

/** Post-process marked HTML to match hugo-blog-aiovtue sakura markdown structure. */
const enhanceSiteMarkdownHtml = (html: string): string => {
  if (!html || typeof document === "undefined") return html;

  const container = document.createElement("div");
  container.innerHTML = html;

  container.querySelectorAll("table").forEach((table) => {
    if (table.closest(".sakura-table-wrap")) return;
    const wrap = document.createElement("div");
    wrap.className = "sakura-table-wrap";
    table.parentNode?.insertBefore(wrap, table);
    wrap.appendChild(table);
  });

  container.querySelectorAll("pre > code").forEach((codeEl) => {
    const pre = codeEl.parentElement;
    if (!pre || pre.parentElement?.className.includes("language-")) return;

    const className = codeEl.className || "";
    const langMatch = className.match(/language-([\w+-]+)/i);
    const lang = (langMatch?.[1] || "text").replace(/[^\w+-]/g, "") || "text";
    const codeText = codeEl.textContent ?? "";
    const lineCount = codeText ? codeText.split("\n").length : 0;
    const fold = lineCount > CODE_FOLD_LINE_THRESHOLD;

    const block = document.createElement("div");
    block.className = `language-${lang}${fold ? " max-h-360px code-foldable folded" : ""}`;
    block.dataset.lineCount = String(lineCount);

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "copy";
    copyBtn.title = "复制代码";
    copyBtn.setAttribute("aria-label", "复制代码");

    const langSpan = document.createElement("span");
    langSpan.className = "lang";
    langSpan.textContent = lang;

    const newPre = document.createElement("pre");
    const newCode = document.createElement("code");
    newCode.className = `language-${lang}`;
    newCode.innerHTML = escapeHtml(codeText.replace(/\n$/, ""));
    newPre.appendChild(newCode);

    const unfoldBtn = document.createElement("button");
    unfoldBtn.type = "button";
    unfoldBtn.className = "code-block-unfold-btn";
    unfoldBtn.setAttribute("aria-label", "展开代码");
    if (!fold) unfoldBtn.hidden = true;

    block.append(copyBtn, langSpan, newPre, unfoldBtn);
    pre.replaceWith(block);
  });

  container.querySelectorAll("img").forEach((img) => {
    if (!img.getAttribute("loading")) img.setAttribute("loading", "lazy");
  });

  initPreviewImageRows(container);

  return container.innerHTML;
};

const bindSitePreviewInteractions = (root: HTMLElement) => {
  const onClick = async (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const copyBtn = target.closest("button.copy");
    if (copyBtn instanceof HTMLButtonElement) {
      const block = copyBtn.closest('div[class*="language-"]');
      const code = block?.querySelector("code")?.textContent ?? "";
      try {
        await navigator.clipboard.writeText(code);
        copyBtn.classList.add("copied");
        window.setTimeout(() => copyBtn.classList.remove("copied"), 1200);
      } catch {
        /* ignore */
      }
      return;
    }

    const unfoldBtn = target.closest("button.code-block-unfold-btn");
    if (unfoldBtn instanceof HTMLButtonElement) {
      const block = unfoldBtn.closest('div[class*="language-"]');
      if (!block) return;
      const expanded = unfoldBtn.classList.toggle("is-expanded");
      block.classList.toggle("folded", !expanded);
      block.classList.toggle("max-h-360px", !expanded);
    }
  };

  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
};

export { bindSitePreviewInteractions, enhanceSiteMarkdownHtml };
