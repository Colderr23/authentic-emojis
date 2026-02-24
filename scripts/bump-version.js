const fs = require('fs');
const path = require('path');

// Bump patch version in package.json
const packageJsonPath = path.resolve(__dirname, '../package.json');
const packageJson = require(packageJsonPath);

const versionParts = packageJson.version.split('.');
versionParts[2] = parseInt(versionParts[2], 10) + 1;
const newVersion = versionParts.join('.');

packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

console.log(`Bumped package.json version to ${newVersion}`);

// Update manifest.json with new version
const manifestJsonPath = path.resolve(__dirname, '../manifest.json');
const manifestJson = require(manifestJsonPath);

manifestJson.version = newVersion;
fs.writeFileSync(manifestJsonPath, JSON.stringify(manifestJson, null, 2));

console.log(`Updated manifest.json version to ${newVersion}`);
