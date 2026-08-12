# Project SEKAI ストーリートークビューア

GitHub Pagesで動作する静的なイベントストーリートーク閲覧ツールです。
ブラウザから `.asset` を直接取得するのではなく、GitHub Actionsで一度ダウンロード・解析し、生成済みJSONをPagesから配信します。

## データ同期

`eventStories.json` のイベント・エピソード情報から `assetbundleName` / `scenarioId` を取得し、次の形式でシナリオassetを組み立てます。

`https://storage.sekai.best/sekai-en-assets/event_story/{assetbundleName}/scenario/{scenarioId}.asset`

`.asset` の `TalkData` を抽出し、`data/stories/*.json` と `data/index.json` を生成します。

初期状態では添付された `event_39_01.asset` を同梱しているため、Actions実行前でも画面を確認できます。

## GitHub Pages設定

1. このフォルダをリポジトリのルートへ配置。
2. GitHubリポジトリの Settings → Pages → Source を「GitHub Actions」に設定。
3. `Update story data` を一度手動実行すると、全イベントの取得・解析を行います。
4. 更新後は `Deploy to GitHub Pages` が走り、Pagesへ反映されます。

## 注意

取得先の利用条件・ライセンス・著作権については、公開前に各データ提供元の規約を確認してください。
