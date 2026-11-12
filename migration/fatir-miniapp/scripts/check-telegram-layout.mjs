import assert from 'node:assert/strict';
import {deviceLayout,clientPlatformLabel} from '../.telegram-layout-test.mjs';

// Native Telegram platform must win over a compact/expanded WebView width.
assert.equal(deviceLayout('tdesktop',480),'desktop');
assert.equal(deviceLayout('macos',520),'desktop');
assert.equal(deviceLayout('tdesktop',1600),'desktop');
assert.equal(deviceLayout('android',980),'mobile');
assert.equal(deviceLayout('ios',390),'mobile');
assert.equal(deviceLayout('ios',1050),'mobile');

// Telegram Web A / K can run on phones or computers; use viewport width.
assert.equal(deviceLayout('weba',1440),'desktop');
assert.equal(deviceLayout('web',375),'mobile');
assert.equal(deviceLayout('webk',1024),'desktop');
assert.equal(deviceLayout(undefined,900),'desktop');
assert.equal(deviceLayout(undefined,899),'mobile');
assert.equal(clientPlatformLabel('tdesktop'),'Telegram Desktop');
console.log('FATIR Telegram device layout tests passed');
