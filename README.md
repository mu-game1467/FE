# FE万紫千紅 データベース

ファイアーエムブレム 万紫千紅のゲームデータを管理・閲覧するための静的サイト（GitHub Pages 用）。
ビルド不要で、HTML + CSS + JavaScript + JSON だけで動きます。

## ページ

公開URLは <https://mu-game1467.github.io/FE/> です。末尾に `.html` を付けない
ディレクトリ形式（`/FE/characters/` など）でアクセスできます。

| ページ | 内容 | データ |
|--------|------|--------|
| `index.html` → `/FE/` | ダッシュボード | - |
| `characters/index.html` → `/FE/characters/` | 64名のキャラクター（立ち絵付き）。成長率・ルート別の加入条件（支援Lv／名声Lv）、カード／加入条件の早見表／成長率一覧表（名前＋9能力の内訳）／**技相性マトリクス**（キャラ×技能を得意=緑・使用可能=灰・苦手=赤で表示。技能の列クリックなしで横断して相性を見られる）／**参加スケジュール**（ルートごとに章順で「その章で誰が参加できるか」を表示。並び順は 章 → 名声Lv → 支援Lv の低い順。名声Lv／支援Lv はしきい値なので、条件を満たせば掲載の章より前からも参加できる）の表示切替。成長率一覧表（名前＋9能力＋合計、立ち絵付き）はヘッダ行と名前列・合計列が固定され、ヘッダのクリックで昇順・降順を切り替え。並び替えは名前・成長合計・9能力すべてに対応。あ行ジャンプとURLへの状態保持（ブックマーク・共有可）にも対応。カードごとに「比較」を押すと最大4人までの比較表（成長率・合計・技能等、各能力の最大値を強調）になります。表はTSVでクリップボードにコピーでき、ヘッダ右上のボタンでダークモードに切り替えられます。スマホ表示にも対応 | `data/characters.json` |
| `characters/<名前>/index.html` → `/FE/characters/カイ/` etc. | キャラクター詳細。成長率・固有スキル・血印・登場時ステータス・技能・加入条件（個人スキルと血印の名称はスキル一覧へリンク）、**おすすめ兵種**（得意技能と兵種の主要技能・選択技能を突き合わせ、階級ごとに上位を表示。**避けられない主要技能が苦手の兵種を最下位**にし、その中で上の得意技能に一致している兵種ほど上位になる。選択技能の苦手は別の選択技能を選べば避けられるため下位の判定。一致した得意・主要技能・選択技能をすべて表示し、得意なら緑、苦手なら赤で塗る）、そして**そのキャラクターが各兵種になった場合の成長率**（素の成長率＋兵種ボーナス、階級フィルタと並び替え付き。個人スキルの効果や性別の制約でなれない兵種は除外し、その旨を表示） | `data/characters.json` + `data/classes.json` |
| `classes/index.html` → `/FE/classes/` | 60兵種。階級・成長ボーナス・移動力・使用可能技能・解放条件 | `data/classes.json` |
| `classes/<名前>/index.html` → `/FE/classes/飛騎兵/` etc. | 兵種詳細。成長ボーナス・条件（**主要技能**／**選択技能**）・使用可能技能、**おすすめキャラクター**（この兵種の主要技能・選択技能に一致するキャラクター。キャラクター詳細のおすすめ兵種と同じ判定（主要技能が苦手のキャラクターは下位、性別・移動タイプの制約がある相手は除外）。表示中の兵種の主要技能・選択技能は、キャラクターの得意なら緑、苦手なら赤で塗る）、そして**その兵種になった場合に各キャラクターがどう成長するか**（9ステータスごとの素＋兵種ボーナス、増減を数字の横に小表示、ステータスごとに全キャラクター中最も高い値を枠で強調、並び替え付き） | `data/classes.json` + `data/characters.json` |
| `skills/index.html` → `/FE/skills/` | 個人スキル・血印・ルーツ・ブレイズアーツ／スキル／タイプ・兵種＆マスタースキル。保有者はキャラクター詳細へリンク。ブレイズアーツの威力・射程・命中などは Game8 のデータに数値列が無いため空欄で、その旨を明示 | `data/skills.json` |
| `items/index.html` → `/FE/items/` | 消費アイテム・指南書など（手入力データ） | `data/items.json` |
| `events/index.html` → `/FE/events/` | 隠しイベント22件＋外伝9件を同じ表にまとめ、ルート（カイ／ディートリヒ／セオドラ／レダ）ごとに章・項目・条件・期日の一覧。外伝は依頼場所・スカウト解放キャラ・報酬を条件欄に併記し、ルートごとに章と期日（発生しないルートは「発生しない」と明記）、発生時期が2回あるものは2行に展開。ルート絞り込み、イベント名・条件・外伝名・期日・報酬で検索、ルート順／章順／名前順で並び替え | `data/events.json` |
| `gear/index.html` → `/FE/gear/` | 装備品23件（盾・杖・仮面・アクセ）。重さ・守備・魔力・魔防・命中・回避・怨呪を数値で持ち、種類（通常／呪宝）と効果文を併記。数値で並び替え | `data/gear.json` |
| `weapons/index.html` → `/FE/weapons/` | 武器88件（剣術・槍術・斧術・弓術・格闘術）。通常と呪宝を分け、威力・命中・必殺・回避・重さ・射程・耐久値・買値・ショップ・特殊効果を持ち、名前／種別／呪宝／各数値で並び替え | `data/weapons.json` |
| `arts/index.html` → `/FE/arts/` | 戦技181件（6系統）。消費・威力・命中・必殺・射程・対象と効果文、必要装備、習得できるキャラと条件。系統／各数値で並び替え | `data/arts.json` |
| `magic/index.html` → `/FE/magic/` | 魔法45件（黒魔術・白魔術・闇魔術 × 攻撃・回復・補助）。威力・命中・必殺・回避・重さ・射程・回数と効果文、習得できるキャラと条件。系統／分類／各数値で並び替え | `data/magic.json` |

各ページは1ディレクトリ下に置いてあり（`characters/index.html`）、
GitHub Pages が `…/characters/` を `characters/index.html` に解決します。
ルート直下の `characters.html` などは、旧的リンクが壊れないように
`characters/` へ（meta refresh で）転送するだけのページに留めています。

## 構成

- `index.html` — ダッシュボード
- `characters/` `classes/` `skills/` `items/` `gear/` `events/` — 各一覧ページ（`index.html` を内包）
- `characters/<名前>/index.html` — キャラクター詳細ページ（`tools/generate-character-pages.ps1` が生成）
- `classes/<名前>/index.html` — 兵種詳細ページ（`tools/generate-class-pages.ps1` が生成）
- `images/characters/` — キャラクター立ち絵（`tools/fetch-character-images.ps1` が取得）
- `styles.css` - スタイルシート
- `app.js` - データ読み込み・検索・並び替え・表示ロジック
- `data/` - JSONデータファイル
- `tools/build-from-game8.ps1` - データを再生成するスクリプト
- `tools/fetch-character-images.ps1` - 立ち絵を取得するスクリプト
- `tools/generate-character-pages.ps1` - キャラクター詳細ページを生成するスクリプト
- `tools/generate-class-pages.ps1` - 兵種詳細ページを生成するスクリプト
- `tools/serve.ps1` - ローカル確認用の簡易HTTPサーバー
- `tools/MAPPINGS.md` - 元JSONの列（`col_1`…）と出力キーの対応表

`app.js` はページの深さ（ルート直下／一覧ページ／詳細ページ）に応じて `data/` を
`data/…` `../data/…` `../../data/…` の順に試行して読み込みます。

## データの再生成

キャラクター・兵種・スキル（血印など）は、ゲームエイト「FE 万紫千紅」の育成シミュレーターが
内部で使う静的JSONから生成しています。列名は `col_1` のように不透明なので、
**対応表はページ表示と突き合わせて特定**しています（`tools/MAPPINGS.md` 参照）。

```powershell
# キャッシュ済みソースを使う
powershell -ExecutionPolicy Bypass -File tools\build-from-game8.ps1

# 最新を取り直す
powershell -ExecutionPolicy Bypass -File tools\build-from-game8.ps1 -Download

# データを更新したら立ち絵と詳細ページも作り直す
powershell -ExecutionPolicy Bypass -File tools\fetch-character-images.ps1
powershell -ExecutionPolicy Bypass -File tools\generate-character-pages.ps1
powershell -ExecutionPolicy Bypass -File tools\generate-class-pages.ps1
```

スクリプトは次のことを行います。

1. `data/characters.json`（64件）、`data/classes.json`（60件）、`data/skills.json`（247件）を書き出す
2. 成長率の合計（`col_29`）と9能力の和が一致するか検証する
3. キャラクターが参照する個人スキル・血印・ブレイズ値がすべて `23030` に存在するか検証する
4. キャラクターの登場兵種がすべて兵種テーブルに存在するか検証する
5. 立ち絵を `images/characters/` に取得する（`fetch-character-images.ps1`）。
   `characters.json` にはサイトルート相対のパス（`images/characters/<名前>.webp`）を書き込み、
   `app.js` がスタイルシートの URL からサイトルートを導出して解決する。
   ホットリンクはせずローカルに置くので、オフラインでも表示できる。

検証に失敗すると警告が出ます。成長ボーナスなどの `+10` という表記は数値に変換されます。

## ローカル確認

`file://` で開くと `fetch()` がCORSで弾かれるため、簡易HTTPサーバー経由で確認します。

```powershell
# PowerShell 5.1 なら
powershell -ExecutionPolicy Bypass -File tools\serve.ps1   # → http://127.0.0.1:8099/

# Python 3 / Node.js があれば
python -m http.server 8000
npx serve
```

## 文字化け・他言語の混入の確認

日本語の文章やコメントを生成していると、中国語・韓国語などが紛れ込むことがあります。
コミット前に次を走らせると、リポジトリ全体を走査して検出します（読み取りのみ。検出しても
自動で直さず、該当行を自分で修正します）。

```powershell
powershell -ExecutionPolicy Bypass -File tools\scan-stray-characters.ps1
```

出力例: `Scanned 152 files, 0 with stray characters`。1 件でも検出されると終了コードが 1 になります。

## GitHub Pages での公開

1. リポジトリの Settings → Pages
2. Source: "Deploy from a branch"
3. Branch: `main` / `/ (root)`
4. Save

`.nojekyll` を置いてあるため、Jekyll の処理は介在しません。

## データ出典・クレジット

- 数値データ（成長率・ステータス・加入条件・スキル効果・兵種データ）は
  [ゲームエイト「ファイアーエムブレム 万紫千紅」](https://game8.jp/fe-banshisenko) が公開しているデータを加工したものです。
- キャラクター名・声優名・効果文など短い事実情報のみを保持し、出典の解説文・記事本文・画像は含めていません。
- `data/items.json` は手入力データです。
- `data/events.json`（隠しイベント）も手入力データで、
  [神攻略「ファイアーエムブレム 万紫千紅」隠しイベント](https://kamikouryaku.net/fe_banshisenkou/?%E9%9A%A0%E3%81%97%E3%82%A4%E3%83%99%E3%83%B3%E3%83%88) の
  ルート別一覧（章・項目・発生条件）を転記して登録したものです。
- 同ファイルの外伝（`gaiden`）も手入力で、
  [GameWith「外伝一覧と発生条件・期日を逃した時の対処法」](https://gamewith.jp/fefw/577815) の
  ルート別一覧（章・期日・依頼場所・報酬）と発生条件の説明を転記して登録したものです。
  `windows` は発生しないルートも「発生しない」章で残しています。
