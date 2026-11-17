// Wraps a 256x256 PNG into a valid single-image .ico (Vista+ format).
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "build", "icon-256.png");
const dst = path.join(__dirname, "build", "icon.ico");

const png = fs.readFileSync(src);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // 1 image

const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0); // width 256 → 0
entry.writeUInt8(0, 1); // height 256 → 0
entry.writeUInt8(0, 2); // palette
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // color planes
entry.writeUInt16LE(32, 6); // bits per pixel
entry.writeUInt32LE(png.length, 8); // image size
entry.writeUInt32LE(22, 12); // image offset (6+16)

fs.writeFileSync(dst, Buffer.concat([header, entry, png]));
console.log("icon.ico written:", fs.statSync(dst).size, "bytes");
