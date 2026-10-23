/** Convert ImageData to a PNG without coupling rendering to download behavior. */
export async function imageDataToPngBlob(image: ImageData): Promise<Blob> {
  if (image.width <= 0 || image.height <= 0) {
    throw new RangeError("PNGへ変換するImageDataの寸法が不正です。");
  }

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    if (context) {
      context.putImageData(image, 0, 0);
      return canvas.convertToBlob({ type: "image/png" });
    }
  }

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("PNG変換用の2D canvasを初期化できませんでした。");
    }
    context.putImageData(image, 0, 0);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvasからPNG Blobを生成できませんでした。"));
      }, "image/png");
    });
  }

  throw new Error("この環境ではImageDataをPNGへ変換できません。");
}
