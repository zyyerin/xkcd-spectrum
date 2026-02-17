// --- APP LOGIC ---
// Depends on translations.js (window.cnDict, window.translations)

const cnDict = window.cnDict;
const translations = window.translations;

let allColors = [];
let currentView = 'grid';
let filters = { huePreset: null };
let bucket = [];
const MAX_BUCKET_SIZE = 5;
let currentLang = 'en';
let savedScrollY = null;
let isPaletteOpen = false;

function translateName(name) {
    if (typeof name !== 'string') return name;

    // First, handle multi-word phrases (like "a hint of")
    let result = name.toLowerCase();
    const multiWordPhrases = Object.keys(cnDict).filter(key => key.includes(' '));
    multiWordPhrases.sort((a, b) => b.length - a.length); // Sort by length descending to match longer phrases first
    for (const phrase of multiWordPhrases) {
        const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        if (regex.test(result)) {
            result = result.replace(regex, cnDict[phrase]);
        }
    }

    const checkSuffix = (word) => {
        if (word.endsWith('ish') && word.length > 3) return { base: word.slice(0, -3), prefix: '带' };
        if (word.endsWith('y') && word.length > 2 && !['sky', 'navy'].includes(word)) return { base: word.slice(0, -1), prefix: '带' };
        return null;
    };
    
    // Preserve slashes but remove spaces by splitting on word boundaries
    // Use a regex to match words and separators separately
    const tokens = [];
    const regex = /([^\s/]+)|([\s/]+)/g;
    let match;
    
    while ((match = regex.exec(result)) !== null) {
        if (match[1]) {
            // Word part
            tokens.push({ type: 'word', value: match[1] });
        } else if (match[2]) {
            // Separator part (spaces or slashes)
            // Only keep slashes, remove spaces
            const separator = match[2].replace(/\s/g, ''); // Remove all spaces
            if (separator) {
                tokens.push({ type: 'separator', value: separator });
            }
        }
    }
    
    // Translate word tokens
    const translatedTokens = tokens.map(token => {
        if (token.type === 'separator') {
            return token.value; // Keep slashes
        }
        // Translate word
        const lower = token.value.toLowerCase();
        // Skip if already translated (contains Chinese characters)
        if (/[\u4e00-\u9fa5]/.test(token.value)) return token.value;
        if (cnDict[lower]) return cnDict[lower];
        const suffixInfo = checkSuffix(lower);
        if (suffixInfo) {
            const baseTrans = cnDict[suffixInfo.base];
            if (baseTrans) return suffixInfo.prefix + baseTrans;
        }
        return token.value;
    });
    
    return translatedTokens.join('');
}

function setLanguage(lang) {
    currentLang = lang;
    const t = translations[lang];
    document.getElementById('headerTitle').textContent = t.title;
    document.getElementById('headerSubtitle').textContent = t.subtitle;
    document.getElementById('dataSourceLink').setAttribute('title', t.dataSourceTooltip);
    document.getElementById('searchInput').placeholder = t.searchPlaceholder;
    document.getElementById('filterLabel').textContent = t.filter;
    document.getElementById('loadingText').textContent = t.loading;
    document.getElementById('emptyTitle').textContent = t.emptyTitle;
    document.getElementById('emptyDesc').textContent = t.emptyDesc;
    document.getElementById('paletteCopyBtn').innerHTML = t.copyAll;
    document.getElementById('paletteClearBtn').textContent = t.clear;
    document.getElementById('paletteEmptyText').textContent = t.emptyPalette;
    document.getElementById('paletteCardTitle').textContent = t.paletteLabel;
    // Update language toggle buttons (mobile and desktop)
    const langToggleMobile = document.getElementById('langToggle');
    const langToggleDesktop = document.getElementById('langToggleDesktop');
    if (langToggleMobile) langToggleMobile.textContent = lang === 'en' ? '中' : 'EN';
    if (langToggleDesktop) langToggleDesktop.textContent = lang === 'en' ? '中' : 'EN';
    
    // Update sort select
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        Array.from(sortSelect.options).forEach(opt => {
            if (t.sort[opt.value]) opt.textContent = t.sort[opt.value];
        });
    }
    document.querySelectorAll('.hue-btn').forEach(btn => {
        const key = btn.getAttribute('data-color-key');
        if (key && t.colors[key]) btn.title = t.colors[key];
    });
    const sortMethod = sortSelect ? sortSelect.value : 'hue';
    renderColors(sortColors(allColors.filter(c => {
        const query = document.getElementById('searchInput').value.toLowerCase();
        const matchesSearch = !query || c.name.toLowerCase().includes(query) || c.nameZh.includes(query) || c.hex.toLowerCase().includes(query);
        const matchesPreset = !filters.huePreset || matchHuePreset(c, filters.huePreset);
        return matchesSearch && matchesPreset;
    }), sortMethod));
    updateBucketUI();
}

function toggleLanguage() {
    setLanguage(currentLang === 'en' ? 'zh' : 'en');
}

function parseData(text) {
    const lines = text.trim().split('\n');
    const parsed = [];
    lines.forEach(line => {
        const match = line.match(/(.+?)\s+(#[0-9a-fA-F]{6})/);
        if (match) {
            const name = match[1].trim();
            const hex = match[2];
            const hsl = hexToHSL(hex);
            const rgb = hexToRGB(hex);
            const nameZh = translateName(name);
            parsed.push({
                name, nameZh, hex,
                hue: hsl.h, saturation: hsl.s, lightness: hsl.l,
                rgb, luma: 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b
            });
        }
    });
    return parsed;
}

function hexToRGB(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

function hexToHSL(hex) {
    let { r, g, b } = hexToRGB(hex);
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
}

function sortColors(colors, method) {
    const sorted = [...colors];
    switch (method) {
        case 'hue':
            return sorted.sort((a, b) => {
                const bucketSize = 15;
                const bucketA = Math.floor(a.hue / bucketSize);
                const bucketB = Math.floor(b.hue / bucketSize);
                if (bucketA !== bucketB) return bucketA - bucketB;
                if (bucketA % 2 === 0) return (b.saturation - a.saturation) || (b.lightness - a.lightness);
                return (a.saturation - b.saturation) || (a.lightness - b.lightness);
            });
        case 'alpha':
            return sorted.sort((a, b) => {
                const nameA = currentLang === 'zh' ? a.nameZh : a.name;
                const nameB = currentLang === 'zh' ? b.nameZh : b.name;
                return nameA.localeCompare(nameB, currentLang === 'zh' ? 'zh' : 'en');
            });
        case 'light': return sorted.sort((a, b) => b.lightness - a.lightness);
        case 'dark': return sorted.sort((a, b) => a.lightness - b.lightness);
        case 'saturation': return sorted.sort((a, b) => b.saturation - a.saturation);
        default: return sorted;
    }
}

function toggleHuePreset(hueName) {
    if (filters.huePreset === hueName) filters.huePreset = null;
    else filters.huePreset = hueName;
    document.querySelectorAll('.hue-btn').forEach(btn => {
        btn.classList.remove('active');
        if (filters.huePreset && btn.onclick.toString().includes(`'${filters.huePreset}'`)) btn.classList.add('active');
    });
    handleFilterAndSort();
}

function matchHuePreset(color, preset) {
    const h = color.hue, s = color.saturation, l = color.lightness;
    switch (preset) {
        case 'red': return (h >= 340 || h <= 20) && s > 15;
        case 'orange': return (h > 20 && h <= 50) && s > 15 && l > 30;
        case 'brown': return (h >= 10 && h <= 50) && (l <= 45) && s > 10;
        case 'yellow': return (h > 50 && h <= 75) && s > 15 && l > 20;
        case 'green': return (h > 75 && h <= 165) && s > 10;
        case 'cyan': return (h > 165 && h <= 200) && s > 10;
        case 'blue': return (h > 200 && h <= 265) && s > 10;
        case 'purple': return (h > 265 && h <= 315) && s > 10;
        case 'pink': return (h > 315 && h < 340) && s > 10;
        case 'grey': return s <= 10;
        default: return true;
    }
}

function updateCardSelectedState(hex, isSelected) {
    const t = translations[currentLang];
    if (currentView === 'grid') {
        const card = document.getElementById('colorGrid').querySelector(`[data-hex="${hex}"]`);
        if (!card) return;
        const buttons = card.querySelectorAll('button');
        const addBtn = buttons.length >= 2 ? buttons[1] : null;
        const icon = addBtn && addBtn.querySelector('i');
        if (addBtn && icon) {
            icon.className = isSelected ? 'fas fa-check text-xs' : 'fas fa-plus text-xs';
            addBtn.className = isSelected
                ? 'w-8 h-8 rounded-full shadow-md flex items-center justify-center transition-all transform hover:scale-110 opacity-100 bg-indigo-600 text-white hover:bg-indigo-700'
                : 'w-8 h-8 rounded-full shadow-md flex items-center justify-center transition-all transform hover:scale-110 opacity-0 group-hover:opacity-100 bg-white text-slate-500 hover:text-indigo-600 hover:bg-slate-50';
            addBtn.title = isSelected ? t.actions.remove : t.actions.add;
        }
    } else {
        const cell = document.getElementById('colorGrid').querySelector(`[data-hex="${hex}"]`);
        if (!cell) return;
        if (isSelected) cell.innerHTML = `<div class="absolute inset-0 flex items-center justify-center"><i class="fas fa-check text-white text-xs drop-shadow-md"></i></div>`;
        else cell.innerHTML = '';
    }
}

function toggleBucket(hex, name) {
    const index = bucket.findIndex(c => c.hex === hex);
    const t = translations[currentLang];
    if (index > -1) {
        bucket.splice(index, 1);
    } else {
        if (bucket.length >= MAX_BUCKET_SIZE) {
            showToast(t.toast.paletteFull, t.toast.paletteFullDesc);
            return;
        }
        bucket.push({ hex, name });
        if (bucket.length === 1 && !isPaletteOpen) {
            togglePaletteCard();
        }
    }
    updateBucketUI();
    updateCardSelectedState(hex, bucket.some(c => c.hex === hex));
}

function togglePaletteCard() {
    isPaletteOpen = !isPaletteOpen;
    const card = document.getElementById('paletteCard');
    if (isPaletteOpen) {
        card.classList.remove('palette-hidden');
        card.classList.add('palette-visible');
    } else {
        card.classList.remove('palette-visible');
        card.classList.add('palette-hidden');
    }
}

// Draggable palette card
const card = document.getElementById('paletteCard');
const header = document.getElementById('paletteHeader');
let isDragging = false;
let startX, startY, initialLeft, initialTop;

header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = card.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    card.style.bottom = 'auto';
    card.style.right = 'auto';
    card.style.left = `${initialLeft}px`;
    card.style.top = `${initialTop}px`;
    header.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    card.style.left = `${initialLeft + dx}px`;
    card.style.top = `${initialTop + dy}px`;
});

window.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        header.style.cursor = 'grab';
    }
});

function copyPalette() {
    const t = translations[currentLang];
    if (bucket.length === 0) return;
    const text = bucket.map(c => {
        const displayName = currentLang === 'zh' ? translateName(c.name) : c.name;
        return `${displayName}: ${c.hex}`;
    }).join('\n');
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast(t.toast.paletteCopied, `${bucket.length} ${t.toast.colorsCopied}`);
}

function clearPalette() {
    savedScrollY = window.scrollY;
    const oldBucket = [...bucket];
    bucket = [];
    updateBucketUI();
    oldBucket.forEach(c => updateCardSelectedState(c.hex, false));
}

function updateBucketUI() {
    const t = translations[currentLang];
    const listContainer = document.getElementById('paletteList');
    const emptyState = document.getElementById('paletteEmpty');
    const countLabel = document.getElementById('paletteCount');
    const badge = document.getElementById('paletteBadge');

    countLabel.textContent = bucket.length;

    if (bucket.length > 0) {
        emptyState.classList.add('hidden');
        badge.classList.remove('hidden');
        badge.textContent = bucket.length;
    } else {
        emptyState.classList.remove('hidden');
        badge.classList.add('hidden');
    }

    Array.from(listContainer.children).forEach(child => {
        if (child.id !== 'paletteEmpty') listContainer.removeChild(child);
    });

    bucket.forEach((color, index) => {
        const rawName = String(color.name);
        const displayName = currentLang === 'zh' ? translateName(rawName) : rawName;
        const safeRawName = rawName.replace(/'/g, "\\'");
        const safeDisplayName = displayName.replace(/'/g, "\\'");

        const item = document.createElement('div');
        item.className = 'flex items-center gap-2 p-3 border-b border-slate-100 hover:bg-slate-50 transition-colors animate-[fadeIn_0.2s_ease-out] group bg-white';
        item.draggable = true;

        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', index.toString());
            e.dataTransfer.effectAllowed = 'move';
            item.classList.add('opacity-50');
        });
        item.addEventListener('dragend', () => item.classList.remove('opacity-50'));
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            item.classList.add('bg-indigo-50');
        });
        item.addEventListener('dragleave', () => item.classList.remove('bg-indigo-50'));
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('bg-indigo-50');
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            if (fromIndex === index) return;
            const element = bucket[fromIndex];
            bucket.splice(fromIndex, 1);
            bucket.splice(index, 0, element);
            updateBucketUI();
        });

        item.innerHTML = `
            <div class="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 p-1 flex items-center justify-center" title="${t.actions.dragHint}">
                <i class="fas fa-grip-vertical text-xs"></i>
            </div>
            <div class="w-10 h-10 rounded-lg shadow-sm border border-slate-200 shrink-0" style="background-color: ${color.hex}"></div>
            <div class="flex-1 min-w-0 ml-1">
                <h4 class="text-sm font-semibold text-slate-800 capitalize truncate" title="${displayName}">${displayName}</h4>
                <p class="text-xs text-slate-500 font-mono">${color.hex}</p>
            </div>
            <div class="flex items-center">
                <button class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all" onclick="copyToClipboard('${color.hex}', '${safeDisplayName}')" title="${t.actions.copy}">
                    <i class="fas fa-copy text-xs"></i>
                </button>
                <button class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all" onclick="toggleBucket('${color.hex}', '${safeRawName}')" title="${t.actions.remove}">
                    <i class="fas fa-trash-alt text-xs"></i>
                </button>
            </div>
        `;
        listContainer.appendChild(item);
    });
}

const grid = document.getElementById('colorGrid');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const loading = document.getElementById('loading');
const resultCount = document.getElementById('resultCount');

function setView(mode) {
    currentView = mode;
    const gridBtn = document.getElementById('viewGridBtn');
    const compactBtn = document.getElementById('viewCompactBtn');
    
    const activeClass = 'bg-white shadow-sm text-indigo-600 transition-all';
    const inactiveClass = 'text-slate-400 hover:text-slate-600 transition-all';
    
    if (gridBtn && compactBtn) {
        if (mode === 'grid') {
            gridBtn.className = `p-1.5 rounded-md w-9 flex justify-center items-center ${activeClass}`;
            compactBtn.className = `p-1.5 rounded-md w-9 flex justify-center items-center ${inactiveClass}`;
        } else {
            gridBtn.className = `p-1.5 rounded-md w-9 flex justify-center items-center ${inactiveClass}`;
            compactBtn.className = `p-1.5 rounded-md w-9 flex justify-center items-center ${activeClass}`;
        }
    }
    
    handleFilterAndSort();
}

function renderColors(colors) {
    grid.innerHTML = '';
    if (colors.length === 0) {
        grid.classList.add('hidden');
        emptyState.classList.remove('hidden');
        emptyState.classList.add('flex');
        resultCount.textContent = '0 results';
        return;
    }
    emptyState.classList.add('hidden');
    emptyState.classList.remove('flex');
    grid.classList.remove('hidden');
    resultCount.textContent = `${colors.length} colors`;
    if (currentView === 'grid') {
        grid.className = 'grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-4';
    } else {
        grid.className = 'grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-1';
    }
    const fragment = document.createDocumentFragment();
    colors.forEach(color => {
        const isSelected = bucket.some(c => c.hex === color.hex);
        const t = translations[currentLang];
        const displayName = currentLang === 'zh' ? color.nameZh : color.name;
        const safeRawName = color.name.replace(/'/g, "\\'");
        const safeDisplayName = displayName.replace(/'/g, "\\'");

        if (currentView === 'grid') {
            const cardEl = document.createElement('div');
            cardEl.className = 'color-card group relative bg-white rounded-lg shadow-sm border border-slate-100 overflow-hidden cursor-pointer';
            cardEl.setAttribute('data-hex', color.hex);
            cardEl.onclick = () => toggleBucket(color.hex, color.name);
            const btnIcon = isSelected ? 'fa-check' : 'fa-plus';
            const btnBg = isSelected ? 'bg-indigo-600 text-white hover:bg-indigo-700 opacity-100' : 'bg-white text-slate-500 hover:text-indigo-600 hover:bg-slate-50 opacity-0 group-hover:opacity-100';
            const btnTitle = isSelected ? t.actions.remove : t.actions.add;
            cardEl.innerHTML = `
                <div class="h-24 w-full flex items-center justify-center relative" style="background-color: ${color.hex}">
                    <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all"></div>
                    <div class="absolute top-2 right-2 flex gap-2">
                        <button onclick="event.stopPropagation(); copyToClipboard('${color.hex}', '${safeDisplayName}')"
                            class="w-8 h-8 rounded-full shadow-md flex items-center justify-center transition-all transform hover:scale-110 bg-white text-slate-500 hover:text-indigo-600 opacity-0 group-hover:opacity-100"
                            title="${t.actions.copy}">
                            <i class="fas fa-copy text-xs"></i>
                        </button>
                        <button onclick="event.stopPropagation(); toggleBucket('${color.hex}', '${safeRawName}')"
                            class="w-8 h-8 rounded-full shadow-md flex items-center justify-center transition-all transform hover:scale-110 ${btnBg}"
                            title="${btnTitle}">
                            <i class="fas ${btnIcon} text-xs"></i>
                        </button>
                    </div>
                </div>
                <div class="p-3">
                    <div class="flex justify-between items-start">
                        <h3 class="text-xs font-bold text-slate-700 capitalize leading-tight mb-1 truncate pr-2 w-full" title="${displayName}">${displayName}</h3>
                    </div>
                    <p class="text-[10px] text-slate-400 font-mono select-all">${color.hex}</p>
                </div>
            `;
            fragment.appendChild(cardEl);
        } else {
            const div = document.createElement('div');
            div.className = 'compact-cell relative rounded-sm shadow-sm';
            div.setAttribute('data-hex', color.hex);
            div.style.backgroundColor = color.hex;
            div.title = `${displayName} (${color.hex})`;
            div.onclick = () => toggleBucket(color.hex, color.name);
            if (isSelected) div.innerHTML = `<div class="absolute inset-0 flex items-center justify-center"><i class="fas fa-check text-white text-xs drop-shadow-md"></i></div>`;
            fragment.appendChild(div);
        }
    });
    grid.appendChild(fragment);
}

function copyToClipboard(text, name) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast(translations[currentLang].toast.copied, text);
}

function showToast(title, subtitle) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast-enter bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 transform';
    let iconHtml = subtitle.startsWith('#')
        ? `<div class="w-4 h-4 rounded-full border border-white/20" style="background-color: ${subtitle}"></div>`
        : `<i class="fas fa-info-circle text-indigo-400"></i>`;
    toast.innerHTML = `${iconHtml}<div class="text-sm"><span class="font-bold capitalize">${title}</span> <span class="opacity-90 ml-1">${subtitle}</span></div>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-exit');
        toast.addEventListener('animationend', () => toast.remove());
    }, 2000);
}

let timeout = null;
function handleFilterAndSort() {
    loading.classList.remove('hidden');
    grid.classList.add('hidden');
    if (savedScrollY !== null) requestAnimationFrame(() => { window.scrollTo({ top: savedScrollY, behavior: 'instant' }); });
    clearTimeout(timeout);
    timeout = setTimeout(() => {
        const query = searchInput.value.toLowerCase();
        // Get sort method from sort select
        const sortSelect = document.getElementById('sortSelect');
        const sortMethod = sortSelect ? sortSelect.value : 'hue';
        
        let filtered = allColors.filter(c => {
            if (query && !c.name.toLowerCase().includes(query) && !c.nameZh.includes(query) && !c.hex.toLowerCase().includes(query)) return false;
            if (filters.huePreset && !matchHuePreset(c, filters.huePreset)) return false;
            return true;
        });
        let sorted = sortColors(filtered, sortMethod);
        renderColors(sorted);
        loading.classList.add('hidden');
        if (savedScrollY !== null) {
            window.scrollTo({ top: savedScrollY, behavior: 'instant' });
            savedScrollY = null;
        }
    }, 50);
}

// Initialize: load colors from colors.txt, then run app
window.addEventListener('DOMContentLoaded', () => {
    fetch('colors.txt')
        .then(r => r.text())
        .then(rawColorData => {
            allColors = parseData(rawColorData);
            setLanguage('en');
            handleFilterAndSort();
            searchInput.addEventListener('input', handleFilterAndSort);
            
            // Add event listener to sort select
            const sortSelect = document.getElementById('sortSelect');
            if (sortSelect) {
                sortSelect.addEventListener('change', handleFilterAndSort);
            }
        })
        .catch(err => {
            console.error('Failed to load colors.txt', err);
            document.getElementById('loadingText').textContent = 'Failed to load colors.';
        });
});
