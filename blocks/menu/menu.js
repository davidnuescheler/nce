/**
 * Parses an item title string into name and price.
 * Handles "Name $NN" or "Name $N" and keeps optional text after price.
 * @param {string} text
 * @returns {{ name: string, price: string }}
 */
function parseItemTitle(text) {
  const match = text.trim().match(/^(.+?)\s+(\$\d+)\s*$/);
  if (match) {
    return { name: match[1].trim(), price: match[2].trim() };
  }
  return { name: text.trim(), price: '' };
}

/**
 * Check if block content is table-like (rows of cells).
 * @param {Element} block
 * @returns {boolean}
 */
function isTableStructure(block) {
  const first = block.firstElementChild;
  return first?.tagName === 'DIV' && first.firstElementChild?.tagName === 'DIV';
}

/**
 * Get the element whose children should be parsed (block or single cell with flow content).
 * When the block is one row / one cell and that cell contains h2, h3, p, we parse it as flow.
 * @param {Element} block
 * @returns {{ useFlow: boolean, root: Element }}
 */
function getContentRoot(block) {
  if (!isTableStructure(block)) {
    return { useFlow: true, root: block };
  }
  const rows = [...block.children].filter((r) => r.tagName === 'DIV');
  if (rows.length === 1) {
    const cells = [...rows[0].children].filter((c) => c.tagName === 'DIV');
    if (cells.length === 1) {
      const cell = cells[0];
      const hasFlow = [...cell.children].some(
        (el) => ['H2', 'H3', 'P'].includes(el.tagName),
      );
      if (hasFlow) {
        return { useFlow: true, root: cell };
      }
    }
  }
  return { useFlow: false, root: block };
}

/**
 * Collect entries from flow content (h2, h3, p).
 * @param {Element} block
 * @returns {{ type: string, name?: string, price?: string, text?: string, element?: Element }[]}
 */
function parseFlowContent(block) {
  const entries = [];
  let currentItem = null;

  [...block.children].forEach((el) => {
    if (el.tagName === 'H2') {
      currentItem = null;
      entries.push({ type: 'section', text: el.textContent.trim(), element: el });
    } else if (el.tagName === 'H3') {
      currentItem = null;
      const { name, price } = parseItemTitle(el.textContent);
      entries.push({ type: 'item', name, price, element: el });
      currentItem = entries[entries.length - 1];
    } else if (el.tagName === 'P' && currentItem) {
      if (!currentItem.descriptions) currentItem.descriptions = [];
      currentItem.descriptions.push(el);
    }
  });

  return entries;
}

/**
 * Collect entries from table structure (rows/cells).
 * @param {Element} block
 * @returns {{ type: string, name?: string, price?: string, text?: string, element?: Element }[]}
 */
function parseTableContent(block) {
  const entries = [];
  let currentItem = null;
  const priceOnly = /^\s*\$?\d+\s*$/;

  [...block.children].forEach((row) => {
    if (row.tagName !== 'DIV') return;
    const cells = [...row.children].filter((c) => c.tagName === 'DIV');
    const texts = cells.map((c) => c.textContent.trim());

    if (cells.length === 2) {
      currentItem = null;
      const [name, price] = texts;
      const item = { type: 'item', name: name || '', price: price || '', row };
      entries.push(item);
      currentItem = item;
    } else if (cells.length === 1) {
      const text = texts[0] || '';
      if (priceOnly.test(text)) return;
      const itemMatch = text.match(/^(.+?)\s+(\$\d+)\s*$/);
      if (itemMatch) {
        currentItem = null;
        entries.push({ type: 'item', name: itemMatch[1].trim(), price: itemMatch[2].trim(), row });
        currentItem = entries[entries.length - 1];
      } else if (text.length < 60 && !currentItem) {
        currentItem = null;
        entries.push({ type: 'section', text, row });
      } else {
        if (!currentItem) {
          entries.push({ type: 'item', name: '', price: '', descriptions: [] });
          currentItem = entries[entries.length - 1];
        }
        if (!currentItem.descriptions) currentItem.descriptions = [];
        const p = row.querySelector('p') || row;
        currentItem.descriptions.push(p.cloneNode(true));
      }
    }
  });

  return entries;
}

/**
 * Build the decorated menu DOM from parsed entries.
 * @param {Element} block
 * @param {{ type: string, name?: string, price?: string, text?: string, descriptions?: Element[], element?: Element, row?: Element }[]} entries
 */
function buildMenuDOM(block, entries) {
  const sectionsEl = document.createElement('div');
  sectionsEl.className = 'menu__sections';

  let sectionEl = null;
  let itemsEl = null;

  const wrapper = document.createElement('div');
  wrapper.className = 'menu__inner';
  ['tl', 'tr', 'bl', 'br'].forEach((pos) => {
    const corner = document.createElement('div');
    corner.className = `menu__corner menu__corner-${pos}`;
    corner.setAttribute('aria-hidden', 'true');
    wrapper.append(corner);
  });
  wrapper.append(sectionsEl);

  entries.forEach((entry) => {
    if (entry.type === 'section') {
      sectionEl = document.createElement('div');
      sectionEl.className = 'menu__section';
      const titleEl = document.createElement('h2');
      titleEl.className = 'menu__section-title';
      if (entry.element && entry.element.id) titleEl.id = entry.element.id;
      titleEl.textContent = entry.text || '';
      sectionEl.append(titleEl);
      itemsEl = document.createElement('div');
      itemsEl.className = 'menu__items';
      sectionEl.append(itemsEl);
      sectionsEl.append(sectionEl);
    } else if (entry.type === 'item' && sectionEl && itemsEl) {
      const itemEl = document.createElement('div');
      itemEl.className = 'menu__item';

      const rowEl = document.createElement('div');
      rowEl.className = 'menu__item-row';
      const nameEl = document.createElement('span');
      nameEl.className = 'menu__item-name';
      nameEl.textContent = entry.name || '';
      const priceEl = document.createElement('span');
      priceEl.className = 'menu__item-price';
      priceEl.textContent = entry.price || '';
      rowEl.append(nameEl, priceEl);
      itemEl.append(rowEl);

      if (entry.descriptions?.length) {
        const descEl = document.createElement('div');
        descEl.className = 'menu__item-desc';
        entry.descriptions.forEach((d) => descEl.append(d));
        itemEl.append(descEl);
      }

      itemsEl.append(itemEl);
    }
  });

  block.replaceChildren(wrapper);
}

export default function decorate(block) {
  const { useFlow, root } = getContentRoot(block);
  const entries = useFlow
    ? parseFlowContent(root)
    : parseTableContent(block);

  if (entries.length && entries[0].type === 'item') {
    entries.unshift({ type: 'section', text: '' });
  }
  buildMenuDOM(block, entries);
}
