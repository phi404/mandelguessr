# MandelGuessr

マンデルブロ集合の局所画像から、同じ景色の座標を探すゲーム。

**[遊ぶ](https://phi404.github.io/mandelguessr/)**

ドラッグで移動、ホイールやピンチで拡大。地点を選んで **GUESS** すると、正解との距離に応じて最大5,000点を獲得できます。**EXPLORE** では自由に探索できます。WebGL 2対応のブラウザが必要です。

## 開発

Node.js 22.13以降を使用します。

```sh
npm ci
npm run dev
npm run check
```

`npm run build`で`dist/`へ静的ファイルを出力し、`npm run preview`で確認できます。`main`へのpushで検証とGitHub Pagesへの公開が実行されます。

## 出題と採点

平面上のランダムな点から距離推定で境界付近へ進み、描画画像のRGB分散で単色に近い候補を除外します。各問は独立に生成します。境界全体に対する一様分布ではありません。

座標誤差を出題画像の対角線で割った値を`d`とし、`round(5000 × 2^(-d))`で採点します。設定とプレイ記録はブラウザ内に保存されます。

## 研究

開発環境の`/generator-lab`で出題方式を比較し、画像データセットを出力できます。DINOv2による特徴抽出とクラスタリングは[ml/README.md](ml/README.md)を参照してください。データセット、モデル、実験出力はGit管理に含めません。

出題アルゴリズム、UI/UX、機械学習を使った評価は引き続き改良していきます。

## クレジット

制作: [ふぁい.](https://github.com/phi404)

パレットの出典とライセンスは[ATTRIBUTION.md](app/fractal/palettes/ATTRIBUTION.md)に記載しています。
