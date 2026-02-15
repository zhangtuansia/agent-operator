/**
 * electron-builder afterPack hook
 *
 * 1. Copies the pre-compiled macOS 26+ Liquid Glass icon (Assets.car) into the
 *    app bundle (if available).
 *
 * 2. Ad-hoc signs the macOS app bundle when no real identity is configured.
 *    Without this, the Electron framework retains its original Apple signature
 *    but the overall bundle is unsigned, causing macOS to reject auto-updates
 *    with: "代码不含资源，但签名指示这些资源必须存在"
 *
 * To regenerate Assets.car after icon changes:
 *   cd apps/electron
 *   xcrun actool "resources/icon.icon" --compile "resources" \
 *     --app-icon AppIcon --minimum-deployment-target 26.0 \
 *     --platform macosx --output-partial-info-plist /dev/null
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

module.exports = async function afterPack(context) {
  // Only process macOS builds
  if (context.electronPlatformName !== 'darwin') {
    console.log('Skipping Liquid Glass icon (not macOS)');
    return;
  }

  const appPath = context.appOutDir;
  const bundleName = `${context.packager.appInfo.productFilename}.app`;
  const appBundle = path.join(appPath, bundleName);
  const resourcesDir = path.join(appBundle, 'Contents', 'Resources');
  const precompiledAssets = path.join(context.packager.projectDir, 'resources', 'Assets.car');

  console.log(`afterPack: projectDir=${context.packager.projectDir}`);
  console.log(`afterPack: looking for Assets.car at ${precompiledAssets}`);

  // Check if pre-compiled Assets.car exists
  if (!fs.existsSync(precompiledAssets)) {
    console.log('Warning: Pre-compiled Assets.car not found in resources/');
    console.log('The app will use the fallback icon.icns on all macOS versions');
  } else {
    // Copy pre-compiled Assets.car to the app bundle
    const destAssetsCar = path.join(resourcesDir, 'Assets.car');
    try {
      fs.copyFileSync(precompiledAssets, destAssetsCar);
      console.log(`Liquid Glass icon copied: ${destAssetsCar}`);
    } catch (err) {
      console.log(`Warning: Could not copy Assets.car: ${err.message}`);
      console.log('The app will use the fallback icon.icns on all macOS versions');
    }
  }

  // Ad-hoc sign the app bundle to fix auto-update signature validation.
  // electron-builder with identity:null skips signing, but the Electron
  // framework binaries retain their original signatures. This mismatch causes
  // macOS to reject the update. Ad-hoc signing (sign with "-") creates a
  // consistent, valid signature without needing a developer certificate.
  try {
    console.log('Ad-hoc signing app bundle for auto-update compatibility...');

    // Sign nested frameworks and helpers first (inside-out)
    const frameworksDir = path.join(appBundle, 'Contents', 'Frameworks');
    if (fs.existsSync(frameworksDir)) {
      const entries = fs.readdirSync(frameworksDir);

      // Sign .framework bundles
      for (const entry of entries) {
        if (entry.endsWith('.framework')) {
          const fwPath = path.join(frameworksDir, entry);
          execSync(`codesign --force --sign - "${fwPath}"`, { stdio: 'pipe' });
          console.log(`  Signed framework: ${entry}`);
        }
      }

      // Sign helper .app bundles
      for (const entry of entries) {
        if (entry.endsWith('.app')) {
          const helperPath = path.join(frameworksDir, entry);
          execSync(`codesign --force --sign - "${helperPath}"`, { stdio: 'pipe' });
          console.log(`  Signed helper: ${entry}`);
        }
      }
    }

    // Sign the main app bundle last
    execSync(`codesign --force --sign - "${appBundle}"`, { stdio: 'pipe' });
    console.log(`  Signed app bundle: ${bundleName}`);

    // Verify the signature
    execSync(`codesign --verify --deep --strict "${appBundle}"`, { stdio: 'pipe' });
    console.log('Ad-hoc signing verified successfully');
  } catch (err) {
    console.log(`Warning: Ad-hoc signing failed: ${err.message}`);
    console.log('Auto-update may not work on macOS without valid code signatures');
  }
};
