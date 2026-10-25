export type EmbeddedImageAsset = {
  bytes: Uint8Array;
  extension: "png" | "jpg";
  mediaType: "image/png" | "image/jpeg";
  width: number;
  height: number;
};

export async function decodeEmbeddedImage(src: string): Promise<EmbeddedImageAsset> {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
  if (!match) throw new Error("The document contains an unsupported embedded image.");

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not decode an embedded image for export."));
    image.src = src;
  });

  if (match[1] === "webp") {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare an embedded image for export.");
    context.drawImage(image, 0, 0);
    const base64 = canvas.toDataURL("image/png").split(",", 2)[1];
    if (!base64) throw new Error("Could not encode an embedded image for export.");
    return {
      bytes: Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)),
      extension: "png",
      mediaType: "image/png",
      width: image.naturalWidth,
      height: image.naturalHeight
    };
  }

  return {
    bytes: Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0)),
    extension: match[1] === "jpeg" ? "jpg" : "png",
    mediaType: match[1] === "jpeg" ? "image/jpeg" : "image/png",
    width: image.naturalWidth,
    height: image.naturalHeight
  };
}
