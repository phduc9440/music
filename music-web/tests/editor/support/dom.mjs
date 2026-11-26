/**
 * DOM XML tối giản cho test Node (không thêm thư viện): đủ cho ScoreDocument và các lệnh sửa của Editor.
 * Hỗ trợ DOMParser (application/xml), XMLSerializer, Element/Text/Comment, querySelector với bộ chọn đơn giản
 * (thẻ, *, [attr], [attr="v"], :scope, tổ hợp con ">" và hậu duệ " ", danh sách ",").
 */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const PI_NODE = 7;
const COMMENT_NODE = 8;
const DOCUMENT_NODE = 9;

class Node {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
  }
  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === ELEMENT_NODE ? this.parentNode : null;
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }
  get nextSibling() {
    if (!this.parentNode) return null;
    const list = this.parentNode.childNodes;
    return list[list.indexOf(this) + 1] ?? null;
  }
  get previousSibling() {
    if (!this.parentNode) return null;
    const list = this.parentNode.childNodes;
    return list[list.indexOf(this) - 1] ?? null;
  }
  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n.nodeType === DOCUMENT_NODE;
  }
  contains(other) {
    for (let n = other; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  appendChild(child) {
    return this.insertBefore(child, null);
  }
  insertBefore(child, ref) {
    if (child.nodeType === 11) {
      for (const c of [...child.childNodes]) this.insertBefore(c, ref);
      return child;
    }
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = ref ? this.childNodes.indexOf(ref) : -1;
    if (index < 0) this.childNodes.push(child);
    else this.childNodes.splice(index, 0, child);
    child.parentNode = this;
    adopt(child, this.ownerDocument ?? this);
    return child;
  }
  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index < 0) throw new Error('NotFoundError: node is not a child');
    this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }
  replaceChild(next, old) {
    this.insertBefore(next, old);
    this.removeChild(old);
    return old;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  before(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    for (const n of nodes) parent.insertBefore(toNode(this, n), this);
  }
  after(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    let ref = this.nextSibling;
    for (const n of nodes) parent.insertBefore(toNode(this, n), ref);
  }
  replaceWith(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    const ref = this.nextSibling;
    parent.removeChild(this);
    for (const n of nodes) parent.insertBefore(toNode(parent, n), ref);
  }
  get textContent() {
    return this.childNodes
      .map((c) => (c.nodeType === COMMENT_NODE || c.nodeType === PI_NODE ? '' : c.textContent))
      .join('');
  }
  set textContent(value) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    if (value !== null && value !== undefined && value !== '')
      this.appendChild(new Text(this.ownerDocument, String(value)));
  }
}

const toNode = (ctx, n) => (typeof n === 'string' ? new Text(ctx.ownerDocument ?? ctx, n) : n);

const adopt = (node, doc) => {
  node.ownerDocument = doc;
  for (const c of node.childNodes) adopt(c, doc);
};

class Text extends Node {
  constructor(doc, data) {
    super(doc);
    this.data = data;
  }
  get nodeType() {
    return TEXT_NODE;
  }
  get nodeName() {
    return '#text';
  }
  get textContent() {
    return this.data;
  }
  set textContent(v) {
    this.data = String(v);
  }
  get nodeValue() {
    return this.data;
  }
  cloneNode() {
    return new Text(this.ownerDocument, this.data);
  }
}

class Comment extends Text {
  get nodeType() {
    return COMMENT_NODE;
  }
  get nodeName() {
    return '#comment';
  }
  cloneNode() {
    return new Comment(this.ownerDocument, this.data);
  }
}

class ProcessingInstruction extends Text {
  constructor(doc, target, data) {
    super(doc, data);
    this.target = target;
  }
  get nodeType() {
    return PI_NODE;
  }
  get nodeName() {
    return this.target;
  }
  cloneNode() {
    return new ProcessingInstruction(this.ownerDocument, this.target, this.data);
  }
}

class Element extends Node {
  constructor(doc, tagName) {
    super(doc);
    this.tagName = tagName;
    this._attrs = new Map();
  }
  get nodeType() {
    return ELEMENT_NODE;
  }
  get nodeName() {
    return this.tagName;
  }
  get localName() {
    return this.tagName.includes(':') ? this.tagName.split(':')[1] : this.tagName;
  }
  get attributes() {
    return [...this._attrs].map(([name, value]) => ({ name, value, localName: name, nodeValue: value }));
  }
  getAttribute(name) {
    return this._attrs.has(name) ? this._attrs.get(name) : null;
  }
  setAttribute(name, value) {
    this._attrs.set(name, String(value));
  }
  removeAttribute(name) {
    this._attrs.delete(name);
  }
  hasAttribute(name) {
    return this._attrs.has(name);
  }
  getAttributeNames() {
    return [...this._attrs.keys()];
  }
  get children() {
    return this.childNodes.filter((c) => c.nodeType === ELEMENT_NODE);
  }
  get childElementCount() {
    return this.children.length;
  }
  get firstElementChild() {
    return this.children[0] ?? null;
  }
  get lastElementChild() {
    const list = this.children;
    return list[list.length - 1] ?? null;
  }
  get nextElementSibling() {
    for (let n = this.nextSibling; n; n = n.nextSibling) if (n.nodeType === ELEMENT_NODE) return n;
    return null;
  }
  get previousElementSibling() {
    for (let n = this.previousSibling; n; n = n.previousSibling) if (n.nodeType === ELEMENT_NODE) return n;
    return null;
  }
  append(...nodes) {
    for (const n of nodes) this.appendChild(toNode(this, n));
  }
  replaceChildren(...nodes) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    for (const n of nodes) this.appendChild(toNode(this, n));
  }
  prepend(...nodes) {
    const ref = this.firstChild;
    for (const n of nodes) this.insertBefore(toNode(this, n), ref);
  }
  cloneNode(deep = false) {
    const copy = new Element(this.ownerDocument, this.tagName);
    for (const [k, v] of this._attrs) copy._attrs.set(k, v);
    if (deep) for (const c of this.childNodes) copy.appendChild(c.cloneNode(true));
    return copy;
  }
  getElementsByTagName(tag) {
    return descendants(this).filter((e) => tag === '*' || e.tagName === tag);
  }
  querySelectorAll(selector) {
    const groups = parseSelector(selector);
    return descendants(this).filter((e) => groups.some((g) => matchChain(e, g, g.length - 1, this)));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  matches(selector) {
    return parseSelector(selector).some((g) => matchChain(this, g, g.length - 1, null));
  }
  closest(selector) {
    for (let n = this; n && n.nodeType === ELEMENT_NODE; n = n.parentNode) if (n.matches(selector)) return n;
    return null;
  }
}

const descendants = (root) => {
  const out = [];
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === ELEMENT_NODE) {
        out.push(c);
        walk(c);
      }
    }
  };
  walk(root);
  return out;
};

// ------------------------------------------------------------------ bộ chọn

const selectorCache = new Map();

/** Trả về danh sách nhóm; mỗi nhóm là mảng bước { compound, combinator } từ trái sang phải. */
function parseSelector(selector) {
  const cached = selectorCache.get(selector);
  if (cached) return cached;
  const groups = splitTop(selector, ',').map((part) => {
    const steps = [];
    const re = /\s*(>)?\s*((?:[^\s>[]|\[[^\]]*\])+)/g;
    let m;
    while ((m = re.exec(part.trim())) !== null) {
      if (!m[2]) break;
      steps.push({ combinator: steps.length === 0 ? null : m[1] ? '>' : ' ', compound: parseCompound(m[2]) });
    }
    return steps;
  });
  selectorCache.set(selector, groups);
  return groups;
}

function splitTop(text, sep) {
  const out = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '[') depth++;
    else if (c === ']') depth--;
    else if (c === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

function parseCompound(text) {
  const out = { tag: null, scope: false, attrs: [] };
  const re =
    /(:scope)|\[\s*([^\]=\s~|^$*]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*)))?\s*\]|(\*|[A-Za-z_][\w:.-]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) out.scope = true;
    else if (m[2]) out.attrs.push({ name: m[2], value: m[3] ?? m[4] ?? m[5] ?? null });
    else if (m[6]) out.tag = m[6] === '*' ? null : m[6];
  }
  return out;
}

function matchCompound(el, c, scope) {
  if (c.scope && el !== scope) return false;
  if (c.tag && el.tagName !== c.tag) return false;
  for (const a of c.attrs) {
    if (!el.hasAttribute(a.name)) return false;
    if (a.value !== null && el.getAttribute(a.name) !== a.value) return false;
  }
  return true;
}

function matchChain(el, steps, index, scope) {
  if (!el || el.nodeType !== ELEMENT_NODE) return false;
  if (!matchCompound(el, steps[index].compound, scope)) return false;
  if (index === 0) return true;
  const combinator = steps[index].combinator;
  if (combinator === '>') return matchChain(el.parentNode, steps, index - 1, scope);
  for (let p = el.parentNode; p && p.nodeType === ELEMENT_NODE; p = p.parentNode) {
    if (matchChain(p, steps, index - 1, scope)) return true;
  }
  return false;
}

// ------------------------------------------------------------------ document

class Document extends Node {
  constructor() {
    super(null);
  }
  get nodeType() {
    return DOCUMENT_NODE;
  }
  get nodeName() {
    return '#document';
  }
  get documentElement() {
    return this.childNodes.find((c) => c.nodeType === ELEMENT_NODE) ?? null;
  }
  get children() {
    return this.childNodes.filter((c) => c.nodeType === ELEMENT_NODE);
  }
  createElement(tag) {
    return new Element(this, tag);
  }
  createElementNS(_ns, tag) {
    return new Element(this, tag);
  }
  createTextNode(text) {
    return new Text(this, text);
  }
  createComment(text) {
    return new Comment(this, text);
  }
  createDocumentFragment() {
    const frag = new Element(this, '#fragment');
    Object.defineProperty(frag, 'nodeType', { value: 11 });
    return frag;
  }
  importNode(node, deep = false) {
    const copy = node.cloneNode(deep);
    adopt(copy, this);
    return copy;
  }
  getElementsByTagName(tag) {
    return descendants(this).filter((e) => tag === '*' || e.tagName === tag);
  }
  querySelectorAll(selector) {
    return this.documentElement
      ? [this.documentElement, ...this.documentElement.querySelectorAll(selector)].filter((e) => e.matches(selector))
      : [];
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

// ------------------------------------------------------------------ parser

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decode = (s) =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (all, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    if (e in ENTITIES) return ENTITIES[e];
    throw new Error(`undefined entity ${all}`);
  });

function parseXml(xml) {
  const doc = new Document();
  const stack = [doc];
  let i = 0;
  const top = () => stack[stack.length - 1];
  while (i < xml.length) {
    if (xml[i] !== '<') {
      const end = xml.indexOf('<', i);
      const raw = xml.slice(i, end < 0 ? xml.length : end);
      if (stack.length > 1) top().appendChild(new Text(doc, decode(raw)));
      else if (raw.trim()) throw new Error('text outside root');
      i = end < 0 ? xml.length : end;
      continue;
    }
    if (xml.startsWith('<?', i)) {
      const end = xml.indexOf('?>', i);
      if (end < 0) throw new Error('unterminated PI');
      const body = xml.slice(i + 2, end);
      const target = body.split(/\s/)[0];
      if (target !== 'xml') top().appendChild(new ProcessingInstruction(doc, target, body.slice(target.length).trim()));
      i = end + 2;
    } else if (xml.startsWith('<!--', i)) {
      const end = xml.indexOf('-->', i);
      if (end < 0) throw new Error('unterminated comment');
      top().appendChild(new Comment(doc, xml.slice(i + 4, end)));
      i = end + 3;
    } else if (xml.startsWith('<![CDATA[', i)) {
      const end = xml.indexOf(']]>', i);
      if (end < 0) throw new Error('unterminated CDATA');
      top().appendChild(new Text(doc, xml.slice(i + 9, end)));
      i = end + 3;
    } else if (xml.startsWith('<!DOCTYPE', i)) {
      let depth = 0;
      let j = i + 9;
      for (; j < xml.length; j++) {
        if (xml[j] === '[') depth++;
        else if (xml[j] === ']') depth--;
        else if (xml[j] === '>' && depth === 0) break;
      }
      i = j + 1;
    } else if (xml[i + 1] === '/') {
      const end = xml.indexOf('>', i);
      const name = xml.slice(i + 2, end).trim();
      const open = top();
      if (!(open instanceof Element) || open.tagName !== name) throw new Error(`mismatched </${name}>`);
      stack.pop();
      i = end + 1;
    } else {
      const re = /<([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
      re.lastIndex = i;
      const m = re.exec(xml);
      if (!m) throw new Error(`bad tag at ${i}`);
      const el = new Element(doc, m[1]);
      const attrRe = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a;
      while ((a = attrRe.exec(m[2])) !== null) el.setAttribute(a[1], decode(a[2] ?? a[3]));
      if (stack.length === 1 && doc.documentElement) throw new Error('multiple roots');
      top().appendChild(el);
      if (!m[3]) stack.push(el);
      i = re.lastIndex;
    }
  }
  if (stack.length !== 1) throw new Error('unclosed element');
  if (!doc.documentElement) throw new Error('no root');
  return doc;
}

class DOMParser {
  parseFromString(xml) {
    try {
      return parseXml(String(xml));
    } catch (err) {
      const doc = new Document();
      const root = doc.createElement('parsererror');
      root.textContent = err.message;
      doc.appendChild(root);
      return doc;
    }
  }
}

// ------------------------------------------------------------------ serializer

const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');

function serialize(node) {
  switch (node.nodeType) {
    case TEXT_NODE:
      return escText(node.data);
    case COMMENT_NODE:
      return `<!--${node.data}-->`;
    case PI_NODE:
      return `<?${node.target} ${node.data}?>`;
    case DOCUMENT_NODE:
      return node.childNodes.map(serialize).join('');
    default: {
      const attrs = [...node._attrs].map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
      if (node.childNodes.length === 0) return `<${node.tagName}${attrs}/>`;
      return `<${node.tagName}${attrs}>${node.childNodes.map(serialize).join('')}</${node.tagName}>`;
    }
  }
}

class XMLSerializer {
  serializeToString(node) {
    return serialize(node);
  }
}

globalThis.DOMParser ??= DOMParser;
globalThis.XMLSerializer ??= XMLSerializer;
globalThis.Node ??= { ELEMENT_NODE, TEXT_NODE, COMMENT_NODE, DOCUMENT_NODE };
globalThis.Element ??= Element;
globalThis.Document ??= Document;
