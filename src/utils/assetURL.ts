/** 把 public/ 下的相对路径按路径段编码，保留斜杠。 */
export function assetURL(path: string) {
  return `./${path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}
