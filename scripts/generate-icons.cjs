const sharp = require('sharp')

const src = 'public/logo.jpeg'
const iconBackground = { r: 187, g: 229, b: 239, alpha: 1 }
const splashBackground = { r: 245, g: 247, b: 250, alpha: 1 }
const adaptiveSize = 432
const adaptiveSafeSize = 80
const iconScale = 0.6

const icons = [
  { dir: 'mipmap-mdpi',    size: 48  },
  { dir: 'mipmap-hdpi',    size: 72  },
  { dir: 'mipmap-xhdpi',   size: 96  },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
]

Promise.all(icons.map(({ dir, size }) => {
  const dest = `android/app/src/main/res/${dir}/ic_launcher.png`
  const logoSize = Math.round(size * iconScale)
  const pad = size - logoSize
  return sharp(src)
    .resize(logoSize, logoSize, { fit: 'contain', background: iconBackground })
    .extend({
      top: Math.floor(pad / 2),
      bottom: Math.ceil(pad / 2),
      left: Math.floor(pad / 2),
      right: Math.ceil(pad / 2),
      background: iconBackground
    })
    .toFile(dest)
    .then(() => console.log('Written: ' + dest))
}))
.then(() => {
  // Also write round icons (same image, Android uses rounded mask itself)
  return Promise.all(icons.map(({ dir, size }) => {
    const dest = `android/app/src/main/res/${dir}/ic_launcher_round.png`
    const logoSize = Math.round(size * iconScale)
    const pad = size - logoSize
    return sharp(src)
      .resize(logoSize, logoSize, { fit: 'contain', background: iconBackground })
      .extend({
        top: Math.floor(pad / 2),
        bottom: Math.ceil(pad / 2),
        left: Math.floor(pad / 2),
        right: Math.ceil(pad / 2),
        background: iconBackground
      })
      .toFile(dest)
      .then(() => console.log('Written: ' + dest))
  }))
})
.then(() => {
  // Foreground for adaptive icon (anydpi-v26) - use larger with padding so icon fits nicely
  return sharp(src)
    .resize(adaptiveSafeSize, adaptiveSafeSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: Math.floor((adaptiveSize - adaptiveSafeSize) / 2),
      bottom: Math.ceil((adaptiveSize - adaptiveSafeSize) / 2),
      left: Math.floor((adaptiveSize - adaptiveSafeSize) / 2),
      right: Math.ceil((adaptiveSize - adaptiveSafeSize) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .toFile('android/app/src/main/res/drawable/ic_launcher_foreground_image.png')
    .then(() => console.log('Written: drawable/ic_launcher_foreground_image.png'))
})
.then(() => {
  const splashTargets = [
    { dir: 'drawable', width: 480, height: 320 },
    { dir: 'drawable-port-mdpi', width: 320, height: 480 },
    { dir: 'drawable-port-hdpi', width: 480, height: 800 },
    { dir: 'drawable-port-xhdpi', width: 720, height: 1280 },
    { dir: 'drawable-port-xxhdpi', width: 960, height: 1600 },
    { dir: 'drawable-port-xxxhdpi', width: 1280, height: 1920 },
    { dir: 'drawable-land-mdpi', width: 480, height: 320 },
    { dir: 'drawable-land-hdpi', width: 800, height: 480 },
    { dir: 'drawable-land-xhdpi', width: 1280, height: 720 },
    { dir: 'drawable-land-xxhdpi', width: 1600, height: 960 },
    { dir: 'drawable-land-xxxhdpi', width: 1920, height: 1280 },
  ]

  return Promise.all(splashTargets.map(({ dir, width, height }) => {
    const dest = `android/app/src/main/res/${dir}/splash.png`
    return sharp(src)
      .resize(width, height, { fit: 'contain', background: splashBackground })
      .png()
      .toFile(dest)
      .then(() => console.log('Written: ' + dest))
  }))
})
.then(() => console.log('\nAll icons generated!'))
.catch(e => console.error(e))
