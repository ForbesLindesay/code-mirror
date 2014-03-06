'use strict';

var relative = require('path').relative;
var join = require('path').join;
var dirname = require('path').dirname;
var fs = require('fs');

var step = require('testit');
var npm = require('npm-fetch');
var unpack = require('tar-pack').unpack;
var mkdirp = require('mkdirp').sync;
var rimraf = require('rimraf').sync;
var astwalker = require('astw');
var uglify = require('uglify-js');
var css = require('css');

step('cleanup', function () {
  rimraf(__dirname + '/addon');
  rimraf(__dirname + '/keymap');
  rimraf(__dirname + '/mode');
  rimraf(__dirname + '/src');
  mkdirp(__dirname + '/src');
  rimraf(__dirname + '/theme');
  rimraf(__dirname + '/codemirror.css');
  rimraf(__dirname + '/codemirror.js');
  rimraf(__dirname + '/LICENSE');
});

step('download', function (callback) {
  npm('codemirror', '*').pipe(unpack(__dirname + '/src', callback));
}, '60 seconds');

step('remove unused files', function () {
  rimraf(__dirname + '/src/doc');
  rimraf(__dirname + '/src/index.html');
  rimraf(__dirname + '/src/.gitattributes');
  rimraf(__dirname + '/src/.gitignore');
  rimraf(__dirname + '/src/.travis.yml');
  rimraf(__dirname + '/src/AUTHORS');
  rimraf(__dirname + '/src/CONTRIBUTING.md');
  rimraf(__dirname + '/src/README.md');
  rimraf(__dirname + '/src/bower.json');
  rimraf(__dirname + '/src/mode/index.html');
  rimraf(__dirname + '/src/mode/meta.js');
  rimraf(__dirname + '/src/addon/mode/multiplex_test.js');
  rimraf(__dirname + '/src/addon/tern');
  rimraf(__dirname + '/src/addon/merge/dep');
});

step('get version', function () {
  var version = JSON.parse(read('./src/package.json')).version;
  var pkg = JSON.parse(read('./package.json'));
  pkg.version = version;
  write('./package.json', JSON.stringify(pkg, null, '  '));
  rimraf(__dirname + '/src/package.json');
});

step('move main files', function () {
  move('./src/lib/codemirror.js', './codemirror.js');
  move('./src/lib/codemirror.css', './codemirror.css');
  move('./src/LICENSE', './LICENSE');
});

step('move themes and keymaps', function () {
  move('./src/theme', './theme');
  move('./src/keymap', './keymap');
});

step('move modes', function () {
  move('./src/mode/rpm/spec/spec.js', './mode/rpm/spec.js');
  move('./src/mode/rpm/spec/spec.css', './mode/rpm/spec.css');
  move('./src/mode/rpm/changes/changes.js', './mode/rpm/changes.js');
  rimraf('./src/mode/rpm');
  readdir('./src/mode').forEach(function (mode) {
    move('./src/mode/' + mode + '/' + mode + '.js', './mode/' + mode + '.js');
    try {
      move('./src/mode/' + mode + '/' + mode + '.css', './mode/' + mode + '.css');
    } catch (ex) {
      //most don't actually have css
    }
  });
});

step('move addons', function () {
  //Addons
  move('./src/addon/dialog/dialog.js', 'addon/dialog.js');
  move('./src/addon/dialog/dialog.css', 'addon/dialog.css');
  ['coffeescript', 'css', 'javascript', 'json'].forEach(function (lint) {
    move('./src/addon/lint/' + lint + '-lint.js', './addon/lint/' + lint + '.js');
    write('./addon/lint/' + lint + '.js', 'require("./lint.js");\n' + read('./addon/lint/' + lint + '.js'));
  })
  move('./src/addon/lint/lint.css', './addon/lint/lint.css');
  move('./src/addon/lint/lint.js', './addon/lint/lint.js');
  move('./src/addon/merge/merge.css', './addon/merge.css');
  move('./src/addon/merge/merge.js', './addon/merge.js');
  var diff = 'var diff_match_patch = require("diff-match-patch");\n' +
    ['DIFF_INSERT', 'DIFF_DELETE', 'DIFF_EQUAL'].map(function (name) {
      return 'var ' + name + ' = diff_match_patch.' + name +  ';';
    }).join('\n');
  write('./addon/merge.js', diff + '\n' + read('./addon/merge.js'));
  readdir('./src/addon').forEach(function (addon) {
    if (addon === 'dialog' || addon === 'lint' || addon === 'merge') return;
    move('./src/addon/' + addon, './addon/' + addon);
  });
});

step('delete empty source folder', function () {
  empty();
})

step('add require("code-mirror")', function () {
  walk(function (path, src, update) {
    if (path === join(__dirname, 'codemirror.js')) {
      update(src.replace(/window\.CodeMirror/g, 'module.exports'));
    } else {
      update('var CodeMirror = module.exports = require("code-mirror");\n' + 
        src.replace(/window\.CodeMirror/g, 'CodeMirror'));
    }
  });
});

var resolver = {
  'global:coffeelint': 'require("coffeelint")',
  'global:CSSLint': 'require("csslint")',
  'global:JSHINT': 'require("jshint").JSHINT',
  'global:jsonlint': 'require("jsonlint")',
  'global:jsyaml': 'require("js-yaml")'
};

step('find exports', function () {
  walk(function (path, src) {
    if (/addon/.test(path)) return;
    getExports(src).forEach(function (name) {
      if (resolver['export:' + name]) {
        console.error('export ' + name + ' is defined in both '
                      + resolver['export:' + name] + ' and ' + path);
      }
      resolver['export:' + name] = path;
    });
  });
});

step('add local require calls', function () {
  //add require calls
  walk(function (path, src, update) {
    var dir = dirname(path);
    var load = getDeps(src).filter(function (name) {
      return name !== 'text/plain';
    }).map(function (name) {
      if (!resolver['export:' + name]) {
        throw new Error('Could not resolve ' + name + ' from ' + path);
      }
      return './' + relative(dir, resolver['export:' + name]).replace(/\\/g, '/');
    }).map(function (name) {
      return 'require(' + JSON.stringify(name) + ');';
    });
    if (load.length)
      update(load.join('\n') + '\n' + src);
  });
})

step('add global require calls', function () {
  var output = '';
  var fail = false;
  walk(function (path, src, update) {
    if (/runmode\.node\.js$/.test(path)) {
      console.warn('ignoring runmode.node.js for globl require calls');
      return;
    }
    var toAdd = [];
    var globals = detectGlobals(src).filter(function (global) {
      if (resolver['global:' + global]) {
        toAdd.push('var ' + global + ' = ' + resolver['global:' + global]);
        return false;
      } else {
        return true;
      }
    })
    if (toAdd.length) {
      update(toAdd.join('\n') + '\n' + src);
    }
    if (globals.length) {
      fail = true;
      output += '\n' + path + '\n';
      globals.forEach(function (global) {
        output += '\n   - ' + global;
      });
      output += '\n';
    }
  });
  if (fail) throw new Error('Missing some global variables:\n' + output);
})

step('add JavaScript versions of CSS', function () {
  var themes = readdir('./theme').filter(function (name) {
    return /\.css$/.test(name);
  });
  if (themes.indexOf('default.css') !== -1) {
    throw new Error('unexpected theme "default.css"')
  }
  var themeNames = themes.map(function (theme) {
    return theme.replace(/\.css$/, '');
  })
  var defaultCSS = readCSS('./codemirror.css');
  write('./theme/default.js', ['require("insert-css")(' + JSON.stringify(defaultCSS) + ');',
      'module.exports = require("./index.js").register("default");'].join('\n'));
  for (var i = 0; i < themes.length; i++) {
    write('./theme/' + themeNames[i] + '.js', [
      'require("./default.js");',
      'require("insert-css")(' + JSON.stringify(readCSS('./theme/' + themes[i])) + ');',
      'module.exports = require("./index.js").register(' + JSON.stringify(themeNames[i]) + ');'
    ].join('\n'));
  };
  write('./theme/index.js', [
    '"use strict";',
    'var themes = [];',
    'var all = ' + JSON.stringify(themeNames) + ';',
    'exports.available = function (name) {',
    '  return name ? themes.indexOf(name) != -1 : themes;',
    '};',
    'exports.all = function () {',
    '  return all;',
    '};',
    'exports.register = function (name) {',
    '  themes.push(name);',
    '  return name',
    '};'
  ].join('\n'));
});

var walkers = {

}
function astw(src, fn) {
  return astwalker(src)(fn)
}

function read(path) {
  return fs.readFileSync(join(__dirname, path), 'utf8');
}
function readCSS(path) {
  return css.stringify(css.parse(read(path)), { compress: true });
}
function write(path, src) {
  return fs.writeFileSync(join(__dirname, path), src);
}
function move(src, dest) {
  mkdirp(dirname(join(__dirname, dest)));
  fs.renameSync(join(__dirname, src), join(__dirname, dest));
}
function readdir(src) {
  return fs.readdirSync(join(__dirname, src));
} 
function detectGlobals(src) {
  var builtins = ['module', 'require', 'RegExp', 'Math', 'undefined', 'Number', 'String', 'Array', 'isNaN',
                  'parseInt', 'alert', 'prompt', 'confirm', 'Infinity', 'Error', 'encodeURI', 'decodeURI', 'Date',
                  'Object', 'NaN', 'clearTimeout', 'setTimeout', 'clearInterval', 'setInterval', 'document',
                  'navigator', 'postMessage', 'console', 'Function', 'arguments', 'FileReader', 'window',
                  'exports', 'parseFloat'];
  var ast = uglify.parse(src.toString())
  ast.figure_out_scope()
  var globals = ast.globals
    .map(function (node, name) {
      if (builtins.indexOf(name) != -1) return null
      return name;
    })
    .filter(Boolean)
  return globals;
}

function CMMethod(node, name, conditions) {
  if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.computed === false
   && node.callee.object.type === 'Identifier' && node.callee.object.name === 'CodeMirror'
   && node.callee.property.type === 'Identifier'
   && node.callee.property.name === name) {
    for (var i = 0; i < conditions.length; i++) {
      if (!conditions[i](node.arguments[i])) {
        return false;
      }
    }
    return true;
  }

  return false;
}
function isStringNode(node) {
  return node.type === 'Literal' && typeof node.value === 'string'
}
function not(fn) {
  return function () {
    return !fn.apply(this, arguments);
  }
}
function getExports(src) {
  var exports = [];
  astw(src, function (node) {
    if (CMMethod(node, 'defineMode', [isStringNode]) || CMMethod(node, 'defineMIME', [isStringNode, not(isStringNode)])) {
      exports.push(node.arguments[0].value);
    }
  });
  return unique(exports);
}
function getAliases(src) {
  var aliases = [];
  astw(src, function (node) {
    if (CMMethod(node, 'defineMIME', [isStringNode, isStringNode])) {
      aliases.push([node.arguments[0].value, node.arguments[1].value])
    }
  });
  return aliases;
}
function getDeps(src) {
  var deps = [];
  function parseArg(arg) {
    if (arg.type === 'Literal' && typeof arg.value === 'string') {
      return [arg.value];
    } else if (arg.type === 'ObjectExpression') {
      for (var i = 0; i < arg.properties.length; i++) {
        if (arg.properties[i].key.type === 'Identifier' && arg.properties[i].key.name === 'name' &&
            arg.properties[i].value.type === 'Literal' && typeof arg.properties[i].value.value === 'string') {
          return [arg.properties[i].value.value];
        }
      }
    } else if (arg.type === 'ConditionalExpression') {
      return flatten([parseArg(arg.consequent), parseArg(arg.alternate)]);
    } else if (arg.type === 'LogicalExpression') {
      return flatten([parseArg(arg.left), parseArg(arg.right)]);
    } else {
      //sometimes we can't work it out
      //console.dir(arg);
      return [];
    }
  }
  function flatten(arr) {
    var buf = [];
    for (var i = 0; i < arr.length; i++) {
      if (Array.isArray(arr[i])) {
        var inner = flatten(arr[i]);
        for (var x = 0; x < inner.length; x++) {
          buf.push(inner[x]);
        };
      } else {
        buf.push(arr[i]);
      }
    }
    return buf;
  }
  astw(src, function (node) {
    if (CMMethod(node, 'getMode', [])) {
      deps = deps.concat(parseArg(node.arguments[1]))
    }
    if (CMMethod(node, 'defineMode', []) && node.arguments.length > 2) {
      deps = deps.concat(flatten(node.arguments.slice(2).map(parseArg)))
    }
  });
  return unique(deps);
}

function unique(list) {
  var seen = {};
  return list.filter(function (str) {
    if (seen['key:' + str]) return false;
    else return seen['key:' + str] = true;
  })
}

function empty(path) {
  path = path || join(__dirname, 'src');
  if (fs.statSync(path).isDirectory()) {
    var isempty = true;
    fs.readdirSync(path)
      .forEach(function (file) {
        isempty = empty(join(path, file)) && isempty;
      });
    if (isempty) rimraf(path);
    return isempty;
  } else {
    if (/\.js$/.test(path) || /\.css$/.test(path)) {
      return /test/.test(path) || /docs\.css/.test(path) || /meta\.js/.test(path);
    } else {
      return true;
    }
  }
}

function walk(path, fn) {
  if (typeof path === 'function') {
    fn = path;
    path = __dirname;
  }
  if (fs.statSync(path).isDirectory()) {
    fs.readdirSync(path)
      .forEach(function (file) {
        walk(join(path, file), fn);
      });
  } else {
    if (/\.js$/.test(path)) {
      if (path === __filename) return;
      if (/node_modules/.test(path)) return;
      var src = fs.readFileSync(path).toString().replace(/\r/g, '');
      fn(path, src, function (src) {
        fs.writeFileSync(path, src);
      });
    }
  }
}