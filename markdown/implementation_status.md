# Implementation Status

## 2026-06-29

| Item | Status | Details |
| --- | --- | --- |
| VRモード時の黒いもや（FFR境界）バグの解消 | Completed | Meta Quest等のVRデバイスで有効になる「固定フォビエートレンダリング（FFR）」による解像度境界がグリッドと干渉して「四角形のもや」や「スペキュラ断絶」を引き起こしていた問題を、`_renderer.xr.setFoveation(0)` でFFRを完全無効化することで解消。また `scene.background` 透過処理を実装し、コンポジタ合成干渉を防止。 |
| 通常ループとVRループの描画競合防止 | Completed | `clean_logic.js` 内の `pu.render` ループに `isPresenting` のガードを入れ、VR起動中に通常のカメラによる重複描画が行われないように修正。 |
| 反映ファイル | Completed | `webmmd_files/xr.js`, `webmmd_files/clean_logic.js`, `webmmd_files/style.css` |
| レンダリング仕様書作成 | Completed | `markdown/rendering_spec.md` を作成し、トーンマッピングやシャドウ、WebXR VRモード動作時の留意事項などをドキュメント化。 |

---

## 2026-06-23 (最新)

| Item | Status | Details |
| --- | --- | --- |
| トーンマッピング改善（色再現修正） | Completed | `handler.js` で `$.renderer.toneMapping = 4`（ACESFilmicToneMapping）、`$.renderer.toneMappingExposure = 0.9` を設定。水色が黒みがかる問題（NoToneMapping時のリニア→sRGB変換でシャドウが暗くなる）と全体的に白っぽい問題（ハイライト白飛び）を解消。SW キャッシュを v10 に更新。 |

---

## 2026-06-23 (追加)

| Item | Status | Details |
| --- | --- | --- |
| ZIP モデル読み込み修正 | Completed | `zip-loader-BVwbcZYR.js` が依存する `./index-4WVB8kZJ.js`（Vite __vitePreload スタブ）が欠落していたため ZIP 解凍が失敗していた。スタブファイルを `webmmd_files/index-4WVB8kZJ.js` として作成（`export const t = (fn, _deps) => fn()`）。ZIP内のPMXはZip-loaderが全エントリを小文字化した後 `Uu()` が `.pmx` 末尾一致で発見する既存ロジックで対応済み。 |
| SW キャッシュ更新 | Completed | `sw.js` のキャッシュ名を `webmmd-cache-v9` に更新し `index-4WVB8kZJ.js` をキャッシュリストへ追加。 |

---

## 2026-06-23

| Item | Status | Details |
| --- | --- | --- |
| motion list 上書き不具合の修正 | Completed | `#assets-motion-list` と再生用モーション一覧の衝突を解消。再生側は `#loaded-motion-list` を参照するように変更。 |
| 自動復元時のモーション選択同期修正 | Completed | `webmmd_files/ui.js` で `webmmd.assets.selectedMotionPath` を保存/復元し、assets motion ラジオが自動でチェックされるよう修正。 |
| 再生モーションUIの撤去 | Completed | `index.html` から `#loaded-motion-list-wrap` を削除。`webmmd_files/logic.js` で `renderMotionList` 呼び出しを停止し、再生モーション一覧描画を実質無効化。 |
| 自動復元時のモデル選択同期修正 | Completed | `webmmd_files/ui.js` で `.loaded-model-name` から `selectedAssetsModelPath` を補完する同期処理を追加。自動復元後に assets model ラジオが自動でチェックされるよう修正。 |
| assetsモデル選択UIの択一化 | Completed | `webmmd_files/ui.js` で「配置」ボタンを廃止。`assets-model-choice` の単一選択（radio）で選択時に即ロードする方式へ変更。 |
| assetsモーション選択UIの択一化 | Completed | `webmmd_files/ui.js` で「適用」ボタンを廃止。`assets-motion-choice` の単一選択（radio）で選択時に即ロードする方式へ変更。 |
| 反映ファイル | Completed | `index.html`, `webmmd_files/logic.js` |
| 反映ファイル（追加） | Completed | `webmmd_files/ui.js` |
| 最小検証 | Completed | 参照セレクタ切替確認、model/motion択一選択化確認、自動復元時のmodel/motionラジオ同期確認（実装上）、再生モーションUI撤去確認、静的エラー確認（対象3ファイルでエラーなし）。 |
| モーション初期化問題の修正 | Completed | モーション切り替え時に前のモーション状態が残る問題を解消。`onMotionFilesSelected` にリセット処理を追加、モーション削除時の処理を実装。 |
| 初期ポーズリセットボタン追加 | Completed | UI にキャラクター初期ポーズリセット用ボタンを追加。`onPoseResetRequested` ハンドラーで `Q.resetMotions()` を実行。 |
| 初期ポーズリセットボタン修正 | Completed | `onPoseResetRequested` を修正。`Q.resetMotions()`（フレーム0移動のみ）から `resetMeshToRestPose` によるバインドポーズ復元に変更。全モデルアクションを `enabled=false・time=0` にしてポーズを固定し、再生時は `setPlaying(true)→play()` で自動復元。`webmmd_files/handler.js` を修正。 |
| モーション切替時のポーズちらつき修正 | Completed | `onMotionFilesSelected` で `Q.resetMotions()`（旧モーションのフレーム0に戻す）を廃止。古いアクション全件を `enabled=false` にしてから `resetMeshToRestPose` でバインドポーズへリセット。`setMotions()` 側で新アクションは `enabled=true` で再生成されるため、ロード後の状態は自動クリーン。`webmmd_files/handler.js` を修正。 |
