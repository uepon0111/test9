# SEKAI Story Talk Viewer

GitHub Pagesで動く、Project SEKAIのイベントストーリー `TalkData` ビューアです。

## 方式

ブラウザから以下を取得します。

- `https://sekai-world.github.io/sekai-master-db-diff/events.json`
- `https://sekai-world.github.io/sekai-master-db-diff/eventStories.json`
- `https://storage.sekai.best/sekai-en-assets/event_story/{assetbundleName}/scenario/{episode.assetbundleName}.asset`

最後の `.asset` をJSONとして読み込み、`TalkData[]` の以下を表示します。

- `WindowDisplayName`
- `Body`
- `TalkTention`
- `LipSync`
- `Motions`
- `Voices`
- その他のTalkData技術情報

公式 `sekai-viewer` の `IScenarioData` / `TalkData` 定義に合わせています。

## GitHub Pages

このフォルダをリポジトリのルートに配置し、GitHub Pagesの公開元を `main` ブランチの `/ (root)` に設定するだけで動作します。ビルド環境やnpmは不要です。

## URL共有

イベントを選ぶと `?event=イベントID`、話を選ぶと `?event=イベントID&episode=話数` のURLになります。URLをそのまま共有できます。

## 補足

この版では、TalkDataの取得をGitHub Actionsでコピーするのではなく、元の `storage.sekai.best` のアセットをブラウザから直接参照しています。そのため、元アセットの更新がそのまま反映されます。

また、ユーザー指定の参照例は以下です。

`https://storage.sekai.best/sekai-en-assets/event_story/event_ashiato_2021/scenario/event_39_01.asset`

この形式のファイルを同じ規則で動的取得します。
