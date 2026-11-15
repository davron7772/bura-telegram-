// O'yin qoidalari (src/engine.js) va stol (src/room.js) serverdagi Telegram versiyasi bilan umumiy.
// Metro ilova papkasidan tashqaridagi ../src papkasini ham kuzatishi uchun watchFolders.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, '..', 'src')];

module.exports = config;
