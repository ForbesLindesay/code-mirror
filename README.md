# code-mirror

CodeMirror fork to be more "browserifyable"

## Installation

```
$ npm install code-mirror
```

## Usage

```javascript
var CodeMirror = require('code-mirror');
```

Replaces the global.

All other scripts can just be require'd in and will all use `requrie('code-mirror')` themselves instead of looking for a global `CodeMirror`.

## Loading Modes

```javascript
require('code-mirror/mode/htmlmixed');
```

For the vast majority of cases, that will also automatically require any dependencies (such as `javascript`, `css` and `xml` in this case).

## Updating

To update this copy of the repository, run:

```
$ npm install
$ node build
```

Then be sure to update version numbers etc.

## License

MIT