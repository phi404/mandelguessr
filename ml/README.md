# 画像データの分析

開発環境の`/generator-lab`から、DATASET EXPORTで`ml/data/raw/`へ画像を書き出します。保存先は空にしてください。フォルダ保存にはChromium系ブラウザとlocalhostが必要です。

## 環境

Python 3.10以降。リポジトリ直下から実行します。

```sh
python -m venv ml/.venv
# Windows: ml/.venv/Scripts/activate
# macOS / Linux: source ml/.venv/bin/activate
python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r ml/requirements.txt
```

## 分析

```sh
python ml/scripts/check_dataset.py
python ml/scripts/extract_embeddings.py --batch-size 4
python ml/scripts/cluster_embeddings.py --clusters 20
python -m unittest discover -s ml/tests
```

初回の特徴抽出ではDINOv2 Smallの重みをダウンロードします。特徴量はL2正規化され、`ml/outputs/embeddings/`に保存されます。クラスタ別の画像一覧は`ml/outputs/clusters/k20/index.html`で確認できます。クラスタ数は画像枚数以下にしてください。

別のデータセットは各スクリプトの最初の引数で指定します。全件抽出の前に`--limit 40`で動作確認できます。クラスタは見た目の傾向を調べるためのもので、問題の良し悪しを直接表すものではありません。

データセット、モデル、仮想環境、実験出力はGit管理に含めません。
