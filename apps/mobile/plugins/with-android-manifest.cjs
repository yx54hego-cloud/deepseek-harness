const { withAndroidManifest } = require('expo/config-plugins')

/** Apply network and Back-dispatch attributes required by the Android companion. */
module.exports = function withAndroidManifestSettings(config) {
  return withAndroidManifest(config, (result) => {
    const application = result.modResults.manifest.application?.[0]
    if (application === undefined) {
      throw new Error('mobile: generated Android manifest has no application element')
    }
    application.$['android:usesCleartextTraffic'] = 'true'
    application.$['android:enableOnBackInvokedCallback'] = 'false'
    return result
  })
}
