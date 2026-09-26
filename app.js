const DATA_FILES = {
    characters: 'data/characters.json',
    classes: 'data/classes.json',
    items: 'data/items.json',
    skills: 'data/skills.json'
};

const ICONS = {
    characters: '👤',
    classes: '⚔️',
    items: '📦',
    skills: '✨'
};

function getCurrentPageType() {
    const path = window.location.pathname;
    if (path.includes('characters')) return 'characters';
    if (path.includes('classes')) return 'classes';
    if (path.includes('items')) return 'items';
    if (path.includes('skills')) return 'skills';
    return null;
}

async function loadData() {
    const type = getCurrentPageType();
    if (!type) return;

    try {
        const response = await fetch(DATA_FILES[type]);
        if (response.ok) {
            const data = await response.json();
            renderCards(type, data);
        } else {
            renderEmptyState(type);
        }
    } catch (e) {
        console.log(`No data file for ${type} yet`);
        renderEmptyState(type);
    }
}

function renderCards(type, data) {
    const container = document.getElementById(`${type}-list`);
    if (!container) return;

    if (!data || data.length === 0) {
        renderEmptyState(type);
        return;
    }

    container.innerHTML = data.map(item => createCard(type, item)).join('');
}

function createCard(type, item) {
    const icon = ICONS[type] || '📄';
    const stats = Object.entries(item)
        .filter(([key]) => !['name', 'id', 'description', 'image'].includes(key))
        .map(([key, value]) => `<span class="stat">${key}: ${value}</span>`)
        .join('');

    return `
        <article class="card">
            <div class="card-image">${item.image || icon}</div>
            <div class="card-content">
                <h3 class="card-name">${item.name}</h3>
                ${item.description ? `<p style="font-size: 0.9rem; color: #666; margin-bottom: 0.5rem;">${item.description}</p>` : ''}
                <div class="card-stats">${stats}</div>
            </div>
        </article>
    `;
}

function renderEmptyState(type) {
    const container = document.getElementById(`${type}-list`);
    if (!container) return;
    const labels = {
        characters: 'キャラクター',
        classes: 'クラス',
        items: 'アイテム',
        skills: 'スキル'
    };
    container.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
            <div class="card-image">${ICONS[type]}</div>
            <div class="card-content">
                <h3 class="card-name">${labels[type]}データがありません</h3>
                <p style="color: #888;">data/${type}.json を作成してデータを追加してください</p>
            </div>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', loadData);