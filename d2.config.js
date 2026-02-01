/** @type {import('@dhis2/cli-app-scripts').D2Config} */
const config = {
  type: 'app',
  title: 'TEI Transfer Plugin',
  pluginType: 'CAPTURE_WIDGET_PLUGIN',
  entryPoints: {
    plugin: './src/Plugin.tsx',
  },
  direction: 'auto',
}

module.exports = config
