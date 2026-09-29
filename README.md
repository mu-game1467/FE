# FE万紫千紅 データベース

ファイアーエムブレム 万紫千紅のゲームデータを管理・閲覧するための静的サイト（GitHub Pages 用）。
ビルド不要で、HTML + CSS + JavaScript + JSON だけで動きます。

## ページ

公開URLは <https://mu-game1467.github.io/FE/> です。末尾に `.html` を付けない
ディレクトリ形式（`/FE/characters/` など）でアクセスできます。

| ページ | 内容 | データ |
|--------|------|--------|
| `index.html` → `/FE/` | ダッシュボード | - |
| `characters/index.html` → `/FE/characters/` | 64名のキャラクター（立ち絵付き）。成長率・ルート別の加入条件（支援Lv／名声Lv）、カード／加入条件の早見表／成長率一覧表（名前＋9能力の内訳）の表示切替。成長率一覧表（名前＋9能力＋合計、立ち絵付き）はヘッダ行と名前列・合計列が固定され、ヘッダのクリックで昇順・降順を切り替え。並び替えは名前・成長合計・9能力すべてに対応。あ行ジャンプとURLへの状態保持（ブックマーク・共有可）にも対応。カードごとに「比較」を押すと最大4人までの比較表（成長率・合計・技能等、各能力の最大値を強調）になります。表はTSVでクリップボードにコピーでき、ヘッダ右上のボタンでダークモードに切り替えられます。スマホ表示にも対応 | `data/characters.json` |
| `characters/<名前>/index.html` → `/FE/characters/カイ/` etc. | キャラクター詳細。成長率・固有スキル・血印・登場時ステータス・技能・加入条件、そして**そのキャラクターが各兵種になった場合の成長率**（素の成長率＋兵種ボーナス、階級フィルタと並び替え付き） | `data/characters.json` + `data/classes.json` |
| `classes/index.html` → `/FE/classes/` | 60兵種。階級・成長ボーナス・移動力・使用可能技能・解放条件 | `data/classes.json` |
| `classes/<名前>/index.html` → `/FE/classes/飛騎兵/` etc. | 兵種詳細。成長ボーナス・条件・使用可能技能、そして**その兵種になった場合に各キャラクターがどう成長するか**（素の合計／加算後／差、並び替え付き） | `data/classes.json` + `data/characters.json` |
| `skills/index.html` → `/FE/skills/` | 個人スキル・血印・ルーツ・ブレイズアーツ／スキル／タイプ・兵種＆マスタースキル | `data/skills.json` |
| `items/index.html` → `/FE/items/` | 消費アイテム・指南書など（手入力データ） | `data/items.json` |
| `events/index.html` → `/FE/events/` | 隠しイベント22件。ルート（カイ／ディートリヒ／セオドラ／レダ）ごとに章・項目・発生条件の一覧。ルート絞り込み、イベント名・条件で検索、ルート順／章順／名前順で並び替え | `data/events.json` |

各ページは1ディレクトリ下に置いてあり（`characters/index.html`）、
GitHub Pages が `…/characters/` を `characters/index.html` に解決します。
ルート直下の `characters.html` などは、旧的リンクが壊れないように
`characters/` へ（meta refresh で）転送するだけのページに留めています。

## 構成

- `index.html` — ダッシュボード
- `characters/` `classes/` `skills/` `items/` `events/` — 各一覧ページ（`index.html` を内包）
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
