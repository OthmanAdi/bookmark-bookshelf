import { el } from './dom';
import { safeHttpUrl } from './parse';
import type { Block, Inline } from './types';

function appendInlines(parent: Node, inlines: Inline[], dom: Document): void {
  for (const inline of inlines) parent.appendChild(renderInline(inline, dom));
}

function wrapped(tag: 'em' | 'strong', inlines: Inline[], dom: Document): HTMLElement {
  const node = el(dom, tag);
  appendInlines(node, inlines, dom);
  return node;
}

function renderInline(inline: Inline, dom: Document): Node {
  switch (inline.t) {
    case 'text':
      return dom.createTextNode(inline.v);
    case 'em':
      return wrapped('em', inline.c, dom);
    case 'strong':
      return wrapped('strong', inline.c, dom);
    case 'code':
      return el(dom, 'code', undefined, inline.v);
    case 'link': {
      // Blocks can be built by hand, so the target is checked again here.
      const href = safeHttpUrl(inline.href);
      if (!href) {
        const plain = dom.createDocumentFragment();
        appendInlines(plain, inline.c, dom);
        return plain;
      }
      const link = el(dom, 'a');
      link.setAttribute('href', href);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      appendInlines(link, inline.c, dom);
      return link;
    }
  }
}

function renderBlock(block: Block, dom: Document): HTMLElement {
  switch (block.type) {
    case 'heading': {
      const heading = el(dom, block.level === 2 ? 'h2' : 'h3');
      appendInlines(heading, block.inlines, dom);
      return heading;
    }
    case 'paragraph': {
      const paragraph = el(dom, 'p');
      appendInlines(paragraph, block.inlines, dom);
      return paragraph;
    }
    case 'quote': {
      const quote = el(dom, 'blockquote');
      appendInlines(quote, block.inlines, dom);
      return quote;
    }
    case 'list': {
      const list = el(dom, block.ordered ? 'ol' : 'ul');
      for (const item of block.items) {
        const entry = el(dom, 'li');
        appendInlines(entry, item, dom);
        list.appendChild(entry);
      }
      return list;
    }
    case 'code': {
      const pre = el(dom, 'pre');
      pre.appendChild(el(dom, 'code', undefined, block.text));
      return pre;
    }
    case 'rule':
      return el(dom, 'hr');
  }
}

/** Builds DOM for the blocks with createElement and text nodes only. Each block carries its index. */
export function renderBlocks(blocks: Block[], dom: Document = document): DocumentFragment {
  const fragment = dom.createDocumentFragment();
  blocks.forEach((block, index) => {
    const node = renderBlock(block, dom);
    node.setAttribute('data-block', String(index));
    fragment.appendChild(node);
  });
  return fragment;
}
