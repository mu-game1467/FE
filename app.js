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
    tableOrder: 'both'
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

function statValue(source, key) {
    if (!source) return null;
    const value = source[key];
    return typeof value === 'number' ? value : null;
}

function statBar(label, value, max, suffix) {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    return `
        <div class="statbar">
            <span class="statbar-label">${esc(label)}</span>
            <span class="statbar-track"><span class="statbar-fill" style="width:${pct.toFixed(1)}%"></span></span>
            <span class="statbar-value">${esc(value)}${esc(suffix || '')}</span>
        </div>`;
}

function growthGrid(rates, max) {
    if (!rates) return '';
    return `<div class="statgrid">${STATS.map((s) => {
        const value = statValue(rates, s.key);
        if (value === null) return '';
        return statBar(s.label, value, max, '');
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

function rows(pairs) {
    const cells = pairs
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .map(([label, value]) => `
            <div class="kv">
                <span class="kv-label">${esc(label)}</span>
                <span class="kv-value">${esc(value)}</span>
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
                    <h3 class="card-name"><a href="${encodeURIComponent(item.id)}/">${esc(item.name)}</a></h3>
                    <div class="taglist">${badges.join('')}</div>
                </header>

                <div class="card-block">
                    <h4>成長率 <span class="muted">合計 ${esc(growth.total)}</span></h4>
                    ${growthGrid(growth, 70)}
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
                        <th class="sticky">${esc(item.name)}</th>
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


/* --------------------------------------------------- classes and lists -- */

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
                    <h3 class="card-name">${esc(item.name)}</h3>
                    <div class="taglist">${badges.join('')}</div>
                </header>

                ${item.growth_bonus ? `
                <div class="card-block">
                    <h4>成長ボーナス</h4>
                    ${growthGrid(item.growth_bonus, 25)}
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
    const container = listElement(state.type);
    if (!container) return;

    const filtered = state.data.filter(matchesQuery);
    const isTable = state.type === 'characters' && state.view === 'table';
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

    if (isTable) {
        container.classList.add('as-table');
        container.innerHTML = renderRecruitTable(list);
    } else {
        container.classList.remove('as-table');
        const render = RENDERERS[state.type] || renderItem;
        container.innerHTML = list.map(render).join('');
    }

    const counter = document.getElementById('result-count');
    if (counter) counter.textContent = `${list.length} / ${state.data.length} 件`;
}

function sortData(list, mode) {
    const byName = (a, b) => a.name.localeCompare(b.name, 'ja');
    const copy = list.slice();
    switch (mode) {
        case 'name':      return copy.sort(byName);
        case 'name-desc': return copy.sort((a, b) => byName(b, a));
        case 'total':     return copy.sort((a, b) => statTotal(b) - statTotal(a));
        case 'movement':  return copy.sort((a, b) => (b.movement || 0) - (a.movement || 0));
        case 'tier':      return copy.sort((a, b) => tierIndex(a.tier) - tierIndex(b.tier) || byName(a, b));
        case 'type':      return copy.sort((a, b) => String(a.type || '').localeCompare(String(b.type || ''), 'ja') || byName(a, b));
        default:
            if (STAT_KEYS.has(mode)) {
                return copy.sort((a, b) => statOf(b, mode) - statOf(a, mode));
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
                        <th class="sticky">${esc(r.cls.name)}</th>
                        <td class="muted">${esc(r.cls.tier || '')}</td>
                        ${STATS.map((s) => {
                            const value = r.growth[s.key];
                            const origin = base[s.key] || 0;
                            const cls = value > origin ? 'up' : (value < origin ? 'down' : '');
                            return `<td class="num ${cls}">${esc(value)}</td>`;
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
    const start = character.start || {};

    const badges = [];
    if (character.gender) badges.push(`<span class="tag">${esc(character.gender)}</span>`);
    if (start.class) badges.push(`<span class="tag tag-class">${esc(start.class)}${start.level ? ' Lv' + esc(start.level) : ''}</span>`);
    if (character.blaze_type) badges.push(`<span class="tag tag-blaze">${esc(character.blaze_type)}</span>`);
    if (character.blaze_skill) badges.push(`<span class="tag tag-blaze">${esc(character.blaze_skill)}</span>`);
    if (character.blaze_arts) badges.push(`<span class="tag tag-blaze">${esc(character.blaze_arts)}</span>`);

    const own = [];
    if (character.personal_skill) {
        own.push(['個人スキル', `<strong>${esc(character.personal_skill.name)}</strong>${character.personal_skill.effect ? `<br><span class="muted">${esc(character.personal_skill.effect)}</span>` : ''}`]);
    }
    (character.blood_seals || []).forEach((seal) => {
        own.push(['血印', `<strong>${esc(seal.name)}</strong>${seal.effect ? `<br><span class="muted">${esc(seal.effect)}</span>` : ''}`]);
    });
    if (character.favorites) own.push(['好きなもの', esc(character.favorites)]);
    if (character.voice_actor) own.push(['声優', esc(character.voice_actor)]);

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
                <div>
                    <h2 class="detail-name">${esc(character.name)}</h2>
                    <div class="taglist">${badges.join('')}</div>
                </div>
                <a class="backlink" href="../">← キャラクター一覧</a>
            </header>

            <section class="panel">
                <h3>成長率 <span class="muted">合計 ${esc(growth.total)}</span></h3>
                ${growthGrid(growth, 70)}
            </section>

            ${own.length ? `<section class="panel"><h3>固有</h3>${rows(own)}</section>` : ''}

            ${start.stats ? `
            <section class="panel">
                <h3>登場時ステータス <span class="muted">${esc(start.class || '')}${start.level ? ' Lv' + esc(start.level) : ''}</span></h3>
                ${growthGrid(start.stats, 40)}
            </section>` : ''}

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

const STAT_KEYS = new Set(STATS.map((s) => s.key));


const SORT_OPTIONS = {
    characters: [
        { value: 'default', label: 'データ順' },
        { value: 'name', label: '名前（昇順）' },
        { value: 'name-desc', label: '名前（降順）' },
        { value: 'total', label: '成長合計が高い順' },
        { value: 'hp', label: 'HP が高い順' },
        { value: 'str', label: '力 が高い順' },
        { value: 'mag', label: '魔力 が高い順' },
        { value: 'spd', label: '速さ が高い順' },
        { value: 'dex', label: '技 が高い順' },
        { value: 'def', label: '守備 が高い順' },
        { value: 'res', label: '魔防 が高い順' },
        { value: 'lck', label: '幸運 が高い順' },
        { value: 'cha', label: '魅力 が高い順' }
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
    // per character pages carry their name in <body data-character="...">
    const detailId = document.body && document.body.dataset ? document.body.dataset.character : null;
    if (detailId) {
        loadDetailPage(detailId);
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

    buildToolbar();
    renderList();
}

document.addEventListener('DOMContentLoaded', loadData);

