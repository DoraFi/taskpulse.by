(function () {
  const STORAGE_KEY = 'tp_theme';
  const THEMES = /** @type {const} */ (['light', 'dark']);
  const ICONS_PREFIX = '/static/source/icons/';

  /** @type {Map<string, string>} */
  const svgSourceCache = new Map();
  /** @type {Map<string, string>} */
  const svgDarkDataUriCache = new Map(); 

  function toAbsoluteUrl(src) {
    try {
      return new URL(src, window.location.origin).href;
    } catch {
      return src;
    }
  }

  function encodeSvgDataUri(svgText) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  }

  function applyDarkPalette(svgText) {
    return svgText
      .replace(/#2d3229([0-9a-f]{2})?\b/gi, (_m, a) => `#F6FBF2${a || ''}`)
      .replace(/#7f8c73([0-9a-f]{2})?\b/gi, (_m, a) => `#EEF7E9${a || ''}`);
  }

  async function ensureSvgSource(absSrc) {
    if (svgSourceCache.has(absSrc)) return svgSourceCache.get(absSrc);
    const res = await fetch(absSrc, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`Failed to fetch svg: ${absSrc}`);
    const text = await res.text();
    svgSourceCache.set(absSrc, text);
    return text;
  }

  async function setIconTheme(theme) {
    const imgs = Array.from(document.querySelectorAll('img'))
      .filter((img) => {
        const src = img.getAttribute('src') || '';
        const original = img.dataset.originalSrc || '';

        const isIconsSrc = src.startsWith(ICONS_PREFIX) && src.toLowerCase().endsWith('.svg');
        const isAlreadyProcessed = original.startsWith(ICONS_PREFIX) && original.toLowerCase().endsWith('.svg');
        return isIconsSrc || isAlreadyProcessed;
      });

    if (theme !== 'dark') {
      for (const img of imgs) {
        const original = img.dataset.originalSrc;
        if (original) img.setAttribute('src', original);
      }
      return;
    }

    await Promise.all(
      imgs.map(async (img) => {
        const src = img.getAttribute('src') || '';
        if (!img.dataset.originalSrc) img.dataset.originalSrc = src;

        const absSrc = toAbsoluteUrl(img.dataset.originalSrc);
        if (svgDarkDataUriCache.has(absSrc)) {
          img.setAttribute('src', svgDarkDataUriCache.get(absSrc));
          return;
        }

        const originalText = await ensureSvgSource(absSrc);
        const darkText = applyDarkPalette(originalText);
        const dataUri = encodeSvgDataUri(darkText);
        svgDarkDataUriCache.set(absSrc, dataUri);
        img.setAttribute('src', dataUri);
      })
    );
  }

  function ensurePseudoElementIconThemeStyle() {
    const STYLE_ID = 'tp-theme-pseudo-icons';
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '';
    document.head.appendChild(style);
  }

  async function setPseudoElementIconTheme(theme) {
    const style = document.getElementById('tp-theme-pseudo-icons');
    if (!style) return;

    if (theme !== 'dark') {
      style.textContent = '';
      return;
    }

    const rules = [
      ['.archive-collapse-arrow::before', '/static/source/icons/arrow_dark_cropped.svg'],
      ['.board-table-card .tasks-grid .name::after', '/static/source/icons/arrow_dark_cropped.svg'],
      ['.board-list .card .list .subtasks .name::after', '/static/source/icons/arrow_dark_cropped.svg'],
      ['.board-list .tasks-grid .name::after', '/static/source/icons/arrow_dark_cropped.svg'],
      ['.board-timeline-card .subtasks .name::after', '/static/source/icons/arrow_dark_cropped.svg'],
      ['.board-kanban .tasks-grid .name::after', '/static/source/icons/arrow_dark_cropped.svg'],
      ['.kanban-board-card .kanban-stage-col .subtasks .name::after', '/static/source/icons/arrow_dark_cropped.svg'],
      ['.kanban-archive-board .kanban-stage-col .subtasks .name::after', '/static/source/icons/arrow_dark_cropped.svg'],
      [
        '.board-list .card .list .subtasks .subtasks-list .checkbox-item .custom-checkbox::after',
        '/static/source/icons/check.svg',
      ],
      [
        '.board-list .tasks-grid .subtasks-list .checkbox-item .custom-checkbox::after',
        '/static/source/icons/check.svg',
      ],
      [
        '.board-table-card .tasks-grid .subtasks-list .checkbox-item .custom-checkbox::after',
        '/static/source/icons/check.svg',
      ],
      [
        '.board-timeline-card .subtasks .subtasks-list .checkbox-item .custom-checkbox::after',
        '/static/source/icons/check.svg',
      ],
      [
        '.board-timeline-card .timeline-task-card .checkbox-item .custom-checkbox::after',
        '/static/source/icons/check.svg',
      ],
      [
        '.board-kanban .tasks-grid .subtasks-list .checkbox-item .custom-checkbox::after',
        '/static/source/icons/check.svg',
      ],
      [
        '.kanban-board-card .kanban-stage-col .subtasks .subtasks-list .checkbox-item .custom-checkbox::after',
        '/static/source/icons/check.svg',
      ],
      ['.deadline::before', '/static/source/icons/deadline.svg'],
      ['.checkbox-item .custom-checkbox::after', '/static/source/icons/check.svg'],
      ['.tasks-grid .col-status .status-select::after', '/static/source/icons/arrow_light_cropped.svg'],
      [
        '.modal-content.create-task-modal select.create-task-select',
        '/static/source/icons/arrow_dark_cropped.svg',
        'background-repeat:no-repeat !important;background-position:right 0.75rem center !important;background-size:0.625rem auto !important;',
      ],
    ];

    const lines = await Promise.all(
      rules.map(async ([selector, iconPath, extraDecl]) => {
        const abs = toAbsoluteUrl(iconPath);
        let dataUri = svgDarkDataUriCache.get(abs);
        if (!dataUri) {
          const original = await ensureSvgSource(abs);
          const darkText = applyDarkPalette(original);
          dataUri = encodeSvgDataUri(darkText);
          svgDarkDataUriCache.set(abs, dataUri);
        }
        const extra = extraDecl || '';
        return `body[data-theme="dark"] ${selector}{background-image:url("${dataUri}") !important;filter:none !important;${extra}}`;
      })
    );

    style.textContent = lines.join('\n');
  }

  function getCurrentTheme() {
    return document.body.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function initAutoIconTheming() {
    let scheduled = false;
    let inProgress = false;

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(async () => {
        scheduled = false;
        if (inProgress) return;
        inProgress = true;
        try {
          await setIconTheme(getCurrentTheme());
        } finally {
          inProgress = false;
        }
      }, 50);
    };

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
          schedule();
          break;
        }
      }
    });

    obs.observe(document.body, { childList: true, subtree: true });
    schedule();
  }

  function getPreferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function ensureUiFixesStyle() {
    const STYLE_ID = 'tp-ui-fixes';
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  function setTheme(theme, { persist } = { persist: true }) {
    const next = THEMES.includes(theme) ? theme : 'light';
    document.body.dataset.theme = next;
    if (persist) localStorage.setItem(STORAGE_KEY, next);

    const icon = document.querySelector('#themeToggle .theme-toggle__icon');
    if (icon) {
      const path =
        next === 'dark' ? `${ICONS_PREFIX}darktheme.svg` : `${ICONS_PREFIX}lighttheme.svg`;
      icon.dataset.originalSrc = path;
      icon.setAttribute('src', path);
    }

    setIconTheme(next).catch(() => {});
    setPseudoElementIconTheme(next).catch(() => {});

    document.body.classList.add('theme-transition');
    window.clearTimeout(setTheme._t);
    setTheme._t = window.setTimeout(() => {
      document.body.classList.remove('theme-transition');
    }, 420);
  }

  function toggleTheme() {
    const current = document.body.dataset.theme === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next, { persist: true });

    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.classList.remove('theme-toggle--pulse');
      void btn.offsetWidth;
      btn.classList.add('theme-toggle--pulse');
    }
  }

  function init() {
    ensurePseudoElementIconThemeStyle();
    ensureUiFixesStyle();
    initAutoIconTheming();
    setTheme(getPreferredTheme(), { persist: false });

    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.addEventListener('click', toggleTheme);
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  window.tpGetThemeMode = function tpGetThemeMode() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return 'system';
  };

  window.tpSetThemeMode = function tpSetThemeMode(mode) {
    if (mode === 'system') {
      localStorage.removeItem(STORAGE_KEY);
      setTheme(getPreferredTheme(), { persist: false });
      return;
    }
    if (mode === 'light' || mode === 'dark') {
      setTheme(mode, { persist: true });
    }
  };
})();

