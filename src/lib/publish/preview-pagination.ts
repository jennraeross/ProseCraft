const PT_TO_PX = 4 / 3;

type PageMetrics = {
  width: number;
  height: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  pageNumbers: boolean;
  runningHeader: string;
};

type PageState = {
  element: HTMLElement;
  content: HTMLElement;
};

type TextNodeInfo = {
  node: Text;
  start: number;
  end: number;
};

function numberFromDataset(body: HTMLElement, key: string, fallback: number): number {
  const value = Number(body.dataset[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readMetrics(doc: Document): PageMetrics {
  const body = doc.body;
  return {
    width: numberFromDataset(body, "pageWidthPt", 432) * PT_TO_PX,
    height: numberFromDataset(body, "pageHeightPt", 648) * PT_TO_PX,
    marginTop: numberFromDataset(body, "pageMarginTopPt", 54) * PT_TO_PX,
    marginRight: numberFromDataset(body, "pageMarginRightPt", 54) * PT_TO_PX,
    marginBottom: numberFromDataset(body, "pageMarginBottomPt", 54) * PT_TO_PX,
    marginLeft: numberFromDataset(body, "pageMarginLeftPt", 54) * PT_TO_PX,
    pageNumbers: body.dataset.pageNumbers === "true",
    runningHeader: body.dataset.runningHeader ?? ""
  };
}

function isOverflowing(element: HTMLElement): boolean {
  return element.scrollHeight > element.clientHeight + 1;
}

function collectTextNodes(root: HTMLElement, doc: Document): { nodes: TextNodeInfo[]; length: number } {
  const walker = doc.createTreeWalker(root, 4);
  const nodes: TextNodeInfo[] = [];
  let length = 0;
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    const size = text.data.length;
    nodes.push({ node: text, start: length, end: length + size });
    length += size;
    current = walker.nextNode();
  }
  return { nodes, length };
}

function locateTextPoint(nodes: TextNodeInfo[], offset: number): { node: Text; offset: number } | null {
  if (nodes.length === 0) return null;
  if (offset <= 0) return { node: nodes[0].node, offset: 0 };
  for (const info of nodes) {
    if (offset <= info.end) return { node: info.node, offset: offset - info.start };
  }
  const last = nodes[nodes.length - 1];
  return { node: last.node, offset: last.node.data.length };
}

function isSplittableBlock(block: HTMLElement): boolean {
  return block.tagName === "P" || block.tagName === "DIV";
}

class PreviewPaginator {
  private doc: Document;
  private pages: HTMLElement;
  private metrics: PageMetrics;
  private pageNumber = 0;
  private page: PageState | null = null;
  private chapter: HTMLElement | null = null;
  private scene: HTMLElement | null = null;
  private chapterClass = "chapter";
  private sceneClass = "scene";
  private sceneStarted = false;

  constructor(doc: Document, pages: HTMLElement, metrics: PageMetrics) {
    this.doc = doc;
    this.pages = pages;
    this.metrics = metrics;
  }

  addFrontMatter(node: HTMLElement): void {
    if (!this.page || this.page.content.childNodes.length > 0) {
      this.startPage("front");
    }
    this.page!.content.append(node.cloneNode(true));
  }

  addChapter(chapter: HTMLElement): void {
    this.chapterClass = chapter.className || "chapter";
    this.startPage("body");
    const children = Array.from(chapter.children) as HTMLElement[];
    for (const child of children) {
      if (child.classList.contains("chapter-title")) {
        this.ensureChapter().append(child.cloneNode(true));
      } else if (child.classList.contains("scene")) {
        this.addScene(child);
      } else if (child.classList.contains("scene-break")) {
        this.addSceneBreak(child);
      } else {
        this.addChapterBlock(child);
      }
    }
  }

  private startPage(kind: "front" | "body"): void {
    this.pageNumber += 1;
    const page = this.doc.createElement("article");
    page.className = `page ${kind === "body" ? "body-page" : "front-matter-page"}`;

    if (kind === "body" && this.metrics.runningHeader) {
      const header = this.doc.createElement("div");
      header.className = "page-header";
      header.textContent = this.metrics.runningHeader;
      page.append(header);
    }

    const content = this.doc.createElement("div");
    content.className = "page-content";
    page.append(content);

    if (kind === "body" && this.metrics.pageNumbers) {
      const footer = this.doc.createElement("div");
      footer.className = "page-footer";
      footer.textContent = String(this.pageNumber);
      page.append(footer);
    }

    this.pages.append(page);
    this.page = { element: page, content };
    this.chapter = null;
    this.scene = null;
  }

  private ensureChapter(): HTMLElement {
    if (!this.page) throw new Error("Preview page was not created.");
    if (!this.chapter) {
      const chapter = this.doc.createElement("section");
      chapter.className = this.chapterClass;
      this.page.content.append(chapter);
      this.chapter = chapter;
    }
    return this.chapter;
  }

  private ensureScene(continuation: boolean): HTMLElement {
    if (!this.scene) {
      const scene = this.doc.createElement("section");
      const classes = this.sceneClass.split(/\s+/).filter(Boolean);
      if (continuation && !classes.includes("continuation")) classes.push("continuation");
      scene.className = classes.join(" ");
      this.ensureChapter().append(scene);
      this.scene = scene;
    }
    return this.scene;
  }

  private addScene(scene: HTMLElement): void {
    this.sceneClass = scene.className || "scene";
    this.sceneStarted = false;
    this.scene = null;
    const children = Array.from(scene.children) as HTMLElement[];
    for (const block of children) {
      this.addSceneBlock(block);
    }
    this.scene = null;
  }

  private addSceneBlock(block: HTMLElement): void {
    let target = this.ensureScene(this.sceneStarted);
    let clone = block.cloneNode(true) as HTMLElement;
    target.append(clone);

    if (!this.isPageOverflowing()) {
      this.sceneStarted = true;
      return;
    }

    target.removeChild(clone);
    if (target.childNodes.length === 0) {
      target.remove();
      this.scene = null;
    }

    this.startPage("body");
    this.ensureChapter();
    target = this.ensureScene(this.sceneStarted);
    clone = block.cloneNode(true) as HTMLElement;
    target.append(clone);

    if (!this.isPageOverflowing()) {
      this.sceneStarted = true;
      return;
    }

    target.removeChild(clone);
    this.splitBlock(block);
  }

  private addSceneBreak(block: HTMLElement): void {
    this.scene = null;
    this.sceneStarted = false;
    let chapter = this.ensureChapter();
    let clone = block.cloneNode(true) as HTMLElement;
    chapter.append(clone);

    if (!this.isPageOverflowing()) return;

    chapter.removeChild(clone);
    this.startPage("body");
    chapter = this.ensureChapter();
    clone = block.cloneNode(true) as HTMLElement;
    chapter.append(clone);
  }

  private addChapterBlock(block: HTMLElement): void {
    this.scene = null;
    this.sceneStarted = false;
    let chapter = this.ensureChapter();
    let clone = block.cloneNode(true) as HTMLElement;
    chapter.append(clone);

    if (!this.isPageOverflowing()) return;

    chapter.removeChild(clone);
    this.startPage("body");
    chapter = this.ensureChapter();
    clone = block.cloneNode(true) as HTMLElement;
    chapter.append(clone);
  }

  private splitBlock(block: HTMLElement): void {
    if (block.querySelector("img") || block.tagName === "IMG") {
      this.ensureScene(true).append(block.cloneNode(true));
      this.sceneStarted = true;
      return;
    }
    if (!isSplittableBlock(block)) {
      this.ensureScene(true).append(block.cloneNode(true));
      this.sceneStarted = true;
      return;
    }

    const full = block.cloneNode(true) as HTMLElement;
    const { nodes, length } = collectTextNodes(full, this.doc);
    if (nodes.length === 0 || length === 0) {
      this.ensureScene(true).append(full);
      this.sceneStarted = true;
      return;
    }

    let available = this.availableHeight();
    let guard = 0;
    while (available <= 2 && guard < 20) {
      this.startPage("body");
      this.ensureChapter();
      this.ensureScene(this.sceneStarted);
      available = this.availableHeight();
      guard += 1;
    }

    if (available <= 2) {
      this.ensureScene(true).append(full);
      this.sceneStarted = true;
      return;
    }

    const splitOffset = this.findSplitOffset(full, nodes, length, available);
    if (splitOffset <= 0) {
      this.ensureScene(true).append(full);
      this.sceneStarted = true;
      return;
    }

    const splitPoint = locateTextPoint(nodes, splitOffset);
    const tailFragment = this.doc.createDocumentFragment();
    if (splitPoint) {
      const tailRange = this.doc.createRange();
      tailRange.selectNodeContents(full);
      tailRange.setStart(splitPoint.node, splitPoint.offset);
      tailFragment.append(tailRange.extractContents());
    }

    this.ensureScene(this.sceneStarted).append(full);
    this.sceneStarted = true;

    if (!tailFragment.hasChildNodes()) return;

    const tail = block.cloneNode(false) as HTMLElement;
    tail.classList.remove("drop-cap");
    tail.classList.add("continuation");
    tail.append(tailFragment);

    this.startPage("body");
    this.ensureChapter();
    this.ensureScene(true).append(tail);

    if (this.isPageOverflowing()) {
      tail.remove();
      this.splitBlock(tail);
    }
  }

  private findSplitOffset(
    full: HTMLElement,
    nodes: TextNodeInfo[],
    length: number,
    available: number
  ): number {
    const probe = full.cloneNode(true) as HTMLElement;
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.left = "0";
    probe.style.right = "0";
    probe.style.pointerEvents = "none";
    this.ensureScene(this.sceneStarted).append(probe);

    const view = this.doc.defaultView;
    const style = view?.getComputedStyle(probe);
    const margins = style
      ? (Number.parseFloat(style.marginTop) || 0) + (Number.parseFloat(style.marginBottom) || 0)
      : 0;

    const measure = (offset: number): number => {
      const point = locateTextPoint(nodes, offset);
      const range = this.doc.createRange();
      range.selectNodeContents(full);
      if (point && offset < length) range.setEnd(point.node, point.offset);
      probe.replaceChildren(range.cloneContents());
      return probe.getBoundingClientRect().height + margins;
    };

    let low = 0;
    let high = length;
    let best = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (measure(mid) <= available) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    probe.remove();

    if (best <= 0) return 0;

    let split = best;
    if (split < length) {
      const text = nodes.map((info) => info.node.data).join("");
      const space = text.lastIndexOf(" ", split);
      if (space > 0) split = space + 1;
    }
    return split;
  }

  private availableHeight(): number {
    if (!this.page) return 0;
    return Math.max(0, this.page.content.clientHeight - this.page.content.scrollHeight);
  }

  private isPageOverflowing(): boolean {
    return this.page ? isOverflowing(this.page.content) : false;
  }
}

export function paginatePreview(doc: Document): void {
  if (doc.body.dataset.paginated !== "true") return;
  const source = doc.getElementById("preview-source");
  const pages = doc.getElementById("preview-pages");
  if (!source || !pages) return;

  const metrics = readMetrics(doc);
  pages.replaceChildren();
  const paginator = new PreviewPaginator(doc, pages, metrics);

  for (const child of Array.from(source.children) as HTMLElement[]) {
    if (
      child.classList.contains("title-page")
      || child.classList.contains("dedication")
      || child.classList.contains("copyright-page")
    ) {
      paginator.addFrontMatter(child);
    } else if (child.classList.contains("matter-page") || child.classList.contains("toc-page")) {
      if (child.classList.contains("matter-page") && child.children.length === 0) {
        paginator.addFrontMatter(child);
      } else {
        child.classList.add("chapter");
        paginator.addChapter(child);
      }
    } else if (child.classList.contains("chapter")) {
      paginator.addChapter(child);
    }
  }

  source.remove();
}

export function fitPreviewFrame(frame: HTMLIFrameElement): void {
  const doc = frame.contentDocument;
  if (!doc?.body) return;

  const widthPt = Number(doc.body.dataset.pageWidthPt);
  const heightPt = Number(doc.body.dataset.pageHeightPt);
  if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt) || widthPt <= 0 || heightPt <= 0) {
    return;
  }

  const pageWidth = widthPt * PT_TO_PX;
  const pageHeight = heightPt * PT_TO_PX;
  const availableWidth = Math.max(1, frame.clientWidth - 32);
  const availableHeight = Math.max(1, frame.clientHeight - 32);
  const paginated = doc.body.dataset.paginated === "true";
  const scale = paginated
    ? Math.min(1, availableWidth / pageWidth, availableHeight / pageHeight)
    : Math.min(1, availableWidth / pageWidth);
  doc.documentElement.style.setProperty("--preview-scale", scale.toFixed(4));
}
