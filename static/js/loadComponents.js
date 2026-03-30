(function() {
    const asideContainer = document.getElementById('aside-container');
    if (asideContainer && asideContainer.innerHTML.trim() === '') {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/templates/components/aside.html', false);
        xhr.send();
        if (xhr.status === 200) {
            asideContainer.innerHTML = xhr.responseText;
        }
    }
})();

function saveSubmenusState() {
    const states = {};
    document.querySelectorAll('.item').forEach((item, index) => {
        const submenu = item.querySelector('.submenu');
        states[index] = submenu ? submenu.style.display === 'block' : false;
    });
    localStorage.setItem('submenusState', JSON.stringify(states));
    console.log('Состояние подменю сохранено:', states);
}

function openDefaultSubmenus() {
    document.querySelectorAll('.item').forEach(item => {
        const submenu = item.querySelector('.submenu');
        const arrowWrapper = item.querySelector('.arrow-wrapper');
        const arrowImg = arrowWrapper?.querySelector('.arrow-img');
        
        if (submenu) {
            submenu.style.display = 'block';
            if (arrowImg) arrowImg.style.transform = 'rotate(-90deg)';
        }
    });
    console.log('Все подменю открыты');
}

function loadSubmenusState() {
    const saved = localStorage.getItem('submenusState');
    if (!saved) {
        openDefaultSubmenus();
        return;
    }
    
    try {
        const states = JSON.parse(saved);
        document.querySelectorAll('.item').forEach((item, index) => {
            const submenu = item.querySelector('.submenu');
            const arrowWrapper = item.querySelector('.arrow-wrapper');
            const arrowImg = arrowWrapper?.querySelector('.arrow-img');
            
            if (submenu && states[index] !== undefined) {
                if (states[index]) {
                    submenu.style.display = 'block';
                    if (arrowImg) arrowImg.style.transform = 'rotate(-90deg)';
                } else {
                    submenu.style.display = 'none';
                    if (arrowImg) arrowImg.style.transform = 'rotate(0deg)';
                }
            }
        });
        console.log('Состояние подменю загружено');
    } catch (e) {
        console.error('Ошибка загрузки состояния подменю:', e);
        openDefaultSubmenus();
    }
}

function handleArrowClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const arrow = e.currentTarget;
    const item = arrow.closest('.item');
    const submenu = item?.querySelector('.submenu');
    const arrowImg = arrow.querySelector('.arrow-img');
    
    if (submenu) {
        const isOpen = submenu.style.display === 'block';
        submenu.style.display = isOpen ? 'none' : 'block';
        if (arrowImg) arrowImg.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(-90deg)';
        
        saveSubmenusState();
    }
}

function initSubmenus() {
    document.querySelectorAll('.arrow-wrapper').forEach(arrow => {
        arrow.removeEventListener('click', handleArrowClick);
        arrow.addEventListener('click', handleArrowClick);
    });
    
    loadSubmenusState();
}

function isCurrentPage(url) {
    const currentPath = window.location.pathname;
    const targetPath = new URL(url, window.location.origin).pathname;
    return currentPath === targetPath;
}

function updateActiveMenuItem() {
    const currentPath = window.location.pathname;
    
    document.querySelectorAll('.nav-link[data-href]').forEach(link => {
        const linkPath = new URL(link.dataset.href, window.location.origin).pathname;
        
        if (currentPath === linkPath) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

function initNavigation() {
    document.querySelectorAll('.nav-link[data-href]').forEach(link => {
        link.removeEventListener('click', handleNavigationClick);
        link.addEventListener('click', handleNavigationClick);
    });
}

function handleNavigationClick(e) {
    e.preventDefault();
    const url = this.dataset.href;
    
    if (isCurrentPage(url)) {
        console.log('Уже на этой странице, переход не требуется');
        return;
    }
    
    loadPage(url);
}

async function loadExternalScript(src) {
    if (document.querySelector(`script[src="${src}"]`)) {
        console.log(`Скрипт ${src} уже загружен`);
        return true;
    }
    
    console.log(`Загружаем скрипт: ${src}`);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            console.log(`Скрипт ${src} загружен`);
            resolve(true);
        };
        script.onerror = () => {
            console.error(`Ошибка загрузки ${src}`);
            reject(new Error(`Failed to load ${src}`));
        };
        document.head.appendChild(script);
    });
}

function executeInlineScripts(container) {
    const scripts = container.querySelectorAll('script:not([src])');
    scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        newScript.textContent = oldScript.textContent;
        document.body.appendChild(newScript);
        document.body.removeChild(newScript);
    });
}

async function loadPage(url) {
    console.log('=== loadPage начат ===', url);
    try {
        const response = await fetch(url);
        console.log('Ответ получен, статус:', response.status);
        const html = await response.text();
        console.log('HTML получен, длина:', html.length);
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newContent = doc.querySelector('.app-container');
        
        console.log('Новый контент найден:', !!newContent);
        
        if (newContent) {
            const currentContent = document.querySelector('.app-container');
            console.log('Текущий контент:', !!currentContent);
            
            if (currentContent) {
                const externalScripts = doc.querySelectorAll('script[src]');
                console.log('Внешних скриптов для загрузки:', externalScripts.length);
                
                for (const script of externalScripts) {
                    const src = script.src;
                    if (src.includes('loadComponents.js') || src.includes('app.js')) {
                        continue;
                    }
                    await loadExternalScript(src);
                }
                
                currentContent.style.opacity = '0';
                currentContent.style.transition = 'opacity 0.2s ease';
                
                setTimeout(() => {
                    console.log('Замена контента...');
                    currentContent.className = newContent.className;
                    currentContent.innerHTML = newContent.innerHTML;
                    currentContent.style.opacity = '1';
                    history.pushState({}, '', url);
                    
                    executeInlineScripts(currentContent);
                    
                    if (currentContent.querySelector('#tasks-grid') && typeof window.initTasksPage === 'function') {
                        console.log('Вызов initTasksPage');
                        window.initTasksPage();
                    }
                    
                    if (currentContent.querySelector('#miniChart') && typeof window.initIndexPage === 'function') {
                        console.log('Вызов initIndexPage');
                        window.initIndexPage();
                    }
                    
                    initSubmenus();
                    initNavigation();
                    
                    updateActiveMenuItem();
                    
                    console.log('Загрузка страницы завершена');
                }, 200);
            }
        } else {
            console.log('Нет .app-container, переход по ссылке');
            window.location.href = url;
        }
    } catch (error) {
        console.error('Ошибка загрузки страницы:', error);
        window.location.href = url;
    }
}

window.addEventListener('popstate', () => {
    loadPage(window.location.pathname);
});

document.addEventListener('DOMContentLoaded', () => {
    initSubmenus();
    initNavigation();
    updateActiveMenuItem();
});