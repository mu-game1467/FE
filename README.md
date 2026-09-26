# FE万紫千紅 データベース

ファイアーエムブレム 万紫千紅のゲームデータを管理・閲覧するための個人用データベースサイト。

## 構成

- `index.html` - メインページ
- `styles.css` - スタイルシート
- `app.js` - データ読み込み・表示ロジック
- `data/` - JSONデータファイル
  - `characters.json` - キャラクターデータ
  - `classes.json` - クラスデータ
  - `items.json` - アイテムデータ
  - `skills.json` - スキルデータ

## GitHub Pages での公開

1. リポジトリの Settings → Pages
2. Source: "Deploy from a branch"
3. Branch: `main` / `/ (root)`
4. Save

## データの追加・編集

`data/` フォルダ内の JSON ファイルを編集するだけで自動的に反映されます。

### キャラクターデータ例

```json
{
    "id": "unique_id",
    "name": "キャラクター名",
    "class": "クラス名",
    "hp": 28,
    "str": 8,
    "mag": 4,
    "dex": 9,
    "spd": 10,
    "lck": 7,
    "def": 6,
    "res": 3,
    "description": "説明文"
}
```

## ローカル確認

ブラウザで `index.html` を直接開くか、簡易サーバーで確認:

```bash
# Python 3
python -m http.server 8000

# Node.js (npx)
npx serve
```