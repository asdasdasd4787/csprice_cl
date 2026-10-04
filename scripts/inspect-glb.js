const fs = require("fs");
const path = require("path");

const glbPath = path.join(__dirname, "..", "assets", "models", "skins", "hy_veneto_purple.glb");
const buffer = fs.readFileSync(glbPath);
const jsonLength = buffer.readUInt32LE(12);
const jsonStart = 20;
const json = JSON.parse(buffer.slice(jsonStart, jsonStart + jsonLength).toString("utf8"));

console.log("images:", JSON.stringify(json.images, null, 2));
console.log("textures:", JSON.stringify(json.textures, null, 2));
console.log("materials:", JSON.stringify(json.materials, null, 2));
console.log("meshes:", json.meshes?.map((mesh) => mesh.name));
