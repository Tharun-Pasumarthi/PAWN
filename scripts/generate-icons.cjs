const sharp = require('sharp')

const src = 'public/pwa-512x512.png'

const icons = [
  { dir: 'mipmap-mdpi',    size: 48  },
  { dir: 'mipmap-hdpi',    size: 72  },
  { dir: 'mipmap-xhdpi',   size: 96  },
  { dir: 'mipmap-xxhdpi',  size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
]

Promise.all(icons.map(({ dir, size }) => {
  const dest = `android/app/src/main/res/${dir}/ic_launcher.png`
  return sharp(src)
    .resize(size, size)
    .toFile(dest)
    .then(() => console.log('Written: ' + dest))
}))
.then(() => {
  // Also write round icons (same image, Android uses rounded mask itself)
  return Promise.all(icons.map(({ dir, size }) => {
    const dest = `android/app/src/main/res/${dir}/ic_launcher_round.png`
    return sharp(src)
      .resize(size, size)
      .toFile(dest)
      .then(() => console.log('Written: ' + dest))
  }))
})
.then(() => {
  // Foreground for adaptive icon (anydpi-v26) - use larger with padding so icon fits nicely
  return sharp(src)
    .resize(432, 432)
    .extend({ top: 108, bottom: 108, left: 108, right: 108, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile('android/app/src/main/res/drawable/ic_launcher_foreground.png')
    .then(() => console.log('Written: drawable/ic_launcher_foreground.png'))
})
.then(() => console.log('\nAll icons generated!'))
.catch(e => console.error(e))
