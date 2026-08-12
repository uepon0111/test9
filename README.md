# Project SEKAI ストーリートークビューア

GitHub Pagesで動作する静的なイベントストーリートーク閲覧ツールです。
ブラウザから `.asset` を直接取得するのではなく、GitHub Actionsで一度ダウンロード・解析し、生成済みJSONをPagesから配信します。

## できること

- イベント／エピソードを選択して全TalkDataを時系列表示
- 話者名、台詞本文、会話キャラクターIDを表示
- 台詞・話者検索、話者フィルタ
- 表示中の会話をコピー／TXT保存
- スマートフォン対応

## データ同期

`eventStories.json` のイベント・エピソード情報から `assetbundleName` / `scenarioId` を取得し、次の形式でシナリオassetを組み立てます。

`https://storage.sekai.best/sekai-en-assets/event_story/{assetbundleName}/scenario/{scenarioId}.asset`

`.asset` の `TalkData` から、次だけを抽出します。

- 話者名 (`WindowDisplayName`)
- 台詞本文 (`Body`)
- 会話キャラクターID (`TalkCharacters[].Character2dId`)

**ボイス、モーション、リップシンク、速度などの再生関連データは生成JSONに保存しません。**

## Actionsの進捗表示

`Update story data` は、処理が長くなってもログが止まって見えないように、以下を継続的に出力します。

- `DOWNLOAD_START`：どの話を取得開始したか
- `DOWNLOAD_OK`：取得サイズと所要時間
- `DOWNLOAD_FAIL`：失敗理由と所要時間
- `RETRY_WAIT`：再試行までの待機
- `PROGRESS 120/350 (34%)`：全体進捗
- `HEARTBEAT`：10秒ごとの現在処理中一覧、成功・キャッシュ・失敗件数
- GitHub ActionsのStep Summaryにも進捗と経過時間を記録

デフォルトでは12並列、1件あたり最大25秒、最大2回試行です。
既存のJSONは再利用するため、定期更新では新規・変更分だけの取得になります。

手動実行時に `force_rebuild` を有効にすると、既存JSONも再取得します。

## GitHub Pages設定

1. このフォルダをリポジトリのルートへ配置。
2. `.github/workflows/update-story-data.yml` を配置。
3. `.github/workflows/pages.yml` を配置。
4. GitHubリポジトリの Settings → Pages → Source を「GitHub Actions」に設定。
5. `Update story data` を一度手動実行します。
6. 生成データがコミットされるとPagesのデプロイが走ります。

## 初期データ

初期状態では添付された `event_39_01.asset` を変換した62件のTalkDataを同梱しているため、Actions実行前でも画面を確認できます。

## ファイル配置

ZIPには `.github` を入れていません。以下の2ファイルは単体で提供しています。

```text
.github/workflows/update-story-data.yml
.github/workflows/pages.yml
```

取得先の利用条件・ライセンス・著作権については、公開前に各データ提供元の規約を確認してください。
