// static/js/theme.js
(function () {
  const STORAGE_KEY = 'tp_theme';
  const THEMES = /** @type {const} */ (['light', 'dark']);
  const ICONS_PREFIX = '/static/source/icons/';

  /** @type {Map<string, string>} */
  const svgSourceCache = new Map(); // original svg text by absolute src
  /** @type {Map<string, string>} */
  const svgDarkDataUriCache = new Map(); // dark data-uri by absolute src

  function toAbsoluteUrl(src) {
    try {
      return new URL(src, window.location.origin).href;
    } catch {
      return src;
    }
  }

  function encodeSvgDataUri(svgText) {
    // keep it simple: encode as UTF-8 URI component
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  }

  function applyDarkPalette(svgText) {
    // exact mapping requested:
    // #2D3229 -> #F6FBF2
    // #7F8C73 -> #EEF7E9
    // Also handles optional alpha suffix (#RRGGBBAA) and any case.
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
        // theme toggle icon is managed separately by setTheme()
        if (img.classList.contains('theme-toggle__icon')) return false;

        const src = img.getAttribute('src') || '';
        const original = img.dataset.originalSrc || '';

        // pick up both: untouched icons (src=.../icons/*.svg) and already-recolored ones (data-original-src set)
        const isIconsSrc = src.startsWith(ICONS_PREFIX) && src.toLowerCase().endsWith('.svg');
        const isAlreadyProcessed = original.startsWith(ICONS_PREFIX) && original.toLowerCase().endsWith('.svg');
        return isIconsSrc || isAlreadyProcessed;
      });

    if (theme !== 'dark') {
      // restore originals
      for (const img of imgs) {
        const original = img.dataset.originalSrc;
        if (original) img.setAttribute('src', original);
      }
      return;
    }

    // dark: rewrite & swap to data-uris
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

    // Pseudo-elements use background-image URLs; filter cannot map colors exactly.
    // We override background-image with recolored SVG data-uris for exact palette mapping.
    const rules = [
      // arrow_dark_cropped.svg
      ['.archive-collapse-arrow::before', '/static/source/icons/arrow_dark_cropped.svg'],
      ['.board-table-card .name::after', '/static/source/icons/arrow_dark_cropped.svg'],
      ['.board-list .card .list .name::after', '/static/source/icons/arrow_dark_cropped.svg'],
      ['.kanban-board-card .kanban-stage-col .name::after', '/static/source/icons/arrow_dark_cropped.svg'],
      ['.kanban-archive-board .kanban-stage-col .name::after', '/static/source/icons/arrow_dark_cropped.svg'],
      // deadline icon
      ['.deadline::before', '/static/source/icons/deadline.svg'],
      // checkbox checkmark
      ['.checkbox-item .custom-checkbox::after', '/static/source/icons/check.svg'],
      // status select arrow (light cropped in your SCSS)
      ['.tasks-grid .col-status .status-select::after', '/static/source/icons/arrow_light_cropped.svg'],
    ];

    const lines = await Promise.all(
      rules.map(async ([selector, iconPath]) => {
        const abs = toAbsoluteUrl(iconPath);
        let dataUri = svgDarkDataUriCache.get(abs);
        if (!dataUri) {
          const original = await ensureSvgSource(abs);
          const darkText = applyDarkPalette(original);
          dataUri = encodeSvgDataUri(darkText);
          svgDarkDataUriCache.set(abs, dataUri);
        }
        // Important: keep url(...) quoting
        return `body[data-theme="dark"] ${selector}{background-image:url("${dataUri}") !important;filter:none !important;}`;
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
      // React to added nodes only (tabs swapping cards, etc.)
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
          schedule();
          break;
        }
      }
    });

    obs.observe(document.body, { childList: true, subtree: true });
    // initial run for pages that render after DOMContentLoaded
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
    style.textContent = `
/* suppress enter animations for dynamic operations */
body.tp-no-enter .cards > *,
body.tp-no-enter .card {
  animation: none !important;
  transition: none !important;
}

/* also prevent subtle “pop” from container animations/transforms during rerender */
body.tp-no-enter .app-container{
  animation: none !important;
  transition: none !important;
}

/* Kill app-surface-in re-run when temporary classes are toggled (was a delayed “jump” ~450ms). */
.app-container{
  animation: none !important;
}

/* Hard stop for card enter animations (prevents “page reload” feel on any rerender). */
.cards > *,
.card {
  animation: none !important;
}

/* Disable any card “jump” on hover/focus while interacting with tasks. */
.card,
.card:hover,
.card:focus-within{
  transform: none !important;
  transition: none !important;
}

/* toast in dark theme */
body[data-theme="dark"] .toast-notification{
  background: rgba(246, 251, 242, 0.92) !important;
  color: #2D3229 !important;
  border: 1px solid rgba(97, 160, 57, 0.35);
}

/* modal checkbox text in dark theme */
body[data-theme="dark"] .modal-content .checkbox-text{
  color: #F6FBF2 !important;
}

/* filters inputs in dark theme (tasks modal etc.) */
body[data-theme="dark"] .modal-content .filter-input{
  background: rgba(45, 50, 41, 0.35) !important;
  color: #F6FBF2 !important;
  border-color: rgba(127, 140, 115, 0.42) !important;
}
body[data-theme="dark"] .modal-content .filter-input::placeholder{
  color: rgba(246, 251, 242, 0.55) !important;
}
body[data-theme="dark"] .modal-content .filter-date span{
  color: rgba(246, 251, 242, 0.7) !important;
}
`;
    document.head.appendChild(style);
  }

  function setTheme(theme, { persist } = { persist: true }) {
    const next = THEMES.includes(theme) ? theme : 'light';
    document.body.dataset.theme = next;
    if (persist) localStorage.setItem(STORAGE_KEY, next);

    // swap icon
    const icon = document.querySelector('#themeToggle .theme-toggle__icon');
    if (icon) {
      icon.setAttribute(
        'src',
        next === 'dark' ? '/static/source/icons/darktheme.svg' : '/static/source/icons/lighttheme.svg'
      );
    }

    // recolor all app icons (img src="/static/source/icons/*.svg")
    // Do not block theme switch; run async.
    setIconTheme(next).catch(() => {});
    setPseudoElementIconTheme(next).catch(() => {});

    // короткий “переход” для фона/карточек/текста
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

    // микро-анимация иконки
    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.classList.remove('theme-toggle--pulse');
      // reflow for restart
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
})();

