/* ------------------------------------------------------------------ *
 * app.js - FE(Banshisenko) static database
 * No build step, no dependencies: plain ES2017 + fetch.
 * ------------------------------------------------------------------ */

const STATS = [
    { key: 'hp',  label: 'HP' },
    { key: 'str', label: '力' },
    { key: 'mag', label: '魔力' },
    { key: 'spd', label: '速さ' },
    { key: 'dex', label: '技' },
    { key: 'def', label: '守備' },
    { key: 'res', label: '魔防' },
    { key: 'lck', label: '幸運' },
    { key: 'cha', label: '魅力' }
];

const ROUTES = [
    { id: 'kai',      label: 'カイ編' },
    { id: 'dietrich', label: 'ディートリヒ編' },
    { id: 'theodora', label: 'セオドラ編' },
    { id: 'reda',     label: 'レダ編' },
    { id: 'savior',   label: '救世主編' }
];

const TIER_ORDER = ['基本職', '初級職', '中級職', '上級職', '最上級職', '神将職'];

const PAGES = {
    characters: { file: 'data/characters.json', icon: '👤', label: 'キャラクター' },
    classes:    { file: 'data/classes.json',    icon: '⚔️', label: 'クラス' },
    skills:     { file: 'data/skills.json',     icon: '✨', label: 'スキル' },
    items:      { file: 'data/items.json',      icon: '📦', label: 'アイテム' }
};

const state = {
    type: null,
    data: [],
    query: '',
    sort: 'default',
    view: 'cards',
    tableRoute: 'kai',
    tableOrder: 'both',
    // { min, max } the growth bars are drawn against, derived from the data
    scale: null,
    // gojūon row id used by the a-z jump row ('' = no filter)
    initial: '',
    // ids of the characters picked for the side-by-side comparison
    compare: []
};

/* ------------------------------------------------------------ helpers -- */

function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Site root, read off the stylesheet's own URL (always <root>/styles.css).
 * The data files store site-root-relative asset paths, but a page can sit one
 * or two directories deep, so letting the browser resolve them against the
 * document would 404 on the character detail pages.
 */
const SITE_ROOT = (() => {
    const link = document.querySelector('link[rel="stylesheet"]');
    const href = (link && link.href) || '';
    const i = href.lastIndexOf('styles.css');
    return i === -1 ? '' : href.slice(0, i);
})();

function assetUrl(path) {
    if (!path) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.charAt(0) === '/') return path;
    return SITE_ROOT + path;
}

function get(type) { return PAGES[type] || { file: '', icon: '📄', label: '' }; }

function currentType() {
    const path = window.location.pathname;
    const found = Object.keys(PAGES).find((key) => path.includes(key));
    return found || null;
}

function listElement(type) {
    return (
        document.getElementById(`${type}-list`) ||
        document.getElementById(`${type.replace(/s$/, '')}-list`)
    );
}

/** lowercase text of every searchable value of a record */
function haystack(item) {
    const parts = [];
    const walk = (value) => {
        if (value === null || value === undefined) return;
        if (Array.isArray(value)) { value.forEach(walk); return; }
        if (typeof value === 'object') { Object.values(value).forEach(walk); return; }
        parts.push(String(value));
    };
    walk(item);
    return parts.join(' ').toLowerCase();
}

function matchesQuery(item) {
    if (!state.query) return true;
    return haystack(item).includes(state.query);
}

/**
 * Gojūon rows for the jump strip. Almost every name in this game starts with
 * katakana, so the first character is folded to hiragana and matched against
 * the row's kana; anything else lands in 'other'. The voiced and semi-voiced
 * forms have to be listed explicitly - without them ジ, ダ, ベ and friends
 * would fall through to 'other' and the row counts would be badly wrong.
 */
const KANA_ROWS = [
    { id: 'a', label: 'あ', kana: 'あいうえお' },
    { id: 'k', label: 'か', kana: 'かきくけこがぎぐげご' },
    { id: 's', label: 'さ', kana: 'さしすせそざじずぜぞ' },
    { id: 't', label: 'た', kana: 'たちつてとだぢづでど' },
    { id: 'n', label: 'な', kana: 'なにぬねの' },
    { id: 'h', label: 'は', kana: 'はひふへほばびぶべぼぱぴぷぺぽ' },
    { id: 'm', label: 'ま', kana: 'まみむめも' },
    { id: 'y', label: 'や', kana: 'やゆよ' },
    { id: 'r', label: 'ら', kana: 'らりるれろ' },
    { id: 'w', label: 'わ', kana: 'わをん' },
    { id: 'other', label: '他', kana: '' }
];

function kanaRow(name) {
    const ch = (name || '').charAt(0);
    if (!ch) return 'other';
    let code = ch.charCodeAt(0);
    // katakana -> hiragana is a fixed 0x60 offset
    if (code >= 0x30A1 && code <= 0x30F6) code -= 0x60;
    const hira = String.fromCharCode(code);
    for (let i = 0; i < KANA_ROWS.length; i++) {
        if (KANA_ROWS[i].kana && KANA_ROWS[i].kana.indexOf(hira) !== -1) return KANA_ROWS[i].id;
    }
    return 'other';
}

function matchesInitial(item) {
    if (!state.initial) return true;
    return kanaRow(item.name) === state.initial;
}

/**
 * A-z jump strip. Only rows that actually occur in the data are offered, so
 * there are no dead buttons.
 */
function renderJump() {
    const jump = document.getElementById('jump');
    if (!jump) return;
    const inUse = new Set(state.data.map((d) => kanaRow(d.name)));
    jump.innerHTML = `
        <div class="jump-inner" role="group" aria-label="あ行で絞り込む">
            <button type="button" class="jump-btn${state.initial ? '' : ' is-active'}" data-initial="">すべて</button>
            ${KANA_ROWS.filter((r) => inUse.has(r.id)).map((r) =>
                `<button type="button" class="jump-btn${state.initial === r.id ? ' is-active' : ''}" data-initial="${esc(r.id)}">${esc(r.label)}</button>`
            ).join('')}
        </div>`;
}

function statValue(source, key) {
    if (!source) return null;
    const value = source[key];
    return typeof value === 'number' ? value : null;
}

/**
 * The { min, max } every bar of one data set is drawn against. It is derived
 * from the data on purpose: a hard-coded scale below the real maximum silently
 * clamps the longest bars, so e.g. 25 and 30 both render at 100% and look
 * identical. One shared scale for the whole set also keeps bars comparable
 * from card to card.
 */
function rateScale(items) {
    let min = 0;
    let max = 0;
    (items || []).forEach((item) => {
        const rates = (item && (item.growth_rates || item.growth_bonus)) || null;
        if (!rates) return;
        STATS.forEach((s) => {
            const value = statValue(rates, s.key);
            if (value === null) return;
            if (value < min) min = value;
            if (value > max) max = value;
        });
    });
    return { min, max: max > min ? max : 1 };
}

/**
 * One bar. Nothing is clamped: a value above the scale would be cut off and
 * two different values would render the same length. When the scale dips below
 * zero the track is split at 0, so a negative growth rate reads as a bar on the
 * left of the line instead of an empty track indistinguishable from 0.
 */
function statBar(label, value, scale) {
    const lo = scale && typeof scale.min === 'number' ? scale.min : 0;
    const hi = scale && typeof scale.max === 'number' && scale.max > lo ? scale.max : 1;
    const span = hi - lo;
    const zero = ((0 - lo) / span) * 100;
    const at = Math.max(0, Math.min(100, ((value - lo) / span) * 100));
    const left = Math.min(at, zero);
    const width = Math.abs(at - zero);
    const split = lo < 0 ? ' is-split' : '';
    return `
        <div class="statbar">
            <span class="statbar-label">${esc(label)}</span>
            <span class="statbar-track${split}" style="--zero:${zero.toFixed(2)}%"><span class="statbar-fill${value < 0 ? ' neg' : ''}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"></span></span>
            <span class="statbar-value">${esc(value)}</span>
        </div>`;
}

function growthGrid(rates, scale) {
    if (!rates) return '';
    const split = scale && scale.min < 0 ? ' is-split' : '';
    return `<div class="statgrid${split}">${STATS.map((s) => {
        const value = statValue(rates, s.key);
        if (value === null) return '';
        return statBar(s.label, value, scale);
    }).join('')}</div>`;
}

function tagList(values, className) {
    if (!values) return '';
    const list = Array.isArray(values) ? values : [values];
    if (!list.length) return '';
    return `<div class="taglist">${list
        .map((v) => `<span class="tag ${className || ''}">${esc(v)}</span>`)
        .join('')}</div>`;
}

/**
 * Key/value block. `raw` keeps pre-escaped markup (used where a value carries
 * its own <strong> markup, e.g. skill name + effect).
 */
function rows(pairs, raw) {
    const cells = pairs
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .map(([label, value]) => `
            <div class="kv">
                <span class="kv-label">${esc(label)}</span>
                <span class="kv-value">${raw ? value : esc(value)}</span>
            </div>`);
    return cells.length ? `<div class="kvs">${cells.join('')}</div>` : '';
}

function emptyState(message) {
    return `
        <div class="card empty">
            <div class="card-image">${get(state.type).icon}</div>
            <div class="card-content">
                <h3 class="card-name">${esc(message)}</h3>
                <p class="muted">条件に合うデータがありません</p>
            </div>
        </div>`;
}


/* --------------------------------------------------------- characters -- */

/**
 * Portrait block. The images are ~466px squares and are always displayed well
 * below that (128px in the list, 210px on the detail page), so they are scaled
 * down and stay sharp. The box comes from CSS, so no width/height attributes
 * are emitted and there is no layout shift. When a record carries no image the
 * name's first character stands in, so a card keeps its shape.
 */
function characterFigure(item, extraClass) {
    const cls = 'card-figure' + (extraClass ? ' ' + extraClass : '');
    if (item.image) {
        return `<div class="${cls}">` +
            `<img src="${esc(assetUrl(item.image))}" alt="${esc(item.name)}" ` +
            `loading="lazy" decoding="async"></div>`;
    }
    return `<div class="${cls} is-empty" aria-hidden="true">${esc((item.name || '?').charAt(0))}</div>`;
}

/**
 * Small portrait for a table's name cell. Decorative only (alt is empty)
 * because the name sits right beside it.
 */
function characterAvatar(item) {
    if (!item.image) return '';
    return `<img class="avatar" src="${esc(assetUrl(item.image))}" alt="" loading="lazy" decoding="async">`;
}

function renderCharacter(item) {
    const growth = item.growth_rates || {};

    const badges = [];
    if (item.gender) badges.push(`<span class="tag">${esc(item.gender)}</span>`);
    if (item.blaze_type) badges.push(`<span class="tag tag-blaze">${esc(item.blaze_type)}</span>`);
    if (item.blaze_skill) badges.push(`<span class="tag tag-blaze">${esc(item.blaze_skill)}</span>`);
    if (item.blaze_arts) badges.push(`<span class="tag tag-blaze">${esc(item.blaze_arts)}</span>`);

    const skills = [];
    if (item.personal_skill) {
        skills.push(`
            <div class="kv">
                <span class="kv-label">個人スキル</span>
                <span class="kv-value"><strong>${esc(item.personal_skill.name)}</strong>${item.personal_skill.effect ? `<br><span class="muted">${esc(item.personal_skill.effect)}</span>` : ''}</span>
            </div>`);
    }
    (item.blood_seals || []).forEach((seal) => {
        skills.push(`
            <div class="kv">
                <span class="kv-label">血印</span>
                <span class="kv-value"><strong>${esc(seal.name)}</strong>${seal.effect ? `<br><span class="muted">${esc(seal.effect)}</span>` : ''}</span>
            </div>`);
    });

    return `
        <article class="card" data-id="${esc(item.id)}">
            <div class="card-content">
                <header class="card-head">
                    ${characterFigure(item, 'card-portrait')}
                    <div class="card-id">
                        <h3 class="card-name"><a href="${encodeURIComponent(item.id)}/">${esc(item.name)}</a></h3>
                        <div class="taglist">${badges.join('')}</div>
                    </div>
                    <button type="button" class="cmp-btn${isCompared(item.id) ? ' is-on' : ''}" data-cmp="${esc(item.id)}" aria-pressed="${isCompared(item.id) ? 'true' : 'false'}">${isCompared(item.id) ? '選択中' : '比較'}</button>
                </header>

                <div class="card-block">
                    <h4>成長率 <span class="muted">合計 ${esc(growth.total)}</span></h4>
                    ${growthGrid(growth, state.scale)}
                </div>

                ${skills.length ? `<div class="card-block"><h4>固有</h4><div class="kvs">${skills.join('')}</div></div>` : ''}

                ${item.forte_skills || item.weak_skills ? `
                <div class="card-block">
                    <h4>技能</h4>
                    ${item.forte_skills ? `<p class="skillline"><span class="skill-tag">得意</span>${tagList(item.forte_skills)}</p>` : ''}
                    ${item.weak_skills ? `<p class="skillline"><span class="skill-tag weak">苦手</span>${tagList(item.weak_skills)}</p>` : ''}
                </div>` : ''}

                ${item.recruit ? `
                <div class="card-block">
                    <h4>加入条件</h4>
                    <table class="mini">
                        <thead><tr><th>ルート</th><th>方式</th><th>支援</th><th>名声</th><th>その他</th></tr></thead>
                        <tbody>
                        ${ROUTES.filter((r) => item.recruit[r.id]).map((r) => {
                            const e = item.recruit[r.id];
                            const other = [e.part, e.stage, e.place, e.condition, e.note]
                                .filter(Boolean).join(' / ');
                            return `<tr>
                                <td>${esc(r.label)}</td>
                                <td>${esc(e.method || '')}</td>
                                <td class="num">${e.support_level === undefined ? '' : esc(e.support_level)}</td>
                                <td class="num">${e.fame_level === undefined ? '' : esc(e.fame_level)}</td>
                                <td class="muted">${esc(other)}</td>
                            </tr>`;
                        }).join('')}
                        </tbody>
                    </table>
                </div>` : ''}

                ${rows([
                    ['好きなもの', item.favorites]
                ])}
            </div>
        </article>`;
}

/* the "hayakabe" view: one row per unit, one column per route */
function renderRecruitTable(list) {
    return `
        <div class="tablewrap">
            <table class="hayakabe">
                <thead>
                    <tr>
                        <th class="sticky">キャラ</th>
                        ${ROUTES.map((r) => `<th class="${r.id === state.tableRoute ? 'is-active' : ''}">${esc(r.label)}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                ${list.map((item) => `
                    <tr>
                        <th class="sticky"><a href="${encodeURIComponent(item.id)}/">${esc(item.name)}</a></th>
                        ${ROUTES.map((r) => {
                            const e = (item.recruit || {})[r.id];
                            const active = r.id === state.tableRoute ? ' class="is-active"' : '';
                            if (!e) return `<td class="na"${active}>-</td>`;
                            if (e.method === '対象外') return `<td class="na"${active}>対象外</td>`;
                            if (e.fame_level === undefined) {
                                return `<td${active}><span class="cell-main">${esc(e.method || '')}</span><span class="cell-sub">${esc([e.part, e.stage].filter(Boolean).join(' '))}</span></td>`;
                            }
                            return `<td${active}>
                                <span class="cell-main">支援${esc(e.support_level)} / 名声${esc(e.fame_level)}</span>
                                <span class="cell-sub">${esc([e.stage, e.place].filter(Boolean).join(' '))}</span>
                            </td>`;
                        }).join('')}
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

/* ------------------------------------------------- growth-rate table -- */

/**
 * Columns the growth table can sort by. 'total' is a derived column, so it
 * lives here rather than in STATS (which drives the bars).
 */
const GROWTH_SORT_KEYS = new Set(['name', 'total'].concat(STATS.map((s) => s.key)));

/**
 * Which column the current sort belongs to, as { key, dir }.
 * 'default' (data order) has no column, so no header is marked.
 * `state.sort` stays the single source of truth: the sort select and the
 * table headers are two views of the same value.
 */
function growthSortState() {
    const mode = state.sort;
    if (mode === 'name' || mode === 'name-desc') {
        return { key: 'name', dir: mode === 'name' ? 'asc' : 'desc' };
    }
    if (mode.endsWith('-asc') && GROWTH_SORT_KEYS.has(mode.slice(0, -4))) {
        return { key: mode.slice(0, -4), dir: 'asc' };
    }
    if (GROWTH_SORT_KEYS.has(mode)) return { key: mode, dir: 'desc' };
    return { key: null, dir: null };
}

/** header cell; clicking it flips that column between ascending/descending */
function growthHeadCell(key, label, extraClass) {
    const current = growthSortState();
    const active = current.key === key;
    const cls = ['sortable', extraClass || ''];
    if (active) cls.push('is-active', current.dir);
    const mark = active ? (current.dir === 'asc' ? ' ▲' : ' ▼') : '';
    const aria = active ? (current.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    return `<th class="${cls.join(' ').trim()}" aria-sort="${aria}">` +
        `<button type="button" data-sort="${esc(key)}">${esc(label)}${mark}</button></th>`;
}

function applyGrowthSort(key) {
    const current = growthSortState();
    const dir = current.key === key
        ? (current.dir === 'desc' ? 'asc' : 'desc')
        : (key === 'name' ? 'asc' : 'desc');
    state.sort = dir === 'asc'
        ? (key === 'name' ? 'name' : `${key}-asc`)
        : (key === 'name' ? 'name-desc' : key);
    const select = document.getElementById('sort');
    if (select) select.value = state.sort;
    renderList();
}

/* one row per unit: name plus the nine growth rates, frozen header */
function renderNameGrowthTable(list) {
    return `
        <div class="tablewrap namewrap">
            <table class="namegrowth">
                <thead>
                    <tr>
                        ${growthHeadCell('name', '名前', 'sticky')}
                        ${STATS.map((s) => growthHeadCell(s.key, s.label, 'num')).join('')}
                        ${growthHeadCell('total', '合計', 'num col-total')}
                    </tr>
                </thead>
                <tbody>
                ${list.map((item) => {
                    const growth = item.growth_rates || {};
                    return `<tr>
                        <th class="sticky">${characterAvatar(item)}<a href="${encodeURIComponent(item.id)}/">${esc(item.name)}</a></th>
                        ${STATS.map((s) => `<td class="num">${esc(statValue(growth, s.key))}</td>`).join('')}
                        <td class="num col-total">${esc(growth.total)}</td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>
        </div>`;
}


/* --------------------------------------------------- character compare -- */

const COMPARE_MAX = 4;
const COMPARE_KEY = 'fe.compare.v1';

/** selection survives a reload; localStorage can throw in private mode */
function loadCompare() {
    try {
        const raw = window.localStorage.getItem(COMPARE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            state.compare = parsed.filter((id) => typeof id === 'string').slice(0, COMPARE_MAX);
        }
    } catch (error) { /* no storage: the selection just does not persist */ }
}

function saveCompare() {
    try { window.localStorage.setItem(COMPARE_KEY, JSON.stringify(state.compare)); } catch (error) { /* ignore */ }
}

function compareItems() {
    return state.compare
        .map((id) => state.data.find((c) => c.id === id))
        .filter(Boolean);
}

function isCompared(id) {
    return state.compare.indexOf(id) !== -1;
}

/** returns false when the tray is already full, so the caller can say so */
function toggleCompare(id) {
    const at = state.compare.indexOf(id);
    if (at !== -1) {
        state.compare.splice(at, 1);
        saveCompare();
        renderList();
        return true;
    }
    if (state.compare.length >= COMPARE_MAX) return false;
    state.compare.push(id);
    saveCompare();
    renderList();
    return true;
}

function compareCell(items, value, isBest) {
    if (value === null || value === undefined || value === '') return '<td class="num is-blank">-</td>';
    return `<td class="num${isBest ? ' is-best' : ''}">${esc(value)}</td>`;
}

function renderCompare() {
    const items = compareItems();
    if (!items.length) {
        return `<div class="cmp-empty">
            <p>カード右上の「比較」を押すと、ここに並びます。</p>
            <p class="muted">一度に ${COMPARE_MAX} 人まで選べます。選択はこの端末に保存されます。</p>
        </div>`;
    }

    const growthOf = (c) => c.growth_rates || {};
    const best = {};
    STATS.forEach((s) => {
        let m = -Infinity;
        items.forEach((c) => {
            const v = statValue(growthOf(c), s.key);
            if (v !== null && v > m) m = v;
        });
        best[s.key] = m;
    });
    let bestTotal = -Infinity;
    items.forEach((c) => {
        const v = statValue(growthOf(c), 'total');
        if (v !== null && v > bestTotal) bestTotal = v;
    });

    const header = items.map((c) => `
        <th class="cmp-head">
            <a href="${encodeURIComponent(c.id)}/">
                ${characterFigure(c, 'cmp-portrait')}
                <span class="cmp-name">${esc(c.name)}</span>
            </a>
        </th>`).join('');

    const statRows = STATS.map((s) => `
        <tr>
            <th class="sticky">${esc(s.label)}</th>
            ${items.map((c) => {
                const v = statValue(growthOf(c), s.key);
                return compareCell(items, v, v !== null && v === best[s.key]);
            }).join('')}
        </tr>`).join('');

    function textRow(label, pick) {
        const cells = items.map((c) => {
            const v = pick(c);
            return `<td>${v ? esc(v) : '<span class="is-blank">-</span>'}</td>`;
        }).join('');
        return `<tr><th class="sticky">${esc(label)}</th>${cells}</tr>`;
    }

    return `
        <div class="tablewrap cmp-wrap">
            <table class="cmptable">
                <thead><tr><th class="sticky">項目</th>${header}</tr></thead>
                <tbody>
                    ${statRows}
                    <tr>
                        <th class="sticky">合計</th>
                        ${items.map((c) => {
                            const v = statValue(growthOf(c), 'total');
                            return compareCell(items, v, v !== null && v === bestTotal);
                        }).join('')}
                    </tr>
                    ${textRow('性別', (c) => c.gender)}
                    ${textRow('個人スキル', (c) => (c.personal_skill || {}).name)}
                    ${textRow('血印', (c) => (c.blood_seals || []).map((b) => b.name).join(' / '))}
                    ${textRow('得意', (c) => (c.forte_skills || []).join(' / '))}
                    ${textRow('苦手', (c) => (c.weak_skills || []).join(' / '))}
                    ${textRow('声優', (c) => c.voice_actor)}
                </tbody>
            </table>
        </div>
        <div class="cmp-actions">
            <button type="button" class="copy-btn" id="cmp-clear">選択をすべて解除</button>
        </div>`;
}

/* the tray that follows you down the page while picking characters */
function renderCompareTray() {
    const tray = document.getElementById('cmp-tray');
    if (!tray) return;
    const items = compareItems();
    if (!items.length || state.view === 'compare') {
        tray.hidden = true;
        tray.innerHTML = '';
        return;
    }
    tray.hidden = false;
    tray.innerHTML = `
        <div class="cmp-tray-inner">
            <span class="cmp-tray-label">比較 <strong>${items.length}</strong>/${COMPARE_MAX}</span>
            <div class="cmp-tray-items">
                ${items.map((c) => `
                    <button type="button" class="cmp-chip" data-cmp="${esc(c.id)}" title="${esc(c.name)} を外す">
                        ${c.image ? `<img class="avatar" src="${esc(assetUrl(c.image))}" alt="">` : ''}
                        <span>${esc(c.name)}</span>
                        <span class="cmp-x" aria-hidden="true">×</span>
                    </button>`).join('')}
            </div>
            <button type="button" class="copy-btn" id="cmp-go">比較する</button>
        </div>`;
}

/* -------------------------------------------------------------- theme -- */

const THEME_KEY = 'fe.theme';

/** 'dark' | 'light' | '' (empty = follow the OS) */
function storedTheme() {
    try { return window.localStorage.getItem(THEME_KEY) || ''; } catch (error) { return ''; }
}

function effectiveTheme() {
    const saved = storedTheme();
    if (saved === 'dark' || saved === 'light') return saved;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

function applyTheme(theme) {
    // '' means "follow the OS", which still has to resolve to a concrete value
    // because the dark rules are keyed on [data-theme="dark"]
    const resolved = (theme === 'dark' || theme === 'light') ? theme : effectiveTheme();
    document.documentElement.setAttribute('data-theme', resolved);
    const button = document.getElementById('theme-toggle');
    if (button) {
        const dark = resolved === 'dark';
        button.textContent = dark ? '☀' : '☾';
        button.setAttribute('aria-label', dark ? 'ライトモードにする' : 'ダークモードにする');
        button.title = button.getAttribute('aria-label');
    }
}

function toggleTheme() {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    try { window.localStorage.setItem(THEME_KEY, next); } catch (error) { /* ignore */ }
    applyTheme(next);
}

/** the switch lives in the banner, created here so no page needs editing */
function mountThemeToggle() {
    const header = document.querySelector('body > header');
    if (!header || document.getElementById('theme-toggle')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'theme-toggle';
    button.className = 'theme-toggle';
    button.addEventListener('click', toggleTheme);
    header.appendChild(button);
}

/* ------------------------------------------------------------ classes and lists -- */

function renderClass(item) {
    const badges = [];
    if (item.tier) badges.push(`<span class="tag tag-class">${esc(item.tier)}</span>`);
    if (item.movement !== undefined) badges.push(`<span class="tag">移動力 ${esc(item.movement)}</span>`);
    if (item.move_type) badges.push(`<span class="tag">${esc(item.move_type)}</span>`);
    if (item.tp !== undefined) badges.push(`<span class="tag">TP ${esc(item.tp)}</span>`);

    return `
        <article class="card" data-id="${esc(item.id)}">
            <div class="card-content">
                <header class="card-head">
                    <h3 class="card-name"><a href="${encodeURIComponent(item.id)}/">${esc(item.name)}</a></h3>
                    <div class="taglist">${badges.join('')}</div>
                </header>

                ${item.growth_bonus ? `
                <div class="card-block">
                    <h4>成長ボーナス</h4>
                    ${growthGrid(item.growth_bonus, state.scale)}
                </div>` : ''}

                ${item.description ? `<p class="muted desc">${esc(item.description)}</p>` : ''}

                ${rows([
                    ['兵種スキル', item.class_skill],
                    ['マスタースキル', item.master_skill],
                    ['熟練度', item.weapon_exp_bonus],
                    ['必要技能', item.required_skills],
                    ['技能上限', item.skill_caps],
                    ['解放条件', [item.unlock_item, item.unlock_note].filter(Boolean).join(' / ')]
                ])}

                ${item.usable_skills ? `
                <div class="card-block">
                    <h4>使用可能技能</h4>
                    ${tagList(item.usable_skills)}
                </div>` : ''}
            </div>
        </article>`;
}

function renderSkill(item) {
    const extras = rows([
        ['習得', item.obtain],
        ['威力', item.power],
        ['射程', item.range],
        ['命中', item.hit],
        ['必殺', item.critical],
        ['補正', item.stat_bonus],
        ['発動条件', item.source]
    ]);
    return `
        <article class="card" data-id="${esc(item.id)}">
            <div class="card-content">
                <header class="card-head">
                    <h3 class="card-name">${esc(item.name)}</h3>
                    ${item.type ? `<div class="taglist"><span class="tag">${esc(item.type)}</span></div>` : ''}
                </header>
                ${item.effect ? `<p class="effect">${esc(item.effect)}</p>` : ''}
                ${extras}
                ${item.owners && item.owners.length ? `
                    <div class="card-block">
                        <h4>保有者</h4>
                        ${tagList(item.owners)}
                    </div>` : ''}
            </div>
        </article>`;
}

function renderItem(item) {
    const skip = new Set(['id', 'name', 'image']);
    const pairs = Object.keys(item)
        .filter((key) => !skip.has(key) && item[key] !== null && item[key] !== undefined && item[key] !== '')
        .map((key) => [key, Array.isArray(item[key]) ? item[key].join(' / ') : item[key]]);
    return `
        <article class="card" data-id="${esc(item.id || item.name)}">
            <div class="card-content">
                <header class="card-head">
                    <h3 class="card-name">${esc(item.name)}</h3>
                </header>
                ${rows(pairs)}
            </div>
        </article>`;
}

const RENDERERS = {
    characters: renderCharacter,
    classes: renderClass,
    skills: renderSkill,
    items: renderItem
};

function renderList() {
    renderListInner();
    syncUrl();
}

function renderListInner() {
    const container = listElement(state.type);
    if (!container) return;

    const isCompare = state.type === 'characters' && state.view === 'compare';
    // the comparison ignores the search and the jump strip: it is a fixed set
    const filtered = isCompare
        ? state.data
        : state.data.filter(matchesQuery).filter(matchesInitial);
    const isTable = state.type === 'characters' && state.view === 'table';
    const isNameTable = state.type === 'characters' && state.view === 'names';
    const list = isTable
        ? sortByRoute(filtered, state.tableRoute, state.tableOrder)
        : sortData(filtered, state.sort);

    const tableControls = document.getElementById('table-controls');
    if (tableControls) tableControls.hidden = !isTable;

    if (!list.length) {
        container.classList.remove('as-table');
        container.innerHTML = emptyState(`${get(state.type).label}が見つかりません`);
        return;
    }

    if (isCompare) {
        container.classList.add('as-table');
        container.innerHTML = renderCompare();
    } else if (isTable) {
        container.classList.add('as-table');
        container.innerHTML = renderRecruitTable(list);
    } else if (isNameTable) {
        container.classList.add('as-table');
        container.innerHTML = renderNameGrowthTable(list);
    } else {
        container.classList.remove('as-table');
        const render = RENDERERS[state.type] || renderItem;
        container.innerHTML = list.map(render).join('');
    }

    const counter = document.getElementById('result-count');
    if (counter) counter.textContent = `${list.length} / ${state.data.length} 件`;
    // the copy button only makes sense while a table is on screen
    const copyButton = document.getElementById('copy-table');
    if (copyButton) copyButton.hidden = !document.querySelector('#characters-list table');
    const jump = document.getElementById('jump');
    if (jump) jump.hidden = isCompare;
    if (!isCompare) renderJump();
    renderCompareTray();
}

function sortData(list, mode) {
    const byName = (a, b) => a.name.localeCompare(b.name, 'ja');
    const copy = list.slice();
    switch (mode) {
        case 'name':      return copy.sort(byName);
        case 'name-desc': return copy.sort((a, b) => byName(b, a));
        case 'total':     return copy.sort((a, b) => statTotal(b) - statTotal(a) || byName(a, b));
        case 'total-asc': return copy.sort((a, b) => statTotal(a) - statTotal(b) || byName(a, b));
        case 'movement':  return copy.sort((a, b) => (b.movement || 0) - (a.movement || 0));
        case 'tier':      return copy.sort((a, b) => tierIndex(a.tier) - tierIndex(b.tier) || byName(a, b));
        case 'type':      return copy.sort((a, b) => String(a.type || '').localeCompare(String(b.type || ''), 'ja') || byName(a, b));
        default:
            // 'hp', 'str', ... sort high-to-low; the '-asc' variants (used by the
            // growth table headers) sort the other way. Ties fall back to the name.
            if (mode.endsWith('-asc') && STAT_KEYS.has(mode.slice(0, -4))) {
                const key = mode.slice(0, -4);
                return copy.sort((a, b) => statOf(a, key) - statOf(b, key) || byName(a, b));
            }
            if (STAT_KEYS.has(mode)) {
                return copy.sort((a, b) => statOf(b, mode) - statOf(a, mode) || byName(a, b));
            }
            return copy;
    }
}

/** effective value of one stat: character growth plus class growth bonus */
function statOf(item, key) {
    return ((item.growth_rates || {})[key] || 0) + ((item.growth_bonus || {})[key] || 0);
}

function statTotal(item) {
    return STATS.reduce((sum, s) => sum + statOf(item, s.key), 0);
}

/** support / fame level of a unit on one route, or null when it does not apply */
function routeLevels(item, routeId) {
    const entry = (item.recruit || {})[routeId];
    if (!entry) return null;
    const hasSupport = typeof entry.support_level === 'number';
    const hasFame = typeof entry.fame_level === 'number';
    return hasSupport || hasFame ? entry : null;
}

/**
 * Sort the recruit table by the support / fame numbers of one route.
 * order: 'name' | 'fame' | 'support' | 'both' (fame first, then support).
 * Units that cannot be recruited on that route are kept but pushed to the end.
 */
function sortByRoute(list, routeId, order) {
    const byName = (a, b) => a.name.localeCompare(b.name, 'ja');
    if (order === 'name') return list.slice().sort(byName);

    return list.slice().sort((a, b) => {
        const ea = routeLevels(a, routeId);
        const eb = routeLevels(b, routeId);
        if (!ea && !eb) return byName(a, b);
        if (!ea) return 1;
        if (!eb) return -1;

        // ascending: the comparator must return a - b so the smallest comes first
        let diff = 0;
        if (order === 'fame' || order === 'both') {
            diff = (ea.fame_level ?? Number.MAX_SAFE_INTEGER) - (eb.fame_level ?? Number.MAX_SAFE_INTEGER);
        }
        if (!diff && (order === 'support' || order === 'both')) {
            diff = (ea.support_level ?? Number.MAX_SAFE_INTEGER) - (eb.support_level ?? Number.MAX_SAFE_INTEGER);
        }
        return diff || byName(a, b);
    });
}

function tierIndex(tier) {
    const index = TIER_ORDER.indexOf(tier);
    return index === -1 ? TIER_ORDER.length : index;
}


/* ------------------------------------------------- character detail page -- */

const detail = { tier: 'all', order: 'total-desc' };

/** growth rates this character would have in the given class */
function mergedGrowth(character, cls) {
    const base = character.growth_rates || {};
    const bonus = (cls && cls.growth_bonus) || {};
    const growth = {};
    let total = 0;
    STATS.forEach((s) => {
        const value = (base[s.key] || 0) + (bonus[s.key] || 0);
        growth[s.key] = value;
        total += value;
    });
    growth.total = total;
    return growth;
}

function classGrowthRows(character, classes) {
    const base = character.growth_rates || {};
    const rows = classes.map((cls) => {
        const growth = mergedGrowth(character, cls);
        return { cls, growth, diff: growth.total - (base.total || 0) };
    });

    const filtered = detail.tier === 'all' ? rows : rows.filter((r) => r.cls.tier === detail.tier);
    const byName = (a, b) => a.cls.name.localeCompare(b.cls.name, 'ja');
    filtered.sort((a, b) => {
        if (detail.order === 'name') return byName(a, b);
        if (detail.order === 'total-asc') return a.growth.total - b.growth.total || byName(a, b);
        return b.growth.total - a.growth.total || byName(a, b);
    });
    return filtered;
}

function classGrowthTable(character, classes) {
    const base = character.growth_rates || {};
    const rows = classGrowthRows(character, classes);
    if (!rows.length) return '<p class="muted">該当する兵種がありません</p>';

    const best = rows.reduce((acc, r) => Math.max(acc, r.growth.total), Number.NEGATIVE_INFINITY);

    // best value per stat across the rows actually shown, so the highlight
    // follows the tier filter instead of the whole table
    const top = {};
    STATS.forEach((s) => {
        top[s.key] = rows.reduce((m, r) => Math.max(m, r.growth[s.key]), Number.NEGATIVE_INFINITY);
    });

    return `
        <div class="tablewrap">
            <table class="classtable">
                <thead>
                    <tr>
                        <th class="sticky">兵種</th>
                        <th>階級</th>
                        ${STATS.map((s) => `<th class="num">${esc(s.label)}</th>`).join('')}
                        <th class="num">合計</th>
                        <th class="num">差</th>
                    </tr>
                </thead>
                <tbody>
                ${rows.map((r) => `
                    <tr${r.growth.total === best ? ' class="is-best"' : ''}>
                        <th class="sticky"><a href="../classes/${encodeURIComponent(r.cls.id)}/">${esc(r.cls.name)}</a></th>
                        <td class="muted">${esc(r.cls.tier || '')}</td>
                        ${STATS.map((s) => {
                            const value = r.growth[s.key];
                            const origin = base[s.key] || 0;
                            const d = value - origin;
                            const cls = d > 0 ? 'up' : (d < 0 ? 'down' : '');
                            // show the move from the bare value, and mark the best
                            const delta = d === 0 ? '' : `<span class="delta">${d > 0 ? '+' : ''}${esc(d)}</span>`;
                            const isTop = value === top[s.key] ? ' is-top' : '';
                            return `<td class="num ${cls}${isTop}">${esc(value)}${delta}</td>`;
                        }).join('')}
                        <td class="num"><strong>${esc(r.growth.total)}</strong></td>
                        <td class="num ${r.diff > 0 ? 'up' : (r.diff < 0 ? 'down' : '')}">${r.diff > 0 ? '+' : ''}${esc(r.diff)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}


function renderCharacterDetail(character, classes, container) {
    const growth = character.growth_rates || {};

    const badges = [];
    if (character.gender) badges.push(`<span class="tag">${esc(character.gender)}</span>`);
    if (character.blaze_type) badges.push(`<span class="tag tag-blaze">${esc(character.blaze_type)}</span>`);
    if (character.blaze_skill) badges.push(`<span class="tag tag-blaze">${esc(character.blaze_skill)}</span>`);
    if (character.blaze_arts) badges.push(`<span class="tag tag-blaze">${esc(character.blaze_arts)}</span>`);

    // values already carry their own markup here, hence rows(own, true)
    const own = [];
    if (character.personal_skill) {
        own.push(['個人スキル', `<strong>${esc(character.personal_skill.name)}</strong>${character.personal_skill.effect ? `<br><span class="muted">${esc(character.personal_skill.effect)}</span>` : ''}`]);
    }
    (character.blood_seals || []).forEach((seal) => {
        own.push(['血印', `<strong>${esc(seal.name)}</strong>${seal.effect ? `<br><span class="muted">${esc(seal.effect)}</span>` : ''}`]);
    });
    if (character.favorites) own.push(['好きなもの', esc(character.favorites)]);

    const recruit = character.recruit || {};
    const recruitRows = ROUTES.filter((r) => recruit[r.id]).map((r) => {
        const e = recruit[r.id];
        const other = [e.part, e.stage, e.place, e.condition, e.note].filter(Boolean).join(' / ');
        return `<tr>
            <td>${esc(r.label)}</td>
            <td>${esc(e.method || '')}</td>
            <td class="num">${e.support_level === undefined ? '' : esc(e.support_level)}</td>
            <td class="num">${e.fame_level === undefined ? '' : esc(e.fame_level)}</td>
            <td class="muted">${esc(other)}</td>
        </tr>`;
    }).join('');

    const tierOptions = TIER_ORDER.map((tier) =>
        `<option value="${esc(tier)}"${tier === detail.tier ? ' selected' : ''}>${esc(tier)}</option>`).join('');

    container.innerHTML = `
        <div class="detail">
            <header class="detail-head">
                <div class="detail-id">
                    ${characterFigure(character, 'detail-portrait')}
                    <div>
                        <h2 class="detail-name">${esc(character.name)}</h2>
                        <div class="taglist">${badges.join('')}</div>
                    </div>
                </div>
                <a class="backlink" href="../">← キャラクター一覧</a>
            </header>

            <section class="panel">
                <h3>成長率 <span class="muted">合計 ${esc(growth.total)}</span></h3>
                ${growthGrid(growth, state.scale)}
            </section>

            ${own.length ? `<section class="panel"><h3>固有</h3>${rows(own, true)}</section>` : ''}

            ${(character.forte_skills || character.weak_skills) ? `
            <section class="panel">
                <h3>技能</h3>
                ${character.forte_skills ? `<p class="skillline"><span class="skill-tag">得意</span>${tagList(character.forte_skills)}</p>` : ''}
                ${character.weak_skills ? `<p class="skillline"><span class="skill-tag weak">苦手</span>${tagList(character.weak_skills)}</p>` : ''}
            </section>` : ''}

            ${recruitRows ? `
            <section class="panel">
                <h3>加入条件</h3>
                <table class="mini">
                    <thead><tr><th>ルート</th><th>方式</th><th>支援</th><th>名声</th><th>その他</th></tr></thead>
                    <tbody>${recruitRows}</tbody>
                </table>
            </section>` : ''}

            <section class="panel">
                <h3>このキャラクターが各兵種になった場合の成長率</h3>
                <p class="muted">素の成長率に各兵種の成長ボーナスを加えた値です。色付きの数値は素からの増減を示します。</p>
                <div class="toolbar-inner">
                    <label class="control">
                        <span>階級</span>
                        <select id="detail-tier">
                            <option value="all"${detail.tier === 'all' ? ' selected' : ''}>すべて</option>
                            ${tierOptions}
                        </select>
                    </label>
                    <label class="control">
                        <span>並び替え</span>
                        <select id="detail-order">
                            <option value="total-desc"${detail.order === 'total-desc' ? ' selected' : ''}>合計が高い順</option>
                            <option value="total-asc"${detail.order === 'total-asc' ? ' selected' : ''}>合計が低い順</option>
                            <option value="name"${detail.order === 'name' ? ' selected' : ''}>名前順</option>
                        </select>
                    </label>
                </div>
                <div id="detail-classes">${classGrowthTable(character, classes)}</div>
            </section>
        </div>`;

    const refresh = () => {
        const host = container.querySelector('#detail-classes');
        if (host) host.innerHTML = classGrowthTable(character, classes);
    };
    const tierSelect = container.querySelector('#detail-tier');
    if (tierSelect) {
        tierSelect.addEventListener('change', (event) => {
            detail.tier = event.target.value;
            refresh();
        });
    }
    const orderSelect = container.querySelector('#detail-order');
    if (orderSelect) {
        orderSelect.addEventListener('change', (event) => {
            detail.order = event.target.value;
            refresh();
        });
    }
}

async function loadDetailPage(id) {
    const container = document.getElementById('character-detail');
    if (!container) return;

    try {
        const [characters, classes] = await Promise.all([
            fetchJson({ file: 'data/characters.json' }),
            fetchJson({ file: 'data/classes.json' })
        ]);
        state.scale = rateScale(characters);
        const character = characters.find((c) => c.id === id || c.name === id);
        if (!character) {
            container.innerHTML = emptyState('キャラクターが見つかりません');
            return;
        }
        document.title = `${character.name} - FE万紫千紅 データベース`;
        renderCharacterDetail(character, classes, container);
    } catch (error) {
        console.error('Failed to load the character detail page', error);
        container.innerHTML = `
            <div class="card empty">
                <div class="card-image">👤</div>
                <div class="card-content">
                    <h3 class="card-name">データを読み込めませんでした</h3>
                    <p class="muted">サーバー経由でアクセスしてください</p>
                </div>
            </div>`;
    }
}

/* ------------------------------------------------------ class detail page -- */

const classDetail = { order: 'total-desc' };

/** characters that can take this class, with the bonus already added in */
function classBenefitRows(cls, characters) {
    const rows = [];
    characters.forEach((c) => {
        if (!c.growth_rates) return;
        // only characters with a full set of bare rates can be merged
        let complete = true;
        for (let i = 0; i < STATS.length; i++) {
            if (statValue(c.growth_rates, STATS[i].key) === null) { complete = false; break; }
        }
        if (!complete) return;
        const merged = mergedGrowth(c, cls);
        rows.push({ c, merged, diff: merged.total - c.growth_rates.total });
    });
    const byName = (a, b) => a.c.name.localeCompare(b.c.name, 'ja');
    rows.sort((a, b) => {
        if (classDetail.order === 'name') return byName(a, b);
        if (classDetail.order === 'diff-desc') return b.diff - a.diff || b.merged.total - a.merged.total || byName(a, b);
        if (classDetail.order === 'diff-asc') return a.diff - b.diff || a.merged.total - b.merged.total || byName(a, b);
        return b.merged.total - a.merged.total || byName(a, b);
    });
    return rows;
}

function classBenefitTable(cls, characters) {
    const rows = classBenefitRows(cls, characters);
    if (!rows.length) return '<p class="muted">対象のキャラクターがありません</p>';
    const best = rows[0].merged.total;
    return `
        <div class="tablewrap">
            <table class="classtable">
                <thead>
                    <tr>
                        <th class="sticky">キャラクター</th>
                        <th class="num">素の合計</th>
                        <th class="num">この兵種</th>
                        <th class="num">差</th>
                    </tr>
                </thead>
                <tbody>
                ${rows.map((r) => `
                    <tr${r.merged.total === best ? ' class="is-best"' : ''}>
                        <th class="sticky">${characterAvatar(r.c)}<a href="../characters/${encodeURIComponent(r.c.id)}/">${esc(r.c.name)}</a></th>
                        <td class="num">${esc(r.c.growth_rates.total)}</td>
                        <td class="num"><strong>${esc(r.merged.total)}</strong></td>
                        <td class="num ${r.diff > 0 ? 'up' : (r.diff < 0 ? 'down' : '')}">${r.diff > 0 ? '+' : ''}${esc(r.diff)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

function renderClassDetail(cls, characters, container) {
    const badges = [];
    if (cls.tier) badges.push(`<span class="tag tag-class">${esc(cls.tier)}</span>`);
    if (cls.movement !== undefined) badges.push(`<span class="tag">移動力 ${esc(cls.movement)}</span>`);
    if (cls.move_type) badges.push(`<span class="tag">${esc(cls.move_type)}</span>`);
    if (cls.tp !== undefined) badges.push(`<span class="tag">TP ${esc(cls.tp)}</span>`);

    const info = rows([
        ['兵種スキル', cls.class_skill],
        ['マスタースキル', cls.master_skill],
        ['熟練度ボーナス', cls.weapon_exp_bonus],
        ['必要技能', cls.required_skills],
        ['技能上限', cls.skill_caps],
        ['解放条件', [cls.unlock_item, cls.unlock_note].filter(Boolean).join(' / ')]
    ]);

    container.innerHTML = `
        <div class="detail">
            <header class="detail-head">
                <div>
                    <h2 class="detail-name">${esc(cls.name)}</h2>
                    <div class="taglist">${badges.join('')}</div>
                </div>
                <a class="backlink" href="../">← クラス一覧</a>
            </header>

            <section class="panel">
                <h3>成長ボーナス</h3>
                <p class="muted">素の成長率に加算される値です。負の値は 0 の左側、赤いバーで描いています。</p>
                ${growthGrid(cls.growth_bonus, state.scale)}
            </section>

            ${cls.description ? `<section class="panel"><h3>説明</h3><p class="effect">${esc(cls.description)}</p></section>` : ''}
            ${info ? `<section class="panel"><h3>条件</h3>${info}</section>` : ''}
            ${cls.usable_skills ? `<section class="panel"><h3>使用可能技能</h3>${tagList(cls.usable_skills)}</section>` : ''}

            <section class="panel">
                <h3>この兵種になった場合の成長率</h3>
                <p class="muted">各キャラクターの素の成長率に、この兵種の成長ボーナスを加えた値です。</p>
                <div class="toolbar-inner">
                    <label class="control">
                        <span>並び替え</span>
                        <select id="class-order">
                            <option value="total-desc"${classDetail.order === 'total-desc' ? ' selected' : ''}>加算後の合計が高い順</option>
                            <option value="diff-desc"${classDetail.order === 'diff-desc' ? ' selected' : ''}>増加幅が大きい順</option>
                            <option value="diff-asc"${classDetail.order === 'diff-asc' ? ' selected' : ''}>増加幅が小さい順</option>
                            <option value="name"${classDetail.order === 'name' ? ' selected' : ''}>名前順</option>
                        </select>
                    </label>
                </div>
                <div id="class-benefits">${classBenefitTable(cls, characters)}</div>
            </section>
        </div>`;

    const orderSelect = container.querySelector('#class-order');
    if (orderSelect) {
        orderSelect.addEventListener('change', (event) => {
            classDetail.order = event.target.value;
            const host = container.querySelector('#class-benefits');
            if (host) host.innerHTML = classBenefitTable(cls, characters);
        });
    }
}

async function loadClassDetailPage(id) {
    const container = document.getElementById('class-detail');
    if (!container) return;

    try {
        const [classes, characters] = await Promise.all([
            fetchJson({ file: 'data/classes.json' }),
            fetchJson({ file: 'data/characters.json' })
        ]);
        state.scale = rateScale(classes);
        const cls = classes.find((c) => c.id === id || c.name === id);
        if (!cls) {
            container.innerHTML = emptyState('兵種が見つかりません');
            return;
        }
        document.title = `${cls.name} - クラス`;
        renderClassDetail(cls, characters, container);
        loadMeta();
    } catch (error) {
        console.error('Failed to load the class detail page', error);
        container.innerHTML = `
            <div class="card empty">
                <div class="card-image">⚔️</div>
                <div class="card-content">
                    <h3 class="card-name">データを読み込めませんでした</h3>
                    <p class="muted">サーバー経由でアクセスしてください</p>
                </div>
            </div>`;
    }
}

const STAT_KEYS = new Set(STATS.map((s) => s.key));


const SORT_OPTIONS = {
    characters: [
        { value: 'default', label: 'データ順' },
        { value: 'name', label: '名前（昇順）' },
        { value: 'name-desc', label: '名前（降順）' },
        { value: 'total', label: '成長合計が高い順' },
        { value: 'total-asc', label: '成長合計が低い順' },
        { value: 'hp', label: 'HP が高い順' },
        { value: 'str', label: '力 が高い順' },
        { value: 'mag', label: '魔力 が高い順' },
        { value: 'spd', label: '速さ が高い順' },
        { value: 'dex', label: '技 が高い順' },
        { value: 'def', label: '守備 が高い順' },
        { value: 'res', label: '魔防 が高い順' },
        { value: 'lck', label: '幸運 が高い順' },
        { value: 'cha', label: '魅力 が高い順' },
        { value: 'hp-asc', label: 'HP が低い順' },
        { value: 'str-asc', label: '力 が低い順' },
        { value: 'mag-asc', label: '魔力 が低い順' },
        { value: 'spd-asc', label: '速さ が低い順' },
        { value: 'dex-asc', label: '技 が低い順' },
        { value: 'def-asc', label: '守備 が低い順' },
        { value: 'res-asc', label: '魔防 が低い順' },
        { value: 'lck-asc', label: '幸運 が低い順' },
        { value: 'cha-asc', label: '魅力 が低い順' }
    ],
    classes: [
        { value: 'tier', label: '階級順' },
        { value: 'name', label: '名前順' },
        { value: 'movement', label: '移動力が高い順' }
    ],
    skills: [
        { value: 'type', label: '種別順' },
        { value: 'name', label: '名前順' }
    ],
    items: [{ value: 'name', label: '名前順' }]
};

/* --------------------------------------------------------------- tsv -- */

/**
 * The visible table as TSV, so it pastes straight into Excel or Sheets.
 * Whitespace inside a cell is collapsed so it cannot break the column count,
 * and the sort marker (▲ / ▼) is dropped so a header pastes as plain text.
 */
function tableToTsv(table) {
    const lines = [];
    table.querySelectorAll('tr').forEach((tr) => {
        const cells = [];
        tr.querySelectorAll('th, td').forEach((cell) => {
            cells.push((cell.textContent || '')
                .replace(/[\u25B2\u25BC\u25B6\u25C0]/g, '')
                .replace(/\s+/g, ' ')
                .trim());
        });
        if (cells.length) lines.push(cells.join('\t'));
    });
    return lines.join('\r\n');
}

async function copyTable(button) {
    const table = document.querySelector('#characters-list table');
    if (!table) return;
    const text = tableToTsv(table);
    const idle = button.getAttribute('data-idle') || button.textContent;
    const say = (message, bad) => {
        button.textContent = message;
        button.classList.toggle('is-error', !!bad);
        setTimeout(() => {
            button.textContent = idle;
            button.classList.remove('is-error');
        }, 1800);
    };
    try {
        await navigator.clipboard.writeText(text);
        say('コピーしました');
    } catch (error) {
        // clipboard API needs a secure context / permission; fall back to a
        // hidden textarea + execCommand, which still works over plain http
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(area);
        area.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(area);
        say(ok ? 'コピーしました' : 'コピーできませんでした', !ok);
    }
}

/* ---------------------------------------------------------- url state -- */

const LIST_VIEWS = ['cards', 'table', 'names', 'compare'];

/**
 * Restore the view state from the query string, so a filtered or re-sorted
 * view survives a reload and can be shared as a link. Unknown values are
 * dropped rather than trusted, because the URL is user-editable.
 */
function readUrl() {
    const params = new URLSearchParams(window.location.search);
    const one = (key) => { const v = params.get(key); return (v === null || v === '') ? null : v; };

    const q = one('q');
    if (q !== null) state.query = q.toLowerCase();
    const sort = one('sort');
    if (sort !== null) state.sort = sort;
    const view = one('view');
    if (view !== null && LIST_VIEWS.indexOf(view) !== -1) state.view = view;
    const route = one('route');
    if (route !== null && ROUTES.some((r) => r.id === route)) state.tableRoute = route;
    const order = one('order');
    if (order !== null) state.tableOrder = order;
    const initial = one('initial');
    if (initial !== null && KANA_ROWS.some((r) => r.id === initial)) state.initial = initial;
    // the selection lives in localStorage; the query string is just a mirror
    const cmp = one('cmp');
    if (cmp !== null) state.compare = cmp.split(',').filter(Boolean).slice(0, COMPARE_MAX);
}

/** Mirror the state back into the query string. replaceState rather than
 *  pushState: typing in the search box must not fill up the back button. */
function syncUrl() {
    if (!state.type) return;
    const params = new URLSearchParams();
    if (state.query) params.set('q', state.query);
    if (state.sort && state.sort !== 'default') params.set('sort', state.sort);
    if (state.view !== 'cards') params.set('view', state.view);
    if (state.tableRoute !== 'kai') params.set('route', state.tableRoute);
    if (state.tableOrder !== 'both') params.set('order', state.tableOrder);
    if (state.initial) params.set('initial', state.initial);
    if (state.compare.length) params.set('cmp', state.compare.join(','));
    const qs = params.toString();
    const url = window.location.pathname + (qs ? '?' + qs : '');
    if (url !== window.location.pathname + window.location.search) {
        window.history.replaceState(null, '', url);
    }
}

/** Drop state that does not apply to this page (e.g. view=names on /items/). */
function validateState() {
    const options = SORT_OPTIONS[state.type] || SORT_OPTIONS.items;
    if (!options.some((o) => o.value === state.sort)) {
        state.sort = options.some((o) => o.value === 'default') ? 'default' : options[0].value;
    }
    if (state.type !== 'characters' || LIST_VIEWS.indexOf(state.view) === -1) {
        state.view = 'cards';
    }
}

function buildToolbar() {
    const list = listElement(state.type);
    if (!list) return;
    const host = document.getElementById('toolbar') || (() => {
        const div = document.createElement('div');
        div.id = 'toolbar';
        list.parentNode.insertBefore(div, list);
        return div;
    })();

    const options = SORT_OPTIONS[state.type] || SORT_OPTIONS.items;
    const needsDefault = options.some((o) => o.value === 'default');

    // the a-z jump strip sits between the toolbar and the list
    if (!document.getElementById('jump')) {
        const jump = document.createElement('div');
        jump.id = 'jump';
        list.parentNode.insertBefore(jump, list);
        jump.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-initial]');
            if (!button) return;
            state.initial = button.dataset.initial;
            renderList();
        });
    }

    // sticky tray for the comparison picks
    if (!document.getElementById('cmp-tray')) {
        const tray = document.createElement('div');
        tray.id = 'cmp-tray';
        tray.hidden = true;
        list.parentNode.insertBefore(tray, list);
        tray.addEventListener('click', (event) => {
            const chip = event.target.closest('.cmp-chip');
            if (chip) { toggleCompare(chip.dataset.cmp); return; }
            if (event.target.closest('#cmp-go')) {
                state.view = 'compare';
                const select = document.getElementById('view');
                if (select) select.value = 'compare';
                renderList();
            }
        });
    }

    host.innerHTML = `
        <div class="toolbar-inner">
            <input id="search" class="search" type="search" placeholder="名前・効果・技能で検索" value="${esc(state.query)}">
            <label class="control">
                <span>並び替え</span>
                <select id="sort">
                    ${options.map((o) => `<option value="${esc(o.value)}"${o.value === state.sort ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
                </select>
            </label>
            ${state.type === 'characters' ? `
            <label class="control">
                <span>表示</span>
                <select id="view">
                    <option value="cards"${state.view === 'cards' ? ' selected' : ''}>カード</option>
                    <option value="table"${state.view === 'table' ? ' selected' : ''}>加入条件の早見表</option>
                    <option value="names"${state.view === 'names' ? ' selected' : ''}>成長率一覧表</option>
                    <option value="compare"${state.view === 'compare' ? ' selected' : ''}>比較</option>
                </select>
            </label>
            <span class="control" id="table-controls" hidden>
                <label>
                    <span>ルート</span>
                    <select id="table-route">
                        ${ROUTES.map((r) => `<option value="${esc(r.id)}"${r.id === state.tableRoute ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}
                    </select>
                </label>
                <label>
                    <span>並び替え</span>
                    <select id="table-order">
                        <option value="both"${state.tableOrder === 'both' ? ' selected' : ''}>名声 → 支援の少ない順</option>
                        <option value="fame"${state.tableOrder === 'fame' ? ' selected' : ''}>名声の少ない順</option>
                        <option value="support"${state.tableOrder === 'support' ? ' selected' : ''}>支援の少ない順</option>
                        <option value="name"${state.tableOrder === 'name' ? ' selected' : ''}>名前順</option>
                    </select>
                </label>
            </span>` : ''}
            <span class="result-count" id="result-count"></span>
            <button type="button" id="copy-table" class="copy-btn" data-idle="表をコピー" hidden>表をコピー</button>
        </div>`;

    if (needsDefault === false && state.sort === 'default') {
        state.sort = options[0].value;
        host.querySelector('#sort').value = state.sort;
    }

    const search = host.querySelector('#search');
    search.addEventListener('input', (event) => {
        state.query = event.target.value.trim().toLowerCase();
        renderList();
    });
    host.querySelector('#sort').addEventListener('change', (event) => {
        state.sort = event.target.value;
        renderList();
    });
    const view = host.querySelector('#view');
    if (view) {
        view.addEventListener('change', (event) => {
            state.view = event.target.value;
            renderList();
        });
    }
    const tableRoute = host.querySelector('#table-route');
    if (tableRoute) {
        tableRoute.addEventListener('change', (event) => {
            state.tableRoute = event.target.value;
            renderList();
        });
    }
    const tableOrder = host.querySelector('#table-order');
    if (tableOrder) {
        tableOrder.addEventListener('change', (event) => {
            state.tableOrder = event.target.value;
            renderList();
        });
    }

    // Delegated on purpose: renderList() replaces the list's innerHTML, so a
    // listener bound to the header cells themselves would not survive a re-render.
    list.addEventListener('click', (event) => {
        const sortButton = event.target.closest('button[data-sort]');
        if (sortButton) { applyGrowthSort(sortButton.dataset.sort); return; }

        const cmpButton = event.target.closest('button[data-cmp]');
        if (cmpButton) {
            // false means the tray was full: flash the button instead of
            // silently ignoring the click
            if (!toggleCompare(cmpButton.dataset.cmp)) {
                cmpButton.classList.add('is-error');
                setTimeout(() => cmpButton.classList.remove('is-error'), 1200);
            }
            return;
        }

        if (event.target.closest('#cmp-clear')) {
            state.compare = [];
            saveCompare();
            renderList();
        }
    });

    const copyButton = host.querySelector('#copy-table');
    if (copyButton) copyButton.addEventListener('click', () => copyTable(copyButton));
}

/* -------------------------------------------------------------- boot -- */

/**
 * The data files live in <site root>/data, while pages sit at different depths
 * (index.html, characters/index.html, characters/<name>/index.html). Trying the
 * relative prefixes from the document upwards keeps every page working.
 */
function dataCandidates(file) {
    const candidates = [];
    for (let depth = 0; depth <= 3; depth += 1) {
        candidates.push(`${'../'.repeat(depth)}${file}`);
    }
    return candidates;
}

async function fetchJson(page) {
    let lastError = null;
    for (const candidate of dataCandidates(page.file)) {
        try {
            const response = await fetch(candidate);
            if (response.ok) return await response.json();
            lastError = new Error(`${candidate} -> ${response.status}`);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error(`could not load ${page.file}`);
}

async function loadData() {
    // per detail pages carry their name in <body data-character="..."> or
    // <body data-class="...">
    const data = document.body && document.body.dataset ? document.body.dataset : null;
    if (data && data.character) {
        loadDetailPage(data.character);
        return;
    }
    if (data && data.class) {
        loadClassDetailPage(data.class);
        return;
    }

    state.type = currentType();
    if (!state.type) return;

    const page = get(state.type);
    const container = listElement(state.type);
    if (!container) return;

    try {
        const data = await fetchJson(page);
        state.data = Array.isArray(data) ? data : [];
        state.scale = rateScale(state.data);
    } catch (error) {
        console.error(`Failed to load ${page.file}`, error);
        state.data = [];
        container.innerHTML = `
            <div class="card empty">
                <div class="card-image">${page.icon}</div>
                <div class="card-content">
                    <h3 class="card-name">データを読み込めませんでした</h3>
                    <p class="muted">${esc(page.file)} を取得できません（ローカルで index.html を直接開くと制限されます）</p>
                </div>
            </div>`;
        return;
    }

    if (state.data.length) {
        const options = SORT_OPTIONS[state.type] || SORT_OPTIONS.items;
        if (!options.some((o) => o.value === state.sort)) state.sort = options[0].value;
    }

    // the query string wins over the stored defaults, then gets validated so a
    // hand-edited ?view= or ?sort= cannot leave the page in a broken state.
    // loadCompare first, so an explicit ?cmp= overrides the saved selection.
    loadCompare();
    readUrl();
    validateState();

    buildToolbar();
    renderList();
    loadMeta();
}

/**
 * Footer slot for the data-freshness line. Created in JS rather than added to
 * every page so the five hand-written pages stay one-liners.
 */
function metaHost() {
    const footer = document.querySelector('body > footer');
    if (!footer) return null;
    let host = document.getElementById('site-meta');
    if (!host) {
        host = document.createElement('div');
        host.id = 'site-meta';
        footer.appendChild(host);
    }
    return host;
}

async function loadMeta() {
    const host = metaHost();
    if (!host) return;
    try {
        const response = await fetch(assetUrl('data/meta.json'));
        if (!response.ok) return;
        const meta = await response.json();
        if (!meta || !meta.generated_at) return;
        const when = new Date(meta.generated_at);
        if (isNaN(when.getTime())) return;
        const stamp = `${when.getFullYear()}/${when.getMonth() + 1}/${when.getDate()}`;
        const counts = meta.counts || {};
        const bits = [`データ更新: <time datetime="${esc(meta.generated_at)}">${stamp}</time>`];
        if (counts.characters) bits.push(`キャラクター ${counts.characters}`);
        if (counts.classes) bits.push(`兵種 ${counts.classes}`);
        if (counts.skills) bits.push(`スキル ${counts.skills}`);
        host.innerHTML = `<p class="meta-line">${bits.join(' ｜ ')}</p>`;
    } catch (error) {
        // no meta.json (or offline): the footer just stays as it was
    }
}

document.addEventListener('DOMContentLoaded', () => {
    mountThemeToggle();
    applyTheme('');   // no stored choice yet: start from the OS preference
    if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        // only follow the OS while the visitor has not chosen explicitly
        const onChange = () => { if (!storedTheme()) applyTheme(''); };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);
    }
});

document.addEventListener('DOMContentLoaded', loadData);

