# code-mirror

CodeMirror fork to be more "browserifyable".  It is automatically built from CodeMirror's source, so it can be easilly kept up to date.  It does not expose any globals and it ensures that modules will require in any of their dependencies automatically.

For example, if you want to use htmlmixed in normal CodeMirror, you would need to add:

```html
<script src="/codemirror.js"></script>
<script src="/mode/xml/xml.js"></script>
<script src="/mode/javascript/javascript.js"></script>
<script src="/mode/css/css.js"></script>
<script src="/mode/htmlmixed/htmlmixed.js"></script>
```

To do the same thing using `code-mirror`, you just do:

```js
var CodeMirror = require('code-mirror/mode/htmlmixed');
```

If you're using browserify, then that will automatically load in the rest.

## Installation

```
$ npm install code-mirror
```

## Usage

```javascript
var CodeMirror = require('code-mirror');
```

All other scripts can just be require'd in and will all use `requrie('code-mirror')` themselves instead of looking for a global `CodeMirror`.

## Loading Modes

```javascript
require('code-mirror/mode/htmlmixed');
```

For the vast majority of cases, that will also automatically require any dependencies (such as `javascript`, `css` and `xml` in this case).

## addons

I'm trying to make requiring addons equally simple.  If you notice one that doesn't work, please open an issue for it.  Tern is intentionally ommitted.  I think someone should probably add it at some point, but it isn't simple to add.

## themes

The themes are all availble either as raw CSS files, or as a JavaScript file that will automatically insert the CSS into the document when required.  The JavaScript versions are also properly minified, and include the base CSS as well as the theme.

You can load a theme by calling `require('code-mirror/theme/theme-name')`.  This will return `theme-name`, so you can use it in a call to code mirror:

```js
var cm = new CodeMirror(element, {
  theme: require('code-mirror/theme/monokai')
});
```

You can also get a list of the themes that have been loaded in this way by calling `require('code-mirror/theme').available()`

## Contributing

If you notice this repository is out of date, open an issue and I will update it as soon as I'm in front of a computer again.

If you've become a maintainer, and want to run the update, just open a command prompt and run:

```console
$ npm install
$ node build
 v cleanup (47ms)
 v download (3s)
 v remove unused files (21ms)
 v move main files (5ms)
 v move themes and keymaps (21ms)
 v move modes (141ms)
 v move addons (82ms)
 v delete empty source folder (92ms)
 v add require("code-mirror") (465ms)
 v find exports and process aliases (1s)
 v add local require calls (628ms)
 v add global require calls (992ms)
```

Then be sure to update version numbers etc. before publishing.

## License

MIT